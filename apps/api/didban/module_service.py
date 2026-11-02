"""Company module preferences and evidence-based operational readiness.

Preferences never remove facts or rewrite historical report snapshots. Readiness
means a usable source exists, not that its financial coverage is complete.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .errors import require
from .security import membership
from .workflow import audit

# Each tuple is a required group: one source in every group is sufficient.
CATALOG = {
    "receivables": ("مطالبات", (("ledger", "sales"),)),
    "payables": ("بدهی‌ها", (("ledger", "purchases"),)),
    "cashflow": ("نقدینگی", (("bank",),)),
    "moadian": ("مؤدیان", (("moadian_sales", "moadian_purchases"),)),
    "settlements": ("تسویه‌ها", (("settlements", "bank"),)),
    "reconciliation": ("تطبیق", (("bank",), ("ledger",))),
    "employees": ("کارکنان، حقوق و کسورات", (("employees", "payroll"),)),
}
NEW_MODULES = {"employees"}
PERSONNEL_ALIASES = {"tax", "insurance", "payroll", "employee_reports"}


def canonical_module(key: str) -> str:
    return "employees" if key in PERSONNEL_ALIASES else key


def accepted_families(db: Session, company: str) -> set[str]:
    manifest = db.scalar(
        select(m.ResultManifest)
        .where(m.ResultManifest.company_id == company)
        .order_by(m.ResultManifest.created_at.desc(), m.ResultManifest.id.desc())
        .limit(1)
    )
    if manifest is None:
        return set()
    ids = manifest.selection.get("interpretation_ids", [])
    if not ids:
        return set()
    return set(
        db.scalars(
            select(m.Interpretation.family).where(
                m.Interpretation.company_id == company, m.Interpretation.id.in_(ids)
            )
        )
    )


def _native_bank_ledger_present(db: Session, company: str) -> bool:
    from .accounting_models import Account
    from .native_reporting_models import NativeAccountRole, NativeStatementRun
    from .posting_models import NativeJournal

    roles = {
        row.account_id: row
        for row in db.scalars(
            select(NativeAccountRole).where(
                NativeAccountRole.company_id == company, NativeAccountRole.role == "bank"
            )
        )
    }
    accounts = {row.id: row for row in db.scalars(select(Account).where(Account.company_id == company))}
    for run in db.scalars(
        select(NativeStatementRun)
        .where(NativeStatementRun.company_id == company)
        .order_by(NativeStatementRun.created_at.desc())
    ):
        bank_ids = {
            row["account_id"]
            for row in run.snapshot.get("role_assignments", [])
            if row.get("role") == "bank"
            and row["account_id"] in roles
            and roles[row["account_id"]].version == row.get("assignment_version")
            and row["account_id"] in accounts
            and accounts[row["account_id"]].version == row.get("account_version")
        }
        ids = run.snapshot.get("profit_journal_ids", [])
        if not bank_ids or not ids:
            continue
        for offset in range(0, len(ids), 500):
            journals = db.scalars(
                select(NativeJournal).where(
                    NativeJournal.company_id == company, NativeJournal.id.in_(ids[offset : offset + 500])
                )
            )
            if any(
                line["account_id"] in bank_ids for journal in journals for line in journal.snapshot["lines"]
            ):
                return True
    return False


def module_state(db: Session, company: str, key: str, families: set[str] | None = None) -> dict:
    key = canonical_module(key)
    require(key in CATALOG, "module_not_found", "ماژول پیدا نشد.", 404)
    setting = db.scalar(
        select(m.CompanyModule).where(m.CompanyModule.company_id == company, m.CompanyModule.key == key)
    )
    enabled = setting.enabled if setting else key not in NEW_MODULES
    label, groups = CATALOG[key]
    families = set(accepted_families(db, company) if families is None else families)
    source_basis = None
    if key in {"receivables", "payables"}:
        from .accounting_setup_models import CompanyAccountingSetup
        from .native_invoice_models import NativeInvoice

        setup = db.get(CompanyAccountingSetup, company)
        if setup and setup.mode == "primary":
            source_basis = "native_invoice"
            groups = (("native_service_invoices",),)
            direction = "sale" if key == "receivables" else "purchase"
            if db.scalar(select(NativeInvoice.id).where(
                NativeInvoice.company_id == company, NativeInvoice.direction == direction
            ).limit(1)):
                families.add("native_service_invoices")
    if key == "reconciliation":
        from .accounting_setup_models import CompanyAccountingSetup

        setup = db.get(CompanyAccountingSetup, company)
        source_basis = "native_book" if setup and setup.mode == "primary" else "imported_ledger"
        if source_basis == "native_book":
            groups = (("bank",), ("native_bank_ledger",))
            if _native_bank_ledger_present(db, company):
                families.add("native_bank_ledger")
    missing = [list(group) for group in groups if not families.intersection(group)]
    status = "disabled" if not enabled else "waiting_sources" if missing else "available"
    return {
        "key": key,
        "label": label,
        "enabled": enabled,
        "status": status,
        "available": status == "available",
        "missing_sources": missing,
        "required_sources": [list(group) for group in groups],
        "source_basis": source_basis,
        "version": setting.version if setting else 1,
    }


def list_modules(db: Session, company: str, user: m.User) -> dict:
    member = membership(db, company, user)
    families = accepted_families(db, company)
    return {
        "items": [module_state(db, company, key, families) for key in CATALOG],
        "can_manage": member.role == "owner",
    }


def update_module(db: Session, company: str, user: m.User, key: str, enabled: bool, version: int) -> dict:
    membership(db, company, user, "owner")
    key = canonical_module(key)
    state = module_state(db, company, key)
    require(version == state["version"], "version_conflict", "اطلاعات تغییر کرده؛ صفحه را تازه کنید.", 409)
    setting = db.scalar(
        select(m.CompanyModule).where(m.CompanyModule.company_id == company, m.CompanyModule.key == key)
    )
    if setting is None:
        setting = m.CompanyModule(company_id=company, key=key, enabled=enabled, version=version + 1)
        db.add(setting)
    else:
        setting.enabled, setting.version = enabled, setting.version + 1
    db.flush()
    audit(
        db,
        company,
        user.id,
        "module.updated",
        setting.id,
        {"key": key, "before": state["enabled"], "after": enabled, "version": setting.version},
    )
    return module_state(db, company, key)


def require_module(db: Session, company: str, key: str, *, ready: bool = True) -> None:
    state = module_state(db, company, key)
    require(state["enabled"], "module_disabled", "این ماژول برای شرکت خاموش است.", 403)
    if ready:
        require(
            state["available"], "module_sources_missing", "اسناد لازم این ماژول هنوز پردازش نشده‌اند.", 409
        )
