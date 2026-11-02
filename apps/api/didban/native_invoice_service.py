"""Explicit operational invoice terms and allocations; never creates journal effects."""

import json
from datetime import date, timezone
from decimal import Decimal, localcontext
from hashlib import sha256

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from . import models as m
from .errors import DomainError, require
from .module_service import require_module
from .money_type import aggregate_money, canonical_money
from .native_invoice_evidence import KINDS, _access, _proof, _today
from .native_invoice_models import (
    NativeInvoice,
    NativeInvoiceAllocation,
    NativeInvoiceAllocationReversal,
    NativeInvoiceSnapshot,
    NativeInvoiceTerms,
)
from .native_invoice_revisions import (
    history as source_history,
)
from .native_invoice_revisions import (
    public_fact,
    replacement_candidates,
    require_released_receipt,
    selected_source,
)
from .native_invoice_schemas import InvoiceInput, TermsUpdate
from .operation_models import OperationDraft
from .services import check_version, get_entity
from .workflow import audit, serialize_fact


def _lock(db: Session, company: str) -> None:
    # Serialize shared receipt capacity across invoices, including different heads.
    if db.get_bind().dialect.name == "sqlite":
        db.execute(update(m.Company).where(m.Company.id == company).values(version=m.Company.version))
    else:
        db.scalar(select(m.Company).where(m.Company.id == company).with_for_update())


def _source_current(db: Session, company: str, source: dict, as_of: date) -> dict:
    checked = _proof(db, company, source["operation_id"], as_of, source["journal_id"])
    require(
        checked == {key: value for key, value in source.items() if key != "allocation_effective_date"},
        "native_invoice_source_changed",
        "شواهد سند مرجع تغییر کرده است.",
        409,
    )
    return checked


def _terms(row: NativeInvoiceTerms) -> dict:
    return {
        "id": row.id,
        "version": row.version,
        "effective_date": row.effective_date.isoformat(),
        **row.payload,
        "reason": row.reason,
        "actor_id": row.actor_id,
        "created_at": row.created_at.replace(tzinfo=timezone.utc).isoformat(),
    }


def _rows(db, model, company, **filters):
    return list(
        db.scalars(
            select(model)
            .where(model.company_id == company, *[getattr(model, k) == v for k, v in filters.items()])
            .order_by(model.created_at, model.id)
        )
    )


def _terms_for(db: Session, company: str, invoice_id: str, as_of: date) -> NativeInvoiceTerms | None:
    return db.scalar(
        select(NativeInvoiceTerms)
        .where(
            NativeInvoiceTerms.company_id == company,
            NativeInvoiceTerms.invoice_id == invoice_id,
            NativeInvoiceTerms.effective_date <= as_of,
        )
        .order_by(NativeInvoiceTerms.effective_date.desc(), NativeInvoiceTerms.version.desc())
    )


