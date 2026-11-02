"""Explicit opening evidence, append-only revocation and conservative validity controls."""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .errors import require
from .http import paginate
from .native_reporting_models import NativeAccountRole, NativeOpeningEvidence, NativeZeroOpeningEvidence
from .native_roles_service import NOMINAL_ROLES, ROLE_KEYS
from .period_lock_service import lock_for, require_open_period
from .posting_models import NativeJournal
from .posting_service import _posting_authority
from .security import membership
from .services import get_entity
from .workflow import audit, serialize_fact


def _origin_period_metadata(
    db: Session, company: str, journal: NativeJournal, seen: set[str] | None = None
) -> dict | None:
    declaration = db.scalar(
        select(NativeOpeningEvidence).where(
            NativeOpeningEvidence.company_id == company, NativeOpeningEvidence.journal_id == journal.id
        )
    )
    if declaration:
        return {"kind": "declared_opening", "declaration_id": declaration.id}
    if journal.snapshot.get("period_accounting"):
        return journal.snapshot["period_accounting"]
    chain = seen or set()
    require(journal.id not in chain, "journal_provenance_cycle", "ارتباط اصلاح سند معتبر نیست.", 409)
    origin_id = journal.reversal_of or journal.replacement_of
    if not origin_id:
        return None
    origin = get_entity(db, NativeJournal, company, origin_id)
    return _origin_period_metadata(db, company, origin, chain | {journal.id})


def _journal_balances(journals: list[NativeJournal]) -> dict[tuple[str, str], Decimal]:
    balances = {}
    for journal in journals:
        for line in journal.snapshot["lines"]:
            key = (line["account_id"], line.get("party_id", ""))
            balances[key] = balances.get(key, Decimal(0)) + Decimal(line["debit"]) - Decimal(line["credit"])
    return balances


def _opening_evidence(
    db: Session, company: str, period: m.Period, journals: list[NativeJournal], assignments: dict
) -> dict:
    candidates = []
    active_zero = _active_zero(db, company, period.id)
    if len(active_zero) > 1:
        return {"status": "unavailable", "reason_codes": ["opening_evidence_ambiguous"], "journal_ids": []}
    zero = active_zero[0] if active_zero else None
    for journal in journals:
        if journal.date != period.start or journal.reversal_of:
            continue
        declaration = db.scalar(
            select(NativeOpeningEvidence).where(
                NativeOpeningEvidence.company_id == company, NativeOpeningEvidence.journal_id == journal.id
            )
        )
        metadata = journal.snapshot.get("period_accounting") or {}
        if metadata.get("kind") != "opening" and declaration is None:
            continue
        if any(row.reversal_of == journal.id for row in journals):
            continue
        candidates.append((journal, metadata, declaration))
    if zero and candidates:
        return {"status": "unavailable", "reason_codes": ["opening_evidence_ambiguous"], "journal_ids": []}
    if zero:
        if _prior_history(db, company, period):
            return {
                "status": "unavailable",
                "reason_codes": ["zero_opening_prior_history"],
                "journal_ids": [],
            }
        return {
            "status": "available",
            "reason_codes": [],
            "journal_ids": [],
            "scope": "explicit_declared_zero_opening",
            "declaration_id": zero.id,
        }
    if len(candidates) != 1:
        return {
            "status": "unavailable",
            "reason_codes": ["opening_evidence_missing" if not candidates else "opening_evidence_ambiguous"],
            "journal_ids": [],
        }
    journal, metadata, declaration = candidates[0]
    invalid_roles = sorted(
        {
            line["account_id"]
            for line in journal.snapshot["lines"]
            if not assignments.get(line["account_id"])
            or assignments[line["account_id"]].role not in ROLE_KEYS - NOMINAL_ROLES
        }
    )
    if invalid_roles:
        return {
            "status": "unavailable",
            "reason_codes": ["opening_account_roles_invalid"],
            "journal_ids": [journal.id],
            "invalid_account_ids": invalid_roles,
        }
    if declaration:
        return {
            "status": "available",
            "reason_codes": [],
            "journal_ids": [journal.id],
            "declaration_id": declaration.id,
            "scope": "explicit_declared_opening",
            "account_ids": sorted({line["account_id"] for line in journal.snapshot["lines"]}),
        }
    source_id = metadata.get("source_period_id")
    lock = lock_for(db, company, source_id)
    if not lock or not lock.closed:
        return {
            "status": "unavailable",
            "reason_codes": ["opening_source_not_closed"],
            "journal_ids": [journal.id],
        }
    source_journals = list(
        db.scalars(
            select(NativeJournal)
            .where(NativeJournal.company_id == company, NativeJournal.period_id == source_id)
            .order_by(NativeJournal.sequence)
        )
    )
    source_ids = [row.id for row in source_journals]
    if source_ids != metadata.get("source_journal_ids"):
        return {
            "status": "unavailable",
            "reason_codes": ["opening_source_changed"],
            "journal_ids": [journal.id],
        }
    nonzero = {key[0] for key, value in _journal_balances(source_journals).items() if value}
    selected = set(metadata.get("selection", {}).get("account_ids", []))
    missing = sorted(nonzero - selected)
    nominal = sorted(
        account_id
        for account_id in nonzero
        if assignments.get(account_id) and assignments[account_id].role in NOMINAL_ROLES
    )
    if missing or nominal:
        return {
            "status": "unavailable",
            "reason_codes": ["opening_scope_incomplete" if missing else "nominal_balance_not_closed"],
            "journal_ids": [journal.id],
            "missing_account_ids": missing,
            "nominal_account_ids": nominal,
        }
    return {
        "status": "available",
        "reason_codes": [],
        "journal_ids": [journal.id],
        "source_period_id": source_id,
        "source_journal_ids": source_ids,
        "account_ids": sorted(selected),
    }


