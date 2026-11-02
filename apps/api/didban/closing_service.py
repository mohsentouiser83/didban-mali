"""Explicit native-only period accounting drafts; no inferred accounts or automatic posting."""

import json
from decimal import Decimal, localcontext
from hashlib import sha256

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_models import Account, Draft
from .accounting_service import save_draft
from .closing_models import PeriodAccountingDraft
from .errors import DomainError, require
from .money_type import canonical_money
from .native_reporting_models import NativeAccountRole
from .native_roles_service import NOMINAL_ROLES, ROLE_KEYS
from .period_lock_service import lock_for, require_open_period
from .posting_models import JournalCorrectionDraft, NativeJournal
from .posting_service import trial_balance
from .security import membership
from .services import get_entity
from .workflow import audit


def _line_amount(value: Decimal) -> str:
    try:
        return canonical_money(value)
    except ValueError as error:
        raise DomainError("period_line_amount_limit", "مبلغ پیشنهادی از سقف هر ردیف بیشتر است.") from error


def _draft_digest(draft: Draft) -> str:
    value = {
        "period_id": draft.period_id,
        "date": draft.date.isoformat(),
        "description": draft.description,
        "original_unit": draft.original_unit,
        "lines": draft.lines,
    }
    return sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _accounts(db: Session, company: str, identifiers: list[str]) -> None:
    require(len(identifiers) == len(set(identifiers)), "duplicate_accounts", "حساب تکراری انتخاب شده است.")
    for identifier in identifiers:
        item = get_entity(db, Account, company, identifier)
        require(item.active, "inactive_account", "حساب غیرفعال است.")


def _source_ids(db: Session, company: str, period_id: str) -> list[str]:
    return list(
        db.scalars(
            select(NativeJournal.id)
            .where(NativeJournal.company_id == company, NativeJournal.period_id == period_id)
            .order_by(NativeJournal.sequence)
        )
    )


def _role_pins(
    db: Session, company: str, kind: str, account_ids: list[str], result_id: str | None = None
) -> list[dict]:
    pins = []
    for account_id in sorted([*account_ids, *([result_id] if result_id else [])]):
        role = db.scalar(
            select(NativeAccountRole).where(
                NativeAccountRole.company_id == company, NativeAccountRole.account_id == account_id
            )
        )
        require(
            role is not None and role.role is not None,
            "period_account_role_missing",
            "پیش از بستن یا انتقال مانده، نقش حساب‌های منتخب را مشخص کنید.",
            409,
        )
        allowed = (
            {"equity"}
            if account_id == result_id
            else NOMINAL_ROLES
            if kind == "closing"
            else ROLE_KEYS - NOMINAL_ROLES
        )
        message = (
            "حساب نتیجه باید نقش حقوق مالکانه داشته باشد."
            if account_id == result_id
            else (
                "فقط حساب درآمد یا هزینه را برای بستن انتخاب کنید."
                if kind == "closing"
                else "افتتاحیه فقط حساب ترازنامه‌ای می‌پذیرد."
            )
        )
        require(role.role in allowed, "period_account_role_invalid", message, 409)
        pins.append({"account_id": account_id, "role": role.role, "version": role.version})
    return pins


def _active_posted(db: Session, company: str, kind: str, target_period_id: str) -> bool:
    for link in db.scalars(
        select(PeriodAccountingDraft).where(
            PeriodAccountingDraft.company_id == company,
            PeriodAccountingDraft.kind == kind,
            PeriodAccountingDraft.target_period_id == target_period_id,
        )
    ):
        journal = db.scalar(
            select(NativeJournal).where(
                NativeJournal.company_id == company, NativeJournal.draft_id == link.draft_id
            )
        )
        seen = set()
        while journal and journal.id not in seen:
            seen.add(journal.id)
            if not db.scalar(
                select(NativeJournal.id).where(
                    NativeJournal.company_id == company, NativeJournal.reversal_of == journal.id
                )
            ):
                return True
            journal = db.scalar(
                select(NativeJournal).where(
                    NativeJournal.company_id == company, NativeJournal.replacement_of == journal.id
                )
            )
    return False


