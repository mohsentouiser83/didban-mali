"""Freeze the reviewed invoice before calling the taxpayer gateway outside the database lock."""

import json
from datetime import timedelta, timezone
from decimal import Decimal, localcontext
from hashlib import sha256
from uuid import uuid4

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_setup_models import CompanyAccountingSetup
from .db import transaction
from .errors import require
from .http import access, paginate
from .moadian_gateway import MoadianGateway, MoadianGatewayError
from .moadian_models import MoadianTransmission as Transmission
from .moadian_models import MoadianTransmissionEvent as Event
from .moadian_payload import build_payload, can_build
from .moadian_profiles import MoadianProfile, load_profile
from .moadian_schemas import MoadianInvoiceInput
from .money_type import aggregate_money, canonical_money
from .native_invoice_models import NativeInvoice
from .native_invoice_service import detail as invoice_detail
from .posting_models import NativeJournal
from .services import get_entity
from .workflow import audit

TERMINAL = {"accepted", "rejected"}
INQUIRY_GRACE = timedelta(minutes=2)


def _can_send(db, company, member) -> bool:
    setup = db.get(CompanyAccountingSetup, company)
    return bool(
        member.role in ("owner", "finance_manager")
        and setup
        and setup.mode == "primary"
    )


def _authority(db, company, member, *, sending: bool) -> MoadianProfile:
    require(
        member.role in ("owner", "finance_manager"),
        "moadian_permission_required",
        "فقط مالک یا مدیر مالی شرکت به این عملیات دسترسی دارد.",
        403,
    )
    if sending:
        setup = db.get(CompanyAccountingSetup, company)
        require(
            setup and setup.mode == "primary",
            "primary_accounting_required",
            "ارسال در کاربرد حسابداری اصلی در دسترس است.",
            409,
        )
    profile = load_profile(company)
    require(profile, "moadian_not_configured", "اتصال مؤدیان برای این شرکت تنظیم نشده است.", 409)
    return profile


def _same_identity(row: Transmission, profile: MoadianProfile | None) -> bool:
    return bool(
        profile and profile.memory_id == row.memory_id and profile.seller_tax_number == row.seller_tax_number
    )


def _latest(db: Session, row: Transmission) -> Event:
    event = db.scalar(
        select(Event)
        .where(Event.company_id == row.company_id, Event.transmission_id == row.id)
        .order_by(Event.sequence.desc())
        .limit(1)
    )
    assert event is not None
    return event


def _inquiry_ready(event: Event) -> bool:
    return event.status in ("queued", "unknown") and (
        event.kind != "send_started"
        or event.created_at.replace(tzinfo=timezone.utc) + INQUIRY_GRACE <= m.now()
    )


def _public(row: Transmission, event: Event, may_inquire: bool, may_send: bool) -> dict:
    return {
        "id": row.id,
        "invoice_id": row.invoice_id,
        "invoice_version": row.invoice_version,
        "commercial_document_id": row.commercial_document_id,
        "document_digest": row.document_digest,
        "invoice_subject": row.invoice_subject,
        "reference_tax_id": row.reference_tax_id,
        "invoice_reference": row.invoice_reference,
        "tax_id": row.tax_id,
        "uid": row.uid,
        "reference_number": event.reference_number,
        "status": event.status,
        "error_codes": event.error_codes,
        "can_inquire": may_inquire and _inquiry_ready(event),
        "can_retry": may_send and event.status == "not_sent",
        "created_at": row.created_at.replace(tzinfo=timezone.utc).isoformat(),
    }


def _visible(db, row, member, profile):
    identity = _same_identity(row, profile)
    return _public(
        row,
        _latest(db, row),
        identity and member.role in ("owner", "finance_manager"),
        identity and _can_send(db, row.company_id, member),
    )


