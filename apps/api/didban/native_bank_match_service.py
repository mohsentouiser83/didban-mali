"""Native book and imported bank remain explicit, separately pinned sources."""

import json
from datetime import date
from decimal import localcontext
from hashlib import sha256

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .errors import require
from .finance import ANCHOR_KINDS, NON_FLOW_ENTRIES, text_amount
from .group_match_models import GroupMatchDecision
from .group_match_service import check_group_capacity, latest
from .http import paginate
from .manual_group_service import _bank
from .native_bank_match_models import NativeBankMatchPreview as Preview
from .native_ledger_source import statement_source
from .native_reporting_models import NativeStatementRun
from .native_reporting_service import build_statement
from .reconciliation_selection import summarize_selection
from .reconciliation_service import latest_decisions
from .security import membership
from .services import get_entity
from .workflow import audit, serialize_fact


def _digest(snapshot: dict) -> str:
    return sha256(json.dumps(snapshot, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def _bank_manifest(db: Session, company: str):
    return db.scalar(
        select(m.ResultManifest)
        .where(m.ResultManifest.company_id == company)
        .order_by(m.ResultManifest.created_at.desc(), m.ResultManifest.id.desc())
        .limit(1)
    )


def _statement_current(db: Session, company: str, user: m.User, run: NativeStatementRun) -> bool:
    current = build_statement(
        db, company, user, run.snapshot["period"]["id"], date.fromisoformat(run.snapshot["as_of"])
    )
    digest = sha256(
        json.dumps(current, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return digest == run.digest


def _statement(db: Session, company: str, user: m.User, identifier: str):
    run = get_entity(db, NativeStatementRun, company, identifier)
    require(
        _statement_current(db, company, user, run),
        "stale_native_statement",
        "دفتر یا نقش حساب‌ها تغییر کرده؛ نسخهٔ ثابت تازه بسازید.",
        409,
    )
    return run, statement_source(db, company, run.id)


def _ledger(row) -> dict:
    with localcontext() as context:
        context.prec = 60
        value = text_amount(row.debit - row.credit)
    return {
        "id": row.id,
        "source_row_id": row.source_row_id,
        "journal_id": row.journal_id,
        "line_index": row.line_index,
        "account": row.account,
        "date": row.date.isoformat(),
        "reference": row.reference,
        "party_id": row.party_id,
        "amount": value,
        "debit": text_amount(row.debit),
        "credit": text_amount(row.credit),
    }


def sources(db: Session, company: str, user: m.User, native_statement_id: str | None = None) -> dict:
    membership(db, company, user)
    manifest = _bank_manifest(db, company)
    bank_accounts = []
    if manifest:
        bank_accounts = sorted(
            set(
                db.scalars(
                    select(m.BankMovement.account).where(
                        m.BankMovement.company_id == company,
                        m.BankMovement.source_row_id.in_(manifest.selection.get("row_ids", [])),
                        m.BankMovement.kind.not_in(ANCHOR_KINDS),
                    )
                )
            )
        )
    ledger_accounts = []
    if native_statement_id:
        _run, source = _statement(db, company, user, native_statement_id)
        ledger_accounts = sorted(
            {
                row.account
                for row in source["rows"]
                if row.role == "bank" and row.entry_type not in NON_FLOW_ENTRIES
            }
        )
    return {
        "bank_manifest_id": manifest.id if manifest else None,
        "bank_accounts": bank_accounts,
        "ledger_accounts": ledger_accounts,
        "ledger_basis": "native_book",
        "bank_basis": "imported_bank",
        "financial_effect": False,
    }


def selection_options(
    db: Session,
    company: str,
    user: m.User,
    statement_id: str,
    side: str,
    account: str = "",
    q: str = "",
    page: int = 0,
) -> dict:
    membership(db, company, user)
    require(
        side in ("bank", "ledger") and 0 <= page <= 100000 and len(q) <= 100 and len(account) <= 100,
        "native_bank_query",
        "جستجو یا صفحه معتبر نیست.",
    )
    _run, source = _statement(db, company, user, statement_id)
    if side == "bank":
        manifest = _bank_manifest(db, company)
        require(manifest is not None, "bank_source_missing", "ابتدا گردش بانک را وارد کنید.", 404)
        rows = db.scalars(
            select(m.BankMovement).where(
                m.BankMovement.company_id == company,
                m.BankMovement.source_row_id.in_(manifest.selection.get("row_ids", [])),
                m.BankMovement.kind.not_in(ANCHOR_KINDS),
            )
        )
        values = [_bank(row) for row in rows]
    else:
        values = [
            _ledger(row)
            for row in source["rows"]
            if row.role == "bank" and row.entry_type not in NON_FLOW_ENTRIES
        ]
    if account:
        values = [row for row in values if row["account"] == account]
    if q:
        query = q.casefold()
        values = [
            row
            for row in values
            if query
            in " ".join(
                str(row.get(key) or "") for key in ("account", "reference", "party_id", "date")
            ).casefold()
        ]
    values.sort(key=lambda row: (row["date"], row["id"]), reverse=True)
    return {"items": values[page * 25 : (page + 1) * 25], "total": len(values), "page": page, "page_size": 25}


def _candidate(db: Session, company: str, user: m.User, data: dict) -> dict:
    manifest = _bank_manifest(db, company)
    require(
        manifest is not None and manifest.id == data["bank_manifest_id"],
        "stale_manifest",
        "نسخهٔ گردش بانک تغییر کرده؛ انتخاب‌ها را بازخوانی کنید.",
        409,
    )
    run, source = _statement(db, company, user, data["native_statement_id"])
    bank_ids = data["bank_ids"]
    ledger_ids = data["ledger_ids"]
    require(
        1 <= len(bank_ids) <= 100
        and 1 <= len(ledger_ids) <= 100
        and len(set(bank_ids)) == len(bank_ids)
        and len(set(ledger_ids)) == len(ledger_ids),
        "native_bank_selection",
        "ردیف‌های متفاوت بانک و دفتر را انتخاب کنید.",
    )
    banks = [get_entity(db, m.BankMovement, company, identifier) for identifier in sorted(bank_ids)]
    allowed = set(manifest.selection.get("row_ids", []))
    require(
        all(row.source_row_id in allowed and row.kind not in ANCHOR_KINDS for row in banks),
        "inactive_record",
        "گردش بانک در نسخهٔ جاری نیست یا مانده مبناست.",
        409,
    )
    native = {
        row.id: row for row in source["rows"] if row.role == "bank" and row.entry_type not in NON_FLOW_ENTRIES
    }
    require(
        all(identifier in native for identifier in ledger_ids),
        "native_bank_line",
        "ردیف بانکی دفتر باید متعلق به همین نسخهٔ ثابت باشد.",
        409,
    )
    summary = summarize_selection(
        [_bank(row) for row in banks],
        [_ledger(native[identifier]) for identifier in sorted(ledger_ids)],
        data["bank_account"],
        data["ledger_account"],
        namespace="native_book",
        allow_one_to_one=True,
    )
    return summary | {
        "basis": "native_book",
        "bank_basis": "imported_bank",
        "bank_manifest_id": manifest.id,
        "native_statement_id": run.id,
        "native_statement_digest": run.digest,
        "statement_period": source["period"],
        "statement_as_of": source["snapshot"]["as_of"],
        "bank_to_ledger": {data["bank_account"]: data["ledger_account"]},
    }


def public(db: Session, company: str, user: m.User, preview: Preview) -> dict:
    membership(db, company, user)
    previous = latest(db, company).get(preview.candidate_key)
    manifest = _bank_manifest(db, company)
    run = get_entity(db, NativeStatementRun, company, preview.native_statement_id)
    return serialize_fact(preview) | {
        "version": previous.version + 1 if previous else 1,
        "status": previous.decision if previous else "needs_review",
        "reason": previous.reason if previous else None,
        "current": bool(
            manifest
            and manifest.id == preview.bank_manifest_id
            and _statement_current(db, company, user, run)
        ),
    }


def read(db: Session, company: str, user: m.User, identifier: str) -> dict:
    return public(db, company, user, get_entity(db, Preview, company, identifier))


def create_preview(db: Session, company: str, user: m.User, data: dict) -> dict:
    membership(db, company, user, "write")
    snapshot = _candidate(db, company, user, data)
    item = Preview(
        company_id=company,
        bank_manifest_id=snapshot["bank_manifest_id"],
        native_statement_id=snapshot["native_statement_id"],
        candidate_key=snapshot["id"],
        actor_id=user.id,
        snapshot=snapshot,
        digest=_digest(snapshot),
    )
    db.add(item)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "reconciliation.native_bank_preview_created",
        item.id,
        {
            "digest": item.digest,
            "bank_manifest_id": item.bank_manifest_id,
            "native_statement_id": item.native_statement_id,
            "financial_effect": False,
        },
    )
    return public(db, company, user, item)


def decide(db: Session, company: str, user: m.User, identifier: str, data: dict) -> dict:
    membership(db, company, user, "write")
    item = get_entity(db, Preview, company, identifier)
    require(
        data["decision"] in ("accepted", "rejected") and bool(data["reason"].strip()),
        "native_bank_decision",
        "تصمیم و دلیل بررسی لازم است.",
    )
    require(
        data["expected_digest"] == item.digest,
        "manual_group_preview_changed",
        "نسخهٔ پیش‌نمایش یکسان نیست.",
        409,
    )
    previous = latest(db, company).get(item.candidate_key)
    version = previous.version + 1 if previous else 1
    require(
        version == data["expected_version"],
        "version_conflict",
        "تصمیم تغییر کرده؛ پیش‌نمایش را بازخوانی کنید.",
        409,
    )
    if data["decision"] == "accepted":
        current = _candidate(
            db,
            company,
            user,
            {
                key: item.snapshot[key]
                for key in (
                    "bank_manifest_id",
                    "native_statement_id",
                    "bank_account",
                    "ledger_account",
                    "bank_ids",
                    "ledger_ids",
                )
            },
        )
        require(
            _digest(current) == item.digest,
            "manual_group_preview_changed",
            "شواهد پیش‌نمایش تغییر کرده است.",
            409,
        )
        require(
            current["can_accept"], "group_mismatch", "مبلغ دو طرف برابر نیست؛ کارمزد حدس زده نمی‌شود.", 409
        )
        check_group_capacity(db, company, current["bank_ids"], current["ledger_ids"], item.candidate_key)
        for old in latest_decisions(db, company).values():
            if old.decision == "accepted":
                require(
                    old.bank_id not in current["bank_ids"],
                    "reconciliation_capacity",
                    "گردش بانک در تطبیق دیگری پذیرفته شده است.",
                    409,
                )
    row = GroupMatchDecision(
        company_id=company,
        candidate_key=item.candidate_key,
        version=version,
        manifest_id=item.bank_manifest_id,
        decision=data["decision"],
        bank_ids=item.snapshot["bank_ids"],
        ledger_ids=item.snapshot["ledger_ids"],
        snapshot=item.snapshot | {"native_preview_id": item.id, "preview_digest": item.digest},
        actor_id=user.id,
        reason=data["reason"].strip(),
    )
    db.add(row)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "reconciliation.native_bank_decided",
        row.id,
        {
            "preview_id": item.id,
            "digest": item.digest,
            "decision": row.decision,
            "version": version,
            "financial_effect": False,
        },
    )
    return public(db, company, user, item)


def history(db: Session, company: str, user: m.User, limit: int = 25, cursor: str | None = None) -> dict:
    membership(db, company, user)
    return paginate(db, Preview, company, limit, cursor, transform=lambda row: public(db, company, user, row))