def detail(db: Session, company: str, user: m.User, invoice_id: str, as_of: date | None = None) -> dict:
    as_of = as_of or _today(db, company)
    require(as_of <= _today(db, company), "native_invoice_future_asof", "تاریخ گزارش در آینده است.")
    invoice = get_entity(db, NativeInvoice, company, invoice_id)
    _access(db, company, user, invoice.direction)
    source = selected_source(db, company, invoice, as_of)
    reason = None
    try:
        _source_current(db, company, source, as_of)
    except DomainError as error:
        reason = error.code
    terms = _terms_for(db, company, invoice.id, as_of)
    if terms is None:
        reason = reason or "native_invoice_terms_missing"
    allocations = []
    used = Decimal(0)
    with localcontext() as ctx:
        ctx.prec = 60
        for row in _rows(db, NativeInvoiceAllocation, company, invoice_id=invoice.id):
            if (
                row.date > as_of
                or row.source.get("allocation_effective_date", row.date.isoformat()) > as_of.isoformat()
            ):
                continue
            reversal = db.scalar(
                select(NativeInvoiceAllocationReversal).where(
                    NativeInvoiceAllocationReversal.company_id == company,
                    NativeInvoiceAllocationReversal.allocation_id == row.id,
                    NativeInvoiceAllocationReversal.date <= as_of,
                )
            )
            error_code = None
            try:
                _source_current(db, company, row.source, as_of)
            except DomainError as error:
                error_code = error.code
            if not reversal:
                if error_code:
                    reason = reason or "native_invoice_allocation_source_invalid"
                else:
                    used += Decimal(row.amount)
            allocations.append(
                {
                    "id": row.id,
                    **row.source,
                    "amount": row.amount,
                    "date": row.date.isoformat(),
                    "reversed": bool(reversal),
                    "reversal": public_fact(reversal) if reversal else None,
                    "status": "unavailable" if error_code else "available",
                    "reason": error_code,
                }
            )
        remaining = aggregate_money(Decimal(source["amount"]) - used) if not reason else None
    return {
        "id": invoice.id,
        "version": invoice.version,
        "basis": "native_invoice",
        "direction": invoice.direction,
        "reference": source["reference"],
        "party_id": source["party_id"],
        "date": invoice.source["date"],
        "amount": source["amount"],
        "unit": "IRR",
        "original_unit": source["unit"],
        "remaining": remaining,
        "status": "unavailable" if reason else "available",
        "reason": reason,
        "source": source,
        "original_source": invoice.source,
        "source_history": source_history(db, company, invoice.id, as_of),
        "terms": _terms(terms) if terms else None,
        "terms_history": [
            _terms(t)
            for t in _rows(db, NativeInvoiceTerms, company, invoice_id=invoice.id)
            if t.effective_date <= as_of
        ],
        "allocations": allocations,
        "as_of": as_of.isoformat(),
        "financial_effect": False,
    }


def current(db: Session, company: str, user: m.User, as_of: date, direction: str | None = None) -> dict:
    _access(db, company, user, direction)
    require(as_of <= _today(db, company), "native_invoice_future_asof", "تاریخ گزارش در آینده است.")
    items = []
    for invoice in _rows(db, NativeInvoice, company):
        if (direction is None or invoice.direction == direction) and date.fromisoformat(
            invoice.source["date"]
        ) <= as_of:
            items.append(detail(db, company, user, invoice.id, as_of))
    return {
        "basis": "native_invoice",
        "as_of": as_of.isoformat(),
        "direction": direction,
        "items": items,
        "financial_effect": False,
        "includes_imported_invoices": False,
    }


def _capacity(db: Session, company: str, source: dict) -> str:
    require_released_receipt(db, company, source)
    amount = Decimal(source["amount"])
    with localcontext() as ctx:
        ctx.prec = 60
        for row in _rows(db, NativeInvoiceAllocation, company, operation_id=source["operation_id"]):
            if not db.scalar(
                select(NativeInvoiceAllocationReversal.id).where(
                    NativeInvoiceAllocationReversal.company_id == company,
                    NativeInvoiceAllocationReversal.allocation_id == row.id,
                )
            ):
                amount -= Decimal(row.amount)
    return canonical_money(amount)


def candidates(db: Session, company: str, user: m.User, kind: str) -> dict:
    require(kind in KINDS, "native_invoice_kind", "نوع عملیات معتبر نیست.")
    _access(db, company, user, "sale" if kind in ("sale_service", "receipt") else "purchase", authoring=True)
    if kind in ("receipt", "payment"):
        require_module(db, company, "settlements", ready=False)
    items = []
    for op in db.scalars(
        select(OperationDraft)
        .where(OperationDraft.company_id == company, OperationDraft.kind == kind)
        .order_by(OperationDraft.created_at.desc())
    ):
        if kind.endswith("_service") and db.scalar(
            select(NativeInvoice.id).where(
                NativeInvoice.company_id == company, NativeInvoice.operation_id == op.id
            )
        ):
            continue
        proofs = (
            replacement_candidates(db, company, op.id, _today(db, company))
            if kind in ("receipt", "payment")
            else []
        )
        try:
            proofs.insert(0, _proof(db, company, op.id, _today(db, company)))
        except DomainError:
            pass
        for proof in proofs:
            try:
                items.append(
                    proof
                    | {
                        "remaining_capacity": _capacity(db, company, proof)
                        if kind in ("receipt", "payment")
                        else proof["amount"]
                    }
                )
            except DomainError:
                continue

    return {"items": items, "basis": "native_invoice"}


