"""Explicit account hierarchy, coding pattern validation, and company-qualified catalogue reads."""

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .accounting_models import Account, AccountHierarchy
from .errors import DomainError, require
from .services import get_entity

PARENT_LEVEL = {"general": "group", "subsidiary": "general", "detail": "subsidiary"}
LEVELS = ("group", "general", "subsidiary", "detail")
CODE_REGEX = {
    "group": re.compile(r"^[0-9]{2}$"),
    "general": re.compile(r"^[0-9]{4}$"),
    "subsidiary": re.compile(r"^[0-9]{6}$"),
    "detail": re.compile(r"^[0-9]{8,12}$"),
}
CODE_ERRORS = {
    "group": "کد گروه باید دقیقاً ۲ رقم عددی باشد (مثلاً 11).",
    "general": "کد کل باید دقیقاً ۴ رقم عددی باشد و با کد گروه بالادست شروع شود.",
    "subsidiary": "کد معین باید دقیقاً ۶ رقم عددی باشد و با کد کل بالادست شروع شود.",
    "detail": "کد تفصیلی باید عددی (حداقل ۸ رقم) باشد و با کد معین بالادست شروع شود.",
}


def is_code_pattern_valid(code: str, level: str | None, parent_code: str | None = None) -> bool:
    if level is None:
        return True
    pattern = CODE_REGEX.get(level)
    if pattern is None or not pattern.fullmatch(code):
        return False
    if level != "group":
        if not parent_code or not code.startswith(parent_code):
            return False
    return True


def validate_code_pattern(code: str, level: str | None, parent_code: str | None = None) -> None:
    if level is None:
        return
    if not is_code_pattern_valid(code, level, parent_code):
        raise DomainError("invalid_account_code_pattern", CODE_ERRORS[level], fields={"code": CODE_ERRORS[level]})


def generate_next_code(db: Session, company: str, level: str, parent_code: str | None = None) -> str:
    existing = set(db.scalars(select(Account.code).where(Account.company_id == company)))
    if level == "group":
        nums = [int(code) for code in existing if len(code) == 2 and code.isascii() and code.isdigit()]
        start = max(nums, default=0) + 1
        for candidate_num in [*range(start, 100), *range(1, start)]:
            if 1 <= candidate_num <= 99:
                candidate = f"{candidate_num:02d}"
                if candidate not in existing:
                    validate_code_pattern(candidate, level, None)
                    return candidate
        raise DomainError("account_code_exhausted", "ظرفیت کدهای دو رقمی گروه تکمیل شده است.", 409, {"code": "ظرفیت کدهای گروه تکمیل شده است."})
    require(bool(parent_code), "account_parent_required", "حساب بالادست را انتخاب کنید.")
    parent_level = PARENT_LEVEL[level]
    if not CODE_REGEX[parent_level].fullmatch(parent_code or ""):
        raise DomainError(
            "legacy_parent_code_incompatible",
            "کد حساب بالادست با الگوی ۴ سطحی سازگار نیست؛ امکان تولید خودکار یا افزودن زیرمجموعه با الگوی جدید زیر این کد قدیمی وجود ندارد.",
            409,
            {"parent_id": "کد حساب بالادست با الگوی جدید سازگار نیست."},
        )
    prefix = parent_code or ""
    target_len = len(prefix) + 2
    nums = [
        int(code[len(prefix):])
        for code in existing
        if code.startswith(prefix) and len(code) == target_len and code[len(prefix):].isascii() and code[len(prefix):].isdigit()
    ]
    start = max(nums, default=0) + 1
    for candidate_num in [*range(start, 100), *range(1, start)]:
        if 1 <= candidate_num <= 99:
            candidate = f"{prefix}{candidate_num:02d}"
            if candidate not in existing and is_code_pattern_valid(candidate, level, parent_code):
                return candidate
    if level == "detail":
        for candidate_num in range(100, 1000):
            candidate = f"{prefix}{candidate_num:03d}"
            if candidate not in existing and is_code_pattern_valid(candidate, level, parent_code):
                return candidate
    raise DomainError("account_code_exhausted", "ظرفیت کدهای زیرمجموعه این سرفصل تکمیل شده است.", 409, {"code": "ظرفیت کدهای این سرفصل تکمیل شده است."})


