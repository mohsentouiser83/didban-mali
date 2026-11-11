"""Freeze the reviewed invoice before calling the taxpayer gateway outside the database lock."""

import json
from datetime import timedelta, timezone
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
from .module_service import module_state, require_module
from .native_invoice_models import NativeInvoice
from .native_invoice_service import detail as invoice_detail
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
        and module_state(db, company, "moadian", set())["enabled"]
    )


def _authority(db, company, member, *, sending: bool) -> MoadianProfile:
    require(
        member.role in ("owner", "finance_manager"),
        "moadian_permission_required",
        "فقط مالک یا مدیر مالی شرکت به این عملیات دسترسی دارد.",
        403,
    )
    if sending:
        require_module(db, company, "moadian", ready=False)
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


def history(db, company, member, limit: int, cursor: str | None) -> dict:
    profile = load_profile(company)
    may_send = _can_send(db, company, member)
    may_inquire = member.role in ("owner", "finance_manager")

    def public(row):
        identity = _same_identity(row, profile)
        return _public(row, _latest(db, row), identity and may_inquire, identity and may_send)

    return paginate(db, Transmission, company, limit, cursor, transform=public) | {
        "configured": profile is not None,
        "can_submit": profile is not None and may_send,
    }


def candidates(db, company, user, member) -> dict:
    _authority(db, company, member, sending=True)
    sent = select(Transmission.invoice_id).where(Transmission.company_id == company)
    ids = db.scalars(
        select(NativeInvoice.id)
        .where(
            NativeInvoice.company_id == company,
            NativeInvoice.direction == "sale",
            ~NativeInvoice.id.in_(sent),
        )
        .order_by(NativeInvoice.created_at.desc(), NativeInvoice.id.desc())
    )
    items = []
    for identifier in ids:
        invoice = invoice_detail(db, company, user, identifier)
        if can_build(invoice):
            items.append(
                {key: invoice[key] for key in ("id", "version", "reference", "date", "amount", "party_id")}
                | {"source": {"kind": invoice["source"]["kind"]}}
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
    packet = build_payload(invoice, data, profile.memory_id, profile.seller_tax_number)
    review = {
        "invoice_id": invoice["id"],
        "invoice_version": invoice["version"],
        "invoice_reference": invoice["reference"],
        "invoice_date": invoice["date"],
        "amount": invoice["amount"],
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
                Transmission.company_id == company, Transmission.invoice_id == data.invoice_id
            )
        ),
        "moadian_invoice_already_prepared",
        "برای این فاکتور سابقهٔ ارسال وجود دارد. وضعیت آن را بررسی کنید.",
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
                Transmission.company_id == company, Transmission.invoice_id == data.invoice_id
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
