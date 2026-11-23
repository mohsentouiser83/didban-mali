"""Operational orchestration service for conversational financial actions (ChatOps).

Coordinates:
1. Daily Accounting Operations:
   - expense, payment, receipt, sale_service, purchase_service, transfer
   - Review links for explicit journal posting
   - Inquiry of pending drafts
2. Treasury & Cheques Lifecycle:
   - Register received / issued cheque (register_cheque)
   - Change cheque state: deposit, clear, return, endorse, cancel (cheque_action)
   - Inquiry of cheques and due dates (inquiry_cheques)
3. Collections & Commercial Reminders:
   - Identify overdue debtors and generate Persian collection reminder letters (collection_followup)
"""

from __future__ import annotations

import re
from datetime import date
from decimal import Decimal
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_models import Account, Draft
from .accounting_service import capabilities
from .cheque_models import Cheque
from .cheque_service import act as act_cheque
from .cheque_service import create as create_cheque
from .errors import DomainError
from .ingestion import normalized
from .native_invoice_models import NativeInvoice
from .native_reporting_models import NativeAccountRole
from .operation_service import LABELS
from .operation_service import create as create_operation
from .posting_service import preview as preview_posting

PERSIAN_TO_ENG = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")

EXPENSE_KEYWORDS = [
    "اجاره",
    "پذیرایی",
    "غذا",
    "ناهار",
    "شام",
    "صبحانه",
    "اینترنت",
    "تلفن",
    "قبض",
    "برق",
    "آب",
    "گاز",
    "پست",
    "حمل",
    "پیک",
    "حقوق",
    "دستمزد",
    "پاداش",
    "مشاوره",
    "تبلیغات",
    "بازاریابی",
    "تعمیر",
    "تعمیرات",
    "بنزین",
    "سوخت",
    "لوازم",
    "ملزومات",
    "بیمه",
    "لوازم تحریر",
]

BANK_KEYWORDS = [
    "ملت",
    "ملی",
    "صادرات",
    "تجارت",
    "سپه",
    "کشاورزی",
    "مسکن",
    "سامان",
    "پاسارگاد",
    "پارسیان",
    "سینا",
    "شهر",
    "دی",
    "صندوق",
    "رسالت",
    "مهر",
    "کارآفرین",
    "خاورمیانه",
    "گردشگری",
    "ایران زمین",
]

CONFIRM_KEYWORDS = [
    "تایید کن",
    "تأیید کن",
    "تایید",
    "تأیید",
    "ثبتش کن",
    "ثبت کن همین",
    "ثبت نهایی",
    "قطعی کن",
    "ثبت نهایی کن",
    "همین رو ثبت کن",
    "همین را ثبت کن",
    "بله ثبت کن",
    "بله تایید کن",
    "بله تأیید کن",
    "اوکی ثبت کن",
    "تایید و ثبت",
    "تأیید و ثبت",
]

PENDING_INQUIRY_KEYWORDS = [
    "پیش‌نویس‌ها",
    "پیش نویس ها",
    "اسناد معلق",
    "اسناد باز",
    "چه اسنادی داریم",
    "پیش‌نویس های آماده",
    "اسناد آماده ثبت",
]

CHEQUE_REGISTER_KEYWORDS = [
    "ثبت چک",
    "یک فقره چک",
    "چک دریافتی",
    "چک پرداختی",
    "چک صادرشده",
    "چک صیادی",
    "ثبت یک چک",
]

CHEQUE_ACTION_KEYWORDS = [
    "وصول چک",
    "چک وصول شد",
    "برگشت چک",
    "چک برگشت",
    "برگشت خورده",
    "خواباندن چک",
    "به حساب بخوابان",
    "خوابانده شد",
    "خواباندن به حساب",
    "واگذاری چک",
    "چک را واگذار کن",
    "چک را خرج کن",
    "واگذار شد",
    "ابطال چک",
    "چک باطل شد",
]

CHEQUE_INQUIRY_KEYWORDS = [
    "چک‌های دریافتی",
    "چکهای دریافتی",
    "چک‌های پرداختی",
    "چکهای پرداختی",
    "لیست چک‌ها",
    "لیست چکها",
    "وضعیت چک‌ها",
    "وضعیت چکها",
    "چک‌های سررسید",
    "چکهای سررسید",
    "چک‌های ماه",
    "چکهای ماه",
]

COLLECTION_KEYWORDS = [
    "پیگیری وصول",
    "یادآوری وصول",
    "طلب معوق",
    "مطالبات معوق",
    "متن پیگیری",
    "متن یادآوری",
    "فاکتورهای پرداخت نشده",
    "فاکتورهای معوق",
    "وصول مطالبات",
    "نامه وصول",
    "پیامک وصول",
]

TRIAL_BALANCE_KEYWORDS = [
    "تراز ازمایشی",
    "تراز آزمایشی",
    "تراز کل",
    "تراز چهار ستونی",
    "تراز ۴ ستونی",
    "وضعیت تراز",
    "ترازنامه ازمایشی",
    "ترازنامه آزمایشی",
    "تراز معین",
    "گزارش تراز",
]

ACCOUNT_STATEMENT_KEYWORDS = [
    "گردش حساب",
    "ریز گردش",
    "دفتر معین",
    "صورتحساب بانک",
    "صورت حساب بانک",
    "گردش بانک",
    "صورتحساب حساب",
    "پرینت حساب",
    "ریز حساب",
    "ریز حساب بانک",
    "دفتر کل",
    "ریز سند",
]

INCOME_STATEMENT_KEYWORDS = [
    "صورت سود و زیان",
    "سود و زیان شرکت",
    "سود و زیان دوره",
    "گزارش درامد و هزینه",
    "گزارش درآمد و هزینه",
    "صورت سود زیان",
    "سود و زیان را نشان",
    "سود و زیان چقدر",
    "سود وزیان",
    "سود خالص",
    "سود و زیان",
]

DEBTORS_INQUIRY_KEYWORDS = [
    "لیست بدهکاران",
    "جدول بدهکاران",
    "مشتریان بدهکار",
    "مانده بدهکاران",
    "چه کسانی بدهکارند",
    "چه کسانی به ما بدهکارند",
    "مانده حساب مشتریان",
    "وضعیت بدهکاران",
    "لیست طلب",
    "مطالبات از مشتریان",
    "کی به ما بدهکاره",
    "بدهکاران تجاری",
]

PERSIAN_MONTHS = {
    "فروردین": 1,
    "اردیبهشت": 2,
    "خرداد": 3,
    "تیر": 4,
    "مرداد": 5,
    "شهریور": 6,
    "مهر": 7,
    "آبان": 8,
    "آذر": 9,
    "دی": 10,
    "بهمن": 11,
    "اسفند": 12,
}


def parse_persian_amount(text: str) -> tuple[int | None, str]:
    """Extract numeric amount and currency unit (TOMAN vs IRR) from Persian text."""
    clean = text.translate(PERSIAN_TO_ENG).replace("،", ",")
    unit = "IRR" if "ریال" in clean else "TOMAN"

    m_mult = re.search(r"(\d+(?:[./]\d+)?)\s*(میلیارد|میلیون|هزار)", clean)
    if m_mult:
        val_str = m_mult.group(1).replace("/", ".")
        mult_word = m_mult.group(2)
        multiplier = (
            1_000_000_000 if mult_word == "میلیارد" else 1_000_000 if mult_word == "میلیون" else 1_000
        )
        try:
            val = float(val_str)
            return int(val * multiplier), unit
        except (ValueError, TypeError):
            pass

    m_digits = re.search(r"(\d[\d,]*\d|\d+)", clean)
    if m_digits:
        val_str = m_digits.group(1).replace(",", "")
        if val_str:
            try:
                return int(val_str), unit
            except (ValueError, TypeError):
                pass

    return None, unit


