"""Read immutable interpretation identities and build bounded review evidence."""

from __future__ import annotations
from decimal import Decimal, localcontext
from ..domain.financial.common import amount, decimal_text, UnsafeFinancialData
from .intake import IntakeRepository


def fingerprint(conn, session: str) -> str:
    return conn.execute(
        "SELECT app.input_review_hash(%s) AS hash", (session,)
    ).fetchone()["hash"]


def ready(conn, session: str) -> bool:
    return bool(
        conn.execute(
            "SELECT app.input_review_ready(%s) AS ready", (session,)
        ).fetchone()["ready"]
    )


def accounts(conn, company: str, session: str) -> list[dict]:
    rows = conn.execute(
        """SELECT DISTINCT sf.source_file_id::text AS file_id,i.sheet_name,
    n.canonical_values->>'account' AS account_code,n.canonical_values->>'account_name' AS account_name,
    n.canonical_values->>'role' AS role FROM app.session_files sf
    JOIN app.normalized_source_rows n ON n.company_id=sf.company_id AND n.run_id=sf.interpretation_run_id
    JOIN app.source_rows r ON r.company_id=n.company_id AND r.id=n.source_row_id
    JOIN app.interpretation_versions i ON i.company_id=r.company_id AND i.id=r.interpretation_id
    WHERE sf.company_id=%s AND sf.session_id=%s AND n.state='valid' AND n.canonical_values ? 'account'
    ORDER BY file_id,i.sheet_name,account_code LIMIT 200""",
        (company, session),
    ).fetchall()
    return [{**r, "account_name": r["account_name"] or r["account_code"]} for r in rows]


def overview(conn, company: str, session: dict) -> dict:
    files = IntakeRepository(conn).files(company, session["id"])
    kinds = set()
    presented = []
    for file in files:
        previews = file.get("interpretation_preview") or []
        summary = file.get("interpretation_summary") or {}
        source_kinds = sorted(
            {
                p["source_kind"]
                for p in summary.get("sheets", [])
                if p.get("source_kind")
            }
        )
        kinds.update(source_kinds)
        summary = file.get("interpretation_summary") or {}
        presented.append(
            {
                "file_id": str(file["id"]),
                "name": file["original_name"],
                "run_id": str(file["interpretation_run_id"])
                if file["interpretation_run_id"]
                else None,
                "source_kinds": source_kinds,
                "valid_rows": summary.get("valid_rows", 0),
                "rejected_rows": summary.get("rejected_rows", 0),
                "excluded_rows": summary.get("excluded_rows", 0),
                "sheets": [p.get("sheet_name", "") for p in previews],
                "controls": [
                    {
                        "sheet_name": sheet["sheet_name"],
                        "source_kind": sheet["source_kind"],
                        "key": c["key"],
                        "outcome": c["outcome"],
                    }
                    for sheet in summary.get("sheets", [])
                    for c in sheet.get("controls", [])
                ],
                "ledger_totals": source_ledger_totals(
                    conn, company, str(file["interpretation_run_id"])
                )
                if file["interpretation_run_id"] and "ledger" in source_kinds
                else None,
            }
        )
    scope = (
        conn.execute(
            "SELECT name FROM app.financial_periods WHERE company_id=%s AND id=%s",
            (company, session["period_id"]),
        ).fetchone()
        if session["period_id"]
        else None
    )
    totals = conn.execute(
        """SELECT count(DISTINCT n.canonical_values->>'party_id') AS parties_count,
    count(DISTINCT n.canonical_values->>'invoice_id') AS invoices_count,
    count(DISTINCT n.canonical_values->>'bank_account') AS bank_accounts_count,
    array_remove(array_agg(DISTINCT n.canonical_values->>'original_unit'),NULL) AS units
    FROM app.normalized_source_rows n JOIN app.session_files sf ON sf.company_id=n.company_id AND sf.interpretation_run_id=n.run_id
    WHERE sf.company_id=%s AND sf.session_id=%s""",
        (company, session["id"]),
    ).fetchone()
    samples = conn.execute(
        """SELECT sf.source_file_id::text AS file_id,i.sheet_name,r.row_number,n.source_kind,n.state,n.canonical_values,n.error_codes
    FROM app.normalized_source_rows n JOIN app.session_files sf ON sf.company_id=n.company_id AND sf.interpretation_run_id=n.run_id
    JOIN app.source_rows r ON r.company_id=n.company_id AND r.id=n.source_row_id
    JOIN app.interpretation_versions i ON i.company_id=r.company_id AND i.id=r.interpretation_id
    WHERE sf.company_id=%s AND sf.session_id=%s ORDER BY sf.source_file_id,i.sheet_name,r.row_number LIMIT 50""",
        (company, session["id"]),
    ).fetchall()
    return {
        "period_name": scope["name"] if scope else None,
        "entities": {
            key: totals[key]
            for key in ("parties_count", "invoices_count", "bank_accounts_count")
        },
        "units": totals["units"] or [],
        "samples": [
            {
                key: r[key]
                for key in (
                    "file_id",
                    "sheet_name",
                    "row_number",
                    "source_kind",
                    "state",
                    "error_codes",
                )
            }
            | {
                "values": [
                    {"field": k, "value": str(v) if v is not None else None}
                    for k, v in r["canonical_values"].items()
                    if k not in ("role_evidence",)
                ]
            }
            for r in samples
        ],
        "files": presented,
        "accounts": accounts(conn, company, str(session["id"])),
        "source_kinds": sorted(kinds),
        "period_id": str(session["period_id"]) if session["period_id"] else None,
        "as_of_date": session["as_of_date"],
        "coverage": session["interpretation_context"].get("coverage"),
    }