def _save(
    db: Session,
    company: str,
    user: m.User,
    source_period_id: str,
    target_period_id: str,
    kind: str,
    reason: str,
    selection: dict,
    lines: list[dict],
    stamp,
) -> dict:
    title = "بستن حساب‌های منتخب" if kind == "closing" else "انتقال ماندهٔ حساب‌های منتخب"
    result = save_draft(
        db,
        company,
        user,
        {
            "period_id": target_period_id,
            "date": stamp,
            "description": f"{title}: {reason}"[:500],
            "unit": "IRR",
            "lines": lines,
        },
    )
    draft = db.get(Draft, result["id"])
    link = PeriodAccountingDraft(
        company_id=company,
        draft_id=draft.id,
        source_period_id=source_period_id,
        target_period_id=target_period_id,
        kind=kind,
        actor_id=user.id,
        reason=reason,
        source_journal_ids=_source_ids(db, company, source_period_id),
        selection=selection,
        draft_digest=_draft_digest(draft),
    )
    db.add(link)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "accounting.period_draft_created",
        draft.id,
        {"kind": kind, "provenance_id": link.id},
    )
    return result | {
        "period_accounting": {
            "kind": kind,
            "source_period_id": source_period_id,
            "source_journal_ids": link.source_journal_ids,
            "selection": selection,
            "scope": "explicit_selected_accounts",
        }
    }


def create_closing(db: Session, company: str, user: m.User, data: dict) -> dict:
    membership(db, company, user, "write")
    period = get_entity(db, m.Period, company, data["period_id"])
    require_open_period(db, company, period.id)
    ids = data["account_ids"]
    result_id = data["result_account_id"]
    _accounts(db, company, ids + [result_id])
    roles = _role_pins(db, company, "closing", ids, result_id)
    require(
        not _active_posted(db, company, "closing", period.id),
        "period_closing_exists",
        "سند بستن حساب‌ها قبلاً ثبت شده؛ ابتدا آن را با دلیل اصلاح کنید.",
        409,
    )
    report = trial_balance(db, company, user, period.id)
    lines = []
    with localcontext() as context:
        context.prec = 60
        net = Decimal(0)
        for row in report["items"]:
            if row["account_id"] not in ids:
                continue
            value = Decimal(row["balance"])
            if not value:
                continue
            net += value
            lines.append(
                {
                    "account_id": row["account_id"],
                    "party_id": row["party_id"],
                    "debit": _line_amount(max(value.copy_negate(), Decimal(0))),
                    "credit": _line_amount(max(value, Decimal(0))),
                }
            )
        if net:
            lines.append(
                {
                    "account_id": result_id,
                    "party_id": "",
                    "debit": _line_amount(max(net, Decimal(0))),
                    "credit": _line_amount(max(-net, Decimal(0))),
                }
            )
    require(bool(lines), "closing_balance_empty", "حساب‌های منتخب مانده‌ای برای بستن ندارند.", 409)
    require(len(lines) <= 200, "closing_line_limit", "حساب‌های منتخب بیش از ۲۰۰ ردیف دارند.")
    return _save(
        db,
        company,
        user,
        period.id,
        period.id,
        "closing",
        data["reason"],
        {"account_ids": ids, "result_account_id": result_id, "account_roles": roles},
        lines,
        period.end,
    )