def validate_hierarchy(
    db: Session, company: str, account_id: str | None, level: str | None, parent_id: str | None
) -> str | None:
    require(level in (*LEVELS, None), "invalid_account_level", "سطح حساب معتبر انتخاب کنید.")
    parent_code: str | None = None
    if level in (None, "group"):
        require(not parent_id, "invalid_account_parent", "حساب گروه بالادست ندارد.")
    else:
        require(bool(parent_id), "account_parent_required", "حساب بالادست را انتخاب کنید.")
        require(parent_id != account_id, "invalid_account_parent", "حساب نمی‌تواند بالادست خودش باشد.")
        parent_account = get_entity(db, Account, company, parent_id)
        parent = db.scalar(select(AccountHierarchy).where(
            AccountHierarchy.company_id == company, AccountHierarchy.account_id == parent_id,
        ))
        require(parent is not None and parent.level == PARENT_LEVEL[level],
                "invalid_account_parent_level", "سطح حساب بالادست سازگار نیست.")
        parent_code = parent_account.code
    if account_id:
        child_levels = list(db.scalars(select(AccountHierarchy.level).where(
            AccountHierarchy.company_id == company, AccountHierarchy.parent_id == account_id,
        )))
        require(all(PARENT_LEVEL.get(child) == level for child in child_levels),
                "account_has_children", "ابتدا سطح حساب‌های زیرمجموعه را اصلاح کنید.", 409)
    return parent_code


def save_hierarchy(
    db: Session,
    company: str,
    item: Account,
    level: str | None,
    parent_id: str | None,
    code_status: str = "standard",
) -> None:
    hierarchy = db.scalar(select(AccountHierarchy).where(
        AccountHierarchy.company_id == company, AccountHierarchy.account_id == item.id,
    ))
    if hierarchy is None and level:
        hierarchy = AccountHierarchy(
            company_id=company,
            account_id=item.id,
            level=level,
            parent_id=parent_id,
            code_status=code_status,
        )
        db.add(hierarchy)
    elif hierarchy is not None:
        if level is None:
            db.delete(hierarchy)
        else:
            hierarchy.level, hierarchy.parent_id = level, parent_id
            hierarchy.code_status = code_status
    db.flush()


def non_postable_account_ids(db: Session, company: str, candidate_ids: list[str] | None = None) -> set[str]:
    stmt_group = select(AccountHierarchy.account_id).where(
        AccountHierarchy.company_id == company, AccountHierarchy.level == "group"
    )
    stmt_parents = select(AccountHierarchy.parent_id).where(
        AccountHierarchy.company_id == company, AccountHierarchy.parent_id.isnot(None)
    )
    if candidate_ids is not None:
        if not candidate_ids:
            return set()
        stmt_group = stmt_group.where(AccountHierarchy.account_id.in_(candidate_ids))
        stmt_parents = stmt_parents.where(AccountHierarchy.parent_id.in_(candidate_ids))
    blocked = set(db.scalars(stmt_group))
    blocked.update(pid for pid in db.scalars(stmt_parents) if pid)
    return blocked


def require_postable_account(db: Session, company: str, account: Account) -> None:
    hierarchy = db.scalar(select(AccountHierarchy).where(
        AccountHierarchy.company_id == company, AccountHierarchy.account_id == account.id,
    ))
    if hierarchy and hierarchy.level == "group":
        raise DomainError(
            "non_postable_account",
            f"ثبت سند روی حساب گروه «{account.code} — {account.name}» مجاز نیست.",
            409,
        )
    has_child = db.scalar(select(AccountHierarchy.account_id).where(
        AccountHierarchy.company_id == company, AccountHierarchy.parent_id == account.id,
    ).limit(1))
    if has_child:
        raise DomainError(
            "non_postable_parent_account",
            f"حساب «{account.code} — {account.name}» دارای زیرمجموعه است و نمی‌توان به آن سند زد؛ از حساب سطح پایین‌تر استفاده کنید.",
            409,
        )