def comment_view(row: dict) -> dict:
    return {
        k: row[k]
        for k in (
            "id",
            "body",
            "file_id",
            "sheet_name",
            "account_code",
            "status",
            "resolution",
            "created_at",
        )
    }


def proposal_view(row: dict) -> dict:
    return {
        k: row[k]
        for k in (
            "id",
            "comment_id",
            "snapshot_hash",
            "status",
            "content",
            "created_at",
        )
    }


def correction_sheets(conn, company: str, session: str) -> list[dict]:
    result = []
    for file in IntakeRepository(conn).files(company, session):
        summaries = {
            s["sheet_name"]: s
            for s in (file["interpretation_summary"] or {}).get("sheets", [])
        }
        selected = file["interpretation_settings"].get("sheets", {})
        for preview in file["interpretation_preview"]:
            kind = summaries.get(preview["sheet_name"], {}).get("source_kind")
            if not kind:
                continue
            settings = selected.get(preview["sheet_name"], {})
            mapping = settings.get("mapping") or {
                m["target_field"]: int(m["source_column"]) for m in preview["mapping"]
            }
            result.append(
                {
                    "file_id": str(file["id"]),
                    "sheet_name": preview["sheet_name"],
                    "source_kind": kind,
                    "header_row": settings.get("header_row", preview["header_row"]),
                    "columns": preview["columns"][:64],
                    "mapping": mapping,
                }
            )
    return result


def source_ledger_totals(conn, company, run):
    rows = conn.execute(
        "SELECT canonical_values,state,error_codes FROM app.normalized_source_rows WHERE company_id=%s AND run_id=%s AND source_kind='ledger'",
        (company, run),
    ).fetchall()
    values = {"debit": Decimal(0), "credit": Decimal(0)}
    known = True
    with localcontext() as ctx:
        ctx.prec = 96
        for row in rows:
            if row["state"] == "excluded_overlap":
                continue
            for key in ("debit", "credit"):
                try:
                    if row["canonical_values"].get("unit") != "IRR":
                        raise UnsafeFinancialData("unit_unknown")
                    values[key] += amount(row["canonical_values"].get(key))
                except UnsafeFinancialData:
                    known = False
        difference = values["debit"] - values["credit"]
    return {
        key: decimal_text(values[key]) if known else None for key in ("debit", "credit")
    } | {
        "difference": decimal_text(difference) if known else None,
        "rejected_rows": sum(row["state"] == "rejected" for row in rows),
        "basis": "readable_source_rows_not_posted",
    }
