"""Explicit service-accounting templates. No journal is posted here."""

from decimal import Decimal, localcontext

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_service import capabilities, save_draft
from .errors import DomainError, require
from .money_type import canonical_money
from .operation_models import OperationDraft
from .workflow import audit

POLICY = "user-provisional-2026-11-02-v1"
# Debit and credit roles are explicit inputs, never inferred from a company's codes.
PAIRS = {
    "sale_service": ("trade_receivable", "service_revenue"),
    "purchase_service": ("service_expense", "trade_payable"),
    "receipt": ("bank_a", "trade_receivable"),
    "payment": ("trade_payable", "bank_a"),
    "expense": ("service_expense", "bank_a"),
    "payroll_payment": ("payroll_payable", "bank_a"),
    "cheque_received": ("notes_receivable", "trade_receivable"),
    "cheque_collected": ("bank_a", "notes_receivable"),
    "cheque_received_return": ("trade_receivable", "notes_receivable"),
    "cheque_issued": ("trade_payable", "notes_payable"),
    "cheque_paid": ("notes_payable", "bank_a"),
    "cheque_issued_return": ("notes_payable", "trade_payable"),
    "cheque_endorsed": ("trade_payable", "notes_receivable"),
}
LABELS = {
    "sale_service": "فروش خدمات",
    "purchase_service": "خرید خدمات",
    "receipt": "دریافت بابت طلب",
    "payment": "پرداخت بدهی",
    "expense": "هزینه پرداخت‌شده",
    "transfer": "انتقال داخلی",
    "payroll": "شناسایی حقوق",
    "payroll_payment": "پرداخت حقوق",
    "cheque_received": "دریافت چک",
    "cheque_collected": "وصول چک دریافتی",
    "cheque_received_return": "برگشت چک دریافتی پیش از وصول",
    "cheque_issued": "صدور چک",
    "cheque_paid": "پرداخت چک صادرشده",
    "cheque_issued_return": "برگشت چک پرداختنی پیش از برداشت",
    "cheque_endorsed": "واگذاری چک بابت بدهی",
}
ROLE_LABELS = {
    "bank_a": "بانک مبدأ",
    "bank_b": "بانک مقصد",
    "trade_receivable": "مطالبات تجاری",
    "service_revenue": "درآمد خدمات",
    "service_expense": "هزینه خدمات",
    "trade_payable": "بدهی تجاری",
    "bank_fee_expense": "هزینه کارمزد",
    "salary_expense": "هزینه حقوق",
    "employer_insurance_expense": "هزینه بیمه کارفرما",
    "payroll_payable": "حقوق پرداختنی",
    "insurance_payable": "بیمه پرداختنی",
    "payroll_tax_payable": "مالیات حقوق پرداختنی",
    "other_deductions_payable": "سایر کسورات پرداختنی",
    "notes_receivable": "چک دریافتنی",
    "notes_payable": "چک پرداختنی",
}
PAYROLL_FIELDS = (
    "gross",
    "employee_insurance",
    "employer_insurance",
    "payroll_tax",
    "other_deductions",
    "net_pay",
)


def _require_operation_module(db: Session, company: str, kind: str) -> None:
    from .module_service import require_module

    module = (
        "payroll"
        if kind in ("payroll", "payroll_payment")
        else "receivables"
        if kind == "sale_service"
        else "payables"
        if kind == "purchase_service"
        else "settlements"
    )
    # Preparation is an input workflow, so source availability is not required.
    # Explicit module disablement still blocks both preparation and posting.
    require_module(db, company, module, ready=False)