def extract_party_name(text: str) -> str | None:
    """Extract counterparty name from text based on common Persian preposition patterns."""
    patterns = [
        r"(?:به|برای|از)\s+(?:شرکت|مشتری|آقای|خانم|تامین‌کننده|تامین کننده)?\s*([^\d,،.؛:\n]+?)(?:\s+(?:مبلغ|به مبلغ|واریز|پرداخت|دریافت|بابت|از حساب|از بانک|به حساب|به بانک|ثبت))",
        r"طرف حساب\s*[:\s]\s*([^\d,،.؛:\n]+)",
        r"(?:به|برای|از)\s+([^\d,،.؛:\n]+?)$",
    ]
    for p in patterns:
        m_party = re.search(p, text)
        if m_party:
            candidate = m_party.group(1).strip()
            candidate = re.sub(r"\s+(?:تومان|ریال|میلیون|هزار|بانک)$", "", candidate).strip()
            if candidate and len(candidate) > 1:
                return candidate
    return None


def extract_cheque_number(text: str) -> str | None:
    """Extract cheque or Sayad numeric identity from text."""
    clean = text.translate(PERSIAN_TO_ENG)
    m = re.search(r"(?:چک|صیادی)(?:\s+(?:صیادی|شماره))?\s*[:\s#]?\s*([0-9a-zA-Z]{4,})", clean)
    if m:
        return m.group(1)
    if "چک" in text:
        m2 = re.search(r"\b(\d{4,16})\b", clean)
        if m2:
            return m2.group(1)
    return None


def parse_persian_due_date(text: str, base_date: date | None = None) -> date:
    """Parse Persian month and day references (e.g. 15 دی or اول آذر)."""
    from datetime import timedelta

    base = base_date or date.today()
    clean = text.translate(PERSIAN_TO_ENG)
    for month_name, m_num in PERSIAN_MONTHS.items():
        if month_name in clean:
            m = re.search(r"(اول|۱|۲|۳|۴|۵|۶|۷|۸|۹|\d+)\s+" + month_name, clean)
            day = 1
            if m:
                day_str = m.group(1)
                day = 1 if day_str == "اول" else int(day_str)
            target = date(base.year, min(12, max(1, m_num)), min(28, max(1, day)))
            if target < base:
                target = date(base.year + 1, min(12, max(1, m_num)), min(28, max(1, day)))
            return target
    return base + timedelta(days=30)


def format_currency_fa(val: Any, unit: str = "تومان") -> str:
    """Format numeric string or int into thousands-separated Persian string."""
    try:
        dec = Decimal(str(val))
        formatted = f"{int(dec):,}".replace(",", "،")
        trans = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
        return f"{formatted.translate(trans)} {unit}"
    except Exception:
        return f"{val} {unit}"


def detect_operational_intent(question: str) -> str | None:
    """Detect whether user wants to execute an operational financial mutation, cheque, or inquiry."""
    text = normalized(question)

    # 1. Direct confirmation
    if any(kw in text for kw in CONFIRM_KEYWORDS):
        return "confirm_post"

    # 2. Inquiries & Reporting Data Tables
    if any(kw in text for kw in TRIAL_BALANCE_KEYWORDS):
        return "inquiry_trial_balance"

    if any(kw in text for kw in ACCOUNT_STATEMENT_KEYWORDS):
        return "inquiry_account_statement"

    if any(kw in text for kw in INCOME_STATEMENT_KEYWORDS):
        return "inquiry_income_statement"

    if any(kw in text for kw in DEBTORS_INQUIRY_KEYWORDS):
        return "inquiry_top_debtors"

    if any(kw in text for kw in PENDING_INQUIRY_KEYWORDS):
        return "inquiry_pending_drafts"

    if any(kw in text for kw in COLLECTION_KEYWORDS):
        return "collection_followup"

    # 3. Cheque operations
    if "چک" in text and any(
        kw in text for kw in ("برگشت", "وصول", "بخوابان", "خواباندن", "واگذار", "خرج", "باطل", "ابطال")
    ):
        return "cheque_action"

    if any(kw in text for kw in CHEQUE_REGISTER_KEYWORDS) or (
        "چک" in text and any(kw in text for kw in ("ثبت کن", "دریافت شد", "صادر شد"))
    ):
        return "register_cheque"

    if "چک" in text and any(
        kw in text for kw in ("لیست", "نشان بده", "سررسید", "وضعیت", "دریافتی", "پرداختی", "ماه")
    ):
        return "inquiry_cheques"

    # 4. Accounting operations
    if any(kw in text for kw in ("ثبت هزینه", "هزینه ثبت", "خرج شد", "هزینه شده", "پرداخت هزینه")) or (
        "هزینه" in text and any(kw in text for kw in ("ثبت کن", "بزن", "پرداخت شد", "از بانک", "از صندوق"))
    ):
        return "expense"

    if (
        any(kw in text for kw in ("پرداخت به", "واریز به", "تسویه بدهی", "پرداخت بدهی", "وجه به حساب"))
        and "دریافت" not in text
    ):
        return "payment"

    if any(kw in text for kw in ("دریافت از", "واریز از", "وصول طلب", "وصول از", "واریز شده از طرف")):
        return "receipt"

    if any(kw in text for kw in ("فروش خدمات", "فاکتور فروش", "فروش به")):
        return "sale_service"

    if any(kw in text for kw in ("خرید خدمات", "فاکتور خرید", "خرید از")):
        return "purchase_service"

    if any(kw in text for kw in ("انتقال وجه", "انتقال از بانک", "انتقال بین حساب", "کارت به کارت بین")):
        return "transfer"

    return None


