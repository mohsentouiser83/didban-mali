"""Bounded explicit many-to-many review; no subset or fee guessing."""

import json
from decimal import Decimal, localcontext
from hashlib import sha256

from sqlalchemy import String, cast, or_, select
from sqlalchemy.orm import Session

from . import models as m
from .errors import require
from .finance import ANCHOR_KINDS, NON_FLOW_ENTRIES, text_amount
from .group_match_models import GroupMatchDecision
from .group_match_service import check_group_capacity, latest
from .http import paginate
from .manual_group_models import ManualGroupPreview
from .reconciliation_service import latest_decisions
from .reconciliation_service import options as reconciliation_options
from .security import membership
from .services import get_entity
from .workflow import audit, serialize_fact


def _scope(db: Session, company: str, run_id: str):
    run = get_entity(db, m.ReconciliationRun, company, run_id)
    current = reconciliation_options(db, company)
    require(
        run.manifest_id == current["manifest_id"],
        "stale_manifest",
        "نسخه داده تغییر کرده؛ تطبیق را دوباره اجرا کنید.",
        409,
    )
    newest = db.scalar(
        select(m.ReconciliationRun.id)
        .where(m.ReconciliationRun.company_id == company)
        .order_by(m.ReconciliationRun.created_at.desc(), m.ReconciliationRun.id.desc())
        .limit(1)
    )
    require(newest == run.id, "stale_reconciliation_run", "تطبیق تازه‌تری موجود است؛ صفحه را تازه کنید.", 409)
    return run, get_entity(db, m.ResultManifest, company, run.manifest_id)


def _current(db: Session, company: str, preview: ManualGroupPreview) -> bool:
    newest_manifest = db.scalar(
        select(m.ResultManifest.id)
        .where(m.ResultManifest.company_id == company)
        .order_by(m.ResultManifest.created_at.desc(), m.ResultManifest.id.desc())
        .limit(1)
    )
    newest_run = db.scalar(
        select(m.ReconciliationRun.id)
        .where(m.ReconciliationRun.company_id == company)
        .order_by(m.ReconciliationRun.created_at.desc(), m.ReconciliationRun.id.desc())
        .limit(1)
    )
    return newest_manifest == preview.manifest_id and newest_run == preview.run_id


def _bank(row: m.BankMovement) -> dict:
    return {
        "id": row.id,
        "source_row_id": row.source_row_id,
        "account": row.account,
        "date": row.date.isoformat(),
        "reference": row.reference,
        "party_id": row.party_id,
        "amount": str(row.amount),
    }


def _ledger(row: m.JournalLine) -> dict:
    with localcontext() as context:
        context.prec = 60
        value = text_amount(Decimal(row.debit) - Decimal(row.credit))
    return {
        "id": row.id,
        "source_row_id": row.source_row_id,
        "account": row.account,
        "date": row.date.isoformat(),
        "reference": row.reference,
        "party_id": row.party_id,
        "amount": value,
        "debit": str(row.debit),
        "credit": str(row.credit),
    }


def selection_options(
    db: Session,
    company: str,
    user: m.User,
    run_id: str,
    side: str,
    q: str = "",
    limit: int = 25,
    cursor: str | None = None,
) -> dict:
    membership(db, company, user)
    require(side in ("bank", "ledger"), "manual_group_side", "بانک یا دفتر را انتخاب کنید.")
    require(len(q) <= 100, "query_too_long", "جستجو باید کوتاه‌تر از ۱۰۰ نویسه باشد.")
    run, manifest = _scope(db, company, run_id)
    model = m.BankMovement if side == "bank" else m.JournalLine
    filters = [model.source_row_id.in_(manifest.selection["row_ids"])]
    if side == "bank":
        filters.extend(
            [m.BankMovement.account.in_(run.bank_to_ledger), m.BankMovement.kind.not_in(ANCHOR_KINDS)]
        )
    else:
        filters.extend(
            [
                m.JournalLine.account.in_(run.bank_to_ledger.values()),
                m.JournalLine.entry_type.not_in(NON_FLOW_ENTRIES),
            ]
        )
        filters.append(
            or_(m.JournalLine.role == "bank", m.JournalLine.role.startswith("bank_", autoescape=True))
        )
    if q:
        filters.append(
            or_(
                model.account.contains(q, autoescape=True),
                model.reference.contains(q, autoescape=True),
                model.party_id.contains(q, autoescape=True),
                cast(model.date, String).contains(q, autoescape=True),
            )
        )
    return paginate(
        db, model, company, limit, cursor, filters, transform=_bank if side == "bank" else _ledger
    )


