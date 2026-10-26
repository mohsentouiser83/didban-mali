from __future__ import annotations
from psycopg.types.json import Jsonb
from ..errors import ApiError, missing, conflict
from ..domain.source_profiles import PROFILES
from ..infrastructure.intake import IntakeRepository
from ..infrastructure.interpretation import schedule, summary_view, preview_view
from .auth import response
from .interpretation_commands import resume
from .start_interpretation import start


class InterpretationService:
    def __init__(self, intake):
        self.intake = intake

    def execute(
        self, op, actor, company, ids, body, key, expected, request_id, limit, cursor
    ):
        with self.intake.db.transaction(
            identity=False, actor=str(actor["id"]), company=company
        ) as conn:
            access = self.intake.authorize(
                conn,
                actor,
                company,
                op in ("configureSessionInterpretation", "startSessionInterpretation"),
            )
            repo = IntakeRepository(conn)
            session = repo.session(
                company,
                ids["session_id"],
                op in ("configureSessionInterpretation", "startSessionInterpretation"),
            )
            if not session:
                raise missing()
            if op == "startSessionInterpretation":
                return start(
                    self.intake,
                    conn,
                    repo,
                    actor,
                    company,
                    session,
                    key,
                    expected,
                    request_id,
                    access,
                )
            file = next(
                (
                    f
                    for f in repo.files(company, ids["session_id"])
                    if str(f["id"]) == ids["file_id"]
                ),
                None,
            )
            if not file:
                raise missing()
            if op == "getSessionInterpretation":
                return response(
                    {
                        "file_id": file["id"],
                        "original_name": file["original_name"],
                        "session_version": session["session_version"],
                        "run_id": file["interpretation_run_id"],
                        "previews": preview_view(file),
                        "summary": summary_view(file["interpretation_summary"]),
                        "profiles": [
                            {
                                "source_kind": k,
                                "required_fields": req,
                                "optional_fields": [*opt, "currency"],
                            }
                            for k, (req, opt) in PROFILES.items()
                        ],
                    }
                )
            if op == "listNormalizedRows":
                resource = "normalized:" + str(file["interpretation_run_id"])
                position = self.intake.security.read_cursor(
                    cursor, resource, str(actor["id"]), company
                )
                rows = conn.execute(
                    """SELECT n.*,r.row_number,r.raw_values,i.sheet_name FROM app.normalized_source_rows n
                  JOIN app.source_rows r ON r.company_id=n.company_id AND r.id=n.source_row_id JOIN app.interpretation_versions i ON i.company_id=r.company_id AND i.id=r.interpretation_id
                  WHERE n.company_id=%s AND n.run_id=%s AND (%s::timestamptz IS NULL OR (n.created_at,n.id)>(%s::timestamptz,%s::uuid)) ORDER BY n.created_at,n.id LIMIT %s""",
                    (
                        company,
                        file["interpretation_run_id"],
                        position[0] if position else None,
                        position[0] if position else None,
                        position[1] if position else None,
                        limit + 1,
                    ),
                ).fetchall()
                return response(
                    {
                        "items": [
                            {
                                "id": r["id"],
                                "sheet_name": r["sheet_name"],
                                "row_number": r["row_number"],
                                "source_kind": r["source_kind"],
                                "state": r["state"],
                                "raw_values": r["raw_values"],
                                "values": [
                                    {
                                        "field": k,
                                        "value": str(v).lower()
                                        if isinstance(v, bool)
                                        else str(v)
                                        if v is not None
                                        else None,
                                    }
                                    for k, v in r["canonical_values"].items()
                                    if k != "role_evidence"
                                ],
                                "error_codes": r["error_codes"],
                            }
                            for r in rows[:limit]
                        ],
                        "next_cursor": self.intake.security.cursor(
                            resource, str(actor["id"]), company, rows[limit - 1]
                        )
                        if len(rows) > limit
                        else None,
                    }
                )

            def action():
                self.intake._version(session, expected)
                if (
                    session["status"]
                    in (
                        "receiving",
                        "cancelled",
                        "failed",
                        "completed",
                        "completed_limited",
                    )
                    or session["manifest_id"] is not None
                    or not session["preparation_finished_at"]
                ):
                    raise conflict("interpretation_not_editable")
                settings = file["interpretation_settings"]
                sheets = settings.setdefault("sheets", {})
                preview = next(
                    (
                        p
                        for p in file["interpretation_preview"]
                        if p["sheet_name"] == body["sheet_name"]
                    ),
                    None,
                )
                if not preview:
                    raise ApiError(422, "sheet_not_available", "شیت قابل انتخاب نیست.")
                kind = body["source_kind"]
                mapping = {
                    m["target_field"]: int(m["source_column"]) for m in body["mapping"]
                }
                if (
                    len(mapping) != len(body["mapping"])
                    or len(set(mapping.values())) != len(mapping)
                    or any(v > len(preview["columns"]) for v in mapping.values())
                ):
                    raise ApiError(
                        422,
                        "invalid_mapping",
                        "هر ستون را فقط به یک فیلد معتبر متصل کنید.",
                    )
                if kind != "ignore" and (
                    not set(PROFILES[kind][0]) <= mapping.keys()
                    or not mapping.keys()
                    <= set(PROFILES[kind][0] + PROFILES[kind][1] + ["currency"])
                ):
                    raise ApiError(
                        422,
                        "invalid_mapping",
                        "ستون‌های ضروری را کامل و درست نگاشت کنید.",
                    )
                if kind == "bank" and not (
                    "amount" in mapping or {"deposit", "withdrawal"} <= mapping.keys()
                ):
                    raise ApiError(
                        422,
                        "invalid_mapping",
                        "ستون مبلغ یا ستون‌های واریز و برداشت را انتخاب کنید.",
                    )
                if not body["reason"].strip():
                    raise ApiError(422, "reason_required", "دلیل اصلاح را وارد کنید.")
                sheets[body["sheet_name"]] = {
                    **sheets.get(body["sheet_name"], {}),
                    **body,
                    "mapping": mapping,
                    "actor_id": str(actor["id"]),
                }
                conn.execute(
                    "UPDATE app.session_files SET interpretation_settings=%s,interpretation_summary=NULL,interpretation_run_id=NULL WHERE company_id=%s AND session_id=%s AND source_file_id=%s",
                    (Jsonb(settings), company, session["id"], file["id"]),
                )
                conn.execute(
                    "UPDATE app.processing_issues SET superseded_at=clock_timestamp() WHERE company_id=%s AND session_id=%s AND resolved_at IS NULL AND superseded_at IS NULL AND answer_constraints->>'file_id'=%s",
                    (company, session["id"], str(file["id"])),
                )
                schedule(conn, company, session["id"], file["id"])
                conn.execute(
                    "UPDATE app.processing_steps SET checkpoint='{}' WHERE company_id=%s AND session_id=%s AND step_kind=%s",
                    (company, session["id"], "interpret:" + str(file["id"])),
                )
                updated = resume(conn, repo, company, session["id"], file["id"])
                access.audit(
                    company,
                    str(actor["id"]),
                    "interpretation.configured",
                    "source_file",
                    str(file["id"]),
                    request_id,
                )
                return response(
                    {
                        "operation_id": self.intake._operation(
                            conn,
                            actor,
                            company,
                            session["id"],
                            "interpretation_configured",
                            request_id,
                            access,
                        )["body"]["operation_id"],
                        "resource_id": session["id"],
                        "status": "accepted",
                    },
                    202,
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
                payload={"body": body, "version": expected},
                action=action,
            )
