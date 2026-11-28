"""Draft preparation and independent accounting authorities."""

from decimal import Decimal, localcontext
from typing import Any

from sqlalchemy import String, cast, or_, select
from sqlalchemy.orm import Session

from . import models as m
from .account_catalogue_service import (
    enrich_accounts,
    require_postable_account,
    resolve_account_code,
    save_hierarchy,
    validate_hierarchy,
)
from .account_detail_service import list_links, replace_links, require_compatible_link_level, save_link
from .accounting_models import Account, AccountHierarchy, AccountingPermission, Draft
from .accounting_setup_models import CompanyAccountingSetup
from .errors import DomainError, require
from .module_access import Action, Module
from .money_type import canonical_money
from .security import has_request_write_grant, may_manage_accounts, membership
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
    scoped_write = has_request_write_grant(db, company, user)
    return {
        "can_prepare": scoped_write or member.role in ("owner", "finance_manager", "advisor"),
        "can_manage_accounts": scoped_write or may_manage_accounts(member),
        "can_manage_permissions": member.role == "owner",
        "can_post": member.role == "finance_manager"
        or (member.role in ("owner", "advisor") and bool(permission and permission.post_journal)),
        "can_reopen": member.role == "finance_manager"
        or (member.role in ("owner", "advisor") and bool(permission and permission.reopen_period)),
        "can_view_payroll": member.role == "finance_manager"
        or (member.role in ("owner", "advisor") and bool(permission and permission.view_payroll)),
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
    *,
    imported_code: str | None = None,
    scope: tuple[Module, Action] | None = None,
) -> dict[str, Any]:
    membership(db, company, user, "manage_accounts", scope=scope or ("accounting", "edit" if account_id else "create"))
    item = get_entity(db, Account, company, account_id) if account_id else None
    if item:
        check_version(item, version)
    current = db.scalar(select(AccountHierarchy).where(
        AccountHierarchy.company_id == company, AccountHierarchy.account_id == account_id,
    )) if account_id else None
    level = data.get("level", current.level if current else None)
    parent_id = data.get("parent_id", current.parent_id if current else None)
    target_ids = data.get("linked_account_ids")
    require(target_ids is None or level == "detail", "invalid_detail_account",
            "پیوند حساب فقط برای سطح تفصیلی قابل تنظیم است.")
    if item and (current.level if current else None) != level:
        require_compatible_link_level(db, company, item.id, level)
    hierarchy_unchanged = bool(
        item
        and current is not None
        and level == current.level
        and parent_id == current.parent_id
    )
    if item and current is not None and not hierarchy_unchanged and not data.get("confirm_reclassification"):
        from .posting_models import NativeJournal

        has_posted = any(
            line.get("account_id") == item.id
            for j in db.scalars(select(NativeJournal).where(NativeJournal.company_id == company))
            for line in (j.snapshot or {}).get("lines", [])
        )
        require(
            not has_posted,
            "account_reclassification_has_history",
            "این حساب دارای سابقهٔ سند قطعی است؛ تغییر سطح یا بالادست آن سابقهٔ گزارش‌های زنده را تغییر می‌دهد.",
            409,
        )
    parent_code = validate_hierarchy(db, company, account_id, level, parent_id)
    code, code_status = resolve_account_code(
        db,
        company,
        imported_code or data.get("code"),
        level,
        parent_code,
        item,
        preserve_legacy=hierarchy_unchanged,
    )
    if item:
        item.version += 1
    else:
        item = Account(company_id=company, code=code)
    for key in ("name", "nature", "active"):
        if key in data:
            setattr(item, key, data[key])
    db.add(item)
    try:
        db.flush()
    except Exception as error:
        from sqlalchemy.exc import IntegrityError

        if isinstance(error, IntegrityError):
            raise DomainError("duplicate_account_code", "کد حساب تکراری است.", 409, {"code": "این کد حساب موجود است."}) from error
        raise
    save_hierarchy(db, company, item, level, parent_id, code_status=code_status)
    if target_ids is not None:
        replace_links(db, company, user.id, item.id, target_ids)
    if "role" in data:
        from .native_reporting_models import NativeAccountRole
        from .native_roles_service import ROLE_KEYS

        role_val = (data["role"] or "").strip() or None
        require(role_val is None or role_val in ROLE_KEYS, "account_role_invalid", "نقش حساب معتبر نیست.")
        role_row = db.scalar(
            select(NativeAccountRole).where(
                NativeAccountRole.company_id == company, NativeAccountRole.account_id == item.id
            )
        )
        if role_val is None:
            if role_row:
                db.delete(role_row)
        else:
            if role_row:
                role_row.role = role_val
                role_row.actor_id = user.id
                role_row.version += 1
            else:
                role_row = NativeAccountRole(
                    company_id=company, account_id=item.id, role=role_val, actor_id=user.id, version=1
                )
                db.add(role_row)
        db.flush()
    audit(db, company, user.id, "accounting.account_saved", item.id,
          {"code": item.code, "level": level, "parent_id": parent_id, "version": item.version})
    return enrich_accounts(db, company, [serialize_fact(item)])[0]