def create_opening(db: Session, company: str, user: m.User, data: dict) -> dict:
    membership(db, company, user, "write")
    source = get_entity(db, m.Period, company, data["source_period_id"])
    target = get_entity(db, m.Period, company, data["target_period_id"])
    require(source.end < target.start, "opening_period_order", "دورهٔ مبدأ باید پیش از دورهٔ مقصد باشد.")
    lock = lock_for(db, company, source.id)
    require(lock is not None and lock.closed, "opening_source_open", "ابتدا دورهٔ مبدأ را قفل کنید.", 409)
    require_open_period(db, company, target.id)
    _accounts(db, company, data["account_ids"])
    roles = _role_pins(db, company, "opening", data["account_ids"])
    require(
        not _active_posted(db, company, "opening", target.id),
        "period_opening_exists",
        "انتقال ماندهٔ این دوره قبلاً ثبت شده است.",
        409,
    )
    report = trial_balance(db, company, user, source.id)
    lines = []
    for row in report["items"]:
        if row["account_id"] not in data["account_ids"]:
            continue
        value = Decimal(row["balance"])
        if not value:
            continue
        lines.append(
            {
                "account_id": row["account_id"],
                "party_id": row["party_id"],
                "debit": _line_amount(max(value, Decimal(0))),
                "credit": _line_amount(max(value.copy_negate(), Decimal(0))),
            }
        )
    require(bool(lines), "opening_balance_empty", "حساب‌های منتخب مانده‌ای برای انتقال ندارند.", 409)
    require(len(lines) <= 200, "opening_line_limit", "حساب‌های منتخب بیش از ۲۰۰ ردیف دارند.")
    return _save(
        db,
        company,
        user,
        source.id,
        target.id,
        "opening",
        data["reason"],
        {"account_ids": data["account_ids"], "account_roles": roles},
        lines,
        target.start,
    )


def validate_posting(db: Session, company: str, draft: Draft) -> bool:
    link = db.scalar(
        select(PeriodAccountingDraft).where(
            PeriodAccountingDraft.company_id == company, PeriodAccountingDraft.draft_id == draft.id
        )
    )
    if not link:
        return _validate_period_replacement(db, company, draft)
    require(
        bool(link.selection.get("account_roles")),
        "period_role_provenance_missing",
        "پیش‌نویس قدیمی نقش حساب‌ها را ندارد؛ دوباره بسازید.",
        409,
    )
    current_roles = _role_pins(
        db, company, link.kind, link.selection["account_ids"], link.selection.get("result_account_id")
    )
    require(
        current_roles == link.selection["account_roles"],
        "period_account_roles_changed",
        "نقش یا نسخهٔ حساب‌های منتخب تغییر کرده؛ پیش‌نویس را دوباره بسازید.",
        409,
    )
    require(
        _draft_digest(draft) == link.draft_digest,
        "period_draft_changed",
        "پیش‌نویس دوره تغییر کرده؛ آن را از مانده‌های جاری دوباره بسازید.",
        409,
    )
    require(
        _source_ids(db, company, link.source_period_id) == link.source_journal_ids,
        "period_source_changed",
        "اسناد دورهٔ مبدأ تغییر کرده؛ پیش‌نویس را دوباره بسازید.",
        409,
    )
    require(
        not _active_posted(db, company, link.kind, link.target_period_id),
        "period_accounting_exists",
        "سند این عملیات دوره قبلاً ثبت شده است.",
        409,
    )
    if link.kind == "opening":
        lock = lock_for(db, company, link.source_period_id)
        require(lock is not None and lock.closed, "opening_source_open", "دورهٔ مبدأ بازگشایی شده است.", 409)
    return True


def _validate_period_replacement(db: Session, company: str, draft: Draft) -> bool:
    correction = db.scalar(
        select(JournalCorrectionDraft).where(
            JournalCorrectionDraft.company_id == company,
            JournalCorrectionDraft.draft_id == draft.id,
            JournalCorrectionDraft.kind == "replacement",
        )
    )
    if not correction:
        return False
    journal = get_entity(db, NativeJournal, company, correction.original_journal_id)
    seen = set()
    metadata = None
    while journal.id not in seen:
        seen.add(journal.id)
        metadata = journal.snapshot.get("period_accounting")
        if metadata:
            break
        origin = journal.replacement_of or journal.reversal_of
        if not origin:
            break
        journal = get_entity(db, NativeJournal, company, origin)
    if not metadata:
        return False
    selection = metadata.get("selection", {})
    selected = selection.get("account_ids", [])
    result_id = selection.get("result_account_id")
    allowed = set(selected) | ({result_id} if result_id else set())
    require(
        bool(allowed) and all(line["account_id"] in allowed for line in draft.lines),
        "period_correction_accounts_changed",
        "حساب‌های اصلاح دوره تغییر کرده؛ پیش‌نویس دوره را دوباره بسازید.",
        409,
    )
    _role_pins(db, company, metadata["kind"], selected, result_id)
    return True