def declare_opening(
    db: Session, company: str, user: m.User, journal_id: str, digest: str, reason: str
) -> dict:
    provenance = _posting_authority(db, company, user)
    require(bool(reason.strip()), "opening_reason_required", "دلیل انتخاب مبنای افتتاحیه را بنویسید.")
    journal = get_entity(db, NativeJournal, company, journal_id)
    period = get_entity(db, m.Period, company, journal.period_id)
    require_open_period(db, company, period.id)
    require(journal.digest == digest, "opening_journal_changed", "نسخهٔ سند افتتاحیه یکسان نیست.", 409)
    require(
        journal.date == period.start and not journal.reversal_of,
        "opening_journal_invalid",
        "سند افتتاحیه باید در ابتدای دوره و غیر از سند برگشت باشد.",
        409,
    )
    require(
        not db.scalar(
            select(NativeJournal.id).where(
                NativeJournal.company_id == company, NativeJournal.reversal_of == journal.id
            )
        ),
        "opening_journal_reversed",
        "این سند برگشت شده است.",
        409,
    )
    assignments = {
        row.account_id: row
        for row in db.scalars(select(NativeAccountRole).where(NativeAccountRole.company_id == company))
    }
    require(
        all(
            assignments.get(line["account_id"])
            and assignments[line["account_id"]].role in ROLE_KEYS - NOMINAL_ROLES
            for line in journal.snapshot["lines"]
        ),
        "opening_account_roles_invalid",
        "نقش همهٔ حساب‌های افتتاحیه را به حساب ترازنامه‌ای مشخص کنید.",
        409,
    )
    journals = list(
        db.scalars(
            select(NativeJournal)
            .where(NativeJournal.company_id == company, NativeJournal.period_id == period.id)
            .order_by(NativeJournal.sequence)
        )
    )
    existing = _opening_evidence(db, company, period, journals, assignments)
    require(
        existing["reason_codes"] == ["opening_evidence_missing"],
        "opening_evidence_exists",
        "برای این دوره مبنای افتتاحیه موجود است؛ اصلاح با سند برگشت انجام شود.",
        409,
    )
    item = NativeOpeningEvidence(
        company_id=company,
        journal_id=journal.id,
        period_id=period.id,
        journal_digest=journal.digest,
        reason=reason.strip(),
        actor_id=user.id,
        permission_provenance=provenance,
    )
    db.add(item)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "accounting.opening_declared",
        item.id,
        {
            "journal_id": journal.id,
            "digest": digest,
            "reason": reason.strip(),
            "permission_provenance": provenance,
        },
    )
    return serialize_fact(item)


