from __future__ import annotations
from ..infrastructure.policies import configured_policy

from psycopg.types.json import Jsonb

from ..adapters.private_files import PrivateFiles
from ..config import Settings
from ..db import Database
from ..infrastructure.company_modules import lock_module_configuration
from ..errors import ApiError, missing, forbidden, conflict
from ..domain.intake import PreparedFile
from ..infrastructure.company import CompanyRepository
from ..infrastructure.intake import IntakeRepository, file_view, session_view
from ..security import Security
from .auth import response
from .idempotency import Replay
from .intake_queries import IntakeQueries
from .interpretation_commands import answer as answer_interpretation
from ..infrastructure.interpretation import enqueue as enqueue_interpretation

READ_OPS = {
    "listProcessingSessions",
    "getProcessingSession",
    "listSessionFiles",
    "listProcessingIssues",
    "getOperation",
    "getSourceFile",
    "listNotifications",
}
TERMINAL = {"cancelled", "completed", "completed_limited", "failed"}


class IntakeService(IntakeQueries):
    def __init__(self, db: Database, security: Security, settings: Settings):
        self.db, self.security, self.settings = db, security, settings
        self.replay = Replay(security)
        self.storage = PrivateFiles(settings.storage_root, settings.max_file_bytes)

    def authorize(self, conn, actor: dict, company: str, write: bool = False):
        access = CompanyRepository(conn)
        if not access.require_session(actor):
            raise ApiError(401, "authentication_required", "وارد حساب خود شوید.")
        current = access.company(company)
        if not current:
            raise missing()
        if write and access.role(company) not in (
            "owner",
            "finance_manager",
            "advisor_accountant",
        ):
            raise forbidden()
        return access

    def upload_preflight(self, actor: dict, company: str, session: str) -> None:
        with self.db.transaction(
            identity=False, actor=str(actor["id"]), company=company
        ) as conn:
            self.authorize(conn, actor, company, True)
            if not IntakeRepository(conn).session(company, session):
                raise missing()

    def upload(
        self,
        actor: dict,
        company: str,
        session: str,
        file: PreparedFile,
        key: str,
        expected: int,
        request_id: str,
    ) -> dict:
        retained = False
        created = False
        try:
            with self.db.transaction(
                identity=False, actor=str(actor["id"]), company=company
            ) as conn:
                access = self.authorize(conn, actor, company, True)
                repo = IntakeRepository(conn)
                current = repo.session(company, session, True)
                if not current:
                    raise missing()

                def action():
                    nonlocal created
                    self._version(current, expected)
                    if current["status"] != "receiving":
                        raise conflict("session_not_receiving")
                    conn.execute(
                        "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                        (company + ":" + file.sha256,),
                    )
                    old = conn.execute(
                        "SELECT * FROM app.source_files WHERE company_id=%s AND sha256=%s FOR UPDATE",
                        (company, file.sha256),
                    ).fetchone()
                    files = repo.files(company, session)
                    already = next(
                        (row for row in files if row["sha256"] == file.sha256), None
                    )
                    if already:
                        return response(
                            file_view(already, True),
                            202,
                            etag=current["session_version"],
                        )
                    configured = configured_policy(conn, company, "upload")
                    caps = configured["parameters"] if configured else {}
                    if file.byte_size > caps.get(
                        "max_file_bytes", self.settings.max_file_bytes
                    ):
                        raise ApiError(
                            413,
                            "company_file_too_large",
                            "حجم فایل بیش از سقف شرکت است.",
                        )
                    if len(files) >= caps.get("max_files", 10):
                        raise ApiError(
                            413, "too_many_files", "تعداد فایل‌ها بیش از سقف شرکت است."
                        )
                    if old and old["scan_status"] == "rejected":
                        raise ApiError(
                            422,
                            "rejected_duplicate",
                            "این فایل قبلاً در بررسی امنیتی رد شده است.",
                        )
                    if old:
                        source = old
                    else:
                        source = conn.execute(
                            """INSERT INTO app.source_files(company_id,sha256,original_name,object_key,byte_size,format,scan_status,uploaded_by)
                         VALUES(%s,%s,%s,%s,%s,%s,'quarantined',%s) RETURNING *""",
                            (
                                company,
                                file.sha256,
                                file.original_name,
                                file.key,
                                file.byte_size,
                                file.format,
                                actor["id"],
                            ),
                        ).fetchone()
                        created = True
                    conn.execute(
                        "INSERT INTO app.session_files(company_id,session_id,source_file_id,status) VALUES(%s,%s,%s,'quarantined')",
                        (company, session, source["id"]),
                    )
                    updated = conn.execute(
                        "UPDATE app.processing_sessions SET session_version=session_version+1 WHERE company_id=%s AND id=%s RETURNING *",
                        (company, session),
                    ).fetchone()
                    access.audit(
                        company,
                        str(actor["id"]),
                        "file.received",
                        "source_file",
                        str(source["id"]),
                        request_id,
                    )
                    row = next(
                        row
                        for row in repo.files(company, session)
                        if row["id"] == source["id"]
                    )
                    return response(
                        file_view(row, bool(old)), 202, etag=updated["session_version"]
                    )

                result = self.replay.run(
                    conn,
                    identity=False,
                    scope=company + ":" + str(actor["id"]),
                    actor=str(actor["id"]),
                    company=company,
                    route="uploadFile:" + session,
                    key=key,
                    payload={
                        "sha256": file.sha256,
                        "name": file.original_name,
                        "size": file.byte_size,
                        "version": expected,
                    },
                    action=action,
                )
            retained = created
            return result
        finally:
            if not retained:
                self.storage.discard(file.key)

    def execute(
        self,
        op: str,
        actor: dict,
        company: str,
        ids: dict,
        body: dict,
        key: str | None,
        expected: int | None,
        request_id: str,
        limit: int,
        cursor: str | None,
    ) -> dict:
        with self.db.transaction(
            identity=False, actor=str(actor["id"]), company=company
        ) as conn:
            access = self.authorize(
                conn, actor, company, op not in READ_OPS and op != "markNotification"
            )
            repo = IntakeRepository(conn)

            def action():
                if op == "createProcessingSession":
                    lock_module_configuration(conn, company)
                    period = body.get("period_id")
                    if period:
                        if not conn.execute(
                            "SELECT 1 FROM app.financial_periods WHERE company_id=%s AND id=%s",
                            (company, period),
                        ).fetchone():
                            raise missing()
                    else:
                        candidates = conn.execute(
                            "SELECT id FROM app.financial_periods WHERE company_id=%s ORDER BY starts_on DESC LIMIT 2",
                            (company,),
                        ).fetchall()
                        if len(candidates) == 1:
                            period = candidates[0]["id"]
                    row = conn.execute(
                        "INSERT INTO app.processing_sessions(company_id,requested_by,period_id,as_of_date) VALUES(%s,%s,%s,%s) RETURNING *",
                        (company, actor["id"], period, body.get("as_of_date")),
                    ).fetchone()
                    access.audit(
                        company,
                        str(actor["id"]),
                        "session.created",
                        "processing_session",
                        str(row["id"]),
                        request_id,
                    )
                    return response(
                        session_view(repo, row), 201, etag=row["session_version"]
                    )
                if op == "listProcessingSessions":
                    rows = self._rows(
                        conn, "processing_sessions", company, actor, limit, cursor
                    )
                    return self._page(
                        rows,
                        limit,
                        lambda row: session_view(repo, row),
                        "processing_sessions",
                        actor,
                        company,
                    )
                if op == "getOperation":
                    row = conn.execute(
                        "SELECT * FROM app.operations WHERE company_id=%s AND id=%s",
                        (company, ids["operation_id"]),
                    ).fetchone()
                    if not row:
                        raise missing()
                    return response(
                        {
                            k: row[k]
                            for k in (
                                "id",
                                "kind",
                                "status",
                                "error_code",
                                "finished_at",
                            )
                        }
                        | {"resource_id": row["entity_id"]}
                    )
                if op in ("listNotifications", "markNotification"):
                    if op == "listNotifications":
                        rows = self._rows(
                            conn, "notifications", company, actor, limit, cursor
                        )
                        return self._page(
                            rows,
                            limit,
                            self._notification,
                            "notifications",
                            actor,
                            company,
                        )
                    row = conn.execute(
                        "SELECT * FROM app.notifications WHERE company_id=%s AND id=%s FOR UPDATE",
                        (company, ids["notification_id"]),
                    ).fetchone()
                    if not row:
                        raise missing()
                    if row["row_version"] != expected:
                        raise conflict()
                    row = conn.execute(
                        "UPDATE app.notifications SET read_at=CASE WHEN %s THEN clock_timestamp() ELSE NULL END WHERE company_id=%s AND id=%s RETURNING *",
                        (body["read"], company, row["id"]),
                    ).fetchone()
                    return response(self._notification(row), etag=row["row_version"])
                if op == "getSourceFile":
                    row = conn.execute(
                        "SELECT f.*,CASE WHEN scan_status='clean' THEN 'pending_interpretation' ELSE scan_status END AS intake_status FROM app.source_files f WHERE company_id=%s AND id=%s",
                        (company, ids["file_id"]),
                    ).fetchone()
                    if not row:
                        raise missing()
                    return response(file_view(row), etag=row["row_version"])
                session_id = ids.get("session_id")
                if op == "answerProcessingIssue":
                    initial = conn.execute(
                        "SELECT session_id FROM app.processing_issues WHERE company_id=%s AND id=%s",
                        (company, ids["issue_id"]),
                    ).fetchone()
                    if not initial:
                        raise missing()
                    session_id = str(initial["session_id"])
                session = repo.session(company, session_id, op not in READ_OPS)
                if not session:
                    raise missing()
                if op == "getProcessingSession":
                    return response(
                        session_view(repo, session), etag=session["session_version"]
                    )
                if op == "listSessionFiles":
                    rows = repo.files(company, session_id)
                    return self._page(
                        rows,
                        limit,
                        file_view,
                        "files:" + session_id,
                        actor,
                        company,
                        cursor=cursor,
                        date_key="linked_at",
                    )
                if op == "listProcessingIssues":
                    rows = repo.issues(company, session_id)
                    issue_status = ids.get("issue_status")
                    if issue_status:
                        rows = [
                            row
                            for row in rows
                            if self._issue(row, session["session_version"])["status"]
                            == issue_status
                        ]
                    return self._page(
                        rows,
                        limit,
                        lambda row: self._issue(row, session["session_version"]),
                        "issues:"
                        + session_id
                        + (":" + issue_status if issue_status else ""),
                        actor,
                        company,
                        cursor=cursor,
                    )
                self._version(session, expected)
                if op == "answerProcessingIssue":
                    return self._answer(
                        conn,
                        repo,
                        actor,
                        company,
                        session,
                        ids["issue_id"],
                        body,
                        key,
                        request_id,
                        access,
                    )
                if op == "cancelProcessingSession":
                    if session["status"] in TERMINAL:
                        raise conflict("session_terminal")
                    conn.execute(
                        "UPDATE app.processing_sessions SET status='cancelled',cancelled_at=clock_timestamp(),session_version=session_version+1 WHERE company_id=%s AND id=%s",
                        (company, session_id),
                    )
                    conn.execute(
                        "UPDATE app.processing_issues SET superseded_at=clock_timestamp() WHERE company_id=%s AND session_id=%s AND resolved_at IS NULL AND superseded_at IS NULL",
                        (company, session_id),
                    )
                    conn.execute(
                        "UPDATE app.processing_steps SET status='cancelled',fence=fence+1,lease_expires_at=NULL WHERE company_id=%s AND session_id=%s AND status NOT IN ('succeeded','limited')",
                        (company, session_id),
                    )
                    conn.execute(
                        "UPDATE app.outbox_events SET published_at=clock_timestamp(),lease_token=NULL,lease_expires_at=NULL WHERE company_id=%s AND session_id=%s AND published_at IS NULL",
                        (company, session_id),
                    )
                    return self._operation(
                        conn,
                        actor,
                        company,
                        session_id,
                        "cancel_session",
                        request_id,
                        access,
                    )
                if op == "sealProcessingSession":
                    if session["status"] != "receiving":
                        raise conflict("session_not_receiving")
                    files = repo.files(company, session_id)
                    if set(map(str, body["expected_file_ids"])) != {
                        str(f["id"]) for f in files
                    }:
                        raise conflict("incomplete_upload_set")
                    if not files:
                        raise ApiError(422, "no_files", "حداقل یک فایل بارگذاری کنید.")
                    policy = self._policy(conn, actor, company)
                    caps = conn.execute(
                        "SELECT parameters FROM app.policy_versions WHERE company_id=%s AND id=%s",
                        (company, policy),
                    ).fetchone()["parameters"]
                    if len(files) > caps.get("max_files", 10) or any(
                        f["byte_size"]
                        > caps.get("max_file_bytes", self.settings.max_file_bytes)
                        for f in files
                    ):
                        raise ApiError(
                            413,
                            "company_upload_limit",
                            "فایل‌های بسته از سقف فعلی شرکت بیشترند.",
                        )
                    for file in files:
                        step = conn.execute(
                            "INSERT INTO app.processing_steps(company_id,session_id,step_kind,input_fingerprint,policy_id,status,total_items) VALUES(%s,%s,%s,%s,%s,'pending',1) RETURNING id",
                            (
                                company,
                                session_id,
                                "prepare:" + str(file["id"]),
                                file["sha256"],
                                policy,
                            ),
                        ).fetchone()["id"]
                        repo.enqueue(company, session_id, str(step), str(file["id"]))
                    conn.execute(
                        "UPDATE app.processing_sessions SET status='sealed',sealed_at=clock_timestamp(),session_version=session_version+1 WHERE company_id=%s AND id=%s",
                        (company, session_id),
                    )
                    return self._operation(
                        conn,
                        actor,
                        company,
                        session_id,
                        "seal_session",
                        request_id,
                        access,
                    )
                if op == "retryProcessingSession":
                    if (
                        session["status"] in TERMINAL
                        or session["status"] == "waiting_input"
                        or session["analysis_finished_at"]
                    ):
                        raise conflict("session_not_retryable")
                    steps = repo.steps(company, session_id)
                    selected = set(body["step_ids"])
                    matched = [s for s in steps if str(s["id"]) in selected]
                    if len(matched) != len(selected) or any(
                        s["status"] != "waiting_dependency" for s in matched
                    ):
                        raise conflict("step_not_retryable")
                    for step in matched:
                        conn.execute(
                            "UPDATE app.processing_steps SET status='pending',dependency_code=NULL,fence=fence+1,lease_expires_at=NULL WHERE company_id=%s AND id=%s",
                            (company, step["id"]),
                        )
                        if step["step_kind"].startswith("analysis:"):
                            from ..infrastructure.analysis import (
                                enqueue as enqueue_analysis,
                            )

                            enqueue_analysis(conn, company, session_id, step["id"])
                        elif step["step_kind"].startswith("financial:"):
                            from ..infrastructure.financial import (
                                enqueue as enqueue_financial,
                            )

                            enqueue_financial(conn, company, session_id, step["id"])
                        elif step["step_kind"].startswith("interpret:"):
                            enqueue_interpretation(
                                conn,
                                company,
                                session_id,
                                step["step_kind"].split(":", 1)[1],
                                step["id"],
                            )
                        else:
                            repo.enqueue(
                                company,
                                session_id,
                                str(step["id"]),
                                step["step_kind"].split(":", 1)[1],
                            )
                    conn.execute(
                        "UPDATE app.processing_sessions SET status='sealed',session_version=session_version+1 WHERE company_id=%s AND id=%s",
                        (company, session_id),
                    )
                    return self._operation(
                        conn,
                        actor,
                        company,
                        session_id,
                        "retry_session",
                        request_id,
                        access,
                    )
                raise missing()

            if key is None:
                return action()
            return self.replay.run(
                conn,
                identity=False,
                scope=company + ":" + str(actor["id"]),
                actor=str(actor["id"]),
                company=company,
                route=op + ":" + str(ids),
                key=key,
                payload={"body": body, "version": expected},
                action=action,
            )

    @staticmethod
    def _version(session: dict, expected: int | None):
        if session["session_version"] != expected:
            raise conflict()

    def _policy(self, conn, actor: dict, company: str):
        conn.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
            (company + ":upload-policy",),
        )
        configured = configured_policy(conn, company, "upload")
        if configured:
            return configured["id"]
        row = conn.execute(
            "SELECT id FROM app.policy_versions p WHERE company_id=%s AND kind='upload' AND effective_from<=current_date AND validation_status IN ('evaluated','approved') AND NOT EXISTS(SELECT 1 FROM app.policy_configuration_events e WHERE e.company_id=p.company_id AND e.policy_id=p.id) ORDER BY version DESC LIMIT 1",
            (company,),
        ).fetchone()
        if row:
            return row["id"]
        return conn.execute(
            "INSERT INTO app.policy_versions(company_id,kind,version,effective_from,parameters,validation_status,actor_id) SELECT %s,'upload',coalesce(max(version),0)+1,current_date,%s,'evaluated',%s FROM app.policy_versions WHERE company_id=%s AND kind='upload' RETURNING id",
            (
                company,
                Jsonb(
                    {
                        "max_files": 10,
                        "auto_interpretation": self.settings.auto_interpretation,
                        "auto_financial": self.settings.auto_financial,
                        "auto_analysis": self.settings.auto_analysis,
                        "max_nonempty_rows": self.settings.max_rows,
                        "max_file_bytes": self.settings.max_file_bytes,
                        "max_expanded_bytes": self.settings.max_expanded_bytes,
                    }
                ),
                actor["id"],
                company,
            ),
        ).fetchone()["id"]

    @staticmethod
    def _operation(conn, actor, company, session, kind, request_id, access):
        row = conn.execute(
            "INSERT INTO app.operations(company_id,requested_by,kind,entity_id,status,finished_at) VALUES(%s,%s,%s,%s,'succeeded',clock_timestamp()) RETURNING id",
            (company, actor["id"], kind, session),
        ).fetchone()
        access.audit(
            company,
            str(actor["id"]),
            kind,
            "processing_session",
            str(session),
            request_id,
        )
        return response(
            {"operation_id": row["id"], "status": "accepted", "resource_id": session},
            202,
        )

    def _answer(
        self,
        conn,
        repo,
        actor,
        company,
        session,
        issue_id,
        body,
        key,
        request_id,
        access,
    ):
        issue = conn.execute(
            "SELECT * FROM app.processing_issues WHERE company_id=%s AND id=%s FOR UPDATE",
            (company, issue_id),
        ).fetchone()
        if (
            session["status"] in TERMINAL
            or issue["resolved_at"]
            or issue["superseded_at"]
        ):
            raise conflict("question_closed")
        if issue["code"].startswith("forecast_"):
            from .forecast_commands import answer_forecast

            return answer_forecast(
                conn,
                repo,
                actor,
                company,
                session,
                issue,
                body,
                key,
                request_id,
                access,
            )
        if issue["code"].startswith("financial_"):
            from .financial_commands import answer_financial

            return answer_financial(
                conn,
                repo,
                actor,
                company,
                session,
                issue,
                body,
                key,
                request_id,
                access,
            )
        if issue["code"] == "input_review_clarification":
            from .input_review_answers import answer_review

            return answer_review(
                conn,
                repo,
                actor,
                company,
                session,
                issue,
                body,
                key,
                request_id,
                access,
            )
        if issue["code"].startswith("interpretation_"):
            return answer_interpretation(
                conn,
                repo,
                actor,
                company,
                session,
                issue,
                body,
                key,
                request_id,
                access,
            )
        answer = body["answer"]
        if (
            issue["code"] != "csv_encoding"
            or answer["kind"] != "choice"
            or answer.get("value") not in issue["answer_constraints"]["choices"]
        ):
            raise ApiError(422, "answer_not_allowed", "پاسخ با این سؤال سازگار نیست.")
        file_id = issue["root_key"].split(":", 1)[1]
        row = conn.execute(
            "INSERT INTO app.issue_answers(company_id,issue_id,actor_id,expected_session_version,answer,idempotency_key) VALUES(%s,%s,%s,%s,%s,%s) RETURNING id",
            (
                company,
                issue_id,
                actor["id"],
                session["session_version"],
                Jsonb(answer),
                key,
            ),
        ).fetchone()
        conn.execute(
            "UPDATE app.session_files SET preparation_settings=%s WHERE company_id=%s AND session_id=%s AND source_file_id=%s",
            (Jsonb({"encoding": answer["value"]}), company, session["id"], file_id),
        )
        conn.execute(
            "UPDATE app.processing_issues SET resolved_at=clock_timestamp() WHERE company_id=%s AND id=%s",
            (company, issue_id),
        )
        step = conn.execute(
            "UPDATE app.processing_steps SET status='pending',fence=fence+1,lease_expires_at=NULL WHERE company_id=%s AND session_id=%s AND step_kind=%s RETURNING id",
            (company, session["id"], "prepare:" + file_id),
        ).fetchone()
        repo.enqueue(company, str(session["id"]), str(step["id"]), file_id)
        remaining = conn.execute(
            "SELECT 1 FROM app.processing_issues WHERE company_id=%s AND session_id=%s AND required AND resolved_at IS NULL AND superseded_at IS NULL LIMIT 1",
            (company, session["id"]),
        ).fetchone()
        updated = conn.execute(
            "UPDATE app.processing_sessions SET status=%s,session_version=session_version+1 WHERE company_id=%s AND id=%s RETURNING *",
            ("waiting_input" if remaining else "sealed", company, session["id"]),
        ).fetchone()
        access.audit(
            company,
            str(actor["id"]),
            "issue.answered",
            "processing_issue",
            issue_id,
            request_id,
        )
        return response(
            {
                "id": row["id"],
                "issue_id": issue_id,
                "session_id": session["id"],
                "session_version": updated["session_version"],
                "status": updated["status"],
            },
            201,
            etag=updated["session_version"],
        )
