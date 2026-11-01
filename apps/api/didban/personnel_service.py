"""Read immutable imported personnel facts from an exact published selection."""

from decimal import Decimal, localcontext

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m

MONEY_FIELDS = (
    "gross_pay",
    "net_pay",
    "payroll_tax",
    "employee_insurance",
    "employer_insurance",
    "other_deductions",
)


def personnel_result(db: Session, company: str, area: str, period_id: str | None = None) -> dict:
    query = select(m.ResultManifest).where(m.ResultManifest.company_id == company)
    if period_id:
        query = query.where(m.ResultManifest.period_id == period_id)
    manifest = db.scalar(
        query.order_by(m.ResultManifest.created_at.desc(), m.ResultManifest.id.desc()).limit(1)
    )
    rows = []
    selected = manifest.selection.get("row_ids", []) if manifest else []
    for start in range(0, len(selected), 500):
        rows.extend(
            db.scalars(
                select(m.PersonnelRecord).where(
                    m.PersonnelRecord.company_id == company,
                    m.PersonnelRecord.source_row_id.in_(selected[start : start + 500]),
                )
            )
        )
    period = db.get(m.Period, manifest.period_id) if manifest else None
    if period and period.company_id == company:
        rows = [
            row
            for row in rows
            if row.date <= period.end and (row.kind == "employees" or row.date >= period.start)
        ]
    kind = "employees" if area == "employees" else "payroll"
    rows = sorted(
        (row for row in rows if row.kind == kind), key=lambda row: (row.employee_id, row.date, row.id)
    )
    # Employee directory represents the most recent source-backed profile per employee.
    if kind == "employees":
        profiles = {row.employee_id: row for row in rows}
        rows = list(profiles.values())
    totals = None
    if rows and kind == "payroll":
        with localcontext() as context:
            context.prec = 50
            totals = {
                field: format(sum((Decimal(row.values[field]) for row in rows), Decimal(0)), "f")
                for field in MONEY_FIELDS
            }
    return {
        "manifest_id": manifest.id if manifest else None,
        "status": "available" if rows else "unavailable",
        "reason": None
        if rows
        else (
            "فهرست کارمندان در اسناد این دوره موجود نیست."
            if kind == "employees"
            else "فایل حقوق و کسورات این دوره موجود نیست."
        ),
        "scope": "imported_personnel" if kind == "employees" else "imported_payroll",
        "items": [
            {
                "id": row.id,
                "employee_id": row.employee_id,
                "employee_name": row.employee_name,
                "date": row.date.isoformat(),
                "kind": row.kind,
                "values": row.values,
                "source_row_id": row.source_row_id,
            }
            for row in rows
        ],
        "totals": totals,
    }


def ready_people_modules(db: Session, company: str) -> set[str]:
    result = set()
    if personnel_result(db, company, "employees")["items"]:
        result.add("employees")
    if personnel_result(db, company, "payroll")["items"]:
        result.update(("payroll", "tax", "insurance", "employee_reports"))
    return result