def history(
    db, company, member, limit: int, cursor: str | None, *,
    q: str | None = None, invoice_reference: str | None = None, tax_id: str | None = None,
    status: str | None = None, period_id: str | None = None,
) -> dict:
    profile = load_profile(company)
    may_send = _can_send(db, company, member)
    may_inquire = member.role in ("owner", "finance_manager")
    filters = []
    if q and (query := q.strip().lower()):
        filters.append(or_(*(
            func.lower(field).contains(query, autoescape=True)
            for field in (Transmission.invoice_reference, Transmission.tax_id, Transmission.uid)
        )))
    for field, value in ((Transmission.invoice_reference, invoice_reference), (Transmission.tax_id, tax_id)):
        if value and (term := value.strip()):
            filters.append(field.icontains(term, autoescape=True))
    if status:
        latest_status = (
            select(Event.status)
            .where(Event.company_id == company, Event.transmission_id == Transmission.id)
            .order_by(Event.sequence.desc())
            .limit(1)
            .scalar_subquery()
        )
        filters.append(latest_status == status)
    if period_id:
        get_entity(db, m.Period, company, period_id)
        period_invoices = (
            select(NativeInvoice.id)
            .join(NativeJournal, NativeJournal.id == NativeInvoice.source["journal_id"].as_string())
            .where(NativeInvoice.company_id == company, NativeJournal.company_id == company, NativeJournal.period_id == period_id)
        )
        filters.append(Transmission.invoice_id.in_(period_invoices))

    def public(row):
        identity = _same_identity(row, profile)
        inquiry_at = db.scalar(
            select(func.max(Event.created_at)).where(
                Event.company_id == company, Event.transmission_id == row.id, Event.kind == "inquiry",
            )
        )
        period_name = db.scalar(
            select(m.Period.name)
            .join(NativeJournal, NativeJournal.period_id == m.Period.id)
            .join(NativeInvoice, NativeInvoice.source["journal_id"].as_string() == NativeJournal.id)
            .where(m.Period.company_id == company, NativeJournal.company_id == company,
                   NativeInvoice.company_id == company, NativeInvoice.id == row.invoice_id)
        )
        return _public(row, _latest(db, row), identity and may_inquire, identity and may_send) | {
            "last_inquiry_at": inquiry_at.replace(tzinfo=timezone.utc).isoformat() if inquiry_at else None,
            "period_name": period_name,
        }

    return paginate(db, Transmission, company, limit, cursor, filters, transform=public) | {
        "configured": profile is not None,
        "can_submit": profile is not None and may_send,
    }