def validate_lines(
    db: Session, company: str, data: dict[str, Any], *, allow_non_leaf: bool = False
) -> list[dict[str, Any]]:
    from .commercial_models import CommercialCounterparty
    from .commercial_service import resolve_counterparty
    from .dimensions_models import Dimension
    from .native_reporting_models import NativeAccountRole

    require(data["unit"] in ("IRR", "TOMAN"), "unsupported_unit", "واحد سند باید ریال یا تومان باشد.")
    require(2 <= len(data["lines"]) <= 200, "invalid_journal_lines", "سند باید بین ۲ تا ۲۰۰ ردیف داشته باشد.")
    lines = []
    with localcontext() as context:
        context.prec = 60
        debit_total = credit_total = Decimal(0)
        for line in data["lines"]:
            account = get_entity(db, Account, company, line["account_id"])
            detail_id = line.get("detail_account_id")
            require(account.active, "inactive_account", "حساب غیرفعال است.")
            if not allow_non_leaf:
                require_postable_account(db, company, account)
                if detail_id:
                    hierarchy = db.get(AccountHierarchy, account.id)
                    require(hierarchy is not None and hierarchy.level == "subsidiary",
                            "invalid_subsidiary_account", "برای این ردیف حساب معین انتخاب کنید.")
                    detail = get_entity(db, Account, company, detail_id)
                    detail_hierarchy = db.get(AccountHierarchy, detail.id)
                    require(detail.active and detail_hierarchy is not None and detail_hierarchy.level == "detail",
                            "invalid_detail_account", "حساب تفصیلی فعال انتخاب کنید.")
            if "detail_account_id" in line and detail_id is None:
                line = {key: value for key, value in line.items() if key != "detail_account_id"}
            dim_ids = list(dict.fromkeys(line.get("dimension_ids") or []))
            if dim_ids:
                dims = {
                    d.id: d
                    for d in db.scalars(
                        select(Dimension).where(
                            Dimension.company_id == company,
                            Dimension.id.in_(dim_ids),
                        )
                    )
                }
                require(
                    len(dims) == len(dim_ids) and all(d.active for d in dims.values()),
                    "invalid_dimension",
                    "بُعد مدیریتی انتخاب‌شده معتبر یا فعال نیست.",
                    409,
                )
                acc_role = db.scalar(
                    select(NativeAccountRole.role).where(
                        NativeAccountRole.company_id == company,
                        NativeAccountRole.account_id == account.id,
                    )
                )
                require(
                    acc_role not in ("equity",),
                    "dimension_not_allowed_for_account",
                    "استفاده از بُعد مدیریتی برای حساب حقوق مالکانه مجاز نیست.",
                    409,
                )
            resolved_cp_id = line.get("counterparty_id")
            if resolved_cp_id:
                cp = get_entity(db, CommercialCounterparty, company, resolved_cp_id)
                require(cp.active, "inactive_counterparty", "طرف‌حساب غیرفعال است.", 409)
            elif line.get("party_id") and not allow_non_leaf:
                cp = resolve_counterparty(db, company, str(line["party_id"]), require_active=True)
                if cp:
                    resolved_cp_id = cp.id
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
                    "counterparty_id": resolved_cp_id,
                    "dimension_ids": dim_ids,
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
    *,
    allow_non_leaf: bool = False,
    scope: tuple[Module, Action] | None = None,
) -> dict[str, Any]:
    from .period_lock_service import require_open_period

    membership(db, company, user, "write", scope=scope)
    period = get_entity(db, m.Period, company, data["period_id"])
    require_open_period(db, company, period.id)
    require(period.start <= data["date"] <= period.end, "date_outside_period", "تاریخ سند خارج از دوره است.")
    lines = validate_lines(db, company, data, allow_non_leaf=allow_non_leaf)
    item = (
        get_entity(db, Draft, company, draft_id) if draft_id else Draft(company_id=company, actor_id=user.id)
    )
    if draft_id:
        check_version(item, version)
        require(item.state == "draft", "draft_not_editable", "پیش‌نویس قابل تغییر نیست.", 409)
        require(
            draft_id not in inventory_draft_ids(db, company, [draft_id]),
            "inventory_draft_changed",
            "پیش‌نویس کالا را کنار بگذارید و دوباره از گردش کالا تهیه کنید.",
            409,
        )
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


