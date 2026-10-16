"""Regression cases based on real ledger structure, without company data."""

from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.analysis.calculations import LedgerLine, calculate_ledger_metrics
from app.analysis.models import MetricCode
from app.financial.accounting import (
    EntryDocument,
    EntryLine,
    classify_account,
    identify_entry_types,
    prepare_accounting_row,
)
from app.financial.models import AccountClass
from app.financial.normalization import infer_account_class
from app.financial.payable_balances import supplier_balances
from app.imports.mapping import (
    parse_table,
    separate_ledger_controls,
    suggest_mapping,
    validate_mapping_fields,
)
from app.imports.models import SourceKind


@pytest.mark.parametrize(
    "code,name,expected",
    [
        ("401", "بستانكاران", AccountClass.LIABILITY),
        ("405", "حقوق پرداختنی", AccountClass.LIABILITY),
        ("506", "سرمایه", AccountClass.EQUITY),
        ("901", "فروش", AccountClass.REVENUE),
        ("205", "اموال و اثاثیه", AccountClass.ASSET),
        ("102", "حساب نامشخص", AccountClass.OTHER),
        ("901", "مالیات ارزش افزوده فروش", AccountClass.LIABILITY),
    ],
)
def test_account_codes_do_not_determine_financial_meaning(code, name, expected):
    assert infer_account_class(code, name) == expected


def test_hierarchy_keeps_identical_subcodes_under_different_roots_separate():
    values = dict(
        general_code="401",
        general_name="بستانکاران",
        subsidiary_code="0001",
        subsidiary_name="تامین کننده نمونه",
        debit="0",
        credit="100",
    )
    supplier = prepare_accounting_row(values)
    bank = prepare_accounting_row(
        {
            **values,
            "general_code": "102",
            "general_name": "بانکها",
            "detail_code": "0001",
            "detail_name": "بانک نمونه",
        }
    )
    assert supplier["account_code"] != bank["account_code"]
    assert "0001" in str(supplier["account_code"])
    assert supplier["counterparty_name"] == "تامین کننده نمونه"
    assert supplier["account_role"] == "trade_payable"
    assert bank["account_role"] == "cash"
    assert "counterparty_name" not in bank


def test_incomplete_hierarchy_does_not_silently_merge_accounts():
    with pytest.raises(ValueError):
        prepare_accounting_row(
            {
                "general_code": "102",
                "general_name": "بانکها",
                "detail_code": "0001",
                "detail_name": "بانک نمونه",
            }
        )


def line(key, name, debit=0, credit=0, role="other"):
    return EntryLine(key, name, classify_account(name), role, Decimal(debit), Decimal(credit))


def test_year_end_retains_profit_stock_and_preclosing_balances():
    documents = [
        EntryDocument(
            "opening",
            date(2024, 3, 20),
            [line("stock", "موجودی", 100, role="inventory"), line("capital", "سرمایه", credit=100)],
            "opening",
        ),
        EntryDocument(
            "buy",
            date(2024, 5, 1),
            [line("buy", "خرید", 40), line("payable", "بستانکاران", credit=40)],
        ),
        EntryDocument(
            "pay",
            date(2024, 5, 2),
            [line("payable", "بستانکاران", 25), line("cash", "بانک", credit=25)],
        ),
        EntryDocument(
            "sell", date(2024, 6, 1), [line("cash", "بانک", 100), line("sales", "فروش", credit=100)]
        ),
        EntryDocument(
            "income-close",
            date(2025, 3, 19),
            [
                line("sales", "فروش", 100),
                line("buy", "خرید", credit=40),
                line("stock", "موجودی", 80, role="inventory"),
                line("stock", "موجودی", credit=100, role="inventory"),
                line("profit", "سود و زیان جاری", credit=40),
            ],
        ),
        EntryDocument(
            "close",
            date(2025, 3, 19),
            [
                line("stock", "موجودی", credit=80, role="inventory"),
                line("cash", "بانک", credit=75),
                line("payable", "بستانکاران", 15),
                line("capital", "سرمایه", 100),
                line("profit", "سود و زیان جاری", 40),
            ],
        ),
    ]
    kinds = identify_entry_types(documents)
    assert kinds["income-close"] == "income_closing"
    assert kinds["close"] == "closing"
    ledger = [
        LedgerLine(doc.on, item.debit, item.credit, item.account_class, kinds[doc.key], item.role)
        for doc in documents
        for item in doc.lines
    ]
    metrics, _ = calculate_ledger_metrics(ledger, date(2024, 3, 20), date(2025, 3, 20))
    assert metrics[MetricCode.REVENUE_IRR].value_irr == 100
    assert metrics[MetricCode.EXPENSES_IRR].value_irr == 60
    assert metrics[MetricCode.NET_PROFIT_IRR].value_irr == 40
    assert metrics[MetricCode.TOTAL_ASSETS_IRR].value_irr == 155
    assert metrics[MetricCode.TOTAL_LIABILITIES_IRR].value_irr == 15
    assert metrics[MetricCode.TOTAL_EQUITY_IRR].value_irr == 140
    # A historical report must not include the later closing or later receipts.
    historical, _ = calculate_ledger_metrics(ledger, date(2024, 3, 20), date(2024, 5, 2))
    assert historical[MetricCode.TOTAL_ASSETS_IRR].value_irr == 75


def test_normal_source_type_takes_precedence_over_structural_inference():
    document = EntryDocument("source", date(2025, 3, 19), [line("x", "تراز اختتامیه")], "normal")
    assert identify_entry_types([document])["source"] == "normal"


