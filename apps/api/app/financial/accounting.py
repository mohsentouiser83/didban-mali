"""Source-independent accounting semantics. Codes are identifiers, not account types."""

import json
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

import jdatetime

from app.financial.models import AccountClass


def words(value: str) -> str:
    value = value.replace("ي", "ی").replace("ك", "ک").replace("\u200c", " ").replace("ـ", "")
    return re.sub(r"\s+", " ", value).strip()


def classify_account(name: str) -> AccountClass:
    name = words(name)
    rules = (
        (AccountClass.OTHER, ("تراز افتتاح", "تراز اختتام")),
        (
            AccountClass.ASSET,
            (
                "پیش پرداخت",
                "اعتبار ارزش افزوده",
                "بدهکاران",
                "دریافتنی",
                "موجودی",
                "اموال",
                "اثاثیه",
                "دارایی",
                "بانک",
                "بانك",
                "صندوق",
                "تنخواه",
                "سپرده",
            ),
        ),
        (
            AccountClass.LIABILITY,
            (
                "پیش دریافت",
                "پرداختنی",
                "بستانکاران",
                "بدهی",
                "تسهیلات",
                "وام",
                "مالیات ارزش افزوده فروش",
                "جاری شرکا",
            ),
        ),
        (AccountClass.EQUITY, ("سرمایه", "اندوخته", "سود و زیان", "سود وزیان", "حقوق مالکانه")),
        (AccountClass.EXPENSE, ("هزینه", "بهای تمام", "خرید", "حقوق و دستمزد", "اجاره", "استهلاک")),
        (AccountClass.REVENUE, ("درآمد", "فروش", "سود بانکی", "کارمزد دریافتی")),
    )
    for account_class, keywords in rules:
        if any(keyword in name for keyword in keywords):
            return account_class
    return AccountClass.OTHER


def account_role(name: str) -> str:
    name = words(name)
    if name in {"سود و زیان جاری", "سود وزیان جاری"}:
        return "current_earnings"
    if name in {"سود و زیان انباشته", "سود وزیان انباشته"}:
        return "retained_earnings"
    if "مالیات عملکرد پرداختنی" in name:
        return "income_tax_payable"
    if any(x in name for x in ("بستانکاران", "تامین کنندگان")):
        return "trade_payable"
    if any(x in name for x in ("بدهکاران", "حسابهای دریافتنی", "حساب های دریافتنی")):
        return "trade_receivable"
    if classify_account(name) == AccountClass.ASSET and name.startswith(
        ("بانک", "صندوق", "تنخواه", "حساب بانک")
    ):
        return "cash"
    if "موجودی" in name:
        return "inventory"
    if "خرید" in name and "ارزش افزوده" not in name:
        return "purchases"
    return "other"


ENTRY_TYPES = {"normal", "opening", "closing", "income_closing", "profit_allocation", "adjustment"}


def prepare_accounting_row(values: dict[str, object]) -> dict[str, object]:
    result = dict(values)

    def text(key: str) -> str:
        value = values.get(key)
        return "" if value is None else str(value).strip()

    hierarchy = [text(f"{level}_code") for level in ("general", "subsidiary", "detail")]
    if any(hierarchy):
        if not hierarchy[0] or (hierarchy[2] and not hierarchy[1]):
            raise ValueError("کد کل و مسیر معین/تفصیلی کامل نیست.")
        for level in ("general", "subsidiary", "detail"):
            if text(f"{level}_code") and not text(f"{level}_name"):
                raise ValueError("نام سطح حساب دارای کد، خالی است.")
        result["account_code"] = json.dumps(hierarchy, ensure_ascii=False, separators=(",", ":"))
        result["account_name"] = next(
            text(f"{level}_name")
            for level in ("detail", "subsidiary", "general")
            if text(f"{level}_name")
        )
    if (
        not str(result.get("account_code", "")).strip()
        or not str(result.get("account_name", "")).strip()
    ):
        raise ValueError("کد و نام حساب الزامی است.")
    if len(str(result["account_code"])) > 160:
        raise ValueError("مسیر کد حساب بیش از حد طولانی است.")
    semantic_name = text("general_name") or str(result["account_name"])
    result["account_role"] = account_role(semantic_name)
    if not text("description"):
        result["description"] = " / ".join(
            text(f"{level}_name")
            for level in ("general", "subsidiary", "detail")
            if text(f"{level}_name")
        ) or str(result["account_name"])
    if not text("counterparty_name") and result["account_role"] in {
        "trade_payable",
        "trade_receivable",
    }:
        party = text("detail_name") or text("subsidiary_name")
        if party:
            result["counterparty_name"] = party
    if text("entry_type"):
        kinds = {
            "عادی": "normal",
            "افتتاحیه": "opening",
            "اختتامیه": "closing",
            "بستن حسابهای موقت": "income_closing",
            "تخصیص سود": "profit_allocation",
            "تعدیلی": "adjustment",
        }
        kind = kinds.get(words(text("entry_type")), text("entry_type"))
        if kind not in ENTRY_TYPES:
            raise ValueError("نوع سند معتبر نیست.")
        result["entry_type"] = kind
    return result


