"""Conservative, reference-based settlement matching; amounts are never identity."""

import hashlib
import re
import unicodedata
from decimal import Decimal, InvalidOperation
from typing import Any

from app.settlements.schemas import InvoiceItem


def identifier(value: object) -> str:
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    value = unicodedata.normalize("NFKC", str(value if value is not None else "")).strip().upper()
    return "".join(str(unicodedata.digit(c)) if c.isdecimal() else c for c in value)


def validate_settlement_values(values: dict[str, object]) -> list[tuple[str, str]]:
    errors = []
    if identifier(values.get("settlement_id")) in {"", "-", "—", "NONE", "NULL"}:
        errors.append(("settlement_id", "شناسه ثابت ردیف تسویه لازم است."))
    for key in (
        "settlement_id",
        "tax_id",
        "invoice_no",
        "party_id",
        "bank_reference",
        "bank_account",
    ):
        if len(identifier(values.get(key))) > 160:
            errors.append((key, "شناسه بیش از حد طولانی است."))
    try:
        amount = Decimal(str(values.get("settlement_amount", "0")))
        if (
            not amount.is_finite()
            or amount <= 0
            or amount != amount.to_integral_value()
            or amount >= Decimal(10) ** 20
        ):
            errors.append(("settlement_amount", "مبلغ تسویه باید صحیح، مثبت و حداکثر ۲۰ رقم باشد."))
    except InvalidOperation:
        errors.append(("settlement_amount", "مبلغ تسویه معتبر نیست."))
    tax = identifier(values.get("tax_id"))
    if tax and not re.fullmatch(r"[A-Z0-9]{22}", tax):
        errors.append(("tax_id", "شماره مالیاتی باید ۲۲ نویسه باشد."))
    return errors


def select_invoice(
    values: dict[str, object], invoices: list[InvoiceItem], direction: str
) -> tuple[InvoiceItem | None, str]:
    tax, number, party = (identifier(values.get(k)) for k in ("tax_id", "invoice_no", "party_id"))
    if not tax and not (number and party):
        return None, "شماره مالیاتی یا شماره فاکتور همراه شناسه طرف معامله لازم است."
    matches = [
        i
        for i in invoices
        if i.direction == direction
        and (
            identifier(i.tax_id) == tax
            if tax
            else identifier(i.invoice_no) == number and identifier(i.party_id) == party
        )
    ]
    if len(matches) != 1:
        return None, "فاکتور پیدا نشد." if not matches else "مرجع فاکتور یکتا نیست."
    invoice = matches[0]
    if party and identifier(invoice.party_id) != party:
        return invoice, "شناسه طرف معامله با فاکتور مغایرت دارد."
    if number and identifier(invoice.invoice_no) != number:
        return invoice, "شماره فاکتور با شماره مالیاتی انتخابی مغایرت دارد."
    return invoice, invoice.review_reason or ""


def select_bank(
    values: dict[str, object], banks: list[Any], direction: str
) -> tuple[Any | None, str]:
    # A reference may be repeated by the bank. Date/account constrain identity;
    # amount/capacity checks happen only after a unique reference is established.
    reference = identifier(values.get("bank_reference"))
    if reference in {"", "0", "-", "—", "NONE", "NULL"}:
        return None, "شناسه بانکی وجود ندارد؛ اتصال سند حسابداری به بانک نیازمند بررسی است."
    account = identifier(values.get("bank_account")).replace(" ", "")
    candidates = []
    for bank, bank_account in banks:
        if (bank.amount_irr > 0) != (direction == "sales"):
            continue
        if bank.booking_date.isoformat() != values.get("payment_date"):
            continue
        bank_id = identifier(bank.source_transaction_id)
        refs = {bank_id, identifier(bank.reference)}
        # PDF source IDs preserve bank document number + statement row number.
        if ":" in bank_id:
            refs.add(bank_id.split(":", 1)[0])
        if reference not in refs:
            continue
        if account:
            fingerprint = hashlib.sha256(account.encode()).hexdigest()
            if fingerprint not in {
                bank_account.iban_fingerprint,
                bank_account.account_number_fingerprint,
            }:
                continue
        candidates.append(bank)
    if len(candidates) != 1:
        return (
            None,
            "تراکنش با این مرجع و تاریخ پیدا نشد."
            if not candidates
            else "مرجع بانکی چند تراکنش دارد؛ شبا یا شناسه دقیق‌تر لازم است.",
        )
    return candidates[0], ""


def settlement_key(direction: str, invoice_key: str, values: dict[str, object]) -> str:
    value = f"{direction}:{invoice_key}:{identifier(values.get('settlement_id'))}"
    return "settlement:" + hashlib.sha256(value.encode()).hexdigest()


def input_signature(values: dict[str, object]) -> tuple[str, ...]:
    return tuple(
        identifier(values.get(k))
        for k in (
            "tax_id",
            "invoice_no",
            "party_id",
            "bank_reference",
            "bank_account",
            "payment_date",
            "settlement_amount",
        )
    )


def settlement_group(values: dict[str, object]) -> tuple[str, ...]:
    tax = identifier(values.get("tax_id"))
    identity = (
        (tax,)
        if tax
        else (identifier(values.get("invoice_no")), identifier(values.get("party_id")))
    )
    return (identifier(values.get("settlement_id")), *identity)
