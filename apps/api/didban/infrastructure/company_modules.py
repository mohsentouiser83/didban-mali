"""Versioned module configuration, serialized on the company's row."""

from __future__ import annotations
from psycopg.types.json import Jsonb
from ..domain.company_modules import DEFAULT_MODULES


def module_settings(conn, company: str) -> dict:
    row = conn.execute(
        "SELECT modules,row_version FROM app.company_module_settings WHERE company_id=%s",
        (company,),
    ).fetchone()
    return {
        "company_id": company,
        "modules": dict(row["modules"]) if row else dict(DEFAULT_MODULES),
        "version": row["row_version"] if row else 1,
    }


def save_modules(conn, company: str, body: dict, actor: str) -> dict:
    conn.execute(
        """INSERT INTO app.company_module_settings(company_id,modules,changed_by,reason)
    VALUES(%s,%s,%s,%s) ON CONFLICT(company_id) DO UPDATE SET modules=excluded.modules,
    changed_by=excluded.changed_by,reason=excluded.reason""",
        (company, Jsonb(body["modules"]), actor, body["reason"].strip()),
    )
    return module_settings(conn, company)


def lock_module_configuration(conn, company: str) -> None:
    conn.execute(
        "SELECT pg_advisory_xact_lock_shared(hashtextextended(%s,0))",
        (company + ":modules",),
    )


def require_module(conn, company: str, module: str) -> None:
    from ..errors import ApiError

    lock_module_configuration(conn, company)
    if not module_settings(conn, company)["modules"][module]:
        raise ApiError(
            409, "company_module_disabled", "ماژول این عملیات برای شرکت غیرفعال است."
        )