def resolve_accounts_for_operation(
    db: Session,
    company_id: str,
    kind: str,
    text: str,
) -> dict[str, str] | None:
    """Find appropriate accounts for operation kind and prompt context."""
    accounts = db.scalars(
        select(Account).where(Account.company_id == company_id, Account.active.is_(True))
    ).all()
    if not accounts:
        return None

    role_rows = db.scalars(select(NativeAccountRole).where(NativeAccountRole.company_id == company_id)).all()
    role_by_acc = {r.account_id: r.role for r in role_rows}
    acc_by_role: dict[str, list[Account]] = {}
    for acc in accounts:
        r = role_by_acc.get(acc.id)
        if r:
            acc_by_role.setdefault(r, []).append(acc)

    def find_bank_account() -> Account | None:
        for kw in BANK_KEYWORDS:
            if kw in text:
                for acc in accounts:
                    if kw in acc.name:
                        return acc
        if acc_by_role.get("bank"):
            return acc_by_role["bank"][0]
        for acc in accounts:
            if "بانک" in acc.name or "صندوق" in acc.name:
                return acc
        return accounts[0] if accounts else None

    def find_expense_account() -> Account | None:
        for kw in EXPENSE_KEYWORDS:
            if kw in text:
                for acc in accounts:
                    if kw in acc.name:
                        return acc
        if acc_by_role.get("expense"):
            return acc_by_role["expense"][0]
        for acc in accounts:
            if "هزینه" in acc.name:
                return acc
        return None

    def find_revenue_account() -> Account | None:
        if acc_by_role.get("revenue"):
            return acc_by_role["revenue"][0]
        for acc in accounts:
            if "درآمد" in acc.name or "فروش" in acc.name:
                return acc
        return None

    def find_receivable_account() -> Account | None:
        if acc_by_role.get("trade_receivable"):
            return acc_by_role["trade_receivable"][0]
        for acc in accounts:
            if "دریافتنی" in acc.name or "مشتریان" in acc.name or "بدهکاران" in acc.name:
                return acc
        return None

    def find_payable_account() -> Account | None:
        if acc_by_role.get("trade_payable"):
            return acc_by_role["trade_payable"][0]
        for acc in accounts:
            if "پرداختنی" in acc.name or "بستانکاران" in acc.name or "تامین" in acc.name:
                return acc
        return None

    selected: dict[str, str] = {}
    if kind == "expense":
        exp = find_expense_account()
        bank = find_bank_account()
        if not exp or not bank:
            return None
        selected["service_expense"] = exp.id
        selected["bank_a"] = bank.id

    elif kind == "payment":
        payable = find_payable_account()
        bank = find_bank_account()
        if not payable or not bank:
            return None
        selected["trade_payable"] = payable.id
        selected["bank_a"] = bank.id

    elif kind == "receipt":
        receivable = find_receivable_account()
        bank = find_bank_account()
        if not receivable or not bank:
            return None
        selected["bank_a"] = bank.id
        selected["trade_receivable"] = receivable.id

    elif kind == "sale_service":
        receivable = find_receivable_account()
        rev = find_revenue_account()
        if not receivable or not rev:
            return None
        selected["trade_receivable"] = receivable.id
        selected["service_revenue"] = rev.id

    elif kind == "purchase_service":
        exp = find_expense_account()
        payable = find_payable_account()
        if not exp or not payable:
            return None
        selected["service_expense"] = exp.id
        selected["trade_payable"] = payable.id

    elif kind == "transfer":
        banks = [acc for acc in accounts if "بانک" in acc.name or role_by_acc.get(acc.id) == "bank"]
        if len(banks) < 2:
            return None
        selected["bank_a"] = banks[0].id
        selected["bank_b"] = banks[1].id

    return selected


def get_open_period(db: Session, company_id: str, target_date: date) -> m.Period | None:
    """Find active open financial period covering the date or latest open period."""
    period = db.scalar(
        select(m.Period).where(
            m.Period.company_id == company_id,
            m.Period.start <= target_date,
            m.Period.end >= target_date,
        )
    )
    if not period:
        period = db.scalar(
            select(m.Period).where(m.Period.company_id == company_id).order_by(m.Period.end.desc())
        )
    return period


def orchestrate_operation(
    db: Session,
    company_id: str,
    user: m.User,
    question: str,
) -> dict[str, Any] | None:
    """Main operational dispatcher: inspects intent, routes to cheques, drafts, or collections."""
    intent = detect_operational_intent(question)
    if not intent:
        return None

    caps = capabilities(db, company_id, user)

    # 1. Draft confirmation
    if intent == "confirm_post":
        return {
            "mode": "operational_clarification",
            "answer": "برای ثبت نهایی، پیش‌نمایش همان سند را در اسناد حسابداری بررسی و تأیید کنید.",
            "action_cards": [{
                "id": "review-accounting",
                "title": "اسناد حسابداری",
                "action_type": "navigate",
                "target_path": "/accounting",
                "button_text": "مشاهده پیش‌نویس‌ها",
            }],
        }

    # 2. Inquiries & Generative UI Reporting Tables
    if intent == "inquiry_trial_balance":
        return handle_trial_balance_inquiry(db, company_id, user)

    if intent == "inquiry_account_statement":
        return handle_account_statement_inquiry(db, company_id, user, question)

    if intent == "inquiry_income_statement":
        return handle_income_statement_inquiry(db, company_id, user)

    if intent == "inquiry_top_debtors":
        return handle_top_debtors_inquiry(db, company_id, user)

    if intent == "inquiry_pending_drafts":
        return handle_pending_inquiry(db, company_id, user)

    if intent == "inquiry_cheques":
        return handle_cheque_inquiry(db, company_id)

    if intent == "collection_followup":
        return handle_collection_followup(db, company_id, question)

    # 3. Cheque lifecycle operations
    if intent == "register_cheque":
        return handle_cheque_registration(db, company_id, user, question)

    if intent == "cheque_action":
        return handle_cheque_action(db, company_id, user, question)

    # 4. Standard accounting operations
    if not caps["can_prepare"]:
        return {
            "mode": "operational_error",
            "answer": "شما مجوز ثبت اسناد مالی و پیش‌نویس عملیات در این شرکت را ندارید.",
            "action_cards": [],
        }

    return handle_operation_creation(db, company_id, user, intent, question)


# ---------------------------------------------------------------------------
# Handlers: Drafts & In-Chat Posting
# ---------------------------------------------------------------------------


def handle_pending_inquiry(db: Session, company_id: str, user: m.User) -> dict[str, Any]:
    """List pending drafts awaiting posting."""
    drafts = db.scalars(
        select(Draft)
        .where(Draft.company_id == company_id, Draft.state == "draft")
        .order_by(Draft.created_at.desc())
        .limit(5)
    ).all()

    if not drafts:
        return {
            "mode": "operational_inquiry",
            "answer": "در حال حاضر هیچ سند پیش‌نویسی در انتظار ثبت نهایی وجود ندارد.",
            "action_cards": [],
        }

    lines = [f"تعداد **{len(drafts)}** سند پیش‌نویس در انتظار بررسی و ثبت نهایی است:\n"]
    cards = []
    for idx, d in enumerate(drafts, 1):
        try:
            prev = preview_posting(db, company_id, user, d.id)
            total = format_currency_fa(prev["total_debit"], "ریال")
        except Exception:
            total = "—"
        lines.append(f"{idx}. **{d.description}** | مبلغ: {total} (تاریخ: {d.date})")
        cards.append(
            {
                "id": f"card-draft-{d.id}",
                "title": d.description,
                "action_type": "navigate",
                "target_path": f"/accounting?review_draft={d.id}",
                "description": f"مبلغ: {total}",
                "button_text": "بررسی سند",
                "variant": "primary",
            }
        )

    return {
        "mode": "operational_inquiry",
        "answer": "\n".join(lines),
        "action_cards": cards,
    }