def enrich_accounts(db: Session, company: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not rows:
        return rows
    from .native_reporting_models import NativeAccountRole

    row_ids = [row["id"] for row in rows]
    hierarchy = {item.account_id: item for item in db.scalars(select(AccountHierarchy).where(
        AccountHierarchy.company_id == company, AccountHierarchy.account_id.in_(row_ids),
    ))}
    parent_ids_with_children = set(
        pid for pid in db.scalars(select(AccountHierarchy.parent_id).where(
            AccountHierarchy.company_id == company, AccountHierarchy.parent_id.in_(row_ids),
        )) if pid
    )
    parents = {item.id: item for item in db.scalars(select(Account).where(
        Account.company_id == company,
        Account.id.in_([item.parent_id for item in hierarchy.values() if item.parent_id]),
    ))}
    roles = {item.account_id: item.role for item in db.scalars(select(NativeAccountRole).where(
        NativeAccountRole.company_id == company,
        NativeAccountRole.account_id.in_(row_ids),
    ))}
    for row in rows:
        info = hierarchy.get(row["id"])
        parent = parents.get(info.parent_id) if info else None
        level = info.level if info else None
        has_children = row["id"] in parent_ids_with_children
        code_valid = is_code_pattern_valid(row["code"], level, parent.code if parent else None) if level else None
        code_status = info.code_status if info else None
        if info and not code_valid:
            code_status = "legacy"
        can_add_child = (
            level in ("group", "general", "subsidiary")
            and bool(CODE_REGEX[level].fullmatch(row["code"]))
        )
        row.update(
            level=level,
            parent_id=info.parent_id if info else None,
            parent_code=parent.code if parent else None,
            parent_name=parent.name if parent else None,
            role=roles.get(row["id"]),
            has_children=has_children,
            postable=bool(row.get("active", True)) and level != "group" and not has_children,
            code_status=code_status,
            code_pattern_valid=code_valid,
            can_add_standard_child=can_add_child,
        )
    return rows


def catalogue_filters(company: str, level: str | None, parent_id: str | None) -> list:
    filters = []
    if level:
        require(level in (*LEVELS, "unclassified"), "invalid_account_level", "سطح حساب معتبر انتخاب کنید.")
        classified = select(AccountHierarchy.account_id).where(AccountHierarchy.company_id == company)
        filters.append(~Account.id.in_(classified) if level == "unclassified" else Account.id.in_(
            classified.where(AccountHierarchy.level == level)))
    if parent_id:
        filters.append(Account.id.in_(select(AccountHierarchy.account_id).where(
            AccountHierarchy.company_id == company, AccountHierarchy.parent_id == parent_id,
        )))
    return filters


def resolve_account_code(
    db: Session,
    company: str,
    code: str | None,
    level: str | None,
    parent_code: str | None,
    item: Account | None,
    *,
    preserve_legacy: bool = False,
) -> tuple[str, str]:
    raw = code.strip() if isinstance(code, str) else ""
    if item:
        value = raw or item.code
        if value != item.code:
            raise DomainError("account_code_immutable", "کد حساب ثبت‌شده تغییر نمی‌کند.", 409, {"code": "کد حساب ثبت‌شده تغییر نمی‌کند."})
        if level is not None:
            if preserve_legacy and not is_code_pattern_valid(value, level, parent_code):
                return value, "legacy"
            validate_code_pattern(value, level, parent_code)
        return value, "standard"
    if not raw:
        if level in LEVELS:
            return generate_next_code(db, company, level, parent_code), "standard"
        raise DomainError("account_code_required", "کد حساب را وارد کنید.", fields={"code": "کد حساب لازم است."})
    if len(raw) > 100:
        raise DomainError("account_code_required", "کد حساب بیش از حد طولانی است.", fields={"code": "کد حساب بیش از حد طولانی است."})
    validate_code_pattern(raw, level, parent_code)
    duplicate = db.scalar(select(Account.id).where(Account.company_id == company, Account.code == raw))
    if duplicate:
        raise DomainError("duplicate_account_code", "کد حساب تکراری است.", 409, {"code": "این کد حساب موجود است."})
    return raw, "standard"


def require_manual_code(db: Session, company: str, code: str | None, item: Account | None) -> str:
    resolved, _ = resolve_account_code(db, company, code, None, None, item)
    return resolved