def test_new_year_opening_does_not_double_count_prior_year_balance():
    ledger = [
        LedgerLine(date(2024, 3, 20), Decimal(100), Decimal(0), AccountClass.ASSET, "opening"),
        LedgerLine(date(2024, 5, 1), Decimal(20), Decimal(0), AccountClass.ASSET),
        LedgerLine(date(2025, 3, 21), Decimal(120), Decimal(0), AccountClass.ASSET, "opening"),
        LedgerLine(date(2025, 5, 1), Decimal(10), Decimal(0), AccountClass.ASSET),
    ]
    metrics, _ = calculate_ledger_metrics(ledger, date(2025, 3, 21), date(2025, 6, 1))
    assert metrics[MetricCode.TOTAL_ASSETS_IRR].value_irr == 130


def test_settlements_and_overpayments_are_netted_per_supplier():
    supplier, other = SimpleNamespace(id=uuid4()), SimpleNamespace(id=uuid4())

    def row(party, debit, credit, kind="normal"):
        return (
            SimpleNamespace(id=uuid4(), debit_irr=Decimal(debit), credit_irr=Decimal(credit)),
            SimpleNamespace(entry_type=kind),
            party,
        )

    rows = [
        row(supplier, 0, 100),
        row(supplier, 70, 0),
        row(supplier, 30, 0, "closing"),
        row(other, 0, 10),
        row(other, 15, 0),
    ]
    balances = supplier_balances(rows)
    assert len(balances) == 1
    assert balances[0]["party"] is supplier
    assert balances[0]["amount"] == 30


def test_portal_long_headers_map_without_internal_invoice_or_named_buyer():
    columns = [
        "شماره مالیاتی صورت‌حساب",
        "تاریخ صدور صورت‌حساب",
        "مجموع صورت‌حساب",
        "موضوع صورت‌حساب",
        "وضعیت صورت‌حساب",
        "مالیات بر ارزش افزوده",
        "نام خریدار/عرضه کننده واسط کالا و خدمت/ حق‌العملکار",
        "شناسه هویتی خریدار/ عرضه کننده واسط کالا و خدمت/ حق‌العملکار",
    ]
    mapping = {
        str(s["target_field"]): str(s["source_column"])
        for s in suggest_mapping(columns, SourceKind.MOADIAN_SALES)
    }
    assert validate_mapping_fields(SourceKind.MOADIAN_SALES, mapping, columns) == []
    assert mapping["party_name"] == columns[6]


def test_xls_is_dispatched_without_mislabelling_as_xlsx():
    from io import BytesIO
    from unittest.mock import patch

    with patch("app.imports.mapping._parse_xls") as parser:
        parse_table(BytesIO(b"legacy"), ".xls")
        parser.assert_called_once()


def test_income_tax_booked_through_profit_allocation_reduces_net_profit():
    document = EntryDocument(
        "allocation",
        date(2025, 3, 19),
        [
            line("profit", "سود و زیان جاری", 40, role="current_earnings"),
            line("retained", "سود و زیان انباشته", credit=30, role="retained_earnings"),
            line("tax", "مالیات عملکرد پرداختنی", credit=10, role="income_tax_payable"),
        ],
    )
    assert identify_entry_types([document])["allocation"] == "profit_allocation"
    ledger = [
        LedgerLine(date(2024, 6, 1), Decimal(0), Decimal(100), AccountClass.REVENUE),
        LedgerLine(date(2024, 6, 1), Decimal(60), Decimal(0), AccountClass.EXPENSE),
    ]
    ledger.extend(
        LedgerLine(
            document.on, item.debit, item.credit, item.account_class, "profit_allocation", item.role
        )
        for item in document.lines
    )
    metrics, _ = calculate_ledger_metrics(ledger, date(2024, 3, 20), date(2025, 3, 20))
    assert metrics[MetricCode.NET_PROFIT_IRR].value_irr == 30
    assert metrics[MetricCode.NET_PROFIT_IRR].calculation["allocated_income_tax_irr"] == "10"


def test_unclassified_ledger_does_not_report_zero_profit():
    metrics, coverage = calculate_ledger_metrics([
        LedgerLine(date(2024, 6, 1), Decimal(10), Decimal(0), AccountClass.OTHER)
    ], date(2024, 3, 20), date(2025, 3, 20))
    assert metrics[MetricCode.NET_PROFIT_IRR].value_irr is None
    assert coverage["score"] == 0


def test_partial_opening_does_not_erase_other_accounts():
    ledger = [
        LedgerLine(date(2024, 3, 20), Decimal(100), Decimal(0), AccountClass.ASSET, account_key="a"),
        LedgerLine(date(2024, 5, 1), Decimal(20), Decimal(0), AccountClass.ASSET, "opening", account_key="b"),
    ]
    metrics, _ = calculate_ledger_metrics(ledger, date(2024, 3, 20), date(2025, 3, 20))
    assert metrics[MetricCode.TOTAL_ASSETS_IRR].value_irr == 120


def test_printed_totals_are_separate_only_when_they_reconcile():
    columns = ["کد کل", "نام کل", "بدهکار", "بستانکار"]
    values = [
        ["", "منقول از قبل", 0, 0],
        ["102", "بانک", 100, 0],
        ["506", "سرمایه", 0, 100],
        ["", "", 100, 100],
        ["", "", 50, 50],
    ]
    rows = [(number, dict(zip(columns, row, strict=True))) for number, row in enumerate(values, 1)]
    postings, controls = separate_ledger_controls(columns, rows)
    assert [number for number, _ in controls] == [1, 4]
    assert [number for number, _ in postings] == [2, 3, 5]