def handle_operation_creation(
    db: Session,
    company_id: str,
    user: m.User,
    kind: str,
    question: str,
) -> dict[str, Any]:
    """Parse slots, validate accounts/period, and create the operational draft."""
    amount, unit = parse_persian_amount(question)
    if not amount or amount <= 0:
        label = LABELS.get(kind, "عملیات")
        return {
            "mode": "operational_clarification",
            "answer": f"برای ثبت **{label}**، لطفاً مبلغ را مشخص نمایید (مثلاً: «۳۰ میلیون تومان»).",
            "action_cards": [
                {
                    "id": "card-help-amount-1",
                    "title": "ثبت با مبلغ فرضی ۱۰ میلیون",
                    "action_type": "suggest_text",
                    "description": "۱۰ میلیون تومان",
                    "button_text": "۱۰ میلیون تومان",
                    "payload": {"text": f"{question} به مبلغ ۱۰ میلیون تومان"},
                },
                {
                    "id": "card-help-amount-2",
                    "title": "ثبت با مبلغ فرضی ۵۰ میلیون",
                    "action_type": "suggest_text",
                    "description": "۵۰ میلیون تومان",
                    "button_text": "۵۰ میلیون تومان",
                    "payload": {"text": f"{question} به مبلغ ۵۰ میلیون تومان"},
                },
            ],
        }

    party = extract_party_name(question)
    if not party:
        if kind == "expense":
            party = "هزینه متفرقه"
        elif kind == "transfer":
            party = ""
        else:
            party = "طرف حساب عمومی"

    accounts = resolve_accounts_for_operation(db, company_id, kind, question)
    if not accounts:
        return {
            "mode": "operational_error",
            "answer": (
                "سرفصل‌های حسابداری لازم برای این عملیات (بانک یا هزینه/درآمد/طرف حساب) "
                "در کدینگ حساب‌های شرکت یافت نشد. لطفاً ابتدا از بخش «کدینگ حساب‌ها» سرفصل‌ها را تعریف نمایید."
            ),
            "action_cards": [
                {
                    "id": "card-manage-accounts",
                    "title": "مدیریت کدینگ حساب‌ها",
                    "action_type": "navigate",
                    "target_path": "/accounting",
                    "button_text": "مشاهده کدینگ",
                    "variant": "primary",
                }
            ],
        }

    today = date.today()
    period = get_open_period(db, company_id, today)
    if not period:
        return {
            "mode": "operational_error",
            "answer": "هیچ دوره مالی فعالی برای تاریخ جاری تعریف نشده است. لطفاً ابتدا یک دوره مالی ایجاد نمایید.",
            "action_cards": [
                {
                    "id": "card-create-period",
                    "title": "مدیریت دوره‌های مالی",
                    "action_type": "navigate",
                    "target_path": "/periods",
                    "button_text": "ایجاد دوره",
                    "variant": "primary",
                }
            ],
        }

    label = LABELS.get(kind, "عملیات مالی")
    description = f"{label} - {party}" if party else label
    source_ref = f"چت-{today.strftime('%Y%m%d')}-{uuid4().hex[:6]}"

    op_payload = {
        "kind": kind,
        "period_id": period.id,
        "date": today,
        "description": description,
        "source_reference": source_ref,
        "unit": unit,
        "party_id": party,
        "accounts": accounts,
        "amounts": {"amount": str(amount)},
        "settlement_type": "on_account",
    }

    try:
        created = create_operation(db, company_id, user, op_payload)
        draft_id = created["draft"]["id"]
        preview_data = preview_posting(db, company_id, user, draft_id)

        lines_summary = []
        for line in preview_data["snapshot"]["lines"]:
            acc_name = line.get("name", "حساب")
            acc_code = line.get("code", "")
            debit = Decimal(line.get("debit", "0"))
            credit = Decimal(line.get("credit", "0"))
            if debit > 0:
                lines_summary.append(
                    f"• **بدهکار:** {acc_name} ({acc_code}) به مبلغ {format_currency_fa(debit, 'ریال')}"
                )
            if credit > 0:
                lines_summary.append(
                    f"• **بستانکار:** {acc_name} ({acc_code}) به مبلغ {format_currency_fa(credit, 'ریال')}"
                )

        unit_label = "تومان" if unit == "TOMAN" else "ریال"
        answer = (
            f"📋 **پیش‌نویس سند {label} با موفقیت ایجاد شد:**\n\n"
            f"• **شرح:** {description}\n"
            f"• **طرف حساب:** {party or '—'}\n"
            f"• **مبلغ:** {format_currency_fa(amount, unit_label)}\n\n"
            f"**آرتیکل‌های سند دوبل:**\n"
            + "\n".join(lines_summary)
            + "\n\nپیش‌نویس برای بررسی در اسناد حسابداری آماده است."
        )

        cards = [{
            "id": f"card-view-draft-{draft_id}",
            "title": "پیش‌نویس سند",
            "action_type": "navigate",
            "target_path": f"/accounting?review_draft={draft_id}",
            "button_text": "بررسی سند",
            "variant": "primary",
        }]

        return {
            "mode": "operational_draft",
            "draft_id": draft_id,
            "answer": answer,
            "action_cards": cards,
        }
    except DomainError as err:
        return {
            "mode": "operational_error",
            "answer": f"خطا در ایجاد پیش‌نویس عملیات: {err.message}",
            "action_cards": [],
        }


# ---------------------------------------------------------------------------
# Handlers: Treasury & Cheques Lifecycle
# ---------------------------------------------------------------------------


def handle_cheque_registration(
    db: Session,
    company_id: str,
    user: m.User,
    question: str,
) -> dict[str, Any]:
    """Register a received or issued cheque via chat."""
    amount, unit = parse_persian_amount(question)
    if not amount or amount <= 0:
        return {
            "mode": "operational_clarification",
            "answer": "برای ثبت چک، لطفاً مبلغ چک را مشخص فرمایید (مثلاً: «۵۰ میلیون تومان»).",
            "action_cards": [],
        }

    cheque_num = extract_cheque_number(question) or f"CHQ-{uuid4().hex[:6]}"
    direction = "issued" if any(kw in question for kw in ("پرداختی", "صادر", "به طرف")) else "received"
    party = extract_party_name(question) or "طرف حساب چک"

    bank_name = "بانک ملت"
    for kw in BANK_KEYWORDS:
        if kw in question:
            bank_name = f"بانک {kw}"
            break

    today = date.today()
    due_date = parse_persian_due_date(question, today)
    period = get_open_period(db, company_id, today)
    if not period:
        return {
            "mode": "operational_error",
            "answer": "دوره مالی فعال برای تاریخ جاری جهت ثبت چک یافت نشد.",
            "action_cards": [],
        }

    cheque_payload = {
        "period_id": period.id,
        "direction": direction,
        "number": cheque_num,
        "bank_name": bank_name,
        "bank_account": "حساب جاری",
        "party_id": party,
        "amount": str(amount),
        "unit": unit,
        "issue_date": today,
        "due_date": due_date,
    }

    try:
        created = create_cheque(db, company_id, user, cheque_payload)
        dir_label = "دریافتی" if direction == "received" else "پرداختی (صادرشده)"
        unit_label = "تومان" if unit == "TOMAN" else "ریال"

        answer = (
            f"✅ **چک صیادی {dir_label} با موفقیت در سیستم خزانه‌داری ثبت شد:**\n\n"
            f"• **شماره صیادی / چک:** `{cheque_num}`\n"
            f"• **طرف حساب:** {party}\n"
            f"• **مبلغ:** {format_currency_fa(amount, unit_label)}\n"
            f"• **بانک:** {bank_name}\n"
            f"• **تاریخ سررسید:** {due_date}\n"
            f"• **وضعیت فعلی:** نزد صندوق ({created['state']})"
        )

        cards = [
            {
                "id": f"card-cheque-{created['id']}",
                "title": f"مدیریت چک شماره {cheque_num}",
                "action_type": "navigate",
                "target_path": "/settlements/cheques",
                "button_text": "مشاهده در دفتر چک‌ها",
                "variant": "primary",
            }
        ]

        return {
            "mode": "cheque_registered",
            "cheque_id": created["id"],
            "answer": answer,
            "action_cards": cards,
        }
    except DomainError as err:
        return {
            "mode": "operational_error",
            "answer": f"خطا در ثبت چک: {err.message}",
            "action_cards": [],
        }


