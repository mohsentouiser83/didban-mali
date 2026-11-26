"""Cheque state is operational evidence, never a journal or invoice settlement."""

from datetime import date
from decimal import Decimal, localcontext
from zoneinfo import ZoneInfo

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from . import models as m
from .cheque_models import Cheque, ChequeClearance, ChequeEvent
from .commercial_service import resolve_counterparty
from .errors import require
from .finance import ANCHOR_KINDS
from .ingestion import money
from .period_lock_service import require_open_period
from .security import membership
from .services import check_version, get_entity
from .treasury_models import TreasuryAccount
from .treasury_service import bank_movement_used_amount
from .workflow import audit, serialize_fact


def _period(db: Session, company: str, period_id: str, event_date: date) -> None:
    period = get_entity(db, m.Period, company, period_id)
    require_open_period(db, company, period_id)
    require(
        period.start <= event_date <= period.end,
        "cheque_date_outside_period",
        "تاریخ رویداد خارج از دوره است.",
    )


def _public(item: Cheque) -> dict:
    return serialize_fact(item) | {
        "financial_effect": False,
        "accounting_status": "separate_approval_workflow",
        "cash_included": False,
    }


def create(db: Session, company: str, user: m.User, data: dict) -> dict:
    membership(db, company, user, "write")
    _period(db, company, data["period_id"], data["issue_date"])
    today = m.now().astimezone(ZoneInfo("Asia/Tehran")).date()
    require(
        data["issue_date"] <= today,
        "cheque_issue_future",
        "تاریخ دریافت یا صدور نباید آینده باشد.",
    )
    if data.get("received_date") is not None:
        require(
            data["received_date"] >= data["issue_date"] and data["received_date"] <= today,
            "cheque_received_date_invalid",
            "تاریخ دریافت چک نباید پیش از تاریخ صدور یا در آینده باشد.",
        )
    require(
        data["due_date"] >= data["issue_date"],
        "cheque_due_before_issue",
        "سررسید نباید پیش از دریافت یا صدور باشد.",
    )
    sayad_id = (data.get("sayad_id") or "").strip() or None
    if sayad_id is not None:
        require(
            sayad_id.isascii() and sayad_id.isdigit() and len(sayad_id) == 16,
            "invalid_sayad_id",
            "شناسه صیادی چک باید دقیقاً ۱۶ رقم عددی باشد.",
        )
        require(
            db.scalar(select(Cheque.id).where(Cheque.company_id == company, Cheque.sayad_id == sayad_id)) is None,
            "duplicate_sayad_id",
            "این شناسه صیادی قبلاً در شرکت ثبت شده است.",
            409,
        )
    treasury_account_id = data.get("treasury_account_id")
    if treasury_account_id:
        ta = get_entity(db, TreasuryAccount, company, treasury_account_id)
        require(ta.active and ta.kind == "bank", "invalid_cheque_treasury", "حساب بانکی خزانه معتبر و فعال نیست.", 409)
    cp = resolve_counterparty(db, company, data["party_id"], require_active=True)
    canonical = money(data["amount"], data["unit"])
    require(Decimal(canonical) > 0, "cheque_amount_positive", "مبلغ چک باید مثبت باشد.")
    item = Cheque(
        company_id=company,
        direction=data["direction"],
        number=data["number"],
        sayad_id=sayad_id,
        sayad_status=data.get("sayad_status") or "not_verified",
        bank_name=data["bank_name"],
        bank_account=data["bank_account"],
        treasury_account_id=treasury_account_id,
        party_id=data["party_id"],
        counterparty_id=cp.id if cp else None,
        issuer_name=data.get("issuer_name"),
        holder_name=data.get("holder_name"),
        amount=canonical,
        original_amount=data["amount"],
        original_unit=data["unit"],
        issue_date=data["issue_date"],
        received_date=data.get("received_date"),
        due_date=data["due_date"],
        state=data["direction"],
        actor_id=user.id,
    )
    db.add(item)
    db.flush()
    event = ChequeEvent(
        company_id=company,
        cheque_id=item.id,
        actor_id=user.id,
        action="registered",
        previous_state=None,
        new_state=item.state,
        event_date=item.received_date or item.issue_date,
        period_id=data["period_id"],
        treasury_account_id=treasury_account_id,
        reason="ثبت اطلاعات چک؛ بدون سند و تسویه مالی",
    )
    db.add(event)
    db.flush()
    audit(
        db, company, user.id, "cheque.registered", item.id, {"event_id": event.id, "financial_effect": False}
    )
    return _public(item)


