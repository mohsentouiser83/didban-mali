"""Reviewed source signatures and column aliases; no company account-code assumptions."""

from __future__ import annotations
import re
from .normalization import text

PROFILES = {
    "bank": (
        "date".split(),
        "amount deposit withdrawal row_id row_type reference balance description bank_account invoice_id party_id".split(),
    ),
    "trial_balance": (
        "account opening_debit opening_credit period_debit period_credit closing_debit closing_credit".split(),
        "row_id account_name role period_start as_of_date row_level flow_basis".split(),
    ),
    "ledger": (
        "entry_id date account debit credit".split(),
        "row_id entry_type role party_id reference description account_name cashflow_activity".split(),
    ),
    "sales_invoices": (
        "invoice_id party_id issued_on gross".split(),
        "due_on vat tax_id record_role".split(),
    ),
    "purchase_invoices": (
        "invoice_id party_id issued_on gross".split(),
        "due_on vat tax_id record_role".split(),
    ),
    "moadian_sales": (
        "tax_id issued_on gross kind".split(),
        "invoice_id vat reference_tax_id party_id party_name document_status".split(),
    ),
    "moadian_purchases": (
        "tax_id issued_on gross kind".split(),
        "invoice_id vat reference_tax_id party_id party_name document_status".split(),
    ),
    "settlements": (
        "event_id invoice_id date amount direction".split(),
        "bank_account bank_reference".split(),
    ),
    "receipt_history": (
        "event_id party_id invoice_id due_on paid_on amount role".split(),
        [],
    ),
    "planned_payments": (
        "plan_id obligation_id date total_obligation paid_as_of confirmed".split(),
        ["invoice_id"],
    ),
}
ALIASES = {
    "opening_debit": ["مانده بدهکار ابتدای دوره", "مانده اول دوره بدهکار"],
    "opening_credit": ["مانده بستانکار ابتدای دوره", "مانده اول دوره بستانکار"],
    "period_debit": ["گردش بدهکار", "گردش بدهکار دوره"],
    "period_credit": ["گردش بستانکار", "گردش بستانکار دوره"],
    "closing_debit": ["مانده بدهکار پایان دوره", "مانده پایان دوره بدهکار"],
    "closing_credit": ["مانده بستانکار پایان دوره", "مانده پایان دوره بستانکار"],
    "period_start": ["ابتدای دوره", "از تاریخ"],
    "as_of_date": ["تاریخ تراز", "تا تاریخ"],
    "row_level": ["سطح ردیف", "نوع ردیف تراز"],
    "flow_basis": ["مبنای گردش", "وضعیت اختتامیه"],
    "cashflow_activity": ["نوع فعالیت نقدی", "فعالیت جریان وجوه نقد"],
    "date": ["تاریخ", "تاریخ تراکنش", "تاریخ سند", "تاريخ سند"],
    "amount": ["مبلغ", "مبلغ تراکنش"],
    "deposit": ["واریز", "واریزی", "مبلغ واریز"],
    "withdrawal": ["برداشت", "مبلغ برداشت"],
    "debit": ["بدهکار", "مبلغ بدهکار"],
    "credit": ["بستانکار", "مبلغ بستانکار"],
    "account": ["کد حساب", "حساب", "کد کل", "شماره دفتر کل"],
    "account_name": ["نام حساب", "عنوان حساب", "نام سرفصل", "نام کل"],
    "entry_id": ["شماره سند", "شناسه سند"],
    "entry_type": ["نوع سند"],
    "row_id": ["ردیف", "شماره ردیف"],
    "reference": ["شماره پیگیری", "شناسه مرجع"],
    "balance": ["مانده", "مانده حساب"],
    "currency": ["واحد", "واحد پول", "ارز"],
    "description": ["شرح", "توضیحات"],
    "invoice_id": ["شماره فاکتور", "شناسه فاکتور"],
    "party_id": ["کد طرف حساب", "شناسه طرف حساب"],
    "issued_on": ["تاریخ صدور"],
    "due_on": ["سررسید", "تاریخ سررسید"],
    "gross": ["مبلغ کل", "مبلغ نهایی"],
    "vat": ["مالیات ارزش افزوده"],
    "tax_id": ["شناسه مالیاتی"],
    "kind": ["نوع صورتحساب"],
    "row_type": ["نوع ردیف"],
    "role": ["نقش حساب", "نقش"],
    "event_id": ["شناسه رویداد"],
    "direction": ["جهت"],
    "bank_account": ["حساب بانک"],
    "bank_reference": ["مرجع بانک"],
    "paid_on": ["تاریخ وصول"],
    "plan_id": ["شناسه برنامه"],
    "obligation_id": ["شناسه تعهد"],
    "total_obligation": ["مبلغ کل تعهد"],
    "paid_as_of": ["پرداخت شده"],
    "confirmed": ["تأیید شده"],
    "reference_tax_id": ["شناسه مالیاتی مرجع"],
    "record_role": ["نقش رکورد"],
}
MONEY = {
    "opening_debit",
    "opening_credit",
    "period_debit",
    "period_credit",
    "closing_debit",
    "closing_credit",
    "amount",
    "balance",
    "debit",
    "credit",
    "gross",
    "vat",
    "total_obligation",
    "paid_as_of",
    "deposit",
    "withdrawal",
}
DATES = {"date", "issued_on", "due_on", "paid_on", "period_start", "as_of_date"}
ROLES = set(
    "bank cash cash_equivalent trade_ar other_ar trade_ap loan_payable tax_payable payroll_payable other_liability inventory fixed_asset other_asset contra_asset other_equity capital revenue other_income expense purchases cogs income_tax_expense vat_receivable vat_payable calibration_only".split()
)


def header_key(value: object) -> str:
    value = re.sub(r"[（(](?:ریال|ريال|تومان|IRR|IRT)[)）]", "", text(value))
    return re.sub(
        r"[\s_\-()\[\]‌]+", "", text(value).replace("ي", "ی").replace("ك", "ک")
    ).lower()


LOOKUP = {
    header_key(alias): field
    for field, aliases in ALIASES.items()
    for alias in [field, *aliases]
}


def header_mapping(values: list) -> dict[str, int]:
    result = {}
    duplicate = set()
    for index, value in enumerate(values, 1):
        field = LOOKUP.get(header_key(value))
        if field:
            if field in result:
                duplicate.add(field)
            result[field] = index
    return {k: v for k, v in result.items() if k not in duplicate}


def candidates(mapping: dict) -> list[str]:
    choices = [
        kind
        for kind, (required, _) in PROFILES.items()
        if set(required) <= mapping.keys()
    ]
    choices = [
        k
        for k in choices
        if k != "bank"
        or "amount" in mapping
        or {"deposit", "withdrawal"} <= mapping.keys()
    ]
    # More specific signatures beat a generic amount/date or invoice signature.
    if any(k not in ("bank", "sales_invoices", "purchase_invoices") for k in choices):
        choices = [
            k
            for k in choices
            if k not in ("bank", "sales_invoices", "purchase_invoices")
        ]
    return choices