def catalogue() -> dict:
    items = []
    for kind, label in LABELS.items():
        roles = (
            list(PAIRS[kind])
            if kind in PAIRS
            else (
                ["bank_b", "bank_fee_expense", "bank_a"]
                if kind == "transfer"
                else [
                    "salary_expense",
                    "employer_insurance_expense",
                    "payroll_payable",
                    "insurance_payable",
                    "payroll_tax_payable",
                    "other_deductions_payable",
                ]
            )
        )
        amounts = (
            list(PAYROLL_FIELDS)
            if kind == "payroll"
            else (["amount", "fee"] if kind == "transfer" else ["amount"])
        )
        items.append(
            {
                "kind": kind,
                "label": label,
                "roles": [{"key": key, "label": ROLE_LABELS[key]} for key in roles],
                "amounts": amounts,
                "cheque_event_required": kind.startswith("cheque_"),
            }
        )
    return {
        "items": items,
        "policy_version": POLICY,
        "policy_provenance": "user_provisional",
        "statutory_calculation": False,
    }


def build(data: dict) -> list[dict]:
    kind = data["kind"]
    accounts = data["accounts"]
    raw = data["amounts"]
    if kind == "cheque_endorsed":
        require(
            bool(data.get("endorsee_party_id") and data["endorsee_party_id"].strip()),
            "cheque_endorse_party",
            "طرف واگذاری چک را مشخص کنید.",
        )
    else:
        require(
            not data.get("endorsee_party_id"), "unexpected_endorsee", "طرف واگذاری فقط برای واگذاری چک است."
        )
    expected = set(
        PAYROLL_FIELDS if kind == "payroll" else ["amount", "fee"] if kind == "transfer" else ["amount"]
    )
    require(
        set(raw) == expected, "operation_amount_fields", "مبلغ‌های لازم را کامل و بدون ستون اضافه وارد کنید."
    )
    try:
        amounts = {key: Decimal(canonical_money(value)) for key, value in raw.items()}
    except (ValueError, TypeError) as error:
        raise DomainError("invalid_amount", "مبلغ معتبر وارد کنید.") from error
    require(all(value >= 0 for value in amounts.values()), "operation_negative", "مبلغ منفی مجاز نیست.")
    require(
        amounts.get("amount", amounts.get("gross", Decimal(0))) > 0,
        "operation_positive",
        "مبلغ باید مثبت باشد.",
    )
    entries = []

    def line(role: str, value: Decimal, side: str):
        if value == 0:
            return
        account = accounts.get(role, "")
        require(bool(account), "operation_account_missing", f"حساب {ROLE_LABELS[role]} را انتخاب کنید.")
        try:
            canonical = canonical_money(value)
        except ValueError as error:
            raise DomainError("invalid_amount", "مبلغ حاصل از جمع از محدوده مجاز بزرگ‌تر است.") from error
        entries.append(
            {
                "account_id": account,
                "party_id": data["endorsee_party_id"]
                if kind == "cheque_endorsed" and role == "trade_payable"
                else data["party_id"],
                "debit": canonical if side == "debit" else "0",
                "credit": canonical if side == "credit" else "0",
            }
        )

    with localcontext() as context:
        context.prec = 60
        if kind in PAIRS:
            left, right = PAIRS[kind]
            line(left, amounts["amount"], "debit")
            line(right, amounts["amount"], "credit")
        elif kind == "transfer":
            require(
                accounts.get("bank_a") != accounts.get("bank_b"),
                "same_transfer_account",
                "حساب مبدأ و مقصد باید متفاوت باشند.",
            )
            line("bank_b", amounts["amount"], "debit")
            line("bank_fee_expense", amounts["fee"], "debit")
            line("bank_a", amounts["amount"] + amounts["fee"], "credit")
        elif kind == "payroll":
            a = amounts
            require(
                a["gross"] - a["employee_insurance"] - a["payroll_tax"] - a["other_deductions"]
                == a["net_pay"],
                "payroll_net_mismatch",
                "خالص با ناخالص و کسورات برابر نیست.",
            )
            line("salary_expense", a["gross"], "debit")
            line("employer_insurance_expense", a["employer_insurance"], "debit")
            line("payroll_payable", a["net_pay"], "credit")
            line("insurance_payable", a["employee_insurance"] + a["employer_insurance"], "credit")
            line("payroll_tax_payable", a["payroll_tax"], "credit")
            line("other_deductions_payable", a["other_deductions"], "credit")
        else:
            raise DomainError("operation_kind_invalid", "نوع عملیات معتبر نیست.")
    allowed = {role["key"] for item in catalogue()["items"] if item["kind"] == kind for role in item["roles"]}
    require(set(accounts) <= allowed, "operation_account_fields", "حساب اضافه برای این عملیات ارسال شده است.")
    # A same-account debit/credit hides the meaning of an operation.
    debits = {x["account_id"] for x in entries if x["debit"] != "0"}
    credits = {x["account_id"] for x in entries if x["credit"] != "0"}
    require(
        not debits.intersection(credits),
        "operation_accounts_overlap",
        "حساب بدهکار و بستانکار باید متفاوت باشند.",
    )
    return entries


