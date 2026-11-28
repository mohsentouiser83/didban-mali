"""Maintain independent, company-scoped associations from detail to chart accounts."""

from typing import Any

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from .accounting_models import Account, AccountDetailLink, AccountHierarchy
from .errors import DomainError, require
from .services import get_entity
from .workflow import audit, serialize_fact

TARGET_LEVELS = ("group", "general", "subsidiary")


def _links(company: str) -> Select[tuple[AccountDetailLink]]:
    return select(AccountDetailLink).where(AccountDetailLink.company_id == company)


def _serialize(link: AccountDetailLink) -> dict[str, Any]:
    return serialize_fact(link) | {"target_account_id": link.subsidiary_account_id}


def list_links(db: Session, company: str, detail_id: str | None) -> dict[str, Any]:
    query = _links(company)
    if detail_id:
        query = query.where(AccountDetailLink.detail_account_id == detail_id)
    links = db.scalars(query.order_by(AccountDetailLink.created_at, AccountDetailLink.id))
    return {"items": [_serialize(link) for link in links]}


def _validate_targets(db: Session, company: str, targets: set[str]) -> None:
    if not targets:
        return
    eligible = set(db.scalars(
        select(Account.id)
        .join(AccountHierarchy, (AccountHierarchy.company_id == Account.company_id)
              & (AccountHierarchy.account_id == Account.id))
        .where(
            Account.company_id == company,
            Account.id.in_(targets),
            Account.active.is_(True),
            AccountHierarchy.level.in_(TARGET_LEVELS),
        )
    ))
    if targets != eligible:
        message = "حساب فعال در سطح گروه، کل یا معین انتخاب کنید."
        raise DomainError("invalid_detail_link_target", message, fields={"linked_account_ids": message})


def replace_links(
    db: Session, company: str, actor: str, detail_id: str, target_ids: list[str],
) -> None:
    current = {
        link.subsidiary_account_id: link
        for link in db.scalars(_links(company).where(AccountDetailLink.detail_account_id == detail_id))
    }
    before = {target for target, link in current.items() if link.active}
    after = set(target_ids)
    if before == after:
        return
    _validate_targets(db, company, after - before)
    for target, link in current.items():
        link.active = target in after
    for target in sorted(after - current.keys()):
        db.add(AccountDetailLink(company_id=company, detail_account_id=detail_id, subsidiary_account_id=target))
    db.flush()
    audit(db, company, actor, "accounting.detail_links_changed", detail_id,
          {"before": sorted(before), "after": sorted(after)})


def require_compatible_link_level(
    db: Session, company: str, account_id: str, level: str | None,
) -> None:
    query = _links(company).where(AccountDetailLink.active.is_(True))
    if level == "detail":
        query = query.where(AccountDetailLink.subsidiary_account_id == account_id)
    elif level in TARGET_LEVELS:
        query = query.where(AccountDetailLink.detail_account_id == account_id)
    else:
        query = query.where((AccountDetailLink.detail_account_id == account_id)
                            | (AccountDetailLink.subsidiary_account_id == account_id))
    if db.scalar(query.limit(1)) is not None:
        message = "پیش از تغییر سطح حساب، پیوندهای تفصیلی آن را بردارید."
        raise DomainError("account_has_detail_links", message, 409, {"level": message})


def save_link(db: Session, company: str, actor: str, data: dict[str, Any]) -> dict[str, Any]:
    from .commercial_models import CommercialCounterparty

    detail = get_entity(db, Account, company, data["detail_account_id"])
    target_id = data.get("target_account_id") or data["subsidiary_account_id"]
    hierarchy = db.scalar(select(AccountHierarchy).where(
        AccountHierarchy.company_id == company, AccountHierarchy.account_id == detail.id,
    ))
    require(hierarchy is not None and hierarchy.level == "detail",
            "invalid_detail_account", "حساب انتخاب‌شده باید در سطح تفصیلی باشد.")
    link = db.scalar(_links(company).where(
        AccountDetailLink.detail_account_id == detail.id,
        AccountDetailLink.subsidiary_account_id == target_id,
    ))
    active = bool(data.get("active", True))
    if link is None or (active and not link.active):
        _validate_targets(db, company, {target_id})
    counterparty_id = data.get("counterparty_id")
    if counterparty_id:
        get_entity(db, CommercialCounterparty, company, counterparty_id)
    if link is not None and link.active == active and link.counterparty_id == counterparty_id:
        return _serialize(link)
    if link is None:
        link = AccountDetailLink(company_id=company, detail_account_id=detail.id, subsidiary_account_id=target_id)
        db.add(link)
    link.counterparty_id = counterparty_id
    link.active = active
    detail.version += 1
    db.flush()
    audit(db, company, actor, "accounting.detail_link_saved", link.id,
          {"detail": detail.id, "target": target_id, "active": active})
    return _serialize(link)