def _candidate(db: Session, company: str, run, manifest, bank_ids: list[str], ledger_ids: list[str]) -> dict:
    require(
        1 <= len(bank_ids) <= 100
        and 1 <= len(ledger_ids) <= 100
        and (len(bank_ids) > 1 or len(ledger_ids) > 1),
        "manual_group_size",
        "حداقل یک طرف گروه باید بیش از یک ردیف داشته باشد.",
    )
    require(
        len(bank_ids) == len(set(bank_ids)) and len(ledger_ids) == len(set(ledger_ids)),
        "manual_group_duplicate",
        "ردیف تکراری انتخاب نکنید.",
    )
    banks = [get_entity(db, m.BankMovement, company, identifier) for identifier in sorted(bank_ids)]
    ledgers = [get_entity(db, m.JournalLine, company, identifier) for identifier in sorted(ledger_ids)]
    rows = set(manifest.selection["row_ids"])
    require(
        all(row.source_row_id in rows for row in [*banks, *ledgers]),
        "inactive_record",
        "ردیف در نسخهٔ جاری نیست.",
        409,
    )
    require(
        all(row.kind not in ANCHOR_KINDS for row in banks)
        and all(row.entry_type not in NON_FLOW_ENTRIES for row in ledgers),
        "manual_group_anchor",
        "مانده مبنا و اسناد انتقالی شاهد تطبیق گردش نیستند.",
    )
    accounts = {row.account for row in banks}
    require(len(accounts) == 1, "reconciliation_account", "گردش‌های یک حساب بانک را انتخاب کنید.")
    bank_account = banks[0].account
    ledger_account = run.bank_to_ledger.get(bank_account)
    require(
        ledger_account and all(row.account == ledger_account for row in ledgers),
        "reconciliation_account",
        "حساب دفتر باید مطابق نگاشت همین تطبیق باشد.",
        409,
    )
    require(
        all(row.role == "bank" or row.role.startswith("bank_") for row in ledgers),
        "reconciliation_account",
        "فقط ردیف حساب بانکی دفتر قابل انتخاب است.",
        409,
    )
    from .reconciliation_selection import summarize_selection

    return summarize_selection(
        [_bank(row) for row in banks], [_ledger(row) for row in ledgers], bank_account, ledger_account
    ) | {
        "run_id": run.id,
        "manifest_id": manifest.id,
        "bank_to_ledger": dict(run.bank_to_ledger),
    }


def public(db: Session, company: str, user: m.User, preview: ManualGroupPreview) -> dict:
    membership(db, company, user)
    decision = latest(db, company).get(preview.candidate_key)
    return serialize_fact(preview) | {
        "version": decision.version + 1 if decision else 1,
        "status": decision.decision if decision else "needs_review",
        "current": _current(db, company, preview),
        "reason": decision.reason if decision else None,
    }


def read(db: Session, company: str, user: m.User, identifier: str) -> dict:
    return public(db, company, user, get_entity(db, ManualGroupPreview, company, identifier))


def create_preview(db: Session, company: str, user: m.User, data: dict) -> dict:
    membership(db, company, user, "write")
    run, manifest = _scope(db, company, data["run_id"])
    snapshot = _candidate(db, company, run, manifest, data["bank_ids"], data["ledger_ids"])
    digest = sha256(json.dumps(snapshot, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    preview = ManualGroupPreview(
        company_id=company,
        run_id=run.id,
        manifest_id=manifest.id,
        candidate_key=snapshot["id"],
        actor_id=user.id,
        snapshot=snapshot,
        digest=digest,
    )
    db.add(preview)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "reconciliation.manual_preview_created",
        preview.id,
        {
            "digest": digest,
            "run_id": run.id,
            "bank_ids": snapshot["bank_ids"],
            "ledger_ids": snapshot["ledger_ids"],
        },
    )
    return public(db, company, user, preview)


def decide(db: Session, company: str, user: m.User, identifier: str, data: dict) -> dict:
    membership(db, company, user, "write")
    preview = get_entity(db, ManualGroupPreview, company, identifier)
    require(data["decision"] in ("accepted", "rejected"), "manual_group_decision", "تصمیم معتبر نیست.")
    require(
        data["expected_digest"] == preview.digest,
        "manual_group_preview_changed",
        "نسخهٔ پیش‌نمایش یکسان نیست.",
        409,
    )
    require(bool(data["reason"].strip()), "reason_required", "دلیل بررسی را بنویسید.")
    previous = latest(db, company).get(preview.candidate_key)
    version = previous.version + 1 if previous else 1
    require(
        data["expected_version"] == version,
        "version_conflict",
        "تصمیم گروه تغییر کرده؛ پیش‌نمایش را بازخوانی کنید.",
        409,
    )
    if data["decision"] == "accepted":
        run, manifest = _scope(db, company, preview.run_id)
        current = _candidate(
            db, company, run, manifest, preview.snapshot["bank_ids"], preview.snapshot["ledger_ids"]
        )
        actual = sha256(json.dumps(current, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        require(
            actual == preview.digest, "manual_group_preview_changed", "شواهد پیش‌نمایش تغییر کرده است.", 409
        )
        require(
            current["can_accept"], "group_mismatch", "جمع دو طرف برابر نیست؛ اختلاف کارمزد فرض نمی‌شود.", 409
        )
        check_group_capacity(db, company, current["bank_ids"], current["ledger_ids"], preview.candidate_key)
        for old in latest_decisions(db, company).values():
            if old.decision == "accepted":
                require(
                    old.bank_id not in current["bank_ids"]
                    and not set(old.ledger_ids) & set(current["ledger_ids"]),
                    "reconciliation_capacity",
                    "ردیف در تطبیق دیگری استفاده شده؛ ابتدا آن تصمیم را برگردانید.",
                    409,
                )
    decision = GroupMatchDecision(
        company_id=company,
        candidate_key=preview.candidate_key,
        version=version,
        manifest_id=preview.manifest_id,
        decision=data["decision"],
        bank_ids=preview.snapshot["bank_ids"],
        ledger_ids=preview.snapshot["ledger_ids"],
        snapshot=preview.snapshot | {"manual_preview_id": preview.id, "preview_digest": preview.digest},
        actor_id=user.id,
        reason=data["reason"].strip(),
    )
    db.add(decision)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "reconciliation.manual_group_decided",
        decision.id,
        {
            "preview_id": preview.id,
            "digest": preview.digest,
            "decision": decision.decision,
            "version": version,
        },
    )
    return public(db, company, user, preview)