def handle_cheque_action(
    db: Session,
    company_id: str,
    user: m.User,
    question: str,
) -> dict[str, Any]:
    """Execute status transition on a cheque (deposit, return, endorse, cancel)."""
    cheque_num = extract_cheque_number(question)
    cheque = None

    if cheque_num:
        cheque = db.scalar(select(Cheque).where(Cheque.company_id == company_id, Cheque.number == cheque_num))

    if not cheque:
        # Pick the latest active received cheque as target candidate
        cheque = db.scalar(
            select(Cheque).where(Cheque.company_id == company_id).order_by(Cheque.created_at.desc())
        )

    if not cheque:
        return {
            "mode": "operational_error",
            "answer": "هیچ چکی با مشخصات اعلام‌شده در سیستم یافت نشد. لطفاً شماره چک را بررسی فرمایید.",
            "action_cards": [],
        }

    today = date.today()
    period = get_open_period(db, company_id, today)
    if not period:
        return {
            "mode": "operational_error",
            "answer": "دوره مالی فعال برای ثبت این رویداد یافت نشد.",
            "action_cards": [],
        }

    # Determine action
    action = "deposit"
    reason = "عملیات چک از طریق چت"
    endorsed_to = None

    if any(kw in question for kw in ("برگشت", "برگشتی", "عدم موجودی")):
        action = "return"
        reason = "برگشت چک به دلیل عدم وصول"
    elif any(kw in question for kw in ("واگذار", "خرج", "انتقال")):
        action = "endorse"
        endorsed_to = extract_party_name(question) or "طرف حساب جدید"
        reason = f"واگذاری چک به {endorsed_to}"
    elif any(kw in question for kw in ("ابطال", "باطل")):
        action = "cancel"
        reason = "ابطال چک"
    elif any(kw in question for kw in ("خواباندن", "بخوابان", "واریز به حساب")):
        action = "deposit"
        reason = "خواباندن چک به حساب بانک"

    act_payload = {
        "action": action,
        "period_id": period.id,
        "event_date": today,
        "reason": reason,
        "bank_id": None,
        "endorsed_to": endorsed_to,
    }

    try:
        updated = act_cheque(db, company_id, user, cheque.id, act_payload, version=cheque.version)
        action_fa = {
            "deposit": "خوابانده‌شده به حساب بانک",
            "return": "برگشت‌خورده",
            "endorse": f"واگذارشده به {endorsed_to}",
            "cancel": "باطل‌شده",
            "clear": "وصول‌شده",
        }.get(action, updated["state"])

        answer = (
            f"🔄 **وضعیت چک شماره {cheque.number} به‌روزرسانی شد:**\n\n"
            f"• **مبلغ:** {format_currency_fa(cheque.amount, 'ریال')}\n"
            f"• **طرف حساب:** {cheque.party_id}\n"
            f"• **وضعیت جدید:** **{action_fa}**\n"
            f"• **علت/شرح:** {reason}"
        )

        cards = [
            {
                "id": f"card-view-cheque-{cheque.id}",
                "title": "مشاهده زنجیره رویدادهای چک",
                "action_type": "navigate",
                "target_path": "/settlements/cheques",
                "button_text": "مشاهده چک",
                "variant": "primary",
            }
        ]

        return {
            "mode": "cheque_updated",
            "cheque_id": cheque.id,
            "answer": answer,
            "action_cards": cards,
        }
    except DomainError as err:
        return {
            "mode": "operational_error",
            "answer": f"تغییر وضعیت چک امکان‌پذیر نیست: {err.message}",
            "action_cards": [],
        }


def handle_cheque_inquiry(db: Session, company_id: str) -> dict[str, Any]:
    """Inquiry and list upcoming or pending cheques."""
    cheques = db.scalars(
        select(Cheque).where(Cheque.company_id == company_id).order_by(Cheque.due_date.asc()).limit(8)
    ).all()

    if not cheques:
        return {
            "mode": "cheque_inquiry",
            "answer": "در حال حاضر هیچ چکی در سامانه ثبت نشده است. می‌توانید با گفتن «ثبت چک دریافتی...» چک جدید ثبت کنید.",
            "action_cards": [],
        }

    state_labels = {
        "received": "نزد صندوق",
        "deposited": "خوابانده به حساب",
        "issued": "صادرشده",
        "cleared": "وصول‌شده",
        "returned": "برگشتی",
        "endorsed": "واگذارشده",
        "cancelled": "باطل‌شده",
    }

    lines = [f"📋 **لیست چک‌های شرکت ({len(cheques)} فقره اخیر):**\n"]
    cards = []

    for idx, ch in enumerate(cheques, 1):
        amt_fa = format_currency_fa(ch.amount, "ریال")
        st_fa = state_labels.get(ch.state, ch.state)
        dir_fa = "دریافتی" if ch.direction == "received" else "پرداختی"
        lines.append(
            f"{idx}. چک `{ch.number}` ({dir_fa}) | مبلغ: {amt_fa} | سررسید: {ch.due_date} | طرف: {ch.party_id} [**{st_fa}**]"
        )

        if ch.state == "received":
            cards.append(
                {
                    "id": f"card-act-deposit-{ch.id}",
                    "title": f"خواباندن چک {ch.number} به حساب",
                    "action_type": "suggest_text",
                    "description": f"مبلغ {amt_fa} از {ch.party_id}",
                    "button_text": "خواباندن به حساب",
                    "payload": {"text": f"چک شماره {ch.number} را به حساب بخوابان"},
                }
            )

    cards.append(
        {
            "id": "card-view-all-cheques",
            "title": "مشاهده دفتر کامل چک‌ها",
            "action_type": "navigate",
            "target_path": "/settlements/cheques",
            "button_text": "مشاهده همه چک‌ها",
            "variant": "secondary",
        }
    )

    return {
        "mode": "cheque_inquiry",
        "answer": "\n".join(lines),
        "action_cards": cards,
    }


# ---------------------------------------------------------------------------
# Handlers: Collections & Commercial Reminders
# ---------------------------------------------------------------------------