def _validate_dates(source: dict, data: dict, effective: date) -> None:
    start = date.fromisoformat(source["date"])
    require(effective >= start, "native_invoice_terms_date", "تاریخ اعمال پیش از صدور فاکتور است.")
    for key in ("due_date", "expected_date"):
        value = data[key]
        require(
            value is None or value >= start,
            "native_invoice_terms_date",
            "تاریخ سررسید یا انتظار پیش از صدور است.",
        )


def _append_terms(db, company, user, invoice, data, effective, reason):
    _validate_dates(invoice.source, data, effective)
    previous = _rows(db, NativeInvoiceTerms, company, invoice_id=invoice.id)
    require(
        not previous or effective >= max(t.effective_date for t in previous),
        "native_invoice_terms_backdated",
        "تاریخ اعمال از آخرین تغییر عقب‌تر است.",
        409,
    )
    payload = {
        k: (data[k].isoformat() if isinstance(data[k], date) else data[k])
        for k in ("due_date", "due_unknown", "expected_date", "expected_unknown")
    }
    row = NativeInvoiceTerms(
        company_id=company,
        invoice_id=invoice.id,
        version=len(previous) + 1,
        effective_date=effective,
        payload=payload,
        reason=reason,
        actor_id=user.id,
    )
    db.add(row)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "native_invoice.terms_recorded",
        invoice.id,
        {"terms_id": row.id, "version": row.version, "reason": reason},
    )


def create(db: Session, company: str, user: m.User, data: dict) -> dict:
    data = InvoiceInput.model_validate(data).model_dump()
    _lock(db, company)
    proof = _proof(db, company, data["operation_id"], _today(db, company))
    require(
        proof["kind"] in ("sale_service", "purchase_service"),
        "native_invoice_kind",
        "فاکتور فقط از عملیات خدمات ساخته می‌شود.",
    )
    direction = "sale" if proof["kind"] == "sale_service" else "purchase"
    _access(db, company, user, direction, True)
    require(
        proof["journal_digest"] == data["journal_digest"],
        "native_invoice_stale_source",
        "نسخه سند مرجع تغییر کرده است.",
        409,
    )
    require(
        proof["reference"] == data["reference"],
        "native_invoice_reference",
        "شماره فاکتور باید با مرجع عملیات برابر باشد.",
    )
    require(
        not db.scalar(
            select(NativeInvoice.id).where(
                NativeInvoice.company_id == company, NativeInvoice.operation_id == proof["operation_id"]
            )
        ),
        "native_invoice_exists",
        "فاکتور این عملیات قبلاً ایجاد شده است.",
        409,
    )
    invoice = NativeInvoice(
        company_id=company,
        operation_id=proof["operation_id"],
        direction=direction,
        source=proof,
        actor_id=user.id,
    )
    db.add(invoice)
    db.flush()
    _append_terms(db, company, user, invoice, data, date.fromisoformat(proof["date"]), "ایجاد شرایط فاکتور")
    return detail(db, company, user, invoice.id)


def update_terms(db: Session, company: str, user: m.User, invoice_id: str, data: dict, version: int) -> dict:
    data = TermsUpdate.model_validate(data).model_dump()
    _lock(db, company)
    invoice = get_entity(db, NativeInvoice, company, invoice_id)
    _access(db, company, user, invoice.direction, True)
    check_version(invoice, version)
    _source_current(
        db, company, selected_source(db, company, invoice, _today(db, company)), _today(db, company)
    )
    require(
        data["effective_date"] <= _today(db, company) and bool(data["reason"].strip()),
        "native_invoice_terms_date",
        "تاریخ اعمال یا دلیل معتبر نیست.",
    )
    _append_terms(db, company, user, invoice, data, data["effective_date"], data["reason"].strip())
    invoice.version += 1
    db.flush()
    return detail(db, company, user, invoice.id)


