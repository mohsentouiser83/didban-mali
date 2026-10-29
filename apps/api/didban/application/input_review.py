"""Versioned, durable human review before financial effects or publication."""

from __future__ import annotations
from psycopg.types.json import Jsonb
from ..errors import ApiError, conflict, missing
from ..domain.source_profiles import PROFILES
from ..infrastructure.intake import IntakeRepository
from ..infrastructure.input_review import (
    fingerprint,
    ready,
    overview,
    comment_view,
    proposal_view,
    correction_sheets,
)
from ..infrastructure.financial import schedule
from .auth import response
from .interpretation_commands import resume

TERMINAL = {"completed", "completed_limited", "cancelled", "failed"}


class InputReviewService:
    def __init__(self, intake):
        self.intake = intake

    def present(self, conn, company, session):
        hash_value = fingerprint(conn, str(session["id"]))
        comments = conn.execute(
            "SELECT * FROM app.input_review_comments WHERE company_id=%s AND session_id=%s ORDER BY created_at,id",
            (company, session["id"]),
        ).fetchall()
        proposals = conn.execute(
            "SELECT * FROM app.input_review_proposals WHERE company_id=%s AND session_id=%s ORDER BY created_at,id",
            (company, session["id"]),
        ).fetchall()
        confirmed = ready(conn, str(session["id"]))
        return {
            "session_id": session["id"],
            "session_version": session["session_version"],
            "required": session["input_review_required"],
            "ready": bool(session["interpretation_finished_at"]),
            "confirmed": confirmed,
            "snapshot_hash": hash_value,
            "overview": overview(conn, company, session),
            "comments": [comment_view(r) for r in comments],
            "proposals": [proposal_view(r) for r in proposals],
            "can_confirm": bool(
                session["status"] == "waiting_dependency"
                and session["interpretation_finished_at"]
                and not session["manifest_id"]
                and not any(c["status"] == "open" for c in comments)
                and not any(p["status"] in ("pending", "proposed") for p in proposals)
            ),
        }

    def execute(
        self, op, actor, company, ids, body, key, expected, request_id, limit, cursor
    ):
        with self.intake.db.transaction(
            identity=False, actor=str(actor["id"]), company=company
        ) as conn:
            access = self.intake.authorize(conn, actor, company, True)
            # Hold current membership through commit; a concurrent revoke cannot
            # pass authorization and then race confirmation/application of edits.
            if not conn.execute(
                "SELECT app.lock_input_review_actor(%s) AS allowed", (company,)
            ).fetchone()["allowed"]:
                raise ApiError(403, "permission_denied", "اجازه این عملیات را ندارید.")
            repo = IntakeRepository(conn)
            session = repo.session(company, ids["session_id"], True)
            if not session:
                raise missing()
            if op == "getInputReview":
                return response(
                    self.present(conn, company, session),
                    etag=session["session_version"],
                )

            def action():
                self.intake._version(session, expected)
                if session["status"] in TERMINAL or session["manifest_id"]:
                    raise conflict("input_review_not_editable")
                if (
                    not session["interpretation_finished_at"]
                    or session["status"] != "waiting_dependency"
                ):
                    raise conflict("input_review_not_ready")
                current = fingerprint(conn, str(session["id"]))
                if "snapshot_hash" in body and body["snapshot_hash"] != current:
                    raise conflict("input_review_version_conflict")
                if op == "createInputReviewComment":
                    if body.get("file_id"):
                        file = next(
                            (
                                f
                                for f in repo.files(company, session["id"])
                                if str(f["id"]) == body["file_id"]
                            ),
                            None,
                        )
                        if not file:
                            raise missing()
                        if body.get("sheet_name") and not any(
                            p["sheet_name"] == body["sheet_name"]
                            for p in file["interpretation_preview"]
                        ):
                            raise ApiError(
                                422,
                                "invalid_review_target",
                                "شیت انتخاب‌شده در این فایل نیست.",
                            )
                        if body.get("account_code"):
                            available = overview(conn, company, session)["accounts"]
                            if not any(
                                a["file_id"] == body["file_id"]
                                and a["sheet_name"] == body.get("sheet_name")
                                and a["account_code"] == body["account_code"]
                                for a in available
                            ):
                                raise ApiError(
                                    422,
                                    "invalid_review_target",
                                    "حساب انتخاب‌شده در این شیت نیست.",
                                )
                    elif body.get("sheet_name") or body.get("account_code"):
                        raise ApiError(
                            422,
                            "invalid_review_target",
                            "ابتدا فایل مرتبط را انتخاب کنید.",
                        )
                    conn.execute(
                        """INSERT INTO app.input_review_comments(company_id,session_id,actor_id,snapshot_hash,body,file_id,sheet_name,account_code)
                    VALUES(%s,%s,%s,%s,%s,%s,%s,%s)""",
                        (
                            company,
                            session["id"],
                            actor["id"],
                            current,
                            body["body"].strip(),
                            body.get("file_id"),
                            body.get("sheet_name"),
                            body.get("account_code"),
                        ),
                    )
                elif op == "resolveInputReviewComment":
                    comment = conn.execute(
                        "SELECT * FROM app.input_review_comments WHERE company_id=%s AND session_id=%s AND id=%s FOR UPDATE",
                        (company, session["id"], ids["comment_id"]),
                    ).fetchone()
                    if not comment:
                        raise missing()
                    if comment["status"] != "open":
                        raise conflict("review_comment_resolved")
                    if conn.execute(
                        "SELECT 1 FROM app.input_review_proposals WHERE company_id=%s AND comment_id=%s AND status IN('pending','proposed')",
                        (company, comment["id"]),
                    ).fetchone():
                        raise conflict("review_proposal_unresolved")
                    conn.execute(
                        "UPDATE app.input_review_comments SET status='resolved',resolved_by=%s,resolved_at=clock_timestamp(),resolution=%s WHERE company_id=%s AND id=%s",
                        (actor["id"], body["reason"].strip(), company, comment["id"]),
                    )
                elif op == "proposeInputReviewCorrection":
                    comment = conn.execute(
                        "SELECT * FROM app.input_review_comments WHERE company_id=%s AND session_id=%s AND id=%s FOR UPDATE",
                        (company, session["id"], body["comment_id"]),
                    ).fetchone()
                    if not comment:
                        raise missing()
                    if comment["status"] != "open":
                        raise conflict("review_comment_resolved")
                    if conn.execute(
                        "SELECT 1 FROM app.input_review_proposals WHERE company_id=%s AND comment_id=%s AND status IN('pending','proposed')",
                        (company, comment["id"]),
                    ).fetchone():
                        raise conflict("review_proposal_pending")
                    context = {
                        "comment": comment["body"],
                        "accounts": overview(conn, company, session)["accounts"],
                        "sheets": correction_sheets(conn, company, str(session["id"])),
                    }
                    if comment["file_id"]:
                        context["accounts"] = [
                            a
                            for a in context["accounts"]
                            if a["file_id"] == str(comment["file_id"])
                            and (
                                not comment["sheet_name"]
                                or a["sheet_name"] == comment["sheet_name"]
                            )
                            and (
                                not comment["account_code"]
                                or a["account_code"] == comment["account_code"]
                            )
                        ]
                    context["sheets"] = [
                        s
                        for s in context["sheets"]
                        if (
                            not comment["file_id"]
                            or s["file_id"] == str(comment["file_id"])
                        )
                        and (
                            not comment["sheet_name"]
                            or s["sheet_name"] == comment["sheet_name"]
                        )
                    ][:8]
                    context["allowed_mapping_fields"] = {
                        k: list(req + opt + ["currency"])
                        for k, (req, opt) in PROFILES.items()
                    }
                    context["accounts"] = context["accounts"][:40]
                    proposal = conn.execute(
                        "INSERT INTO app.input_review_proposals(company_id,session_id,comment_id,actor_id,snapshot_hash,context) VALUES(%s,%s,%s,%s,%s,%s) RETURNING id",
                        (
                            company,
                            session["id"],
                            comment["id"],
                            actor["id"],
                            current,
                            Jsonb(context),
                        ),
                    ).fetchone()
                    conn.execute(
                        "INSERT INTO app.outbox_events(company_id,session_id,event_kind,dedupe_key,payload) VALUES(%s,%s,'input_review.propose',%s,%s)",
                        (
                            company,
                            session["id"],
                            "input-review:" + str(proposal["id"]),
                            Jsonb({"proposal_id": str(proposal["id"])}),
                        ),
                    )
                elif op == "decideInputReviewCorrection":
                    proposal = conn.execute(
                        "SELECT * FROM app.input_review_proposals WHERE company_id=%s AND session_id=%s AND id=%s FOR UPDATE",
                        (company, session["id"], ids["proposal_id"]),
                    ).fetchone()
                    if not proposal:
                        raise missing()
                    if proposal["status"] not in (
                        "proposed",
                        "ambiguous",
                        "unavailable",
                        "usage_unknown",
                    ):
                        raise conflict("review_proposal_not_ready")
                    if body["accept"]:
                        if (
                            proposal["status"] != "proposed"
                            or proposal["snapshot_hash"] != current
                        ):
                            raise conflict("review_proposal_stale")
                        change = proposal["content"]
                        source = next(
                            (
                                f
                                for f in repo.files(company, session["id"])
                                if str(f["id"]) == change["file_id"]
                            ),
                            None,
                        )
                        if not source:
                            raise missing()
                        settings = source["interpretation_settings"]
                        selected = settings.setdefault("sheets", {}).setdefault(
                            change["sheet_name"], {}
                        )
                        selected["actor_id"] = str(actor["id"])
                        selected["reason"] = body["reason"].strip()
                        if change["action"] == "set_account_role":
                            selected.setdefault("account_roles", {})[
                                change["account_code"]
                            ] = change["role"]
                        elif change["action"] == "set_column_mapping":
                            selected["mapping"] = change["mapping"]
                            selected["header_row"] = change["header_row"]
                            selected["source_kind"] = change["source_kind"]
                        else:
                            raise conflict("review_proposal_invalid")
                        conn.execute(
                            "UPDATE app.session_files SET interpretation_settings=%s WHERE company_id=%s AND session_id=%s AND source_file_id=%s",
                            (Jsonb(settings), company, session["id"], source["id"]),
                        )
                        resume(conn, repo, company, session["id"], source["id"])
                        conn.execute(
                            "UPDATE app.input_review_comments SET status='resolved',resolved_by=%s,resolved_at=clock_timestamp(),resolution=%s WHERE company_id=%s AND id=%s",
                            (
                                actor["id"],
                                body["reason"].strip(),
                                company,
                                proposal["comment_id"],
                            ),
                        )
                    conn.execute(
                        "UPDATE app.input_review_proposals SET status=%s,decided_by=%s,decided_at=clock_timestamp() WHERE company_id=%s AND id=%s",
                        (
                            "accepted" if body["accept"] else "rejected",
                            actor["id"],
                            company,
                            proposal["id"],
                        ),
                    )
                elif op == "confirmInputReview":
                    pending = conn.execute(
                        "SELECT 1 FROM app.input_review_comments WHERE company_id=%s AND session_id=%s AND status='open' UNION ALL SELECT 1 FROM app.input_review_proposals WHERE company_id=%s AND session_id=%s AND status IN('pending','proposed') LIMIT 1",
                        (company, session["id"], company, session["id"]),
                    ).fetchone()
                    if pending:
                        raise conflict("input_review_unresolved")
                    conn.execute(
                        "INSERT INTO app.input_review_confirmations(company_id,session_id,actor_id,snapshot_hash) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                        (company, session["id"], actor["id"], current),
                    )
                    schedule(conn, company, session["id"])
                    conn.execute(
                        "UPDATE app.processing_sessions SET status='sealed' WHERE company_id=%s AND id=%s",
                        (company, session["id"]),
                    )
                else:
                    raise missing()
                updated = conn.execute(
                    "UPDATE app.processing_sessions SET session_version=session_version+1 WHERE company_id=%s AND id=%s RETURNING *",
                    (company, session["id"]),
                ).fetchone()
                access.audit(
                    company,
                    str(actor["id"]),
                    "input_review." + op,
                    "processing_session",
                    str(session["id"]),
                    request_id,
                )
                return response(
                    self.present(conn, company, updated),
                    etag=updated["session_version"],
                )

            return self.intake.replay.run(
                conn,
                identity=False,
                scope=company + ":" + str(actor["id"]),
                actor=str(actor["id"]),
                company=company,
                route=op + ":" + str(ids),
                key=key,
                payload={"body": body, "expected_version": expected},
                action=action,
            )
