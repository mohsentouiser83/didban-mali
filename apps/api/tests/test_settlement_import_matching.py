from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.imports.mapping import SourceKind, suggest_mapping, transform_and_validate_row
from app.settlements.import_matching import select_bank, select_invoice, settlement_key
from app.settlements.schemas import InvoiceItem


def invoice(**changes):
    values = dict(
        source_row_id=uuid4(),
        key="a",
        direction="sales",
        number="A" * 22,
        tax_id="A" * 22,
        invoice_no="INV1",
        party_id="123",
        party_name="مشتری",
        issue_date=date(2025, 1, 1),
        gross_amount_irr=Decimal(100),
    )
    return InvoiceItem(**(values | changes))


def bank(ref="REF1", amount=100, transaction="DOC:1"):
    return (
        SimpleNamespace(
            source_transaction_id=transaction,
            reference=ref,
            amount_irr=Decimal(amount),
            booking_date=date(2025, 1, 2),
        ),
        SimpleNamespace(iban_fingerprint=None, account_number_fingerprint=None),
    )


def test_amount_or_name_alone_never_identifies_an_invoice():
    found, reason = select_invoice(
        {"settlement_amount": "100", "party_name": "مشتری"}, [invoice()], "sales"
    )
    assert found is None and reason


def test_tax_reference_unique_with_optional_consistency_checks():
    inv = invoice()
    assert select_invoice({"tax_id": "A" * 22}, [inv], "sales") == (inv, "")
    assert select_invoice({"tax_id": "A" * 22, "party_id": "456"}, [inv], "sales")[1]
    assert select_invoice({"invoice_no": "INV1", "party_id": "123"}, [inv], "sales") == (inv, "")
    assert select_invoice({"invoice_no": "INV1"}, [inv], "sales")[0] is None
    assert select_invoice({"tax_id": "A" * 22}, [inv, invoice()], "sales")[0] is None
    assert select_invoice({"tax_id": "A" * 22}, [inv], "purchases")[0] is None


def test_bank_requires_reference_date_direction_and_unique_account():
    values = {"bank_reference": "REF1", "payment_date": "2025-01-02"}
    tx = bank()
    assert select_bank(values, [tx], "sales") == (tx[0], "")
    assert (
        select_bank({"payment_date": "2025-01-02", "settlement_amount": "100"}, [tx], "sales")[0]
        is None
    )
    assert select_bank(values, [tx, bank()], "sales")[0] is None
    assert select_bank(values | {"payment_date": "2025-01-03"}, [tx], "sales")[0] is None
    assert select_bank(values, [tx], "purchases")[0] is None
    # Same bank document on a fee and transfer is ambiguous even if only one amount matches.
    assert (
        select_bank(
            values | {"bank_reference": "DOC"}, [tx, bank(amount=1, transaction="DOC:2")], "sales"
        )[0]
        is None
    )


def test_bank_account_disambiguates_repeated_reference():
    import hashlib

    iban = "IR" + "1" * 24
    chosen = bank()
    chosen[1].iban_fingerprint = hashlib.sha256(iban.encode()).hexdigest()
    assert (
        select_bank(
            {"bank_reference": "REF1", "payment_date": "2025-01-02", "bank_account": iban},
            [bank(), chosen],
            "sales",
        )[0]
        is chosen[0]
    )


@pytest.mark.parametrize("amount", ["0", "-1", "1.5", "100000000000000000000"])
def test_invalid_amounts_are_rejected(amount):
    values = {"settlement_id": "S1", "payment_date": "2025-01-02", "settlement_amount": amount}
    _, issues = transform_and_validate_row(
        source_kind=SourceKind.SETTLEMENT_SALES,
        row_number=2,
        raw=values,
        mapping={k: k for k in values},
        transforms={},
        currency_unit="rial",
        calendar="gregorian",
    )
    assert any(i.code == "INVALID_SETTLEMENT" for i in issues)


def test_generic_columns_currency_and_stable_key():
    columns = [
        "شناسه تسویه",
        "تاریخ دریافت",
        "مبلغ دریافت",
        "شماره مالیاتی صورتحساب",
        "شماره پیگیری",
    ]
    suggested = {
        i["target_field"]: i["source_column"]
        for i in suggest_mapping(columns, SourceKind.SETTLEMENT_SALES)
    }
    assert set(suggested) >= {
        "settlement_id",
        "payment_date",
        "settlement_amount",
        "tax_id",
        "bank_reference",
    }
    values, issues = transform_and_validate_row(
        source_kind=SourceKind.SETTLEMENT_SALES,
        row_number=2,
        raw=dict(zip(columns, ["S1", "1403/12/05", "۱۰۰", "A" * 22, "REF1"], strict=True)),
        mapping=suggested,
        transforms={"settlement_amount": ["normalize_digits", "toman_to_rial"]},
        currency_unit="toman",
        calendar="jalali",
    )
    assert not issues and values["settlement_amount"] == "1000"
    assert settlement_key("sales", "inv", values) == settlement_key(
        "sales", "inv", values | {"payment_date": "another"}
    )
    assert settlement_key("purchases", "inv", values) != settlement_key("sales", "inv", values)


@pytest.mark.parametrize("reference", ["0", "-", "", "None"])
def test_placeholder_bank_reference_is_never_proof(reference):
    assert (
        select_bank(
            {"bank_reference": reference, "payment_date": "2025-01-02"},
            [bank(ref=reference)],
            "sales",
        )[0]
        is None
    )