def create(db: Session, company: str, user: m.User, data: dict) -> dict:
    require(
        capabilities(db, company, user)["can_prepare"], "permission_denied", "اجازه تهیه سند ندارید.", 403
    )
    _require_operation_module(db, company, data["kind"])
    require(
        not db.scalar(
            select(OperationDraft.id).where(
                OperationDraft.company_id == company,
                OperationDraft.kind == data["kind"],
                OperationDraft.source_reference == data["source_reference"],
            )
        ),
        "operation_duplicate",
        "این مرجع عملیات قبلاً ثبت شده است.",
        409,
    )
    if data["kind"] != "transfer":
        require(bool(data["party_id"].strip()), "operation_party_required", "طرف حساب را مشخص کنید.")
    if data["kind"].startswith("cheque_"):
        _validate_cheque(db, company, data)
    else:
        require(
            not data.get("cheque_event_id"), "unexpected_cheque_event", "این عملیات به رویداد چک مربوط نیست."
        )
    lines = build(data)
    result = save_draft(
        db,
        company,
        user,
        {
            "period_id": data["period_id"],
            "date": data["date"],
            "description": data["description"],
            "unit": data["unit"],
            "lines": lines,
        },
    )
    origin = OperationDraft(
        company_id=company,
        draft_id=result["id"],
        kind=data["kind"],
        source_reference=data["source_reference"],
        payload=jsonable_encoder(data),
        actor_id=user.id,
        policy_version=POLICY,
    )
    db.add(origin)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "accounting.operation_prepared",
        origin.id,
        {"draft_id": result["id"], "kind": origin.kind, "policy_version": POLICY},
    )
    return {"operation_id": origin.id, "draft": result, "financial_effect": False, "policy_version": POLICY}


def _validate_cheque(db: Session, company: str, data: dict) -> None:
    from .cheque_models import Cheque, ChequeEvent
    from .ingestion import money
    from .services import get_entity

    event = get_entity(db, ChequeEvent, company, data.get("cheque_event_id") or "")
    cheque = get_entity(db, Cheque, company, event.cheque_id)
    expected = {
        "cheque_received": ("received", "registered"),
        "cheque_issued": ("issued", "registered"),
        "cheque_collected": ("received", "clear"),
        "cheque_paid": ("issued", "clear"),
        "cheque_received_return": ("received", "return"),
        "cheque_issued_return": ("issued", "return"),
        "cheque_endorsed": ("received", "endorse"),
    }
    direction, action = expected[data["kind"]]
    require(
        cheque.direction == direction and event.action == action and event.event_date == data["date"],
        "cheque_operation_mismatch",
        "رویداد چک با عملیات و تاریخ یکسان نیست.",
    )
    require(
        event.previous_state != "cleared" or action != "return",
        "cheque_return_after_clearance",
        "برگشت پس از برداشت، سند اصلاحی جدا می‌خواهد.",
    )
    require(
        data["party_id"] == cheque.party_id
        and canonical_money(money(data["amounts"].get("amount", ""), data["unit"])) == cheque.amount,
        "cheque_amount_mismatch",
        "طرف حساب یا مبلغ با چک برابر نیست.",
    )
    if data["kind"] == "cheque_endorsed":
        require(
            _current_endorsee(db, company, cheque, event) == data.get("endorsee_party_id")
            and bool(data.get("endorsee_party_id")),
            "cheque_endorse_evidence_mismatch",
            "طرف واگذاری یا رویداد جاری چک یکسان نیست؛ سابقه را بررسی کنید.",
            409,
        )
    require(
        not db.scalar(
            select(OperationDraft.id).where(
                OperationDraft.company_id == company,
                OperationDraft.source_reference == "cheque-event:" + event.id,
            )
        ),
        "operation_duplicate",
        "برای این رویداد قبلاً پیش‌نویس ساخته شده است.",
        409,
    )
    data["source_reference"] = "cheque-event:" + event.id


