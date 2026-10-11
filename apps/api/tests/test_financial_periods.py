from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.companies.models import CompanyRole
from app.financial_periods.routes import delete_period, require_writer, save_history
from app.financial_periods.schemas import DateRange, PeriodCreate, ReceiptCreate, ReceiptHistory
from app.financial_periods.service import account_balance, cash_report, receivables_report
from app.main import app  # noqa: F401


def invoice(issue=date(2026, 3, 1), paid="0", complete=True):
    return SimpleNamespace(
        id=uuid4(),
        issue_date=issue,
        due_date=date(2026, 4, 5),
        invoice_no="INV",
        gross_amount_irr=Decimal(100),
        paid_amount_irr=Decimal(paid),
        receipt_history_complete=complete,
        receipt_history_version=0,
        status=None,
    )


def customer():
    return SimpleNamespace(id=uuid4(), name="مشتری", national_id=None)


def receipt(inv, received, amount):
    return SimpleNamespace(invoice_id=inv.id, received_on=received, amount_irr=Decimal(amount))


def period():
    return DateRange(start_date=date(2026, 4, 1), end_date=date(2026, 4, 30))


def test_old_invoice_and_later_receipts_do_not_disappear_from_history():
    inv = invoice(paid="100")
    receipts = [
        receipt(inv, date(2026, 3, 31), 20),
        receipt(inv, date(2026, 4, 1), 15),
        receipt(inv, date(2026, 4, 30), 25),
        receipt(inv, date(2026, 5, 1), 40),
    ]
    result = receivables_report([(inv, customer())], receipts, period())
    assert result.opening_balance_irr == "80"
    assert result.sales_irr == "0"
    assert result.receipts_irr == "40"
    assert result.closing_balance_irr == "40"
    assert result.overdue_irr == "40"
    assert result.invoices[0].paid_amount_irr == Decimal(60)
    assert sum(Decimal(c.total_outstanding_irr) for c in result.customers) == Decimal(40)
    assert sum(b.amount_irr for b in result.buckets) == Decimal(40)


def test_new_sales_boundaries_and_reconciliation():
    rows = [
        (invoice(date(2026, 3, 31)), customer()),
        (invoice(date(2026, 4, 1)), customer()),
        (invoice(date(2026, 4, 30)), customer()),
        (invoice(date(2026, 5, 1)), customer()),
    ]
    result = receivables_report(rows, [receipt(rows[1][0], date(2026, 4, 30), 50)], period())
    assert (
        result.opening_balance_irr,
        result.sales_irr,
        result.receipts_irr,
        result.closing_balance_irr,
    ) == ("100", "200", "50", "250")
    assert Decimal(result.opening_balance_irr) + Decimal(result.sales_irr) - Decimal(
        result.receipts_irr
    ) == Decimal(result.closing_balance_irr)


def test_legacy_cumulative_paid_never_invents_a_historical_balance():
    result = receivables_report([(invoice(paid="50", complete=False), customer())], [], period())
    assert not result.history_complete
    assert result.closing_balance_irr is None
    assert result.receipts_irr is None
    assert result.warnings and not result.customers
    # No receipts on an unpaid imported invoice is a known zero.
    result = receivables_report([(invoice(complete=False), customer())], [], period())
    assert result.history_complete and result.closing_balance_irr == "100"


def test_absent_invoices_are_not_reported_as_zero():
    result = receivables_report([], [], period())
    assert result.closing_balance_irr is None and result.warnings


def transaction(account, day, amount, balance=None):
    return SimpleNamespace(
        id=uuid4(),
        bank_account_id=account,
        booking_date=day,
        amount_irr=Decimal(amount),
        running_balance_irr=Decimal(balance) if balance is not None else None,
    )


def test_cash_uses_anchor_and_subsequent_movements_and_inclusive_boundaries():
    acc = SimpleNamespace(id=uuid4())
    rows = [
        transaction(acc.id, date(2026, 3, 30), 100, 500),
        transaction(acc.id, date(2026, 3, 31), 20),
        transaction(acc.id, date(2026, 4, 1), 30),
        transaction(acc.id, date(2026, 4, 30), -50),
        transaction(acc.id, date(2026, 5, 1), 999),
    ]
    result = cash_report([acc], rows, period())
    assert (
        result.opening_balance_irr,
        result.inflows_irr,
        result.outflows_irr,
        result.closing_balance_irr,
    ) == ("520", "30", "50", "500")
    assert result.days[0].balance_irr == "550" and result.days[-1].balance_irr == "500"
    assert len(result.days) == 30


def test_first_statement_balance_can_reconstruct_previous_day_only_with_coverage():
    acc = uuid4()
    rows = [transaction(acc, date(2026, 4, 1), 100), transaction(acc, date(2026, 4, 2), -20, 1080)]
    assert account_balance(rows, date(2026, 3, 31)) == 1000
    assert account_balance(rows, date(2026, 3, 30)) is None
    assert account_balance(rows, date(2026, 4, 1)) == 1100


