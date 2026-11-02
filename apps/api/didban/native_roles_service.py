"""Explicit company-scoped account semantics and audited versioned changes."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_models import Account
from .accounting_service import capabilities
from .errors import require
from .http import paginate
from .native_reporting_models import NativeAccountRole
from .security import membership
from .services import get_entity
from .workflow import audit

ROLE_CATALOG = (
    {"key": "bank", "label": "بانک", "balance_side": "debit"},
    {"key": "trade_receivable", "label": "مطالبات تجاری", "balance_side": "debit"},
    {"key": "trade_payable", "label": "بدهی تجاری", "balance_side": "credit"},
    {"key": "revenue", "label": "درآمد", "balance_side": "credit"},
    {"key": "expense", "label": "هزینه", "balance_side": "debit"},
    {"key": "other_asset", "label": "سایر دارایی‌ها", "balance_side": "debit"},
    {"key": "other_liability", "label": "سایر بدهی‌ها", "balance_side": "credit"},
    {"key": "equity", "label": "حقوق مالکانه", "balance_side": "credit"},
    {"key": "payroll_payable", "label": "حقوق پرداختنی", "balance_side": "credit"},
    {"key": "insurance_payable", "label": "بیمه پرداختنی", "balance_side": "credit"},
    {"key": "payroll_tax_payable", "label": "مالیات حقوق پرداختنی", "balance_side": "credit"},
    {"key": "other_payroll_deductions", "label": "سایر کسورات پرداختنی", "balance_side": "credit"},
)
ROLE_KEYS = frozenset(row["key"] for row in ROLE_CATALOG)
NOMINAL_ROLES = frozenset(("revenue", "expense"))
CREDIT_ROLES = frozenset(row["key"] for row in ROLE_CATALOG if row["balance_side"] == "credit")


def list_roles(db: Session, company: str, user: m.User, limit: int = 50, cursor: str | None = None) -> dict:
    membership(db, company, user)
    assigned = {
        row.account_id: row
        for row in db.scalars(select(NativeAccountRole).where(NativeAccountRole.company_id == company))
    }

    def public(account):
        row = assigned.get(account.id)
        return {
            "account_id": account.id,
            "code": account.code,
            "name": account.name,
            "active": account.active,
            "role": row.role if row else None,
            "version": row.version if row else 1,
        }

    return paginate(db, Account, company, limit, cursor, transform=public) | {"catalog": list(ROLE_CATALOG)}


def save_role(
    db: Session, company: str, user: m.User, account_id: str, role: str | None, version: int
) -> dict:
    require(
        capabilities(db, company, user)["can_manage_accounts"],
        "permission_denied",
        "اجازهٔ تعیین نقش حساب ندارید.",
        403,
    )
    account = get_entity(db, Account, company, account_id)
    require(role is None or role in ROLE_KEYS, "account_role_invalid", "نقش حساب معتبر نیست.")
    row = db.scalar(
        select(NativeAccountRole).where(
            NativeAccountRole.company_id == company, NativeAccountRole.account_id == account.id
        )
    )
    require(
        (row.version if row else 1) == version, "version_conflict", "نقش حساب تغییر کرده؛ تازه کنید.", 409
    )
    before = row.role if row else None
    if row:
        row.version += 1
    else:
        row = NativeAccountRole(company_id=company, account_id=account.id, version=2)
        db.add(row)
    row.role = role
    row.actor_id = user.id
    db.flush()
    audit(
        db,
        company,
        user.id,
        "accounting.account_role_changed",
        account.id,
        {"before": before, "after": role, "assignment_id": row.id, "version": row.version},
    )
    return {
        "account_id": account.id,
        "code": account.code,
        "name": account.name,
        "active": account.active,
        "role": row.role,
        "version": row.version,
    }