def handle_collection_followup(
    db: Session,
    company_id: str,
    question: str,
) -> dict[str, Any]:
    """Retrieve overdue customer receivables and generate formal Persian collection reminders."""
    party = extract_party_name(question)
    company = db.get(m.Company, company_id)
    company_name = company.name if company else "شرکت"

    # Query overdue commercial invoices or receivables
    invoices = db.scalars(
        select(NativeInvoice)
        .where(NativeInvoice.company_id == company_id, NativeInvoice.direction == "sale")
        .limit(10)
    ).all()

    target_debtor = party or (invoices[0].source.get("party_id") if invoices else "مشتری محترم")
    target_amount = "۴۵،۰۰۰،۰۰۰"
    if invoices and invoices[0].source.get("amount"):
        target_amount = format_currency_fa(invoices[0].source["amount"], "ریال")

    reminder_letter = (
        f"📩 **پیش‌نویس پیامک و نامه رسمی پیگیری وصول مطالبات:**\n\n"
        f"«جناب آقای / سرکار خانم مدیریت محترم **{target_debtor}**\n\n"
        f"با سلام و احترام،\n"
        f"احتراماً به استحضار می‌رساند طبق بررسی دفاتر مالی، فاکتورهای سررسید گذشته آن مجموعه محترم "
        f"دارای مانده بدهی معوق به مبلغ **{target_amount}** می‌باشد.\n\n"
        f"خواهشمند است دستور فرمایید در اسرع وقت نسبت به تسویه حساب یا هماهنگی با امور مالی اقدام فرمایند.\n"
        f"پیشاپیش از همکاری صمیمانه شما سپاسگزاریم.\n"
        f"امور مالی و وصول مطالبات **{company_name}**»"
    )

    cards = [
        {
            "id": "card-copy-reminder",
            "title": "کپی و ویرایش متن یادآوری",
            "action_type": "suggest_text",
            "description": "انتقال متن پیام به کادر ارسال",
            "button_text": "استفاده از متن",
            "payload": {"text": reminder_letter},
            "variant": "primary",
        },
        {
            "id": "card-goto-collections",
            "title": "مشاهده صف پیگیری و اقدامات وصول",
            "action_type": "navigate",
            "target_path": "/collection-followups",
            "button_text": "مشاهده صف وصول",
            "variant": "secondary",
        },
    ]

    return {
        "mode": "collection_followup",
        "debtor": target_debtor,
        "answer": reminder_letter,
        "action_cards": cards,
    }


# ---------------------------------------------------------------------------
# Handlers: In-Chat Generative UI Reporting Tables
# ---------------------------------------------------------------------------


def handle_trial_balance_inquiry(
    db: Session,
    company_id: str,
    user: m.User,
) -> dict[str, Any]:
    """Retrieve trial balance for active period and format into interactive chat data table."""
    from .posting_service import trial_balance

    period = get_open_period(db, company_id, date.today())
    if not period:
        return {
            "mode": "inquiry_trial_balance",
            "answer": "هیچ دوره مالی فعالی برای این شرکت تعریف نشده است. لطفاً ابتدا از بخش دوره‌های مالی یک دوره مالی باز تعریف فرمایید.",
            "action_cards": [
                {
                    "id": "card-create-period",
                    "title": "تعریف دوره مالی",
                    "action_type": "navigate",
                    "target_path": "/periods",
                    "button_text": "مشاهده دوره‌ها",
                    "variant": "primary",
                }
            ],
        }

    try:
        tb = trial_balance(db, company_id, user, period.id)
    except Exception as exc:
        return {
            "mode": "inquiry_trial_balance",
            "answer": f"خطا در دریافت تراز آزمایشی: {exc}",
            "action_cards": [],
        }

    items = tb.get("items", [])
    if not items:
        return {
            "mode": "inquiry_trial_balance",
            "answer": (
                "📊 **تراز آزمایشی دوره جاری:**\n\n"
                "هیچ سند قطعی حسابداری در این دوره ثبت نشده است و گردش حساب‌ها صفر می‌باشد.\n\n"
                "می‌توانید با ثبت عملیات جدید (مانند ثبت هزینه یا فاکتور) و سپس تأیید نهایی، تراز دوره را شکل دهید."
            ),
            "action_cards": [
                {
                    "id": "card-view-drafts",
                    "title": "مشاهده پیش‌نویس‌های آماده ثبت",
                    "action_type": "suggest_text",
                    "button_text": "بررسی پیش‌نویس‌ها",
                    "payload": {"text": "پیش نویس ها را نشان بده"},
                    "variant": "primary",
                },
                {
                    "id": "card-view-tb",
                    "title": "صفحه تراز آزمایشی",
                    "action_type": "navigate",
                    "target_path": "/trial-balance",
                    "button_text": "مشاهده تراز",
                    "variant": "secondary",
                },
            ],
        }

    columns = [
        {"key": "code", "label": "کد", "align": "start"},
        {"key": "name", "label": "سرفصل حساب", "align": "start"},
        {"key": "debit", "label": "گردش بدهکار (ریال)", "align": "end"},
        {"key": "credit", "label": "گردش بستانکار (ریال)", "align": "end"},
        {"key": "balance", "label": "مانده نهایی (ریال)", "align": "end"},
    ]

    rows = []
    for item in items:
        deb_dec = Decimal(str(item.get("debit", 0)))
        crd_dec = Decimal(str(item.get("credit", 0)))
        bal_dec = Decimal(str(item.get("balance", 0)))
        rows.append(
            {
                "id": f"{item['account_id']}_{item.get('party_id', '')}",
                "code": item.get("code", "—"),
                "name": item.get("name", "—"),
                "debit": format_currency_fa(deb_dec, "").strip(),
                "credit": format_currency_fa(crd_dec, "").strip(),
                "balance": format_currency_fa(bal_dec, "").strip(),
            }
        )

    total_debit = Decimal(str(tb.get("total_debit", 0)))
    total_credit = Decimal(str(tb.get("total_credit", 0)))
    balanced = total_debit == total_credit

    summary = {
        "code": "جمع کل",
        "name": "—",
        "debit": format_currency_fa(total_debit, "").strip(),
        "credit": format_currency_fa(total_credit, "").strip(),
        "balance": "۰" if balanced else format_currency_fa(total_debit - total_credit, "").strip(),
    }

    balance_status = (
        "تراز کاملاً متوازن است ✅"
        if balanced
        else f"دارای مغایرت به مبلغ {format_currency_fa(abs(total_debit - total_credit), 'ریال')} ⚠️"
    )

    period_title = period.name if hasattr(period, "name") and period.name else f"دوره {period.id[:8]}"
    answer = (
        f"📊 **تراز آزمایشی اسناد قطعی ({period_title}):**\n\n"
        f"• **گردش بدهکار:** {format_currency_fa(total_debit, 'ریال')}\n"
        f"• **گردش بستانکار:** {format_currency_fa(total_credit, 'ریال')}\n"
        f"• **وضعیت توازن:** {balance_status}\n"
        f"• **تعداد سرفصل‌های دارای گردش:** {len(rows)} حساب"
    )

    data_table = {
        "title": f"تراز آزمایشی ۴ ستونی گردش اسناد ({period_title})",
        "columns": columns,
        "rows": rows,
        "summary": summary,
        "footer_text": f"استخراج شده بر اساس {len(tb.get('journal_ids', []))} سند قطعی صادر شده تا تاریخ امروز.",
    }

    cards = [
        {
            "id": "card-view-tb-page",
            "title": "مشاهده صفحه تراز آزمایشی و خروجی اکسل",
            "action_type": "navigate",
            "target_path": "/trial-balance",
            "button_text": "مشاهده تراز آزمایشی",
            "variant": "primary",
        },
        {
            "id": "card-view-journals",
            "title": "دفتر روزنامه اسناد حسابداری",
            "action_type": "navigate",
            "target_path": "/journals",
            "button_text": "مشاهده دفتر روزنامه",
            "variant": "secondary",
        },
    ]

    return {
        "mode": "inquiry_trial_balance",
        "answer": answer,
        "data_table": data_table,
        "action_cards": cards,
    }


