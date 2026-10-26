"""Immutable policy administration and dependency-preserving source lifecycle."""

from __future__ import annotations
from datetime import date
from psycopg.types.json import Jsonb
from ..errors import ApiError, forbidden, missing, conflict
from ..domain.policies import validate_parameters
from ..infrastructure.company import CompanyRepository
from ..infrastructure.policies import (
    policy_view,
    source_view,
    dependencies,
    configured_policy,
)
from .auth import response

READS = {
    "getUploadPolicy",
    "listPolicies",
    "listSourceFiles",
    "getRetentionPolicy",
    "getSourceDeletionImpact",
}


class PolicyService:
    def __init__(self, intake):
        self.intake = intake

    def execute(
        self, op, actor, company, ids, body, key, expected, request_id, limit, cursor
    ):
        with self.intake.db.transaction(
            identity=False, actor=str(actor["id"]), company=company
        ) as conn:
            access = CompanyRepository(conn)
            if not access.require_session(actor):
                raise ApiError(401, "authentication_required", "وارد حساب خود شوید.")
            if not access.company(company):
                raise missing()
            role = access.role(company)
            if op == "createPolicyVersion" and role not in ("owner", "finance_manager"):
                raise forbidden()
            if (
                op
                in (
                    "updateRetentionPolicy",
                    "archiveSourceFile",
                    "deleteSourceFile",
                    "getSourceDeletionImpact",
                )
                and role != "owner"
            ):
                raise forbidden()

            def audit(action, entity, details=None):
                access.audit(
                    company,
                    str(actor["id"]),
                    action,
                    "source_policy",
                    str(entity),
                    request_id,
                    details,
                )

            def action():
                if op == "getUploadPolicy":
                    configured = configured_policy(conn, company, "upload")
                    params = configured["parameters"] if configured else {}
                    return response(
                        {
                            "max_files": params.get("max_files", 10),
                            "max_data_rows": params.get(
                                "max_data_rows", self.intake.settings.max_rows
                            ),
                            "max_file_bytes": params.get(
                                "max_file_bytes", self.intake.settings.max_file_bytes
                            ),
                            "max_expanded_bytes": params.get(
                                "max_expanded_bytes",
                                self.intake.settings.max_expanded_bytes,
                            ),
                            "formats": ["csv", "xls", "xlsx"],
                        }
                    )
                if op in ("listPolicies", "listSourceFiles"):
                    resource = "policies" if op == "listPolicies" else "source_files"
                    position = self.intake.security.read_cursor(
                        cursor, resource, str(actor["id"]), company
                    )
                    table = (
                        "policy_versions" if op == "listPolicies" else "source_files"
                    )
                    where = " AND (created_at,id)>(%s,%s)" if position else ""
                    rows = conn.execute(
                        "SELECT * FROM app."
                        + table
                        + " WHERE company_id=%s"
                        + where
                        + " ORDER BY created_at,id LIMIT %s",
                        (company, *(position or ()), limit + 1),
                    ).fetchall()
                    visible = rows[:limit]
                    return response(
                        {
                            "items": list(
                                map(
                                    policy_view
                                    if op == "listPolicies"
                                    else source_view,
                                    visible,
                                )
                            ),
                            "next_cursor": self.intake.security.cursor(
                                resource, str(actor["id"]), company, visible[-1]
                            )
                            if len(rows) > limit
                            else None,
                        }
                    )
                if op == "createPolicyVersion":
                    kind = body["kind"]
                    params, status = validate_parameters(
                        kind, body["parameters"], self.intake.settings
                    )
                    effective = date.fromisoformat(body["effective_from"])
                    local_today = conn.execute(
                        "SELECT (clock_timestamp() AT TIME ZONE timezone)::date AS today FROM app.companies WHERE id=%s",
                        (company,),
                    ).fetchone()["today"]
                    if effective < local_today:
                        raise ApiError(
                            422,
                            "policy_effective_date",
                            "تاریخ اثر نباید در گذشته باشد.",
                        )
                    conn.execute(
                        "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
                        (company + ":" + kind + "-policy",),
                    )
                    row = conn.execute(
                        "INSERT INTO app.policy_versions(company_id,kind,version,effective_from,parameters,validation_status,actor_id) SELECT %s,%s,coalesce(max(version),0)+1,%s,%s,%s,%s FROM app.policy_versions WHERE company_id=%s AND kind=%s RETURNING *",
                        (
                            company,
                            kind,
                            effective,
                            Jsonb(params),
                            status,
                            actor["id"],
                            company,
                            kind,
                        ),
                    ).fetchone()
                    conn.execute(
                        "INSERT INTO app.policy_configuration_events(company_id,policy_id,actor_id,reason) VALUES(%s,%s,%s,%s)",
                        (company, row["id"], actor["id"], body["reason"].strip()),
                    )
                    audit(
                        "policy.configured",
                        row["id"],
                        {
                            "kind": kind,
                            "version": row["version"],
                            "validation_status": status,
                            "reason": body["reason"].strip(),
                        },
                    )
                    return response(policy_view(row), 201)
                if op in ("getRetentionPolicy", "updateRetentionPolicy"):
                    if op == "updateRetentionPolicy":
                        conn.execute(
                            "INSERT INTO app.retention_settings(company_id,changed_by) VALUES(%s,%s) ON CONFLICT(company_id) DO NOTHING",
                            (company, actor["id"]),
                        )
                    row = conn.execute(
                        "SELECT * FROM app.retention_settings WHERE company_id=%s"
                        + (" FOR UPDATE" if op == "updateRetentionPolicy" else ""),
                        (company,),
                    ).fetchone()
                    if op == "updateRetentionPolicy":
                        if row["row_version"] != expected:
                            raise conflict()
                        previous_days = row["retention_days"]
                        row = conn.execute(
                            "UPDATE app.retention_settings SET retention_days=%s,changed_by=%s WHERE company_id=%s RETURNING *",
                            (body["retention_days"], actor["id"], company),
                        ).fetchone()
                        conn.execute(
                            "INSERT INTO app.source_lifecycle_events(company_id,entity_id,actor_id,action,reason,details) VALUES(%s,%s,%s,'retention_changed',%s,%s)",
                            (
                                company,
                                row["id"],
                                actor["id"],
                                body["reason"].strip(),
                                Jsonb(
                                    {
                                        "retention_days": body["retention_days"],
                                        "previous_retention_days": previous_days,
                                        "automatic_deletion": False,
                                    }
                                ),
                            ),
                        )
                        audit(
                            "retention.updated",
                            row["id"],
                            {
                                "retention_days": body["retention_days"],
                                "previous_retention_days": previous_days,
                                "automatic_deletion": False,
                            },
                        )
                    result = {
                        "company_id": company,
                        "retention_days": row["retention_days"] if row else None,
                        "automatic_deletion": False,
                        "version": row["row_version"] if row else 1,
                    }
                    return response(result, etag=result["version"])
                row = conn.execute(
                    "SELECT * FROM app.source_files WHERE company_id=%s AND id=%s"
                    + (" FOR UPDATE" if op != "getSourceDeletionImpact" else ""),
                    (company, ids["file_id"]),
                ).fetchone()
                if not row:
                    raise missing()
                deps = dependencies(conn, company, row["id"])
                if op == "getSourceDeletionImpact":
                    return response(
                        {
                            "source_file_id": row["id"],
                            "hard_delete_allowed": not deps,
                            "dependencies": deps,
                            "version": row["row_version"],
                        }
                    )
                if row["row_version"] != expected:
                    raise conflict()
                if op == "archiveSourceFile":
                    row = conn.execute(
                        "UPDATE app.source_files SET archived_at=CASE WHEN %s THEN coalesce(archived_at,clock_timestamp()) ELSE NULL END WHERE company_id=%s AND id=%s RETURNING *",
                        (body["archived"], company, row["id"]),
                    ).fetchone()
                    verb = "archived" if body["archived"] else "restored"
                    conn.execute(
                        "INSERT INTO app.source_lifecycle_events(company_id,entity_id,actor_id,action,reason) VALUES(%s,%s,%s,%s,%s)",
                        (
                            company,
                            row["id"],
                            actor["id"],
                            verb,
                            "explicit_source_archive",
                        ),
                    )
                    audit("source." + verb, row["id"])
                    return response(source_view(row), etag=row["row_version"])
                if op == "deleteSourceFile":
                    if deps:
                        raise ApiError(
                            409,
                            "source_has_dependencies",
                            "فایل دارای سابقه وابسته است؛ فقط بایگانی مجاز است.",
                        )
                    if not body.get("confirmed") or not body["reason"].strip():
                        raise ApiError(
                            422,
                            "delete_confirmation_required",
                            "تأیید و دلیل حذف لازم است.",
                        )
                    # Source lock plus FK checks serializes a new dependency against deletion.
                    operation = conn.execute(
                        "INSERT INTO app.operations(company_id,requested_by,kind,entity_id,status) VALUES(%s,%s,'delete_source',%s,'accepted') RETURNING id",
                        (company, actor["id"], row["id"]),
                    ).fetchone()["id"]
                    conn.execute(
                        "INSERT INTO app.source_deletion_jobs(company_id,entity_id,operation_id,object_key,actor_id) VALUES(%s,%s,%s,%s,%s)",
                        (company, row["id"], operation, row["object_key"], actor["id"]),
                    )
                    conn.execute(
                        "DELETE FROM app.source_files WHERE company_id=%s AND id=%s",
                        (company, row["id"]),
                    )
                    conn.execute(
                        "INSERT INTO app.source_lifecycle_events(company_id,entity_id,actor_id,action,reason) VALUES(%s,%s,%s,'delete_requested',%s)",
                        (company, row["id"], actor["id"], body["reason"].strip()),
                    )
                    audit("source.delete_requested", row["id"])
                    return response(
                        {
                            "operation_id": operation,
                            "status": "accepted",
                            "resource_id": row["id"],
                        },
                        202,
                    )
                raise missing()

            if op in READS:
                return action()
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
