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
    manifest = db.scalar(select(m.ResultManifest).where(m.ResultManifest.company_id == company)
                         .order_by(m.ResultManifest.created_at.desc(), m.ResultManifest.id.desc()).limit(1))
    if manifest is None:
        return set()
    ids = manifest.selection.get("interpretation_ids", [])
    if not ids:
        return set()
    return set(db.scalars(select(m.Interpretation.family).where(
        m.Interpretation.company_id == company, m.Interpretation.id.in_(ids))))


def module_state(db: Session, company: str, key: str, families: set[str] | None = None) -> dict:
    key = canonical_module(key)
    require(key in CATALOG, "module_not_found", "ماژول پیدا نشد.", 404)
    setting = db.scalar(select(m.CompanyModule).where(
        m.CompanyModule.company_id == company, m.CompanyModule.key == key))
    enabled = setting.enabled if setting else key not in NEW_MODULES
    label, groups = CATALOG[key]
    families = accepted_families(db, company) if families is None else families
    missing = [list(group) for group in groups if not families.intersection(group)]
    status = "disabled" if not enabled else "waiting_sources" if missing else "available"
    return {"key": key, "label": label, "enabled": enabled, "status": status,
            "available": status == "available", "missing_sources": missing,
            "required_sources": [list(group) for group in groups],
            "version": setting.version if setting else 1}


def list_modules(db: Session, company: str, user: m.User) -> dict:
    member = membership(db, company, user)
    families = accepted_families(db, company)
    return {"items": [module_state(db, company, key, families) for key in CATALOG],
            "can_manage": member.role == "owner"}


def update_module(db: Session, company: str, user: m.User, key: str, enabled: bool, version: int) -> dict:
    membership(db, company, user, "owner")
    key = canonical_module(key)
    state = module_state(db, company, key)
    require(version == state["version"], "version_conflict", "اطلاعات تغییر کرده؛ صفحه را تازه کنید.", 409)
    setting = db.scalar(select(m.CompanyModule).where(
        m.CompanyModule.company_id == company, m.CompanyModule.key == key))
    if setting is None:
        setting = m.CompanyModule(company_id=company, key=key, enabled=enabled, version=version + 1)
        db.add(setting)
    else:
        setting.enabled, setting.version = enabled, setting.version + 1
    db.flush()
    audit(db, company, user.id, "module.updated", setting.id,
          {"key": key, "before": state["enabled"], "after": enabled, "version": setting.version})
    return module_state(db, company, key)


def require_module(db: Session, company: str, key: str, *, ready: bool = True) -> None:
    state = module_state(db, company, key)
    require(state["enabled"], "module_disabled", "این ماژول برای شرکت خاموش است.", 403)
    if ready:
        require(state["available"], "module_sources_missing", "اسناد لازم این ماژول هنوز پردازش نشده‌اند.", 409)
