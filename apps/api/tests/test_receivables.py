from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.main import app  # noqa: F401 -- register related database models
from app.receivables.schemas import AgingBucketDetail, ReceivablesSummaryResponse
from app.receivables.service import (
    _classify_delay,
    get_customer_receivables,
    get_receivable_invoices,
    get_receivables_summary,
)


def test_classify_delay_buckets() -> None:
    assert _classify_delay(0) == "not_due"
    assert _classify_delay(-15) == "not_due"
    assert _classify_delay(1) == "1_30"
    assert _classify_delay(30) == "1_30"
    assert _classify_delay(31) == "31_60"
    assert _classify_delay(60) == "31_60"
    assert _classify_delay(61) == "61_90"
    assert _classify_delay(90) == "61_90"
    assert _classify_delay(91) == "90_plus"
    assert _classify_delay(180) == "90_plus"


def test_receivables_summary_schema_serialization() -> None:
    buckets = [
        AgingBucketDetail(
            bucket_key="not_due",
            label_fa="جاری",
            amount_irr=Decimal("500000000"),
            invoice_count=5,
            share_percentage=50.0,
        ),
        AgingBucketDetail(
            bucket_key="1_30",
            label_fa="۱ تا ۳۰ روز",
            amount_irr=Decimal("200000000"),
            invoice_count=2,
            share_percentage=20.0,
        ),
        AgingBucketDetail(
            bucket_key="31_60",
            label_fa="۳۱ تا ۶۰ روز",
            amount_irr=Decimal("150000000"),
            invoice_count=1,
            share_percentage=15.0,
        ),
        AgingBucketDetail(
            bucket_key="61_90",
            label_fa="۶۱ تا ۹۰ روز",
            amount_irr=Decimal("100000000"),
            invoice_count=1,
            share_percentage=10.0,
        ),
        AgingBucketDetail(
            bucket_key="90_plus",
            label_fa="بیش از ۹۰ روز",
            amount_irr=Decimal("50000000"),
            invoice_count=1,
            share_percentage=5.0,
        ),
    ]

    summary = ReceivablesSummaryResponse(
        as_of_date=date(2026, 9, 20),
        total_receivables_irr=Decimal("1000000000"),
        total_overdue_irr=Decimal("500000000"),
        overdue_ratio=0.5,
        dso_days=45,
        customer_count=8,
        high_risk_customer_count=2,
        buckets=buckets,
    )

    data = summary.model_dump()
    assert data["total_receivables_irr"] == "1000000000"
    assert data["total_overdue_irr"] == "500000000"
    assert len(data["buckets"]) == 5
    assert data["dso_days"] == 45


@pytest.mark.asyncio
async def test_summary_risk_count_matches_customers_and_unknown_dates_stay_unknown() -> None:
    unknown = SimpleNamespace(id=uuid4(), name="بدون سررسید", national_id=None)
    overdue = SimpleNamespace(id=uuid4(), name="معوق", national_id=None)

    def invoice(due, amount):
        return SimpleNamespace(
            id=uuid4(),
            invoice_no="INV",
            issue_date=date(2026, 9, 1),
            due_date=due,
            gross_amount_irr=Decimal(amount),
            paid_amount_irr=Decimal(0),
            status=None,
        )

    rows = [(invoice(None, "100"), unknown), (invoice(date(2026, 9, 28), "60"), overdue)]
    result = MagicMock()
    result.all.return_value = rows
    session = AsyncMock()
    session.execute.return_value = result
    session.scalar.side_effect = [None, Decimal("320")]
    company_id, as_of = uuid4(), date(2026, 10, 8)
    summary = await get_receivables_summary(session, company_id, as_of)
    customers = await get_customer_receivables(session, company_id, as_of)
    invoices = await get_receivable_invoices(session, company_id, as_of)
    assert (
        summary.high_risk_customer_count
        == sum(c.risk_level in ("high", "critical") for c in customers.items)
        == 1
    )
    assert summary.total_overdue_irr == Decimal("60")
    assert summary.total_receivables_irr == sum(
        Decimal(c.total_outstanding_irr) for c in customers.items
    )
    assert summary.dso_days == 45.0
    assert summary.dso_warnings
    missing = next(i for i in invoices.items if i.due_date is None)
    assert missing.bucket_key == "due_date_missing"
    assert missing.delay_days == 0
    assert next(
        c for c in customers.items if c.counterparty_id == unknown.id
    ).risk_assessment_incomplete
    assert "issue_date <=" in str(session.execute.call_args_list[0].args[0])
    assert (
        "توقف"
        not in next(
            c for c in customers.items if c.counterparty_id == overdue.id
        ).recommended_action
    )


@pytest.mark.asyncio
async def test_no_sales_dso_is_unavailable_instead_of_invented_thirty_days() -> None:
    session = AsyncMock()
    result = MagicMock()
    result.all.return_value = []
    session.execute.return_value = result
    session.scalar.side_effect = [None, None]
    summary = await get_receivables_summary(session, uuid4(), date(2026, 10, 8))
    assert summary.dso_days is None
    assert summary.total_receivables_irr == 0
