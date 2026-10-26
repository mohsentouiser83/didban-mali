"""Explicit configured policies do not silently replace pinned execution versions."""

from __future__ import annotations


def configured_policy(conn, company, kind, effective_on=None):
    return conn.execute(
        "SELECT p.* FROM app.policy_versions p JOIN app.policy_configuration_events e ON e.company_id=p.company_id AND e.policy_id=p.id JOIN app.companies c ON c.id=p.company_id WHERE p.company_id=%s AND p.kind=%s AND p.effective_from<=coalesce(%s::date,(clock_timestamp() AT TIME ZONE c.timezone)::date) ORDER BY p.version DESC LIMIT 1",
        (company, kind, effective_on),
    ).fetchone()


def policy_view(row):
    parameters = row["parameters"]
    if row["kind"] == "upload":
        parameters = {
            k: parameters[k]
            for k in ("max_files", "max_file_bytes", "max_expanded_bytes")
            if k in parameters
        } | {
            "max_data_rows": parameters.get(
                "max_data_rows", parameters.get("max_nonempty_rows")
            )
        }
    return {
        k: row[k]
        for k in ("id", "kind", "version", "effective_from", "validation_status")
    } | {"parameters": parameters, "created_at": row["created_at"]}


def source_view(row):
    return {
        k: row[k]
        for k in (
            "id",
            "original_name",
            "sha256",
            "byte_size",
            "format",
            "scan_status",
            "created_at",
        )
    } | {"archived": row["archived_at"] is not None, "version": row["row_version"]}


def dependencies(conn, company, file_id):
    return [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM app.source_dependency_rows(%s,%s)", (company, file_id)
        ).fetchall()
    ]