def _current_endorsee(db: Session, company: str, cheque, event) -> str | None:
    """Older events do not retain an endorsee; never infer it from mutable state."""
    from .cheque_models import ChequeEvent

    if event.action != "endorse" or cheque.state != "endorsed":
        return None
    latest = db.scalar(
        select(ChequeEvent)
        .where(ChequeEvent.company_id == company, ChequeEvent.cheque_id == cheque.id)
        .order_by(ChequeEvent.created_at.desc(), ChequeEvent.id.desc())
        .limit(1)
    )
    return cheque.endorsed_to if latest and latest.id == event.id else None


def validate_posting(db: Session, company: str, draft) -> str | None:
    """A cheque event is not reusable; later lifecycle entries need the posted origin."""
    from .cheque_models import ChequeEvent
    from .posting_models import NativeJournal

    origin = db.scalar(
        select(OperationDraft).where(
            OperationDraft.company_id == company, OperationDraft.draft_id == draft.id
        )
    )
    if not origin:
        return
    _require_operation_module(db, company, origin.kind)
    if not origin.kind.startswith("cheque_"):
        return
    data = dict(origin.payload)
    from datetime import date

    data["date"] = date.fromisoformat(data["date"])
    # Recheck source evidence and pin generated journal content despite draft edits.
    event = db.get(ChequeEvent, data["cheque_event_id"])
    require(event and event.company_id == company, "cheque_event_missing", "شاهد چک در دسترس نیست.", 409)
    if event.action == "clear":
        _validate_current_bank_proof(db, company, event)
    lines = build(data)
    from .accounting_service import validate_lines

    expected = validate_lines(db, company, {"unit": data["unit"], "lines": lines})
    require(
        draft.lines == expected and draft.date == data["date"] and draft.period_id == data["period_id"],
        "operation_draft_changed",
        "محتوای سند با رویداد چک یکسان نیست؛ پیش‌نویس مرتبط را بررسی کنید.",
        409,
    )
    if event.action == "registered":
        return
    prior = []
    for candidate in db.scalars(
        select(OperationDraft).where(
            OperationDraft.company_id == company,
            OperationDraft.kind.in_(["cheque_received", "cheque_issued"]),
        )
    ):
        source = db.get(ChequeEvent, candidate.payload.get("cheque_event_id"))
        if source and source.cheque_id == event.cheque_id:
            journal = db.scalar(
                select(NativeJournal).where(
                    NativeJournal.company_id == company, NativeJournal.draft_id == candidate.draft_id
                )
            )
            if journal:
                prior.append(journal)
    require(
        len(prior) == 1, "cheque_origin_not_posted", "ابتدا سند دریافت یا صدور این چک را ثبت نهایی کنید.", 409
    )
    require(
        not db.scalar(
            select(NativeJournal.id).where(
                NativeJournal.company_id == company, NativeJournal.reversal_of == prior[0].id
            )
        ),
        "cheque_origin_reversed",
        "سند دریافت یا صدور چک برگشت خورده است.",
        409,
    )
    for other in db.scalars(
        select(OperationDraft).where(
            OperationDraft.company_id == company,
            OperationDraft.kind.like("cheque_%"),
            OperationDraft.id != origin.id,
        )
    ):
        if other.kind in ("cheque_received", "cheque_issued"):
            continue
        source = db.get(ChequeEvent, other.payload.get("cheque_event_id"))
        if not source or source.cheque_id != event.cheque_id:
            continue
        posted = db.scalar(
            select(NativeJournal).where(
                NativeJournal.company_id == company, NativeJournal.draft_id == other.draft_id
            )
        )
        if posted and not db.scalar(
            select(NativeJournal.id).where(
                NativeJournal.company_id == company, NativeJournal.reversal_of == posted.id
            )
        ):
            require(
                False,
                "cheque_accounting_capacity",
                "این چک قبلاً مصرف حسابداری شده؛ ابتدا سند قبلی را با دلیل اصلاح کنید.",
                409,
            )

    return event.cheque_id