@dataclass(frozen=True)
class EntryLine:
    account_key: str
    account_name: str
    account_class: AccountClass
    role: str
    debit: Decimal
    credit: Decimal


@dataclass(frozen=True)
class EntryDocument:
    key: str
    on: date
    lines: list[EntryLine]
    explicit_type: str | None = None


def identify_entry_types(
    documents: list[EntryDocument], *, calendar: str = "jalali", fiscal_start_month: int = 1
) -> dict[str, str]:
    """Recognize closings only when they actually cancel prior account balances.

    This works on complete documents, never chunks or a particular vendor's codes.
    Explicit source types take precedence over structural inference.
    """
    balances: dict[tuple[int, str], Decimal] = defaultdict(Decimal)
    result: dict[str, str] = {}
    temporary = {AccountClass.REVENUE, AccountClass.EXPENSE}
    permanent = {AccountClass.ASSET, AccountClass.LIABILITY, AccountClass.EQUITY}
    for doc in documents:
        source_date = jdatetime.date.fromgregorian(date=doc.on) if calendar == "jalali" else doc.on
        year = source_date.year - (source_date.month < fiscal_start_month)
        changes: dict[str, Decimal] = defaultdict(Decimal)
        for line in doc.lines:
            changes[line.account_key] += line.debit - line.credit
        balanced = sum(changes.values(), Decimal(0)) == 0
        names = [words(line.account_name) for line in doc.lines]
        kind = doc.explicit_type or "normal"
        if not doc.explicit_type:
            if any("تراز افتتاح" in name for name in names):
                kind = "opening"
            elif any("تراز اختتام" in name for name in names):
                kind = "closing"
            elif source_date.month == (fiscal_start_month - 2) % 12 + 1 and balanced:
                temp_lines = [line for line in doc.lines if line.account_class in temporary]
                roles = {line.role for line in doc.lines}
                tax_allocation = roles == {
                    "current_earnings",
                    "retained_earnings",
                    "income_tax_payable",
                } and all(
                    line.debit > line.credit
                    if line.role == "current_earnings"
                    else line.credit > line.debit
                    for line in doc.lines
                )
                reversing = all(
                    balances[year, key] != 0 and balances[year, key] + change == 0
                    for key, change in changes.items()
                    if change
                )
                if tax_allocation:
                    kind = "profit_allocation"
                elif len(changes) >= 3 and not temp_lines and reversing:
                    kind = "closing"
                elif {line.account_class for line in temp_lines} == temporary and all(
                    balances[year, line.account_key] != 0
                    and balances[year, line.account_key] + changes[line.account_key] == 0
                    for line in temp_lines
                ):
                    kind = "income_closing"
        result[doc.key] = kind
        # Closing entries remain auditable but never erase report balances.
        if kind != "closing":
            for line in doc.lines:
                if kind == "income_closing" and line.account_class not in permanent:
                    continue
                balances[year, line.account_key] += line.debit - line.credit
    return result
