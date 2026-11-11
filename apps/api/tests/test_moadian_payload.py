from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from didban.errors import DomainError
from didban.moadian_payload import build_payload, can_build
from didban.moadian_schemas import MoadianInvoiceInput


def _invoice(kind: str = "sale_goods", amount: str = "3000") -> dict:
    source = {"kind": kind, "date": "2020-07-20", "unit": "TOMAN", "amount": amount}
    if kind == "sale_goods":
        source |= {"quantity": 3, "unit_price": "100", "item_name": "کالای نمونه"}
    return {
        "id": "invoice-a",
        "version": 3,
        "basis": "native_invoice",
        "direction": "sale",
        "status": "available",
        "date": "2020-07-20",
        "unit": "IRR",
        "amount": amount,
        "source": source,
        "original_source": dict(source),
        "source_history": [],
    }


def _submit(**updates):
    return MoadianInvoiceInput(
        **(
            {
                "invoice_id": "invoice-a",
                "invoice_version": 3,
                # Published RC_DCPS.SN example, including the Verhoeff digit.
                "tax_id": "DEF5GH0481F000000000C2",
                "issued_at": "2020-07-20T11:30:00+04:30",
                "buyer_type": "legal",
                "buyer_tax_number": "12345678901",
                "item_tax_id": "1234567890123",
                "unit_code": "1627",
                "vat_treatment": "exempt",
                "vat_evidence": "مستند نمونه",
            }
            | updates
        )
    )


def _build(invoice, data=None, memory_id="DEF5GH"):
    return build_payload(invoice, data or _submit(), memory_id, "09876543210")


def test_general_credit_sale_uses_exact_approved_toman_price_and_published_fiscal_number():
    packet = _build(_invoice())
    header, item = packet["header"], packet["body"][0]
    assert header["inno"] == "000000000C"
    assert header["indatim"] == int(datetime(2020, 7, 20, 7, tzinfo=timezone.utc).timestamp()) * 1000
    assert [header[field] for field in ("inty", "inp", "ins", "setm")] == [1, 1, 1, 2]
    assert (header["tob"], header["tinb"], header["tins"]) == (2, "12345678901", "09876543210")
    assert (item["am"], item["fee"], item["prdis"], item["tsstam"]) == (3, 1000, 3000, 3000)
    assert (item["vra"], item["vam"], header["tvam"], header["tbill"]) == (0, 0, 0, 3000)
    assert packet["payments"] == []
    assert "vat_evidence" not in str(packet)


def test_single_service_preserves_integer_above_javascript_safe_range():
    total = "9007199254740993"
    packet = _build(_invoice("sale_service", total), _submit(vat_treatment="zero_rated"))
    assert packet["body"][0]["am"] == 1
    assert packet["body"][0]["fee"] == packet["header"]["tbill"] == 9_007_199_254_740_993


@pytest.mark.parametrize(
    ("updates", "memory_id", "code"),
    [
        ({"tax_id": "DEF5GH0481F000000000C9"}, "DEF5GH", "moadian_tax_id_checksum"),
        ({"tax_id": "DEF5GH0481E000000000C2"}, "DEF5GH", "moadian_tax_id_date"),
        ({}, "ADE5GH", "moadian_tax_id_memory"),
        ({"issued_at": "2020-07-20T22:00:00Z"}, "DEF5GH", "moadian_issue_time"),
        ({"invoice_version": 2}, "DEF5GH", "moadian_invoice_version"),
    ],
)
def test_fiscal_id_date_and_version_checks(updates, memory_id, code):
    with pytest.raises(DomainError) as error:
        _build(_invoice(), _submit(**updates), memory_id)
    assert error.value.code == code


def test_unavailable_corrected_unbalanced_and_fractional_sources_cannot_be_submitted():
    invoice = _invoice()
    assert can_build(invoice)
    assert not can_build(invoice | {"status": "unavailable"})
    assert not can_build(invoice | {"source_history": [{"version": 2}]})
    assert not can_build(invoice | {"direction": "purchase"})
    assert not can_build(_invoice(amount="3001"))
    assert not can_build(_invoice("sale_service", "100.1"))


@pytest.mark.parametrize(
    "changes",
    [
        {"issued_at": "2020-07-20T11:30:00"},
        {"issued_at": 1595230200},
        {"issued_at": "1595230200"},
        {"vat_evidence": "  "},
        {"buyer_tax_number": "123456789012"},
        {"item_tax_id": "۱۲۳۴۵۶۷۸۹۰۱۲۳"},
        {"unit_code": "1627/1"},
    ],
)
def test_tax_inputs_are_explicit(changes):
    with pytest.raises(ValidationError):
        _submit(**changes)