def _validate_current_bank_proof(db: Session, company: str, event) -> None:
    """Reserved evidence is not reserved again; its current source is rechecked."""
    from .cheque_models import Cheque, ChequeClearance
    from .finance import ANCHOR_KINDS
    from .services import get_entity

    clearance = db.scalar(
        select(ChequeClearance).where(
            ChequeClearance.company_id == company,
            ChequeClearance.event_id == event.id,
            ChequeClearance.cheque_id == event.cheque_id,
        )
    )
    require(
        clearance is not None, "cheque_bank_evidence_required", "شاهد وصول یا پرداخت چک در دسترس نیست.", 409
    )
    cheque = get_entity(db, Cheque, company, event.cheque_id)
    bank = get_entity(db, m.BankMovement, company, clearance.bank_id)
    manifest = db.scalar(
        select(m.ResultManifest)
        .where(m.ResultManifest.company_id == company)
        .order_by(m.ResultManifest.created_at.desc(), m.ResultManifest.id.desc())
        .limit(1)
    )
    require(
        manifest is not None and bank.source_row_id in manifest.selection.get("row_ids", []),
        "cheque_inactive_bank_evidence",
        "شاهد بانک در نسخه جاری نیست؛ وصول یا پرداخت را بررسی کنید.",
        409,
    )
    require(
        bank.kind not in ANCHOR_KINDS
        and bank.date == event.event_date
        and Decimal(clearance.amount) == Decimal(cheque.amount)
        and Decimal(bank.amount).copy_abs() >= Decimal(clearance.amount),
        "cheque_bank_evidence_changed",
        "شاهد بانک با مبلغ و تاریخ چک سازگار نیست.",
        409,
    )
    require(
        (Decimal(bank.amount) > 0 if cheque.direction == "received" else Decimal(bank.amount) < 0),
        "cheque_bank_direction",
        "جهت شاهد بانک با چک سازگار نیست.",
        409,
    )
    require(
        not bank.party_id or bank.party_id == cheque.party_id,
        "cheque_bank_party",
        "طرف حساب شاهد بانک با چک سازگار نیست.",
        409,
    )
    require(
        cheque.direction != "issued" or bank.account == cheque.bank_account,
        "cheque_bank_account",
        "برداشت باید از حساب صادرکننده باشد.",
        409,
    )


def cheque_options(db: Session, company: str, kind: str, limit: int = 25, cursor: str | None = None) -> dict:
    from .cheque_models import Cheque, ChequeEvent
    from .http import paginate

    expected = {
        "cheque_received": ("received", "registered"),
        "cheque_issued": ("issued", "registered"),
        "cheque_collected": ("received", "clear"),
        "cheque_paid": ("issued", "clear"),
        "cheque_received_return": ("received", "return"),
        "cheque_issued_return": ("issued", "return"),
        "cheque_endorsed": ("received", "endorse"),
    }
    require(kind in expected, "operation_kind_invalid", "نوع عملیات چک معتبر نیست.")
    direction, action = expected[kind]

    def public(event):
        cheque = db.get(Cheque, event.cheque_id)
        return {
            "id": event.id,
            "number": cheque.number,
            "party_id": cheque.party_id,
            "amount": cheque.amount,
            "date": event.event_date.isoformat(),
            "period_id": event.period_id,
            "action": event.action,
            "endorsee_party_id": _current_endorsee(db, company, cheque, event),
        }

    eligible = select(Cheque.id).where(Cheque.company_id == company, Cheque.direction == direction)
    return paginate(
        db,
        ChequeEvent,
        company,
        limit,
        cursor,
        [ChequeEvent.action == action, ChequeEvent.cheque_id.in_(eligible)],
        transform=public,
    )