def allocate(db: Session, company: str, user: m.User, invoice_id: str, data: dict, version: int) -> dict:
    _lock(db, company)
    invoice = get_entity(db, NativeInvoice, company, invoice_id)
    _access(db, company, user, invoice.direction, True)
    require_module(db, company, "settlements", ready=False)
    check_version(invoice, version)
    status = detail(db, company, user, invoice.id)
    require(
        status["status"] == "available",
        "native_invoice_unavailable",
        "شواهد فاکتور یا تخصیص معتبر نیست.",
        409,
    )
    source = _proof(db, company, data["operation_id"], _today(db, company), data.get("journal_id"))
    require(
        source["kind"] == ("receipt" if invoice.direction == "sale" else "payment")
        and source["party_id"] == status["party_id"],
        "native_invoice_allocation_party",
        "نوع دریافت/پرداخت یا طرف حساب یکسان نیست.",
    )
    require(
        source["journal_digest"] == data["journal_digest"],
        "native_invoice_stale_source",
        "نسخه سند دریافت/پرداخت تغییر کرده است.",
        409,
    )
    require(
        source["date"] >= status["date"],
        "native_invoice_allocation_date",
        "تاریخ دریافت/پرداخت پیش از صدور فاکتور است.",
    )
    try:
        amount = canonical_money(data["amount"])
    except ValueError as error:
        raise DomainError("invalid_amount", "مبلغ دقیق معتبر نیست.") from error
    require(
        Decimal(amount) > 0
        and Decimal(amount) <= Decimal(status["remaining"])
        and Decimal(amount) <= Decimal(_capacity(db, company, source)),
        "native_invoice_capacity",
        "مبلغ از مانده فاکتور یا ظرفیت دریافت/پرداخت بیشتر است.",
        409,
    )
    require(
        not db.scalar(
            select(NativeInvoiceAllocation.id).where(
                NativeInvoiceAllocation.company_id == company,
                NativeInvoiceAllocation.invoice_id == invoice.id,
                NativeInvoiceAllocation.operation_id == source["operation_id"],
                ~NativeInvoiceAllocation.id.in_(
                    select(NativeInvoiceAllocationReversal.allocation_id).where(
                        NativeInvoiceAllocationReversal.company_id == company
                    )
                ),
            )
        ),
        "native_invoice_allocation_exists",
        "این دریافت/پرداخت قبلاً به فاکتور تخصیص یافته است.",
        409,
    )
    # Reusing a corrected/released receipt must not overlap its old historical
    # allocation before the explicit reversal made today.
    previous_reversals = db.scalar(
        select(NativeInvoiceAllocationReversal.id).where(
            NativeInvoiceAllocationReversal.company_id == company,
            NativeInvoiceAllocationReversal.allocation_id.in_(
                select(NativeInvoiceAllocation.id).where(
                    NativeInvoiceAllocation.company_id == company,
                    NativeInvoiceAllocation.operation_id == source["operation_id"],
                )
            ),
        )
    )
    effective = source["date"]
    if status["source_history"]:
        effective = max(effective, status["source_history"][-1]["effective_date"])
    if previous_reversals or source.get("replacement_of"):
        effective = max(effective, _today(db, company).isoformat())
    if effective > source["date"]:
        source = source | {"allocation_effective_date": effective}
    row = NativeInvoiceAllocation(
        company_id=company,
        invoice_id=invoice.id,
        operation_id=source["operation_id"],
        amount=amount,
        date=date.fromisoformat(source["date"]),
        source=source,
        actor_id=user.id,
    )
    db.add(row)
    invoice.version += 1
    db.flush()
    audit(
        db,
        company,
        user.id,
        "native_invoice.allocated",
        row.id,
        {"invoice_id": invoice.id, "amount": amount, "source": source},
    )
    return detail(db, company, user, invoice.id)


