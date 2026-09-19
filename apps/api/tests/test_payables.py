from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.payables.schemas import (
    PayableAgingBucketDetail,
    PayablesSummaryResponse,
    VendorPayableItem,
)
from app.payables.service import _classify_delay


def test_classify_delay_payables() -> None:
    assert _classify_delay(0) == "not_due"
    assert _classify_delay(-10) == "not_due"
    assert _classify_delay(1) == "1_30"
    assert _classify_delay(30) == "1_30"
    assert _classify_delay(31) == "31_60"
    assert _classify_delay(60) == "31_60"
    assert _classify_delay(61) == "61_90"
    assert _classify_delay(90) == "61_90"
    assert _classify_delay(91) == "90_plus"
    assert _classify_delay(120) == "90_plus"


def test_payables_summary_serialization() -> None:
    buckets = [
        PayableAgingBucketDetail(
            bucket_key="not_due",
            label_fa="جاری",
            amount_irr=Decimal("600000000"),
            vendor_count=6,
            share_percentage=60.0,
        ),
        PayableAgingBucketDetail(
            bucket_key="1_30",
            label_fa="۱ تا ۳۰ روز",
            amount_irr=Decimal("200000000"),
            vendor_count=2,
            share_percentage=20.0,
        ),
        PayableAgingBucketDetail(
            bucket_key="31_60",
            label_fa="۳۱ تا ۶۰ روز",
            amount_irr=Decimal("100000000"),
            vendor_count=1,
            share_percentage=10.0,
        ),
        PayableAgingBucketDetail(
            bucket_key="61_90",
            label_fa="۶۱ تا ۹۰ روز",
            amount_irr=Decimal("50000000"),
            vendor_count=1,
            share_percentage=5.0,
        ),
        PayableAgingBucketDetail(
            bucket_key="90_plus",
            label_fa="بیش از ۹۰ روز",
            amount_irr=Decimal("50000000"),
            vendor_count=1,
            share_percentage=5.0,
        ),
    ]

    summary = PayablesSummaryResponse(
        as_of_date=date(2026, 9, 20),
        total_payables_irr=Decimal("1000000000"),
        total_overdue_irr=Decimal("400000000"),
        overdue_ratio=0.4,
        dpo_days=40,
        dso_days=55,
        ccc_days=15,  # CCC = DSO - DPO = 55 - 40 = 15
        vendor_count=10,
        high_risk_vendor_count=2,
        buckets=buckets,
    )

    data = summary.model_dump()
    assert data["total_payables_irr"] == "1000000000"
    assert data["total_overdue_irr"] == "400000000"
    assert data["dpo_days"] == 40
    assert data["dso_days"] == 55
    assert data["ccc_days"] == 15
    assert len(data["buckets"]) == 5


def test_vendor_payable_item_serialization() -> None:
    vendor = VendorPayableItem(
        counterparty_id=uuid4(),
        name="شرکت تامین مواد اولیه پارس",
        national_id="10109988776",
        total_payable_irr=Decimal("350000000"),
        overdue_amount_irr=Decimal("150000000"),
        overdue_ratio=0.4285,
        avg_delay_days=35,
        risk_level="high",
        risk_score=58,
        recommended_action="صدور چک مدت‌دار جدید",
        buckets={
            "not_due": "200000000",
            "1_30": "100000000",
            "31_60": "50000000",
            "61_90": "0",
            "90_plus": "0",
        },
        share_of_total_payables=35.0,
    )

    data = vendor.model_dump()
    assert data["total_payable_irr"] == "350000000"
    assert data["risk_level"] == "high"
    assert data["buckets"]["not_due"] == "200000000"
