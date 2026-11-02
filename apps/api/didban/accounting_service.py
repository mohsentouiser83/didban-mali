"""Draft preparation and independent accounting authorities."""

from decimal import Decimal, localcontext
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_models import Account, AccountingPermission, Draft
from .accounting_setup_models import CompanyAccountingSetup
from .errors import DomainError, require
from .money_type import canonical_money
from .security import membership
from .services import check_version, get_entity
from .workflow import audit, serialize_fact


def capabilities(db: Session, company: str, user: m.User) -> dict[str, Any]:
    member = membership(db, company, user, "read")
    permission = db.scalar(
        select(AccountingPermission).where(
            AccountingPermission.company_id == company, AccountingPermission.membership_id == member.id
        )
    )
    setup = db.get(CompanyAccountingSetup, company)
    primary = setup is not None and setup.mode == "primary"
    return {
        "can_prepare": member.role in ("owner", "finance_manager", "advisor"),
        "can_manage_accounts": member.role in ("owner", "finance_manager"),
        "can_manage_permissions": member.role == "owner",
        "can_post": member.role == "finance_manager"
        or (member.role in ("owner", "advisor") and bool(permission and permission.post_journal)),
        "can_reopen": member.role == "finance_manager"
        or (member.role in ("owner", "advisor") and bool(permission and permission.reopen_period)),
        "posting_available": primary,
        "posting_reason": None if primary else "primary_accounting_required",
    }


def save_account(
    db: Session,
    company: str,
    user: m.User,
    data: dict[str, Any],
    account_id: str | None = None,
    version: int | None = None,
) -> dict[str, Any]:
    require(
        capabilities(db, company, user)["can_manage_accounts"],
        "permission_denied",
        "اجازه مدیریت حساب‌ها ندارید.",
        403,
    )
    item = get_entity(db, Account, company, account_id) if account_id else Account(company_id=company)
    if account_id:
        check_version(item, version)
        item.version += 1
    for key, value in data.items():
        setattr(item, key, value)
    db.add(item)
    db.flush()
    audit(db, company, user.id, "accounting.account_saved", item.id)
    return serialize_fact(item)


def validate_lines(db: Session, company: str, data: dict[str, Any]) -> list[dict[str, Any]]:
    require(data["unit"] in ("IRR", "TOMAN"), "unsupported_unit", "واحد سند باید ریال یا تومان باشد.")
    require(2 <= len(data["lines"]) <= 200, "invalid_journal_lines", "سند باید بین ۲ تا ۲۰۰ ردیف داشته باشد.")
    lines = []
    with localcontext() as context:
        context.prec = 60
        debit_total = credit_total = Decimal(0)
        for line in data["lines"]:
            account = get_entity(db, Account, company, line["account_id"])
            require(account.active, "inactive_account", "حساب غیرفعال است.")
            try:
                debit = Decimal(canonical_money(line["debit"]))
                credit = Decimal(canonical_money(line["credit"]))
                require(
                    debit >= 0 and credit >= 0 and ((debit > 0) != (credit > 0)),
                    "invalid_journal_line",
                    "هر ردیف فقط بدهکار یا بستانکار باشد.",
                )
                factor = 10 if data["unit"] == "TOMAN" else 1
                canonical_debit = canonical_money(debit * factor)
                canonical_credit = canonical_money(credit * factor)
            except ValueError as error:
                raise DomainError("invalid_amount", "مبلغ معتبر وارد کنید.") from error
            debit_total += Decimal(canonical_debit)
            credit_total += Decimal(canonical_credit)
            lines.append(
                line
                | {
                    "debit": canonical_debit,
                    "credit": canonical_credit,
                    "original_debit": line["debit"],
                    "original_credit": line["credit"],
                }
            )
        require(debit_total == credit_total, "journal_not_balanced", "جمع بدهکار و بستانکار برابر نیست.")
    return lines


def save_draft(
    db: Session,
    company: str,
    user: m.User,
    data: dict[str, Any],
    draft_id: str | None = None,
    version: int | None = None,
) -> dict[str, Any]:
    from .period_lock_service import require_open_period

    require(
        capabilities(db, company, user)["can_prepare"], "permission_denied", "اجازه تهیه سند ندارید.", 403
    )
    period = get_entity(db, m.Period, company, data["period_id"])
    require_open_period(db, company, period.id)
    require(period.start <= data["date"] <= period.end, "date_outside_period", "تاریخ سند خارج از دوره است.")
    lines = validate_lines(db, company, data)
    item = (
        get_entity(db, Draft, company, draft_id) if draft_id else Draft(company_id=company, actor_id=user.id)
    )
    if draft_id:
        check_version(item, version)
        require(item.state == "draft", "draft_not_editable", "پیش‌نویس قابل تغییر نیست.", 409)
        item.version += 1
    item.period_id = period.id
    item.date = data["date"]
    item.description = data["description"]
    item.original_unit = data["unit"]
    item.lines = lines
    db.add(item)
    db.flush()
    audit(db, company, user.id, "accounting.draft_saved", item.id, {"version": item.version})
    ability = capabilities(db, company, user)
    return serialize_fact(item) | {key: ability[key] for key in ("posting_available", "posting_reason")}


def permissions(db: Session, company: str, user: m.User) -> dict[str, Any]:
    membership(db, company, user, "owner")
    result = []
    for member in db.scalars(
        select(m.Membership).where(m.Membership.company_id == company, m.Membership.active.is_(True))
    ):
        item = db.scalar(
            select(AccountingPermission).where(
                AccountingPermission.company_id == company, AccountingPermission.membership_id == member.id
            )
        )
        person = db.get(m.User, member.user_id)
        result.append(
            {
                "membership_id": member.id,
                "name": person.name,
                "role": member.role,
                "version": item.version if item else 1,
                "post_journal": bool(item and item.post_journal),
                "reopen_period": bool(item and item.reopen_period),
                "implicit_authority": member.role == "finance_manager",
            }
        )
    return {"items": result}


def grant(
    db: Session, company: str, user: m.User, member_id: str, data: dict[str, bool], version: int
) -> dict[str, Any]:
    membership(db, company, user, "owner")
    member = get_entity(db, m.Membership, company, member_id)
    require(member.active, "inactive_membership", "عضویت غیرفعال است.", 409)
    require(
        member.role != "viewer" or not any(data.values()),
        "viewer_read_only",
        "برای اعطای اختیار، ابتدا نقش مشاهده‌گر را تغییر دهید.",
        403,
    )
    item = db.scalar(
        select(AccountingPermission).where(
            AccountingPermission.company_id == company, AccountingPermission.membership_id == member.id
        )
    )
    before = {
        "post_journal": bool(item and item.post_journal),
        "reopen_period": bool(item and item.reopen_period),
    }
    if item:
        check_version(item, version)
        item.version += 1
    else:
        require(version == 1, "version_conflict", "اطلاعات تغییر کرده است.", 409)
        item = AccountingPermission(company_id=company, membership_id=member.id, version=2)
    item.post_journal = data["post_journal"]
    item.reopen_period = data["reopen_period"]
    db.add(item)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "accounting.permissions_changed",
        member.id,
        {"recipient_id": member.user_id, "before": before, "after": data},
    )
    return {"membership_id": member.id, "version": item.version, **data}