def test_cash_without_anchor_or_missing_accounts_stays_unknown():
    acc = SimpleNamespace(id=uuid4())
    rows = [transaction(acc.id, date(2026, 4, 1), 100)]
    result = cash_report([acc], rows, period())
    assert result.opening_balance_irr is None and result.closing_balance_irr is None
    assert result.inflows_irr == "100"
    result = cash_report(
        [acc, SimpleNamespace(id=uuid4())],
        [transaction(acc.id, date(2026, 3, 31), 100, 100)],
        period(),
    )
    assert result.closing_balance_irr is None
    assert cash_report([], [], period()).inflows_irr is None


def test_cash_balance_discontinuity_is_explained():
    acc = SimpleNamespace(id=uuid4())
    rows = [
        transaction(acc.id, date(2026, 3, 31), 100, 100),
        transaction(acc.id, date(2026, 4, 1), 20, 150),
    ]
    result = cash_report([acc], rows, period())
    assert result.closing_balance_irr == "150"
    assert any("تطبیق ندارد" in warning for warning in result.warnings)


@pytest.mark.parametrize(
    "values",
    [
        {"start_date": "2026-04-30", "end_date": "2026-04-01"},
        {"start_date": "2020-01-01", "end_date": "2026-01-01"},
    ],
)
def test_invalid_ranges(values):
    with pytest.raises(ValidationError):
        DateRange(**values)


def test_invalid_name_and_receipt_amounts():
    with pytest.raises(ValidationError):
        PeriodCreate(name=" ", **period().model_dump())
    for amount in ("0", "-1", "1.5", "NaN"):
        with pytest.raises(ValidationError):
            ReceiptCreate(received_on=date(2026, 4, 1), amount_irr=amount)


def test_viewers_cannot_write_financial_history():
    with pytest.raises(HTTPException) as error:
        require_writer(SimpleNamespace(role=CompanyRole.VIEWER))
    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_company_scoped_deletion_and_receipt_replacement_reject_foreign_objects():
    session = AsyncMock()
    session.scalar.return_value = None
    access = SimpleNamespace(role=CompanyRole.OWNER, user_id=uuid4())
    with pytest.raises(HTTPException) as error:
        await delete_period(uuid4(), uuid4(), session, access, None)
    assert error.value.status_code == 404
    assert "company_id" in str(session.scalar.call_args.args[0])
    with pytest.raises(HTTPException) as error:
        await save_history(
            uuid4(),
            uuid4(),
            ReceiptHistory(receipts=[], confirm_complete=True, expected_version=0),
            session,
            access,
            None,
        )
    assert error.value.status_code == 404
    session.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_full_history_updates_cumulative_cache_and_audits_previous_values():
    inv = invoice(paid="80", complete=False)
    session = AsyncMock()
    session.add = MagicMock()
    session.add_all = MagicMock()
    session.scalar.return_value = inv
    previous = MagicMock()
    previous.all.return_value = []
    session.scalars.return_value = previous
    payload = ReceiptHistory(
        receipts=[
            ReceiptCreate(received_on=date(2026, 4, 1), amount_irr=30),
            ReceiptCreate(received_on=date(2026, 5, 1), amount_irr=50),
        ],
        confirm_complete=True,
        expected_version=0,
    )

    async def flush_receipts():
        for row in session.add_all.call_args.args[0]:
            row.id = uuid4()

    session.flush.side_effect = flush_receipts
    await save_history(
        uuid4(),
        inv.id,
        payload,
        session,
        SimpleNamespace(role=CompanyRole.OWNER, user_id=uuid4()),
        None,
    )
    assert inv.paid_amount_irr == 80 and inv.receipt_history_complete
    assert inv.receipt_history_version == 1
    session.commit.assert_awaited_once()
    assert "FOR UPDATE" in str(session.scalar.call_args.args[0])
    audit = session.add.call_args.args[0]
    assert audit.metadata_json["previous_paid_amount_irr"] == "80"


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["overpaid", "before_invoice", "future", "stale", "unconfirmed"])
async def test_invalid_history_is_rejected_before_mutation(kind):
    inv = invoice()
    session = AsyncMock()
    session.scalar.return_value = inv
    values = dict(
        receipts=[dict(received_on="2026-04-01", amount_irr="50")],
        confirm_complete=True,
        expected_version=0,
    )
    if kind == "overpaid":
        values["receipts"][0]["amount_irr"] = "101"
    if kind == "before_invoice":
        values["receipts"][0]["received_on"] = "2026-02-01"
    if kind == "future":
        values["receipts"][0]["received_on"] = "2099-01-01"
    if kind == "stale":
        values["expected_version"] = 2
    if kind == "unconfirmed":
        values["confirm_complete"] = False
    with pytest.raises(HTTPException) as error:
        await save_history(
            uuid4(),
            inv.id,
            ReceiptHistory(**values),
            session,
            SimpleNamespace(role=CompanyRole.OWNER),
            None,
        )
    assert error.value.status_code == (409 if kind == "stale" else 422)
    session.execute.assert_not_awaited()
    session.commit.assert_not_awaited()