def _commercial_context(db: Session, company: str, invoice_id: str) -> tuple[dict | None, list[dict] | None]:
    from .commercial_doc_models import CommercialDocument, CommercialDocumentLine

    cdoc = db.scalar(
        select(CommercialDocument).where(
            CommercialDocument.company_id == company, CommercialDocument.native_invoice_id == invoice_id
        )
    )
    if cdoc is None:
        return None, None
    clines = list(
        db.scalars(
            select(CommercialDocumentLine)
            .where(
                CommercialDocumentLine.company_id == company, CommercialDocumentLine.document_id == cdoc.id
            )
            .order_by(CommercialDocumentLine.line_index)
        )
    )
    doc_dict = {
        "id": cdoc.id,
        "number": cdoc.number,
        "party_snapshot": cdoc.party_snapshot or {},
        "net_amount_irr": cdoc.net_amount_irr,
    }
    doc_digest = sha256(
        json.dumps(doc_dict, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()
    ).hexdigest()
    doc_dict["digest"] = doc_digest
    lines_list = [
        {
            "id": cline.id,
            "quantity": cline.quantity,
            "unit": cline.unit,
            "description": cline.description,
            "unit_price_irr": cline.unit_price_irr,
            "line_discount_irr": cline.line_discount_irr,
            "allocated_invoice_discount_irr": cline.allocated_invoice_discount_irr,
            "net_amount_irr": cline.net_amount_irr,
        }
        for cline in clines
    ]
    return doc_dict, lines_list


def candidates(db, company, user, member, include_all: bool = False) -> dict:
    _authority(db, company, member, sending=True)
    sent_ids = set(
        db.scalars(
            select(Transmission.invoice_id).where(
                Transmission.company_id == company, Transmission.invoice_subject == 1
            )
        )
    )
    stmt = (
        select(NativeInvoice.id)
        .where(
            NativeInvoice.company_id == company,
            NativeInvoice.direction == "sale",
        )
        .order_by(NativeInvoice.created_at.desc(), NativeInvoice.id.desc())
    )
    if not include_all and sent_ids:
        stmt = stmt.where(~NativeInvoice.id.in_(sent_ids))
    ids = list(db.scalars(stmt))
    items = []
    for identifier in ids:
        invoice = invoice_detail(db, company, user, identifier)
        cdoc, clines = _commercial_context(db, company, identifier)
        if can_build(invoice, clines):
            items.append(
                {key: invoice[key] for key in ("id", "version", "reference", "date", "amount", "party_id")}
                | {
                    "source": {"kind": invoice["source"]["kind"]},
                    "commercial_document_id": cdoc["id"] if cdoc else None,
                    "moadian_status": "sent" if identifier in sent_ids else "not_sent",
                }
            )
    return {"items": items}


def _review(db, company, user, data: MoadianInvoiceInput, profile: MoadianProfile) -> tuple[dict, dict]:
    invoice = invoice_detail(db, company, user, data.invoice_id)
    require(
        invoice["version"] == data.invoice_version,
        "version_conflict",
        "نسخه فاکتور تغییر کرده است. دوباره بررسی کنید.",
        409,
    )
    cdoc, clines = _commercial_context(db, company, invoice["id"])
    # Cross-check frozen buyer profile / counterparty identity against fiscal input
    party_snapshot = (cdoc or {}).get("party_snapshot") or {}
    if not party_snapshot and invoice.get("party_id"):
        from .commercial_service import counterparty_snapshot, resolve_counterparty

        cp = resolve_counterparty(db, company, invoice["party_id"])
        if cp is not None:
            party_snapshot = counterparty_snapshot(cp)
    buyer_mismatches = []
    snap_ek = party_snapshot.get("entity_kind")
    if snap_ek in ("natural_person", "legal_entity"):
        expected_bt = "natural" if snap_ek == "natural_person" else "legal"
        if expected_bt != data.buyer_type:
            buyer_mismatches.append("buyer_type")
    expected_tax_ids = [v for v in (party_snapshot.get("economic_code"), party_snapshot.get("national_id")) if v]
    if expected_tax_ids and data.buyer_tax_number not in expected_tax_ids:
        buyer_mismatches.append("buyer_tax_number")
    require(
        not buyer_mismatches,
        "moadian_buyer_mismatch",
        "مشخصات خریدار با کارت طرف‌حساب تثبیت‌شده در فاکتور تطابق ندارد.",
        409,
    )

    if data.invoice_subject in (2, 3, 4):
        orig_tx = db.scalar(
            select(Transmission).where(
                Transmission.company_id == company,
                Transmission.invoice_id == data.invoice_id,
                Transmission.invoice_subject == 1,
                Transmission.tax_id == data.reference_tax_id,
            )
        )
        require(
            orig_tx is not None,
            "moadian_reference_tax_id_not_found",
            "شماره مالیاتی مرجع با سابقه ارسال اصلی این فاکتور تطابق ندارد.",
            409,
        )

    packet = build_payload(invoice, data, profile.memory_id, profile.seller_tax_number, commercial_lines=clines)
    review = {
        "invoice_id": invoice["id"],
        "invoice_version": invoice["version"],
        "commercial_document_id": cdoc["id"] if cdoc else None,
        "document_digest": cdoc["digest"] if cdoc else None,
        "invoice_subject": data.invoice_subject,
        "reference_tax_id": data.reference_tax_id,
        "invoice_reference": invoice["reference"],
        "invoice_date": invoice["date"],
        "amount": str(packet["header"]["tbill"]),
        "tax_id": data.tax_id,
        "seller_tax_number": profile.seller_tax_number,
        "memory_id": profile.memory_id,
        "journal_id": invoice["source"]["journal_id"],
        "journal_digest": invoice["source"]["journal_digest"],
    }
    evidence = {
        "review": review,
        "input": data.model_dump(mode="json"),
        "payload": packet,
    }
    digest = sha256(json.dumps(evidence, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode())
    return review | {"digest": digest.hexdigest()}, packet


def preview(db, company, user, member, data: MoadianInvoiceInput) -> dict:
    profile = _authority(db, company, member, sending=True)
    review, _ = _review(db, company, user, data, profile)
    require(
        not db.scalar(
            select(Transmission.id).where(
                Transmission.company_id == company,
                Transmission.invoice_id == data.invoice_id,
                Transmission.invoice_subject == data.invoice_subject,
            )
        ),
        "moadian_invoice_already_prepared",
        "برای این فاکتور با این موضوع صورتحساب سابقهٔ ارسال وجود دارد. وضعیت آن را بررسی کنید.",
        409,
    )
    return review


def _event_seen(db, row, kind, key) -> bool:
    return (
        db.scalar(
            select(Event.id).where(
                Event.company_id == row.company_id,
                Event.transmission_id == row.id,
                Event.kind == kind,
                Event.request_key == key,
            )
        )
        is not None
    )


def _append(
    db, row, actor, key, kind, status, reference=None, errors=(), evidence_digest=None, approval=None
):
    sequence = (
        db.scalar(
            select(func.max(Event.sequence)).where(
                Event.company_id == row.company_id, Event.transmission_id == row.id
            )
        )
        or 0
    )
    db.add(
        Event(
            company_id=row.company_id,
            transmission_id=row.id,
            sequence=sequence + 1,
            kind=kind,
            status=status,
            reference_number=reference,
            error_codes=list(errors),
            evidence_digest=evidence_digest,
            request_key=key,
            actor_id=actor,
        )
    )
    audit(
        db,
        row.company_id,
        actor,
        "moadian." + kind,
        row.id,
        {
            "status": status,
            "uid": row.uid,
            "reference_number": reference,
            "evidence_digest": evidence_digest,
        }
        | ({"approval": approval} if approval else {}),
    )
    db.flush()


def _request_key(request) -> str:
    key = request.headers.get("idempotency-key", "")
    require(1 <= len(key) <= 128, "idempotency_key_required", "شناسه درخواست لازم است.", 428)
    return key


def submit(request, company, data: MoadianInvoiceInput, digest: str) -> dict:
    key = _request_key(request)
    with access(request, company) as (db, user, member):
        profile = _authority(db, company, member, sending=True)
        row = db.scalar(
            select(Transmission).where(
                Transmission.company_id == company,
                Transmission.invoice_id == data.invoice_id,
                Transmission.invoice_subject == data.invoice_subject,
            )
        )
        if row is not None:
            require(
                row.digest == digest and row.input == data.model_dump(mode="json"),
                "moadian_invoice_already_prepared",
                "برای این فاکتور سابقهٔ ارسال وجود دارد. وضعیت آن را بررسی کنید.",
                409,
            )
            return _visible(db, row, member, profile)
        review, payload = _review(db, company, user, data, profile)
        require(
            review["digest"] == digest,
            "moadian_preview_changed",
            "اطلاعات صورتحساب تغییر کرده است. دوباره بررسی کنید.",
            409,
        )
        serial = payload["header"]["inno"]
        require(
            not db.scalar(
                select(Transmission.id).where(
                    Transmission.company_id == company,
                    or_(
                        Transmission.tax_id == data.tax_id,
                        (Transmission.memory_id == profile.memory_id) & (Transmission.serial == serial),
                    ),
                )
            ),
            "moadian_tax_id_used",
            "این شماره مالیاتی یا سریال قبلاً برای فاکتور دیگری استفاده شده است.",
            409,
        )
        row = Transmission(
            company_id=company,
            invoice_id=data.invoice_id,
            invoice_version=data.invoice_version,
            commercial_document_id=review.get("commercial_document_id"),
            document_digest=review.get("document_digest"),
            invoice_subject=data.invoice_subject,
            reference_tax_id=data.reference_tax_id,
            invoice_reference=review["invoice_reference"],
            tax_id=data.tax_id,
            uid=str(uuid4()),
            memory_id=profile.memory_id,
            serial=serial,
            seller_tax_number=profile.seller_tax_number,
            digest=digest,
            payload=payload,
            input=data.model_dump(mode="json"),
            actor_id=user.id,
        )
        db.add(row)
        db.flush()
        _append(
            db,
            row,
            user.id,
            key,
            "send_started",
            "unknown",
            approval={
                name: review[name] for name in ("invoice_version", "journal_id", "journal_digest", "digest")
            },
        )
    return _send(request, row, profile, user.id, key)


def retry(request, company, transmission_id) -> dict:
    key = _request_key(request)
    with access(request, company) as (db, user, member):
        profile = _authority(db, company, member, sending=True)
        row = get_entity(db, Transmission, company, transmission_id)
        require(
            _same_identity(row, profile),
            "moadian_profile_changed",
            "هویت مالیاتی تنظیم‌شده تغییر کرده است.",
            409,
        )
        if _event_seen(db, row, "send_started", key):
            return _visible(db, row, member, profile)
        require(
            _latest(db, row).status == "not_sent",
            "moadian_retry_blocked",
            "قبل از ارسال دوباره، نتیجهٔ ارسال قبلی باید مشخص شود.",
            409,
        )
        data = MoadianInvoiceInput.model_validate(row.input)
        review, _ = _review(db, company, user, data, profile)
        require(
            review["digest"] == row.digest,
            "moadian_preview_changed",
            "اطلاعات صورتحساب تغییر کرده است.",
            409,
        )
        _append(db, row, user.id, key, "send_started", "unknown")
    return _send(request, row, profile, user.id, key)


def _send(request, row: Transmission, profile: MoadianProfile, actor: str, key: str) -> dict:
    reference = evidence = None
    try:
        result = MoadianGateway(profile.credentials).submit(row.uid, row.payload)
        status = (
            "queued"
            if result.status == "queued" and result.reference_number and result.evidence_digest
            else "unknown"
        )
        reference, errors = result.reference_number if status == "queued" else None, result.error_codes
        evidence = result.evidence_digest if status == "queued" else None
    except MoadianGatewayError as error:
        status = "unknown" if error.transmission_possible else "not_sent"
        errors = ("connection_error",)
    _record(row, actor, key, "send_result", status, reference, errors, evidence)
    return _refresh(request, row)


def inquire(request, company, transmission_id) -> dict:
    key = _request_key(request)
    with access(request, company) as (db, user, member):
        profile = _authority(db, company, member, sending=False)
        row = get_entity(db, Transmission, company, transmission_id)
        require(
            _same_identity(row, profile),
            "moadian_profile_changed",
            "هویت مالیاتی تنظیم‌شده تغییر کرده است.",
            409,
        )
        current = _latest(db, row)
        if current.status in TERMINAL or _event_seen(db, row, "inquiry", key):
            return _visible(db, row, member, profile)
        require(_inquiry_ready(current), "moadian_inquiry_wait", "استعلام این ارسال هنوز در دسترس نیست.", 409)
        started_at = db.scalar(
            select(Event.created_at)
            .where(Event.company_id == company, Event.transmission_id == row.id, Event.kind == "send_started")
            .order_by(Event.sequence.desc())
            .limit(1)
        )
        assert started_at is not None
    try:
        result = MoadianGateway(profile.credentials).inquire(
            row.uid,
            current.reference_number,
            submitted_at=started_at.replace(tzinfo=timezone.utc),
            tax_id=row.tax_id,
        )
        status, reference, errors, evidence = (
            result.status,
            result.reference_number,
            result.error_codes,
            result.evidence_digest,
        )
        if status in TERMINAL and not (reference and evidence):
            status, reference, errors, evidence = "unknown", None, ("unverified_response",), None
    except MoadianGatewayError:
        status, reference, errors, evidence = "unknown", None, ("connection_error",), None
    _record(row, user.id, key, "inquiry", status, reference, errors, evidence)
    return _refresh(request, row)


def _record(row, actor, key, kind, status, reference, errors, evidence_digest) -> None:
    with transaction(row.company_id) as db:
        current = _latest(db, row)
        if current.status in TERMINAL or _event_seen(db, row, kind, key):
            return
        if current.status == "queued" and status == "unknown":
            status = "queued"
        _append(
            db, row, actor, key, kind, status, reference or current.reference_number, errors, evidence_digest
        )


def _refresh(request, row) -> dict:
    with access(request, row.company_id) as (db, _, member):
        return _visible(db, row, member, load_profile(row.company_id))


def reconciliation_summary(db: Session, company: str, user: m.User, member) -> dict:
    require(
        member.role in ("owner", "finance_manager", "advisor"),
        "moadian_permission_required",
        "دسترسی کافی برای مشاهده مغایرت مؤدیان ندارید.",
        403,
    )
    profile = load_profile(company)
    invoices = db.scalars(
        select(NativeInvoice)
        .where(NativeInvoice.company_id == company, NativeInvoice.direction == "sale")
        .order_by(NativeInvoice.created_at.desc())
    ).all()

    transmissions = db.scalars(
        select(Transmission)
        .where(Transmission.company_id == company)
        .order_by(Transmission.created_at.desc())
    ).all()

    tx_by_invoice = {}
    for tx in transmissions:
        if tx.invoice_id not in tx_by_invoice:
            tx_by_invoice[tx.invoice_id] = tx

    accepted = []
    pending = []
    rejected = []
    untransmitted = []

    total_sales_book = Decimal(0)
    total_sales_accepted = Decimal(0)
    total_sales_untransmitted = Decimal(0)

    total_vat_book = Decimal(0)
    total_vat_accepted = Decimal(0)

    for inv in invoices:
        det = invoice_detail(db, company, user, inv.id)
        amt = Decimal(str(det.get("amount") or 0))
        vat_amt = Decimal(0)
        lines = det.get("source", {}).get("lines", []) or []
        for line in lines:
            vat_amt += Decimal(str(line.get("vat_amount") or 0))

        total_sales_book += amt
        total_vat_book += vat_amt

        tx = tx_by_invoice.get(inv.id)
        if not tx:
            total_sales_untransmitted += amt
            untransmitted.append(
                {
                    "invoice_id": inv.id,
                    "reference": det.get("reference") or "",
                    "party_id": det.get("party_id") or "",
                    "date": det.get("date") or "",
                    "amount": canonical_money(amt),
                    "vat_amount": canonical_money(vat_amt),
                    "status": "untransmitted",
                    "status_label": "ارسال‌نشده به مؤدیان",
                }
            )
        else:
            latest_ev = _latest(db, tx)
            st = latest_ev.status
            row_data = {
                "invoice_id": inv.id,
                "transmission_id": tx.id,
                "tax_id": tx.tax_id,
                "reference": det.get("reference") or "",
                "party_id": det.get("party_id") or "",
                "date": det.get("date") or "",
                "amount": canonical_money(amt),
                "vat_amount": canonical_money(vat_amt),
                "status": st,
            }
            if st == "accepted":
                header = (tx.payload or {}).get("header") or {}
                with localcontext() as precision:
                    precision.prec = 60
                    if header.get("tbill") is not None:
                        submitted = Decimal(str(header["tbill"]))
                        total_sales_accepted += submitted
                        row_data["submitted_amount"] = canonical_money(submitted)
                        row_data["difference"] = aggregate_money(submitted - amt)
                    if header.get("tvam") is not None:
                        total_vat_accepted += Decimal(str(header["tvam"]))
                row_data["status_label"] = "تأییدشده در کارپوشه"
                accepted.append(row_data)
            elif st in ("rejected", "failed"):
                row_data["status_label"] = "ردشده در مؤدیان"
                rejected.append(row_data)
            else:
                row_data["status_label"] = "در انتظار استعلام/ارسال"
                pending.append(row_data)

    vat_discrepancy = total_vat_book - total_vat_accepted

    return {
        "configured": profile is not None,
        "has_portal_evidence": bool(accepted),
        "summary": {
            "total_sales_book": canonical_money(total_sales_book),
            "total_sales_accepted": canonical_money(total_sales_accepted),
            "total_sales_untransmitted": canonical_money(total_sales_untransmitted),
            "total_vat_book": canonical_money(total_vat_book),
            "total_vat_accepted": canonical_money(total_vat_accepted),
            "vat_discrepancy": canonical_money(abs(vat_discrepancy)),
            "invoices_count": len(invoices),
            "accepted_count": len(accepted),
            "pending_count": len(pending),
            "rejected_count": len(rejected),
            "untransmitted_count": len(untransmitted),
            "compliance_percentage": (
                round(float(total_sales_accepted / total_sales_book * 100), 1)
                if total_sales_book > 0
                else None
            ),
        },
        "accepted": accepted,
        "pending": pending,
        "rejected": rejected,
        "untransmitted": untransmitted,
    }
