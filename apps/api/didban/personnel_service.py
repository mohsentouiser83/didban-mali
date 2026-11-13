"""Read immutable imported personnel facts from an exact published selection,
or native posted payroll operations with traceable journals and payment status.
Strictly preserves separation of imported vs native basis (ACC-07).
"""

from decimal import Decimal, localcontext

from sqlalchemy import and_, select
from sqlalchemy.orm import Session, aliased

from . import models as m
from .accounting_setup_models import CompanyAccountingSetup
from .money_type import canonical_money
from .operation_models import OperationDraft
from .posting_models import NativeJournal

MONEY_FIELDS = (
    "gross_pay",
    "net_pay",
    "payroll_tax",
    "employee_insurance",
    "employer_insurance",
    "other_deductions",
)


def _imported_personnel_result(db: Session, company: str, area: str, period_id: str | None = None) -> dict:
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
        "basis": "imported",
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
                "basis": "imported",
                "payment_status": "unknown",
            }
            for row in rows
        ],
        "totals": totals,
    }


def _native_personnel_result(db: Session, company: str, area: str, period_id: str | None = None) -> dict:
    journal = aliased(NativeJournal)
    reversal = aliased(NativeJournal)

    stmt = (
        select(OperationDraft, journal)
        .join(journal, and_(journal.company_id == company, journal.draft_id == OperationDraft.draft_id))
        .outerjoin(reversal, and_(reversal.company_id == company, reversal.reversal_of == journal.id))
        .where(
            OperationDraft.company_id == company,
            OperationDraft.kind == "payroll",
            reversal.id.is_(None),
        )
    )
    if period_id:
        stmt = stmt.where(journal.period_id == period_id)

    payroll_records = list(db.execute(stmt.order_by(journal.date, journal.sequence)))

    # Check paid status from posted payroll_payment journals
    payment_stmt = (
        select(OperationDraft)
        .join(journal, and_(journal.company_id == company, journal.draft_id == OperationDraft.draft_id))
        .outerjoin(reversal, and_(reversal.company_id == company, reversal.reversal_of == journal.id))
        .where(
            OperationDraft.company_id == company,
            OperationDraft.kind == "payroll_payment",
            reversal.id.is_(None),
        )
    )
    if period_id:
        payment_stmt = payment_stmt.where(journal.period_id == period_id)

    paid_parties = {
        op.payload.get("party_id") for op in db.scalars(payment_stmt) if op.payload and op.payload.get("party_id")
    }

    items = []
    employees_map = {}

    for op, j in payroll_records:
        payload = op.payload or {}
        amounts = payload.get("amounts", {})
        raw_party = payload.get("party_id") or ""
        is_aggregate = not bool(raw_party.strip())
        party_id = raw_party.strip() if not is_aggregate else "unassigned_aggregate"
        emp_name = "حقوق تجمیعی ثبت‌شده" if is_aggregate else (payload.get("party_name") or party_id)

        values = {
            "gross_pay": canonical_money(amounts.get("gross", 0)),
            "net_pay": canonical_money(amounts.get("net_pay", 0)),
            "payroll_tax": canonical_money(amounts.get("payroll_tax", 0)),
            "employee_insurance": canonical_money(amounts.get("employee_insurance", 0)),
            "employer_insurance": canonical_money(amounts.get("employer_insurance", 0)),
            "other_deductions": canonical_money(amounts.get("other_deductions", 0)),
        }

        is_paid = party_id in paid_parties

        item = {
            "id": j.id,
            "employee_id": party_id,
            "employee_name": emp_name,
            "date": j.date.isoformat(),
            "kind": "payroll",
            "values": values,
            "source_row_id": str(j.sequence),
            "basis": "native",
            "payment_status": "paid" if is_paid else "unpaid",
            "is_unassigned_aggregate": is_aggregate,
            "journal_id": j.id,
            "journal_sequence": j.sequence,
        }

        if area == "employees":
            if not is_aggregate and party_id not in employees_map:
                employees_map[party_id] = {
                    "id": j.id,
                    "employee_id": party_id,
                    "employee_name": emp_name,
                    "date": j.date.isoformat(),
                    "kind": "employees",
                    "values": values,
                    "source_row_id": str(j.sequence),
                    "basis": "native",
                    "payment_status": "paid" if is_paid else "unpaid",
                }
        else:
            items.append(item)

    if area == "employees":
        items = list(employees_map.values())

    totals = None
    if items and area != "employees":
        with localcontext() as context:
            context.prec = 50
            totals = {
                field: format(sum((Decimal(it["values"][field]) for it in items), Decimal(0)), "f")
                for field in MONEY_FIELDS
            }

    return {
        "basis": "native",
        "manifest_id": None,
        "status": "available" if items else "unavailable",
        "reason": None
        if items
        else (
            "فهرست پرسنل در دفتر حسابداری این دوره موجود نیست."
            if area == "employees"
            else "سند شناسایی حقوق در دفتر این دوره ثبت نشده است."
        ),
        "scope": "native_personnel" if area == "employees" else "native_payroll",
        "items": items,
        "totals": totals,
    }


def personnel_result(
    db: Session, company: str, area: str, period_id: str | None = None, basis: str | None = None
) -> dict:
    if basis == "native":
        return _native_personnel_result(db, company, area, period_id)
    if basis == "imported":
        return _imported_personnel_result(db, company, area, period_id)

    # If basis is not explicitly requested, check company accounting setup mode
    mode = db.scalar(
        select(CompanyAccountingSetup.mode).where(CompanyAccountingSetup.company_id == company)
    )
    if mode == "primary":
        native = _native_personnel_result(db, company, area, period_id)
        if native["status"] == "available":
            return native
    return _imported_personnel_result(db, company, area, period_id)


def ready_people_modules(db: Session, company: str) -> set[str]:
    result = set()
    if personnel_result(db, company, "employees")["items"]:
        result.add("employees")
    if personnel_result(db, company, "payroll")["items"]:
        result.update(("payroll", "tax", "insurance", "employee_reports"))
    return result
