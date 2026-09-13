from decimal import Decimal

from app.analysis.models import AnalysisStatus
from app.dashboard.logic import coverage_summary, dashboard_health, metric_change
from app.findings.models import PriorityBand


def test_metric_change_is_deterministic_and_handles_zero_baseline() -> None:
    change, ratio, trend = metric_change(Decimal("80"), Decimal("100"))
    assert (change, ratio, trend) == (Decimal("-20"), Decimal("-0.200000"), "down")

    change, ratio, trend = metric_change(Decimal("10"), Decimal("0"))
    assert (change, ratio, trend) == (Decimal("10"), None, "up")

    assert metric_change(Decimal("10"), None) == (None, None, "unavailable")


def test_coverage_summary_keeps_reasoned_limitations() -> None:
    score, limitations = coverage_summary(
        {
            "accounting": {"score": 100, "reasons": []},
            "bank": {"score": 100, "reasons": []},
            "sales": {"score": 0, "reasons": ["داده فروش وجود ندارد"]},
            "gross_profit": {"score": 0, "reasons": ["تفکیک بهای تمام‌شده موجود نیست"]},
        }
    )

    assert score == 50
    assert limitations == ["داده فروش وجود ندارد", "تفکیک بهای تمام‌شده موجود نیست"]


def test_high_priority_wins_without_hiding_limited_coverage() -> None:
    overall, financial, quality, summary, reasons = dashboard_health(
        analysis_status=AnalysisStatus.COMPLETED_LIMITED,
        finding_generation_status="completed_limited",
        highest_priority=PriorityBand.HIGH,
    )

    assert overall == "attention"
    assert financial == "attention"
    assert quality == "limited"
    assert "اولویت بالا" in summary
    assert reasons == ["پوشش تحلیل مالی محدود است", "پوشش تولید یافته محدود است"]


def test_dashboard_reports_missing_finding_run_separately() -> None:
    overall, financial, quality, _, reasons = dashboard_health(
        analysis_status=AnalysisStatus.COMPLETED,
        finding_generation_status=None,
        highest_priority=None,
    )

    assert overall == "analysis_incomplete"
    assert financial == "stable"
    assert quality == "limited"
    assert reasons == ["موتور یافته برای این snapshot اجرا نشده است"]
