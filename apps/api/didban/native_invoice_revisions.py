"""Explicit adoption of already-approved linked correction journals; no financial writes."""

from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .errors import DomainError, require
from .native_invoice_evidence import _access, _proof, _today
from .native_invoice_models import (
    NativeInvoice,
    NativeInvoiceAllocation,
    NativeInvoiceAllocationReversal,
    NativeInvoiceSourceRevision,
)
from .posting_models import NativeJournal
from .services import check_version, get_entity
from .workflow import audit, serialize_fact


def public_fact(row) -> dict:
    return {
        key: value.replace(tzinfo=timezone.utc).isoformat()
        if isinstance(value, datetime)
        else value.isoformat()
        if isinstance(value, date)
        else value
        for key, value in serialize_fact(row).items()
    }


def selected_source(db: Session, company: str, invoice: NativeInvoice, as_of: date) -> dict:
    row = db.scalar(
        select(NativeInvoiceSourceRevision)
        .where(
            NativeInvoiceSourceRevision.company_id == company,
            NativeInvoiceSourceRevision.invoice_id == invoice.id,
            NativeInvoiceSourceRevision.effective_date <= as_of,
        )
        .order_by(
            NativeInvoiceSourceRevision.effective_date.desc(), NativeInvoiceSourceRevision.version.desc()
        )
    )
    return row.source if row else invoice.source


def history(db: Session, company: str, invoice_id: str, as_of: date) -> list[dict]:
    return [
        public_fact(row)
        for row in db.scalars(
            select(NativeInvoiceSourceRevision)
            .where(
                NativeInvoiceSourceRevision.company_id == company,
                NativeInvoiceSourceRevision.invoice_id == invoice_id,
                NativeInvoiceSourceRevision.effective_date <= as_of,
            )
            .order_by(NativeInvoiceSourceRevision.version)
        )
    ]


def active_allocations(db: Session, company: str, **filters) -> list[NativeInvoiceAllocation]:
    return list(
        db.scalars(
            select(NativeInvoiceAllocation).where(
                NativeInvoiceAllocation.company_id == company,
                *[getattr(NativeInvoiceAllocation, k) == v for k, v in filters.items()],
                ~NativeInvoiceAllocation.id.in_(
                    select(NativeInvoiceAllocationReversal.allocation_id).where(
                        NativeInvoiceAllocationReversal.company_id == company
                    )
                ),
            )
        )
    )


def require_released_receipt(db: Session, company: str, source: dict) -> None:
    require(
        not any(
            row.source["journal_id"] != source["journal_id"]
            for row in active_allocations(db, company, operation_id=source["operation_id"])
        ),
        "native_invoice_release_old_allocations",
        "ابتدا تخصیص‌های سند دریافت/پرداخت قبلی را برگشت دهید.",
        409,
    )


def replacement_candidates(db: Session, company: str, operation_id: str, as_of: date) -> list[dict]:
    items = []
    for journal in db.scalars(
        select(NativeJournal)
        .where(NativeJournal.company_id == company, NativeJournal.replacement_of.is_not(None))
        .order_by(NativeJournal.sequence.desc())
    ):
        try:
            items.append(_proof(db, company, operation_id, as_of, journal.id))
        except DomainError:
            continue
    return items


def candidates(db: Session, company: str, user: m.User, invoice_id: str) -> dict:
    invoice = get_entity(db, NativeInvoice, company, invoice_id)
    _access(db, company, user, invoice.direction, authoring=True)
    adopted = set(
        db.scalars(
            select(NativeInvoiceSourceRevision.journal_id).where(
                NativeInvoiceSourceRevision.company_id == company,
                NativeInvoiceSourceRevision.invoice_id == invoice.id,
            )
        )
    )
    return {
        "items": [
            source
            for source in replacement_candidates(db, company, invoice.operation_id, _today(db, company))
            if source["journal_id"] not in adopted
        ],
        "financial_effect": False,
    }


def adopt(db: Session, company: str, user: m.User, invoice_id: str, data: dict, version: int) -> dict:
    from .native_invoice_service import _lock, detail

    _lock(db, company)
    invoice = get_entity(db, NativeInvoice, company, invoice_id)
    _access(db, company, user, invoice.direction, True)
    check_version(invoice, version)
    today = _today(db, company)
    require(bool(data["reason"].strip()), "reason_required", "دلیل پذیرش منبع جایگزین لازم است.")
    source = _proof(db, company, invoice.operation_id, today, data["journal_id"])
    require(
        bool(source.get("replacement_of"))
        and source["journal_digest"] == data["journal_digest"]
        and source["approved_draft_version"] == data["approved_draft_version"],
        "native_invoice_stale_source",
        "نسخه سند جایگزین با انتخاب شما برابر نیست.",
        409,
    )
    require(
        not active_allocations(db, company, invoice_id=invoice.id),
        "native_invoice_release_old_allocations",
        "ابتدا تمام تخصیص‌های قبلی فاکتور را برگشت دهید.",
        409,
    )
    existing = list(
        db.scalars(
            select(NativeInvoiceSourceRevision).where(
                NativeInvoiceSourceRevision.company_id == company,
                NativeInvoiceSourceRevision.invoice_id == invoice.id,
            )
        )
    )
    require(
        not any(row.journal_id == source["journal_id"] for row in existing),
        "native_invoice_source_adopted",
        "این منبع جایگزین قبلاً پذیرفته شده است.",
        409,
    )
    row = NativeInvoiceSourceRevision(
        company_id=company,
        invoice_id=invoice.id,
        journal_id=source["journal_id"],
        version=len(existing) + 1,
        effective_date=today,
        source=source,
        reason=data["reason"].strip(),
        actor_id=user.id,
    )
    db.add(row)
    invoice.version += 1
    db.flush()
    audit(
        db,
        company,
        user.id,
        "native_invoice.source_replacement_adopted",
        invoice.id,
        {
            "source_revision_id": row.id,
            "source": source,
            "effective_date": today.isoformat(),
            "reason": row.reason,
        },
    )
    return detail(db, company, user, invoice.id)