def _validate_clearance(db: Session, company: str, item: Cheque, data: dict) -> m.BankMovement:
    require(bool(data.get("bank_id")), "cheque_bank_evidence_required", "گردش واقعی بانک را انتخاب کنید.")
    bank = get_entity(db, m.BankMovement, company, data["bank_id"])
    manifest = db.scalar(
        select(m.ResultManifest)
        .where(m.ResultManifest.company_id == company)
        .order_by(m.ResultManifest.created_at.desc(), m.ResultManifest.id.desc())
        .limit(1)
    )
    require(
        manifest is not None and bank.source_row_id in manifest.selection.get("row_ids", []),
        "cheque_inactive_bank_evidence",
        "گردش بانک در نسخه فعال نیست.",
        409,
    )
    require(
        bank.kind not in ANCHOR_KINDS, "cheque_anchor_not_payment", "مانده مبنا شاهد وصول یا پرداخت نیست."
    )
    require(
        bank.date == data["event_date"] and bank.date >= item.issue_date,
        "cheque_bank_date",
        "تاریخ گردش با رویداد چک یکسان نیست.",
    )
    require(
        bank.date <= m.now().astimezone(ZoneInfo("Asia/Tehran")).date(),
        "cheque_future_bank",
        "گردش آینده شاهد وصول واقعی نیست.",
    )
    from .commercial_service import resolve_counterparty_id

    bank_cp = resolve_counterparty_id(db, company, bank.party_id) if bank.party_id else None
    item_cp = item.counterparty_id or resolve_counterparty_id(db, company, item.party_id)
    require(
        not bank.party_id or bank_cp == item_cp,
        "cheque_bank_party",
        "طرف حساب گردش بانک با چک یکسان نیست.",
        409,
    )
    value = Decimal(bank.amount)
    require(
        (value > 0 if item.direction in ("received", "guarantee_in") else value < 0),
        "cheque_bank_direction",
        "جهت گردش بانک با چک سازگار نیست.",
    )
    if item.direction in ("issued", "guarantee_out"):
        require(
            bank.account == item.bank_account, "cheque_bank_account", "برداشت باید از حساب صادرکننده باشد."
        )
    with localcontext() as context:
        context.prec = 60
        used = bank_movement_used_amount(db, company, bank.id)
        require(
            used + Decimal(item.amount) <= value.copy_abs(),
            "cheque_bank_capacity",
            "ظرفیت مبلغ این گردش بانک کافی نیست.",
            409,
        )
    return bank