def draft_list_filters(company: str, state: str | None, search: str) -> list:
    from .operation_models import OperationDraft
    from .posting_models import NativeJournal

    filters = [Draft.state == state] if state else []
    if not search:
        return filters
    operation = select(OperationDraft.draft_id).where(
        OperationDraft.company_id == company,
        or_(
            OperationDraft.source_reference.icontains(search, autoescape=True),
            OperationDraft.payload["source_reference"].as_string().icontains(search, autoescape=True),
        ),
    )
    journal = select(NativeJournal.draft_id).where(
        NativeJournal.company_id == company,
        or_(
            NativeJournal.snapshot["number"].as_string().icontains(search, autoescape=True),
            cast(NativeJournal.sequence, String).contains(search, autoescape=True),
        ),
    )
    filters.append(or_(
        Draft.description.icontains(search, autoescape=True),
        Draft.id.icontains(search, autoescape=True),
        Draft.id.in_(operation),
        Draft.id.in_(journal),
    ))
    return filters


def enrich_draft_list(db: Session, company: str, items: list[dict]) -> None:
    from .inventory_service import GOODS_KINDS
    from .operation_models import OperationDraft
    from .posting_models import NativeJournal

    if not items:
        return
    ids = [row["id"] for row in items]
    journals = {
        row.draft_id: row for row in db.scalars(select(NativeJournal).where(
            NativeJournal.company_id == company, NativeJournal.draft_id.in_(ids)
        ))
    }
    operations = {
        row.draft_id: row for row in db.scalars(select(OperationDraft).where(
            OperationDraft.company_id == company, OperationDraft.draft_id.in_(ids)
        ))
    }
    for item in items:
        journal, operation = journals.get(item["id"]), operations.get(item["id"])
        item["reference"] = (
            (journal.snapshot or {}).get("number") or str(journal.sequence)
            if journal else operation.business_reference if operation else None
        )
        item["operation_kind"] = (
            "reversal" if journal and journal.reversal_of
            else "replacement" if journal and journal.replacement_of
            else operation.kind if operation else None
        )
        if operation and operation.kind in GOODS_KINDS:
            item["inventory_origin"] = True


def inventory_draft_ids(db: Session, company: str, ids: list[str]) -> set[str]:
    from .inventory_service import GOODS_KINDS
    from .operation_models import OperationDraft
    from .operation_numbering import WAREHOUSE_VOUCHER_KINDS

    if not ids:
        return set()
    return set(
        db.scalars(
            select(OperationDraft.draft_id).where(
                OperationDraft.company_id == company,
                OperationDraft.draft_id.in_(ids),
                OperationDraft.kind.in_(GOODS_KINDS.union(WAREHOUSE_VOUCHER_KINDS)),
            )
        )
    )


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
                "view_payroll": bool(item and item.view_payroll),
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
        "view_payroll": bool(item and item.view_payroll),
    }
    if item:
        check_version(item, version)
        item.version += 1
    else:
        require(version == 1, "version_conflict", "اطلاعات تغییر کرده است.", 409)
        item = AccountingPermission(company_id=company, membership_id=member.id, version=2)
    item.post_journal = data["post_journal"]
    item.reopen_period = data["reopen_period"]
    item.view_payroll = bool(data.get("view_payroll", False))
    db.add(item)
    db.flush()
    after = {
        "post_journal": item.post_journal,
        "reopen_period": item.reopen_period,
        "view_payroll": item.view_payroll,
    }
    audit(
        db,
        company,
        user.id,
        "accounting.permissions_changed",
        member.id,
        {"recipient_id": member.user_id, "before": before, "after": after},
    )
    return {"membership_id": member.id, "version": item.version, **after}


def list_detail_links(db: Session, company: str, user: m.User, detail_account_id: str | None = None) -> dict[str, Any]:
    membership(db, company, user, "read")
    return list_links(db, company, detail_account_id)


def save_detail_link(db: Session, company: str, user: m.User, data: dict[str, Any]) -> dict[str, Any]:
    require(
        capabilities(db, company, user)["can_manage_accounts"],
        "permission_denied",
        "اجازه مدیریت ارتباط تفصیلی ندارید.",
        403,
    )
    return save_link(db, company, user.id, data)
