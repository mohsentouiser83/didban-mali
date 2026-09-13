from decimal import Decimal
from uuid import UUID

from app.analysis.models import MetricCode
from app.findings.engine import (
    FindingConfig,
    ReconciliationSignal,
    reconciliation_findings,
    trend_findings,
)
from app.findings.models import AssertionStatus, FindingCode
from app.reconciliation.models import MatchStatus


def uid(value: int) -> UUID:
    return UUID(int=value)


def test_engine_generates_exactly_the_eight_approved_catalog_codes() -> None:
    reconciliation = reconciliation_findings(
        [
            ReconciliationSignal(
                uid(1), uid(101), None, MatchStatus.UNRESOLVED, Decimal(0), None, None, "MISSING"
            ),
            ReconciliationSignal(
                uid(2), uid(102), None, MatchStatus.DUPLICATE_HIGH, Decimal(100), None, None, "DUP"
            ),
            ReconciliationSignal(
                uid(3),
                uid(103),
                uid(203),
                MatchStatus.AMOUNT_MISMATCH,
                Decimal(80),
                Decimal("5000000"),
                0,
                "AMOUNT",
            ),
            ReconciliationSignal(
                uid(4),
                uid(104),
                uid(204),
                MatchStatus.DATE_MISMATCH,
                Decimal(85),
                Decimal(0),
                7,
                "DATE",
            ),
            ReconciliationSignal(
                uid(5),
                uid(105),
                uid(205),
                MatchStatus.AUTO_MATCHED,
                Decimal(100),
                Decimal(0),
                0,
                "EXACT",
            ),
        ]
    )
    financial = trend_findings(
        {
            MetricCode.REVENUE_IRR: Decimal("8000000"),
            MetricCode.NET_PROFIT_IRR: Decimal("2000000"),
            MetricCode.EXPENSES_IRR: Decimal("4000000"),
            MetricCode.SALES_OUTSTANDING_IRR: Decimal("3000000"),
        },
        {
            MetricCode.REVENUE_IRR: Decimal("10000000"),
            MetricCode.NET_PROFIT_IRR: Decimal("4000000"),
            MetricCode.EXPENSES_IRR: Decimal("2000000"),
            MetricCode.SALES_OUTSTANDING_IRR: Decimal("1000000"),
        },
        uid(999),
        FindingConfig(),
    )

    generated = reconciliation + financial
    assert {item.finding_code for item in generated} == set(FindingCode)
    assert len(generated) == 8
    assert reconciliation[0].assertion_status == AssertionStatus.HYPOTHESIS
    assert all("تقلب" not in item.title_fa + item.summary_fa for item in generated)


def test_trends_below_versioned_threshold_do_not_create_findings() -> None:
    findings = trend_findings(
        {
            MetricCode.REVENUE_IRR: Decimal("9500000"),
            MetricCode.NET_PROFIT_IRR: Decimal("3900000"),
        },
        {
            MetricCode.REVENUE_IRR: Decimal("10000000"),
            MetricCode.NET_PROFIT_IRR: Decimal("4000000"),
        },
        uid(999),
        FindingConfig(trend_ratio=Decimal("0.10"), minimum_amount_irr=Decimal("1000000")),
    )

    assert findings == []


def test_fingerprint_is_stable_and_rule_version_sensitive() -> None:
    candidate = reconciliation_findings(
        [
            ReconciliationSignal(
                uid(1), uid(101), None, MatchStatus.UNRESOLVED, Decimal(0), None, None, "MISSING"
            )
        ]
    )[0]

    assert candidate.fingerprint(uid(20), "finding-rules-v1:a") == candidate.fingerprint(
        uid(20), "finding-rules-v1:a"
    )
    assert candidate.fingerprint(uid(20), "finding-rules-v1:a") != candidate.fingerprint(
        uid(20), "finding-rules-v1:b"
    )