def act(db: Session, company: str, user: m.User, cheque_id: str, data: dict, version: int) -> dict:
    membership(db, company, user, "write")
    if db.get_bind().dialect.name == "sqlite":
        db.execute(update(m.Company).where(m.Company.id == company).values(version=m.Company.version))
    else:
        db.scalar(select(m.Company).where(m.Company.id == company).with_for_update())
    require(
        isinstance(data.get("reason"), str) and bool(data["reason"].strip()),
        "cheque_reason_required",
        "دلیل و شرح رویداد را وارد کنید.",
    )
    item = get_entity(db, Cheque, company, cheque_id)
    check_version(item, version)
    _period(db, company, data["period_id"], data["event_date"])
    require(
        data["event_date"] <= m.now().astimezone(ZoneInfo("Asia/Tehran")).date(),
        "cheque_event_future",
        "تاریخ رویداد نباید آینده باشد.",
    )
    require(
        data["event_date"] >= item.issue_date, "cheque_event_date", "رویداد نباید پیش از دریافت یا صدور باشد."
    )
    previous = db.scalar(
        select(ChequeEvent)
        .where(ChequeEvent.company_id == company, ChequeEvent.cheque_id == item.id)
        .order_by(ChequeEvent.created_at.desc(), ChequeEvent.id.desc())
        .limit(1)
    )
    require(
        previous is None or data["event_date"] >= previous.event_date,
        "cheque_event_order",
        "تاریخ رویداد نباید پیش از آخرین رویداد باشد.",
    )
    allowed = {
        "received": {"deposit", "endorse", "clear", "return", "cancel"},
        "issued": {"clear", "return", "cancel"},
        "guarantee_in": {"deposit", "clear", "return", "cancel"},
        "guarantee_out": {"clear", "return", "cancel"},
        "deposited": {"clear", "return"},
        "endorsed": {"return"},
        "cleared": {"return"},
        "returned": {"deposit", "endorse", "clear", "cancel"}
        if item.direction in ("received", "guarantee_in")
        else {"clear", "cancel"},
        "cancelled": set(),
    }
    action = data["action"]
    require(
        action in allowed.get(item.state, set()),
        "cheque_transition_invalid",
        "این تغییر وضعیت برای چک مجاز نیست.",
        409,
    )
    endorsed_cp_id = None
    endorsed_to = data.get("endorsed_to")
    if action == "endorse":
        require(
            item.direction == "received" and bool(endorsed_to),
            "cheque_endorse_party",
            "طرف واگذاری را مشخص کنید.",
        )
        endorsed_cp = resolve_counterparty(db, company, endorsed_to, require_active=True)
        endorsed_cp_id = endorsed_cp.id if endorsed_cp else None
    treasury_account_id = data.get("treasury_account_id")
    if treasury_account_id:
        ta = get_entity(db, TreasuryAccount, company, treasury_account_id)
        require(ta.active, "inactive_treasury_account", "حساب خزانه غیرفعال است.", 409)
    bank = _validate_clearance(db, company, item, data) if action == "clear" else None
    newstate = {
        "deposit": "deposited",
        "endorse": "endorsed",
        "clear": "cleared",
        "return": "returned",
        "cancel": "cancelled",
    }[action]
    event = ChequeEvent(
        company_id=company,
        cheque_id=item.id,
        actor_id=user.id,
        action=action,
        previous_state=item.state,
        new_state=newstate,
        event_date=data["event_date"],
        period_id=data["period_id"],
        endorsed_to=endorsed_to if action == "endorse" else None,
        endorsed_to_counterparty_id=endorsed_cp_id if action == "endorse" else None,
        treasury_account_id=treasury_account_id,
        reason=data["reason"],
    )
    db.add(event)
    db.flush()
    if bank:
        db.add(
            ChequeClearance(
                company_id=company, cheque_id=item.id, bank_id=bank.id, event_id=event.id, amount=item.amount
            )
        )
    item.state = newstate
    item.version += 1
    if action == "endorse":
        item.endorsed_to = endorsed_to
        item.endorsed_to_counterparty_id = endorsed_cp_id
    if treasury_account_id and action in ("deposit", "clear"):
        item.treasury_account_id = treasury_account_id
    db.flush()
    audit(
        db,
        company,
        user.id,
        "cheque.state_changed",
        item.id,
        {
            "event_id": event.id,
            "before": event.previous_state,
            "after": newstate,
            "bank_id": bank.id if bank else None,
            "reason": data["reason"],
            "financial_effect": False,
            "unknown_bank_party_reviewed": bool(bank and not bank.party_id),
        },
    )
    return _public(item)


def bank_options(db: Session, company: str, limit: int = 50, cursor: str | None = None, q: str = "") -> dict:
    from sqlalchemy import or_

    from .http import paginate

    require(len(q) <= 100, "query_too_long", "جستجو باید کوتاه‌تر از ۱۰۰ نویسه باشد.")
    manifest = db.scalar(
        select(m.ResultManifest)
        .where(m.ResultManifest.company_id == company)
        .order_by(m.ResultManifest.created_at.desc(), m.ResultManifest.id.desc())
        .limit(1)
    )
    filters = [
        m.BankMovement.source_row_id.in_(manifest.selection.get("row_ids", []) if manifest else []),
        m.BankMovement.kind.not_in(ANCHOR_KINDS),
    ]
    if q:
        filters.append(
            or_(
                m.BankMovement.reference.contains(q, autoescape=True),
                m.BankMovement.account.contains(q, autoescape=True),
            )
        )
    return paginate(
        db,
        m.BankMovement,
        company,
        limit,
        cursor,
        filters,
        transform=lambda bank: {
            "id": bank.id,
            "account": bank.account,
            "reference": bank.reference,
            "party_id": bank.party_id,
            "amount": bank.amount,
            "date": bank.date.isoformat(),
        },
    )