def _zero_revoked(db: Session, company: str, evidence_id: str) -> bool:
    return (
        db.scalar(
            select(m.AuditEvent.id).where(
                m.AuditEvent.company_id == company,
                m.AuditEvent.action == "accounting.zero_opening_revoked",
                m.AuditEvent.entity_id == evidence_id,
            )
        )
        is not None
    )


def _prior_history(db: Session, company: str, period: m.Period) -> bool:
    return bool(
        db.scalar(select(m.Period.id).where(m.Period.company_id == company, m.Period.start < period.start))
        or db.scalar(
            select(NativeJournal.id).where(
                NativeJournal.company_id == company, NativeJournal.date < period.start
            )
        )
    )


def declare_zero_opening(db: Session, company: str, user: m.User, period_id: str, reason: str) -> dict:
    provenance = _posting_authority(db, company, user)
    require(bool(reason.strip()), "opening_reason_required", "دلیل مبنای صفر را بنویسید.")
    period = get_entity(db, m.Period, company, period_id)
    require_open_period(db, company, period.id)
    require(
        not _prior_history(db, company, period),
        "zero_opening_prior_history",
        "با وجود دوره یا اسناد پیشین، افتتاحیهٔ صفر قابل اظهار نیست.",
        409,
    )
    require(
        not _active_zero(db, company, period.id),
        "zero_opening_exists",
        "اظهار افتتاحیهٔ صفر قبلاً ثبت شده است.",
        409,
    )
    journals = list(
        db.scalars(
            select(NativeJournal)
            .where(NativeJournal.company_id == company, NativeJournal.period_id == period.id)
            .order_by(NativeJournal.sequence)
        )
    )
    assignments = {
        row.account_id: row
        for row in db.scalars(select(NativeAccountRole).where(NativeAccountRole.company_id == company))
    }
    existing = _opening_evidence(db, company, period, journals, assignments)
    require(
        existing["reason_codes"] == ["opening_evidence_missing"],
        "opening_evidence_exists",
        "برای این دوره مبنای افتتاحیه موجود است.",
        409,
    )
    item = NativeZeroOpeningEvidence(
        company_id=company,
        period_id=period.id,
        reason=reason.strip(),
        actor_id=user.id,
        permission_provenance=provenance,
    )
    db.add(item)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "accounting.zero_opening_declared",
        item.id,
        {
            "period_id": period.id,
            "reason": reason.strip(),
            "permission_provenance": provenance,
            "financial_effect": False,
        },
    )
    return serialize_fact(item) | {"revoked": False}


def revoke_zero_opening(db: Session, company: str, user: m.User, evidence_id: str, reason: str) -> dict:
    provenance = _posting_authority(db, company, user)
    require(bool(reason.strip()), "opening_reason_required", "دلیل لغو مبنا را بنویسید.")
    item = get_entity(db, NativeZeroOpeningEvidence, company, evidence_id)
    require_open_period(db, company, item.period_id)
    require(
        not _zero_revoked(db, company, item.id),
        "zero_opening_already_revoked",
        "این مبنا قبلاً لغو شده است.",
        409,
    )
    audit(
        db,
        company,
        user.id,
        "accounting.zero_opening_revoked",
        item.id,
        {"reason": reason.strip(), "permission_provenance": provenance, "financial_effect": False},
    )
    db.flush()
    return serialize_fact(item) | {"revoked": True}


def zero_openings(
    db: Session, company: str, user: m.User, limit: int = 25, cursor: str | None = None
) -> dict:
    membership(db, company, user)
    return paginate(
        db,
        NativeZeroOpeningEvidence,
        company,
        limit,
        cursor,
        transform=lambda row: serialize_fact(row) | {"revoked": _zero_revoked(db, company, row.id)},
    )


def _active_zero(db: Session, company: str, period_id: str) -> list[NativeZeroOpeningEvidence]:
    return [
        row
        for row in db.scalars(
            select(NativeZeroOpeningEvidence).where(
                NativeZeroOpeningEvidence.company_id == company,
                NativeZeroOpeningEvidence.period_id == period_id,
            )
        )
        if not _zero_revoked(db, company, row.id)
    ]