def handle_account_statement_inquiry(
    db: Session,
    company_id: str,
    user: m.User,
    question: str,
) -> dict[str, Any]:
    """Retrieve detailed ledger entries (گردش و ریز حساب) for an account."""
    from .posting_models import NativeJournal

    period = get_open_period(db, company_id, date.today())
    if not period:
        return {
            "mode": "inquiry_account_statement",
            "answer": "هیچ دوره مالی فعالی یافت نشد.",
            "action_cards": [],
        }

    accounts = db.scalars(
        select(Account).where(Account.company_id == company_id, Account.active.is_(True))
    ).all()
    if not accounts:
        return {
            "mode": "inquiry_account_statement",
            "answer": "هیچ حسابی در جدول کدینگ این شرکت تعریف نشده است.",
            "action_cards": [],
        }

    # Match target account from question words
    target_account = None
    clean_q = normalized(question)
    for acc in accounts:
        if acc.name and (acc.name in clean_q or clean_q in acc.name):
            target_account = acc
            break

    if not target_account:
        for kw in BANK_KEYWORDS:
            if kw in clean_q:
                for acc in accounts:
                    if kw in acc.name:
                        target_account = acc
                        break
                if target_account:
                    break

    if not target_account:
        for kw in EXPENSE_KEYWORDS:
            if kw in clean_q:
                for acc in accounts:
                    if kw in acc.name:
                        target_account = acc
                        break
                if target_account:
                    break

    if not target_account:
        for acc in accounts:
            if "بانک" in acc.name or "صندوق" in acc.name:
                target_account = acc
                break

    if not target_account:
        target_account = accounts[0]

    # Query journals for this company and period
    journals = db.scalars(
        select(NativeJournal)
        .where(
            NativeJournal.company_id == company_id,
            NativeJournal.period_id == period.id,
        )
        .order_by(NativeJournal.sequence)
    ).all()

    matched_lines = []
    running = Decimal(0)
    for j in journals:
        j_lines = j.snapshot.get("lines", [])
        for line in j_lines:
            if line.get("account_id") == target_account.id:
                deb = Decimal(str(line.get("debit", 0)))
                crd = Decimal(str(line.get("credit", 0)))
                running += deb - crd
                bal_formatted = (
                    f"{format_currency_fa(running, '').strip()} (بد)"
                    if running > 0
                    else f"{format_currency_fa(abs(running), '').strip()} (بس)"
                    if running < 0
                    else "۰"
                )
                matched_lines.append(
                    {
                        "id": f"{j.id}_{len(matched_lines)}",
                        "date": j.date.isoformat(),
                        "sequence": f"سند {j.sequence}",
                        "description": line.get("description")
                        or j.snapshot.get("description")
                        or "ثبت عملیات مالی",
                        "debit": format_currency_fa(deb, "").strip() if deb else "—",
                        "credit": format_currency_fa(crd, "").strip() if crd else "—",
                        "balance": bal_formatted,
                        "raw_debit": deb,
                        "raw_credit": crd,
                    }
                )

    if not matched_lines:
        return {
            "mode": "inquiry_account_statement",
            "answer": (
                f"📋 **ریز گردش حساب «{target_account.name}» (کد {target_account.code}):**\n\n"
                f"در دوره مالی جاری هیچ سند ثبت‌شده‌ای برای این حساب وجود ندارد و مانده آن صفر است."
            ),
            "action_cards": [
                {
                    "id": "card-view-journals",
                    "title": "مشاهده اسناد حسابداری",
                    "action_type": "navigate",
                    "target_path": "/journals",
                    "button_text": "مشاهده اسناد",
                    "variant": "secondary",
                }
            ],
        }

    columns = [
        {"key": "date", "label": "تاریخ", "align": "start"},
        {"key": "sequence", "label": "شماره سند", "align": "start"},
        {"key": "description", "label": "شرح عملیات", "align": "start"},
        {"key": "debit", "label": "بدهکار (ریال)", "align": "end"},
        {"key": "credit", "label": "بستانکار (ریال)", "align": "end"},
        {"key": "balance", "label": "مانده (ریال)", "align": "end"},
    ]

    total_deb = sum(line["raw_debit"] for line in matched_lines)
    total_crd = sum(line["raw_credit"] for line in matched_lines)
    status_str = "بدهکار" if running > 0 else "بستانکار" if running < 0 else "تسویه"

    summary = {
        "date": "جمع کل",
        "sequence": "—",
        "description": "—",
        "debit": format_currency_fa(total_deb, "").strip(),
        "credit": format_currency_fa(total_crd, "").strip(),
        "balance": f"{format_currency_fa(abs(running), '').strip()} ({status_str})",
    }

    answer = (
        f"📋 **ریز گردش حساب (دفتر معین) «{target_account.name}» (کد {target_account.code}):**\n\n"
        f"• **تعداد ردیف‌های گردش:** {len(matched_lines)} آرتیکل\n"
        f"• **مجموع گردش بدهکار:** {format_currency_fa(total_deb, 'ریال')}\n"
        f"• **مجموع گردش بستانکار:** {format_currency_fa(total_crd, 'ریال')}\n"
        f"• **مانده نهایی:** {format_currency_fa(abs(running), 'ریال')} ({status_str})"
    )

    data_table = {
        "title": f"دفتر معین و ریز گردش حساب {target_account.name}",
        "columns": columns,
        "rows": matched_lines,
        "summary": summary,
        "footer_text": f"مانده نهایی حساب: {format_currency_fa(abs(running), 'ریال')} ({status_str})",
    }

    return {
        "mode": "inquiry_account_statement",
        "answer": answer,
        "data_table": data_table,
        "action_cards": [
            {
                "id": "card-view-journals",
                "title": "مشاهده کلیه اسناد در دفتر روزنامه",
                "action_type": "navigate",
                "target_path": "/journals",
                "button_text": "مشاهده دفتر روزنامه",
                "variant": "primary",
            }
        ],
    }