def reverse_allocation(
    db: Session, company: str, user: m.User, invoice_id: str, allocation_id: str, reason: str, version: int
) -> dict:
    _lock(db, company)
    invoice = get_entity(db, NativeInvoice, company, invoice_id)
    _access(db, company, user, invoice.direction, True)
    require_module(db, company, "settlements", ready=False)
    check_version(invoice, version)
    row = get_entity(db, NativeInvoiceAllocation, company, allocation_id)
    require(row.invoice_id == invoice.id, "not_found", "تخصیص پیدا نشد.", 404)
    require(bool(reason.strip()), "reason_required", "دلیل برگشت لازم است.")
    require(
        not db.scalar(
            select(NativeInvoiceAllocationReversal.id).where(
                NativeInvoiceAllocationReversal.company_id == company,
                NativeInvoiceAllocationReversal.allocation_id == row.id,
            )
        ),
        "native_invoice_allocation_reversed",
        "تخصیص قبلاً برگشت شده است.",
        409,
    )
    reverse = NativeInvoiceAllocationReversal(
        company_id=company,
        allocation_id=row.id,
        date=_today(db, company),
        reason=reason.strip(),
        actor_id=user.id,
    )
    db.add(reverse)
    invoice.version += 1
    db.flush()
    audit(
        db,
        company,
        user.id,
        "native_invoice.allocation_reversed",
        row.id,
        {"reason": reason.strip(), "reversal_id": reverse.id},
    )
    return detail(db, company, user, invoice.id)


def receipt_history(db: Session, company: str, user: m.User, party_id: str, as_of: date) -> list[dict]:
    result = []
    for invoice in current(db, company, user, as_of, "sale")["items"]:
        if invoice["party_id"] != party_id or invoice["status"] != "available":
            continue
        for allocation in invoice["allocations"]:
            if allocation["reversed"] or allocation["status"] != "available":
                continue
            paid_date = date.fromisoformat(allocation["date"])
            head = get_entity(db, NativeInvoice, company, invoice["id"])
            historical_source = selected_source(db, company, head, paid_date)
            raw_allocation = get_entity(db, NativeInvoiceAllocation, company, allocation["id"])
            if historical_source["party_id"] != party_id:
                continue
            try:
                _source_current(db, company, historical_source, paid_date)
                _source_current(db, company, raw_allocation.source, paid_date)
            except DomainError:
                continue
            terms = _terms_for(db, company, invoice["id"], paid_date)
            if not terms or terms.payload["due_date"] is None:
                continue
            result.append(
                {
                    "allocation_id": allocation["id"],
                    "invoice_id": invoice["id"],
                    "journal_id": allocation["journal_id"],
                    "journal_digest": allocation["journal_digest"],
                    "due_date": terms.payload["due_date"],
                    "date": allocation["date"],
                    "amount": allocation["amount"],
                    "terms_id": terms.id,
                    "terms_version": terms.version,
                }
            )
    return result


def snapshot(db: Session, company: str, user: m.User, as_of: date, direction: str | None = None) -> dict:
    _access(db, company, user, direction, True)
    payload = current(db, company, user, as_of, direction)
    digest = sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    row = NativeInvoiceSnapshot(
        company_id=company, as_of=as_of, actor_id=user.id, digest=digest, payload=payload
    )
    db.add(row)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "native_invoice.snapshot_saved",
        row.id,
        {"digest": digest, "as_of": as_of.isoformat()},
    )
    return serialize_fact(row)


def reminder(db: Session, company: str, user: m.User, invoice_id: str) -> dict:
    item = detail(db, company, user, invoice_id)
    require(
        item["direction"] == "sale" and item["status"] == "available" and Decimal(item["remaining"]) > 0,
        "native_invoice_reminder_unavailable",
        "مانده معتبر برای یادآوری وصول موجود نیست.",
        409,
    )
    due = item["terms"]["due_date"]
    text = f"{item['party_id']}، مانده فاکتور {item['reference']} مبلغ {item['remaining']} ریال است." + (
        f" سررسید: {due}." if due else ""
    )
    return {
        "invoice_id": item["id"],
        "version": item["version"],
        "digest": sha256(json.dumps(item, sort_keys=True).encode()).hexdigest(),
        "text": text,
        "financial_effect": False,
        "delivery": "local_draft",
    }
