"""Explicit human posting of exact reviewed draft versions into an isolated native book."""

import json
from datetime import date
from decimal import Decimal, localcontext
from hashlib import sha256
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_models import Account, AccountingPermission, Draft
from .accounting_service import capabilities, save_draft, validate_lines
from .accounting_setup_models import CompanyAccountingSetup
from .errors import require
from .money_type import aggregate_money
from .period_lock_service import require_open_period
from .posting_models import JournalCorrectionDraft, NativeJournal
from .security import membership
from .services import check_version, get_entity
from .workflow import audit, serialize_fact


def _aggregate(value: Decimal) -> str:
    """JSON report totals may exceed the storage limit of a single money field."""
    return aggregate_money(value)


def _correction(db: Session, company: str, draft_id: str) -> JournalCorrectionDraft | None:
    return db.scalar(
        select(JournalCorrectionDraft).where(
            JournalCorrectionDraft.company_id == company, JournalCorrectionDraft.draft_id == draft_id
        )
    )


def _prepared(db: Session, company: str, draft_id: str) -> dict[str, Any]:
    from .closing_models import PeriodAccountingDraft

    draft = get_entity(db, Draft, company, draft_id)
    require(draft.state == "draft", "draft_not_postable", "این پیش‌نویس آمادهٔ ثبت نیست.", 409)
    period = get_entity(db, m.Period, company, draft.period_id)
    require_open_period(db, company, period.id)
    require(period.start <= draft.date <= period.end, "date_outside_period", "تاریخ سند خارج از دوره است.")
    # Stored draft amounts are already IRR. Revalidating must never multiply TOMAN twice.
    validate_lines(db, company, {"unit": "IRR", "lines": draft.lines})
    lines = []
    for line in draft.lines:
        account = get_entity(db, Account, company, line["account_id"])
        lines.append({**line, "code": account.code, "name": account.name, "account_version": account.version})
    link = _correction(db, company, draft.id)
    correction = None
    if link:
        original = get_entity(db, NativeJournal, company, link.original_journal_id)
        require(not original.reversal_of, "cannot_reverse_reversal", "برگشتِ سند برگشت مجاز نیست.", 409)
        if link.kind == "reversal":
            require(
                not db.scalar(
                    select(NativeJournal.id).where(
                        NativeJournal.company_id == company, NativeJournal.reversal_of == original.id
                    )
                ),
                "journal_already_reversed",
                "این سند قبلاً برگشت شده است.",
                409,
            )
            expected = [
                {
                    "account_id": row["account_id"],
                    "party_id": row.get("party_id", ""),
                    "debit": row["credit"],
                    "credit": row["debit"],
                }
                for row in original.snapshot["lines"]
            ]
            actual = [
                {key: row.get(key, "") for key in ("account_id", "party_id", "debit", "credit")}
                for row in draft.lines
            ]
            require(
                actual == expected,
                "reversal_content_changed",
                "ردیف‌های برگشت باید دقیقاً معکوس سند اصلی باشند.",
                409,
            )
        else:
            require(
                db.scalar(
                    select(NativeJournal.id).where(
                        NativeJournal.company_id == company, NativeJournal.reversal_of == original.id
                    )
                )
                is not None,
                "reversal_required",
                "ابتدا سند برگشت را نهایی کنید.",
                409,
            )
            require(
                not db.scalar(
                    select(NativeJournal.id).where(
                        NativeJournal.company_id == company, NativeJournal.replacement_of == original.id
                    )
                ),
                "replacement_exists",
                "سند جایگزین قبلاً ثبت شده است.",
                409,
            )
        correction = {"kind": link.kind, "original_journal_id": original.id, "reason": link.reason}
    snapshot = {
        "draft_id": draft.id,
        "draft_version": draft.version,
        "period_id": period.id,
        "date": draft.date.isoformat(),
        "description": draft.description,
        "original_unit": draft.original_unit,
        "lines": lines,
        "correction": correction,
        "basis": "native_book",
        "policy_version": "native-posting-provisional-1",
        "policy_provenance": "user_provisional",
        "decision_id": "D22",
    }
    period_origin = db.scalar(
        select(PeriodAccountingDraft).where(
            PeriodAccountingDraft.company_id == company, PeriodAccountingDraft.draft_id == draft.id
        )
    )
    if period_origin:
        snapshot["period_accounting"] = {
            "kind": period_origin.kind,
            "source_period_id": period_origin.source_period_id,
            "source_journal_ids": period_origin.source_journal_ids,
            "selection": period_origin.selection,
            "reason": period_origin.reason,
            "scope": "explicit_selected_accounts",
        }
    digest = sha256(
        json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    with localcontext() as context:
        context.prec = 60
        total_debit = _aggregate(sum((Decimal(row["debit"]) for row in lines), Decimal(0)))
        total_credit = _aggregate(sum((Decimal(row["credit"]) for row in lines), Decimal(0)))
    return {
        "draft_id": draft.id,
        "expected_version": draft.version,
        "digest": digest,
        "snapshot": snapshot,
        "total_debit": total_debit,
        "total_credit": total_credit,
    }


def preview(db: Session, company: str, user: m.User, draft_id: str) -> dict[str, Any]:
    from .closing_service import validate_posting as validate_period_posting

    membership(db, company, user)
    validate_period_posting(db, company, get_entity(db, Draft, company, draft_id))
    return _prepared(db, company, draft_id)


def _posting_authority(db: Session, company: str, user: m.User) -> dict:
    require(user.active, "permission_denied", "حساب کاربری غیرفعال است.", 403)
    member = membership(db, company, user)
    require(
        capabilities(db, company, user)["can_post"],
        "posting_permission_required",
        "اختیار ثبت نهایی سند ندارید.",
        403,
    )
    setup = db.get(CompanyAccountingSetup, company)
    require(
        setup is not None and setup.mode == "primary",
        "primary_accounting_required",
        "ثبت نهایی فقط در کاربرد حسابداری اصلی فعال است.",
        409,
    )
    if member.role == "finance_manager":
        return {
            "source": "role:finance_manager",
            "membership_id": member.id,
            "membership_version": member.version,
        }
    permission = db.scalar(
        select(AccountingPermission).where(
            AccountingPermission.company_id == company, AccountingPermission.membership_id == member.id
        )
    )
    return {
        "source": "explicit_post_journal",
        "membership_id": member.id,
        "permission_id": permission.id,
        "permission_version": permission.version,
    }


def post_batch(db: Session, company: str, user: m.User, items: list[dict]) -> dict[str, Any]:
    from .closing_service import validate_posting as validate_period_posting
    from .operation_service import validate_posting

    provenance = _posting_authority(db, company, user)
    require(1 <= len(items) <= 100, "posting_batch_size", "بین ۱ تا ۱۰۰ سند انتخاب کنید.")
    identifiers = [item["draft_id"] for item in items]
    require(len(identifiers) == len(set(identifiers)), "duplicate_draft", "یک پیش‌نویس دوبار انتخاب شده است.")
    prepared = []
    correction_keys = []
    cheque_ids = []
    has_period_draft = False
    for item in items:
        draft = get_entity(db, Draft, company, item["draft_id"])
        check_version(draft, item["expected_version"])
        current = _prepared(db, company, draft.id)
        has_period_draft = validate_period_posting(db, company, draft) or has_period_draft
        cheque_id = validate_posting(db, company, draft)
        if cheque_id:
            cheque_ids.append(cheque_id)
        require(
            current["digest"] == item["digest"],
            "posting_preview_changed",
            "محتوای سند یا حساب‌ها تغییر کرده؛ دوباره بررسی کنید.",
            409,
        )
        link = current["snapshot"]["correction"]
        if link:
            correction_keys.append((link["kind"], link["original_journal_id"]))
        prepared.append((draft, current))
    require(
        len(correction_keys) == len(set(correction_keys)),
        "duplicate_correction",
        "برای یک سند چند اصلاح هم‌نوع انتخاب شده است.",
        409,
    )
    require(
        len(cheque_ids) == len(set(cheque_ids)),
        "duplicate_cheque_effect",
        "برای یک چک چند رویداد مالی هم‌زمان انتخاب شده است.",
        409,
    )
    require(
        not has_period_draft or len(items) == 1,
        "period_draft_post_alone",
        "پیش‌نویس بستن یا انتقال مانده را جداگانه تأیید کنید.",
        409,
    )
    sequence = (
        db.scalar(select(func.max(NativeJournal.sequence)).where(NativeJournal.company_id == company)) or 0
    )
    result = []
    for draft, current in prepared:
        sequence += 1
        correction = current["snapshot"]["correction"] or {}
        journal = NativeJournal(
            company_id=company,
            draft_id=draft.id,
            draft_version=draft.version,
            period_id=draft.period_id,
            date=draft.date,
            sequence=sequence,
            digest=current["digest"],
            snapshot=current["snapshot"],
            actor_id=user.id,
            permission_provenance=provenance,
            reversal_of=correction.get("original_journal_id")
            if correction.get("kind") == "reversal"
            else None,
            replacement_of=correction.get("original_journal_id")
            if correction.get("kind") == "replacement"
            else None,
        )
        db.add(journal)
        draft.state = "posted"
        draft.version += 1
        db.flush()
        audit(
            db,
            company,
            user.id,
            "accounting.journal_posted",
            journal.id,
            {
                "draft_id": draft.id,
                "approved_version": journal.draft_version,
                "digest": journal.digest,
                "sequence": sequence,
                "permission_provenance": provenance,
            },
        )
        result.append(serialize_fact(journal))
    from .native_control_service import on_postings

    on_postings(db, company, user, [draft.period_id for draft, _ in prepared])
    from .native_automation_service import on_postings as apply_rules

    apply_rules(db, company, user, [row["id"] for row in result])
    return {"items": result, "basis": "native_book"}


def create_reversal(db: Session, company: str, user: m.User, journal_id: str, data: dict) -> dict:
    original = get_entity(db, NativeJournal, company, journal_id)
    require(not original.reversal_of, "cannot_reverse_reversal", "برگشتِ سند برگشت مجاز نیست.", 409)
    require(
        not db.scalar(
            select(NativeJournal.id).where(
                NativeJournal.company_id == company, NativeJournal.reversal_of == original.id
            )
        ),
        "journal_already_reversed",
        "این سند قبلاً برگشت شده است.",
        409,
    )
    lines = [
        {
            "account_id": row["account_id"],
            "party_id": row.get("party_id", ""),
            "debit": row["credit"],
            "credit": row["debit"],
        }
        for row in original.snapshot["lines"]
    ]
    draft = save_draft(
        db,
        company,
        user,
        {
            "period_id": data["period_id"],
            "date": data["date"],
            "description": f"برگشت سند {original.sequence}: {data['reason']}"[:500],
            "unit": "IRR",
            "lines": lines,
        },
    )
    db.add(
        JournalCorrectionDraft(
            company_id=company,
            draft_id=draft["id"],
            original_journal_id=original.id,
            kind="reversal",
            reason=data["reason"],
            actor_id=user.id,
        )
    )
    db.flush()
    return draft


def create_replacement(db: Session, company: str, user: m.User, journal_id: str, data: dict) -> dict:
    original = get_entity(db, NativeJournal, company, journal_id)
    require(not original.reversal_of, "cannot_replace_reversal", "سند برگشت جایگزین نمی‌شود.", 409)
    require(
        db.scalar(
            select(NativeJournal.id).where(
                NativeJournal.company_id == company, NativeJournal.reversal_of == original.id
            )
        )
        is not None,
        "reversal_required",
        "ابتدا سند برگشت را نهایی کنید.",
        409,
    )
    require(
        not db.scalar(
            select(NativeJournal.id).where(
                NativeJournal.company_id == company, NativeJournal.replacement_of == original.id
            )
        ),
        "replacement_exists",
        "سند جایگزین قبلاً ثبت شده است.",
        409,
    )
    draft = save_draft(db, company, user, {key: value for key, value in data.items() if key != "reason"})
    db.add(
        JournalCorrectionDraft(
            company_id=company,
            draft_id=draft["id"],
            original_journal_id=original.id,
            kind="replacement",
            reason=data["reason"],
            actor_id=user.id,
        )
    )
    db.flush()
    return draft


def trial_balance(db: Session, company: str, user: m.User, period_id: str, as_of: date | None = None) -> dict:
    membership(db, company, user)
    period = get_entity(db, m.Period, company, period_id)
    cutoff = as_of or period.end
    require(period.start <= cutoff <= period.end, "date_outside_period", "تاریخ گزارش خارج از دوره است.")
    journals = list(
        db.scalars(
            select(NativeJournal)
            .where(
                NativeJournal.company_id == company,
                NativeJournal.period_id == period_id,
                NativeJournal.date <= cutoff,
            )
            .order_by(NativeJournal.sequence)
        )
    )
    rows = {}
    with localcontext() as context:
        context.prec = 60
        for journal in journals:
            for line in journal.snapshot["lines"]:
                key = (line["account_id"], line.get("party_id", ""))
                row = rows.setdefault(
                    key,
                    {
                        "account_id": key[0],
                        "party_id": key[1],
                        "code": line["code"],
                        "name": line["name"],
                        "debit": Decimal(0),
                        "credit": Decimal(0),
                    },
                )
                row["debit"] += Decimal(line["debit"])
                row["credit"] += Decimal(line["credit"])
        total_debit = sum((row["debit"] for row in rows.values()), Decimal(0))
        total_credit = sum((row["credit"] for row in rows.values()), Decimal(0))
        rendered = [
            {
                **row,
                "debit": _aggregate(row["debit"]),
                "credit": _aggregate(row["credit"]),
                "balance": _aggregate(row["debit"] - row["credit"]),
            }
            for row in rows.values()
        ]
    return {
        "basis": "native_book",
        "scope": "period_movements",
        "period_id": period.id,
        "as_of": cutoff.isoformat(),
        "journal_ids": [journal.id for journal in journals],
        "items": rendered,
        "total_debit": _aggregate(total_debit),
        "total_credit": _aggregate(total_credit),
        "includes_imported_ledger": False,
        "opening_balance_inferred": False,
    }


def save_report(db: Session, company: str, user: m.User, period_id: str, as_of: date | None = None) -> dict:
    from .posting_models import NativeBookReportRun

    membership(db, company, user, "write")
    snapshot = trial_balance(db, company, user, period_id, as_of)
    snapshot["company_name"] = db.get(m.Company, company).name
    snapshot["title"] = "گردش دفتر اصلی دیدبان"
    digest = sha256(
        json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    item = NativeBookReportRun(company_id=company, actor_id=user.id, digest=digest, snapshot=snapshot)
    db.add(item)
    db.flush()
    audit(db, company, user.id, "accounting.native_report_saved", item.id, {"digest": digest})
    return serialize_fact(item)


def discard_draft(db: Session, company: str, user: m.User, draft_id: str, reason: str, version: int) -> dict:
    require(
        capabilities(db, company, user)["can_prepare"],
        "permission_denied",
        "اجازهٔ تغییر پیش‌نویس ندارید.",
        403,
    )
    require(bool(reason.strip()), "reason_required", "دلیل کنارگذاشتن را بنویسید.")
    draft = get_entity(db, Draft, company, draft_id)
    check_version(draft, version)
    require(draft.state == "draft", "draft_not_editable", "فقط پیش‌نویس ثبت‌نشده را می‌توان کنار گذاشت.", 409)
    draft.state = "discarded"
    draft.version += 1
    db.flush()
    audit(
        db,
        company,
        user.id,
        "accounting.draft_discarded",
        draft.id,
        {"reason": reason.strip(), "version": draft.version},
    )
    return serialize_fact(draft)