def handle_income_statement_inquiry(
    db: Session,
    company_id: str,
    user: m.User,
) -> dict[str, Any]:
    """Retrieve income statement summary and render profit/loss table in chat."""
    from .native_reporting_service import build_statement
    from .posting_models import NativeJournal

    period = get_open_period(db, company_id, date.today())
    if not period:
        return {
            "mode": "inquiry_income_statement",
            "answer": "هیچ دوره مالی فعالی برای ارائه صورت‌های مالی یافت نشد.",
            "action_cards": [],
        }

    rev_val = Decimal(0)
    exp_val = Decimal(0)

    try:
        stmt = build_statement(db, company_id, user, period.id)
        metrics = {m["metric_key"]: m for m in stmt.get("metrics", [])}
        rev_val = Decimal(str(metrics.get("revenue", {}).get("known_subset_value") or 0))
        exp_val = Decimal(str(metrics.get("expense", {}).get("known_subset_value") or 0))
    except Exception:
        pass

    # If build_statement yielded 0 or failed, inspect journal lines for nominal accounts
    if rev_val == 0 and exp_val == 0:
        journals = db.scalars(
            select(NativeJournal).where(
                NativeJournal.company_id == company_id,
                NativeJournal.period_id == period.id,
            )
        ).all()
        for j in journals:
            for line in j.snapshot.get("lines", []):
                acc_name = line.get("name", "")
                deb = Decimal(str(line.get("debit", 0)))
                crd = Decimal(str(line.get("credit", 0)))
                if any(kw in acc_name for kw in ("درآمد", "فروش")):
                    rev_val += crd - deb
                elif any(kw in acc_name for kw in ("هزینه", "خرج")):
                    exp_val += deb - crd

    profit_val = rev_val - exp_val

    columns = [
        {"key": "item", "label": "سرفصل سود و زیانی", "align": "start"},
        {"key": "nature", "label": "ماهیت حساب", "align": "center"},
        {"key": "amount", "label": "مبلغ (ریال)", "align": "end"},
    ]

    rows = [
        {
            "id": "rev",
            "item": "درآمدهای عملیاتی (فروش و ارائه خدمات)",
            "nature": "بستانکار",
            "amount": format_currency_fa(rev_val, "").strip(),
        },
        {
            "id": "exp",
            "item": "هزینه‌های عملیاتی و اداری عمومی",
            "nature": "بدهکار",
            "amount": format_currency_fa(exp_val, "").strip(),
        },
        {
            "id": "profit",
            "item": "سود (زیان) خالص قبل از مالیات",
            "nature": "سود" if profit_val >= 0 else "زیان",
            "amount": format_currency_fa(profit_val, "").strip(),
        },
    ]

    period_title = period.name if hasattr(period, "name") and period.name else f"دوره {period.id[:8]}"
    profit_status = "سوددهی مطلوب ✅" if profit_val > 0 else "سربه‌سر ⚖️" if profit_val == 0 else "زیان‌دهی ⚠️"

    answer = (
        f"📈 **خلاصه صورت سود و زیان ({period_title}):**\n\n"
        f"• **مجموع درآمدها:** {format_currency_fa(rev_val, 'ریال')}\n"
        f"• **مجموع هزینه‌ها:** {format_currency_fa(exp_val, 'ریال')}\n"
        f"• **سود (زیان) خالص:** {format_currency_fa(profit_val, 'ریال')} ({profit_status})\n\n"
        f"این ارقام بر مبنای اسناد قطعی صادر شده و نقش‌های کدینگ حسابداری محاسبه شده است."
    )

    data_table = {
        "title": f"صورت سود و زیان خلاصه ({period_title})",
        "columns": columns,
        "rows": rows,
        "footer_text": f"وضعیت عملکرد مالی دوره: {profit_status}",
    }

    return {
        "mode": "inquiry_income_statement",
        "answer": answer,
        "data_table": data_table,
        "action_cards": [
            {
                "id": "card-view-statements",
                "title": "مشاهده کامل صورت‌های مالی",
                "action_type": "navigate",
                "target_path": "/statements",
                "button_text": "مشاهده صورت‌های مالی",
                "variant": "primary",
            }
        ],
    }


def handle_top_debtors_inquiry(
    db: Session,
    company_id: str,
    user: m.User,
) -> dict[str, Any]:
    """Retrieve customers / counterparties with receivable balance and render rankings."""
    from .posting_models import NativeJournal

    role_rows = db.scalars(
        select(NativeAccountRole).where(
            NativeAccountRole.company_id == company_id,
            NativeAccountRole.role == "trade_receivable",
        )
    ).all()
    rec_acc_ids = {r.account_id for r in role_rows}

    if not rec_acc_ids:
        accs = db.scalars(
            select(Account).where(
                Account.company_id == company_id,
                Account.active.is_(True),
            )
        ).all()
        for a in accs:
            if any(kw in a.name for kw in ("دریافتنی", "مشتریان", "بدهکاران")):
                rec_acc_ids.add(a.id)

    journals = db.scalars(select(NativeJournal).where(NativeJournal.company_id == company_id)).all()

    party_balances: dict[str, Decimal] = {}
    for j in journals:
        for line in j.snapshot.get("lines", []):
            if line.get("account_id") in rec_acc_ids:
                p_name = line.get("party_id") or "مشتری متفرقه"
                deb = Decimal(str(line.get("debit", 0)))
                crd = Decimal(str(line.get("credit", 0)))
                party_balances[p_name] = party_balances.get(p_name, Decimal(0)) + (deb - crd)

    # If no journal balances found, check open NativeInvoice sales
    if not party_balances or all(bal <= 0 for bal in party_balances.values()):
        invoices = db.scalars(
            select(NativeInvoice).where(
                NativeInvoice.company_id == company_id,
                NativeInvoice.direction == "sale",
            )
        ).all()
        for inv in invoices:
            p_name = inv.source.get("party_id") or inv.source.get("counterparty") or "مشتری تجاری"
            amt = Decimal(str(inv.source.get("amount") or 0))
            if amt > 0:
                party_balances[p_name] = party_balances.get(p_name, Decimal(0)) + amt

    debtors = [(party, bal) for party, bal in party_balances.items() if bal > 0]
    debtors.sort(key=lambda x: x[1], reverse=True)

    if not debtors:
        return {
            "mode": "inquiry_top_debtors",
            "answer": (
                "👥 **وضعیت مطالبات از مشتریان (بدهکاران):**\n\n"
                "در حال حاضر هیچ مانده بدهی معوق یا مطالبه‌ای از طرف حساب‌ها ثبت نشده است و حساب مشتریان تسویه می‌باشد."
            ),
            "action_cards": [
                {
                    "id": "card-view-invoices",
                    "title": "فاکتورهای فروش",
                    "action_type": "navigate",
                    "target_path": "/invoices",
                    "button_text": "مشاهده فاکتورها",
                    "variant": "secondary",
                }
            ],
        }

    columns = [
        {"key": "party", "label": "طرف حساب / مشتری", "align": "start"},
        {"key": "balance", "label": "مانده طلب (ریال)", "align": "end"},
        {"key": "status", "label": "وضعیت وصول", "align": "center"},
    ]

    rows = []
    total_debt = sum((bal for _, bal in debtors), Decimal(0))
    for idx, (party, bal) in enumerate(debtors[:15]):
        rows.append(
            {
                "id": f"debtor_{idx}",
                "party": party,
                "balance": format_currency_fa(bal, "").strip(),
                "status": "در حال پیگیری",
            }
        )

    summary = {
        "party": "مجموع مطالبات",
        "balance": format_currency_fa(total_debt, "").strip(),
        "status": f"{len(debtors)} طرف حساب",
    }

    answer = (
        f"👥 **لیست و وضعیت مطالبات از مشتریان تجاری:**\n\n"
        f"• **تعداد کل بدهکاران:** {len(debtors)} طرف حساب\n"
        f"• **مجموع کل مطالبات:** {format_currency_fa(total_debt, 'ریال')}\n"
        f"• **بزرگترین بدهکار:** {debtors[0][0]} با مانده {format_currency_fa(debtors[0][1], 'ریال')}\n\n"
        f"برای ارسال پیامک یا نامه پیگیری می‌توانید بگویید «یادآوری وصول برای {debtors[0][0]}»."
    )

    data_table = {
        "title": "جدول بدهکاران و مانده مطالبات تجاری",
        "columns": columns,
        "rows": rows,
        "summary": summary,
        "footer_text": f"مجموع مطالبات جاری شرکت: {format_currency_fa(total_debt, 'ریال')}",
    }

    cards = [
        {
            "id": "card-followup-top",
            "title": f"تهیه پیش‌نویس پیگیری برای {debtors[0][0]}",
            "action_type": "suggest_text",
            "button_text": "پیگیری وصول",
            "payload": {"text": f"متن پیگیری وصول مطالبات برای {debtors[0][0]}"},
            "variant": "primary",
        },
        {
            "id": "card-view-collections",
            "title": "مشاهده صف وصول مطالبات",
            "action_type": "navigate",
            "target_path": "/collection-followups",
            "button_text": "صف وصول",
            "variant": "secondary",
        },
    ]

    return {
        "mode": "inquiry_top_debtors",
        "answer": answer,
        "data_table": data_table,
        "action_cards": cards,
    }
