from datetime import date
from decimal import Decimal

from app.receivables.schemas import AgingBucketDetail, ReceivablesSummaryResponse
from app.receivables.service import _classify_delay


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
