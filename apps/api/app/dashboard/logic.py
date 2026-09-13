from decimal import Decimal
from typing import Any

from app.analysis.models import AnalysisStatus
from app.findings.models import PriorityBand

PRIORITY_ORDER = {
    PriorityBand.CRITICAL: 4,
    PriorityBand.HIGH: 3,
    PriorityBand.MEDIUM: 2,
    PriorityBand.LOW: 1,
}


def metric_change(
    current: Decimal | None, previous: Decimal | None
) -> tuple[Decimal | None, Decimal | None, str]:
    if current is None or previous is None:
        return None, None, "unavailable"
    change = current - previous
    ratio = change / abs(previous) if previous != 0 else None
    trend = "up" if change > 0 else "down" if change < 0 else "flat"
    return change, ratio.quantize(Decimal("0.000001")) if ratio is not None else None, trend


def coverage_summary(sections: dict[str, Any]) -> tuple[int, list[str]]:
    scores: list[int] = []
    limitations: list[str] = []
    for section in sections.values():
        if not isinstance(section, dict):
            continue
        score = section.get("score")
        if isinstance(score, int | float):
            scores.append(round(score))
        reasons = section.get("reasons", [])
        if isinstance(reasons, list):
            limitations.extend(str(reason) for reason in reasons if reason)
    overall = round(sum(scores) / len(scores)) if scores else 0
    return overall, list(dict.fromkeys(limitations))


def dashboard_health(
    *,
    analysis_status: AnalysisStatus,
    finding_generation_status: str | None,
    highest_priority: PriorityBand | None,
) -> tuple[str, str, str, str, list[str]]:
    if highest_priority == PriorityBand.CRITICAL:
        financial_state = "critical_attention"
    elif highest_priority == PriorityBand.HIGH:
        financial_state = "attention"
    elif highest_priority == PriorityBand.MEDIUM:
        financial_state = "monitor"
    else:
        financial_state = "stable"
    limited = analysis_status == AnalysisStatus.COMPLETED_LIMITED or finding_generation_status in {
        None,
        "completed_limited",
    }
    data_quality = "limited" if limited else "complete"
    reasons: list[str] = []
    if analysis_status == AnalysisStatus.COMPLETED_LIMITED:
        reasons.append("پوشش تحلیل مالی محدود است")
    if finding_generation_status is None:
        reasons.append("موتور یافته برای این snapshot اجرا نشده است")
    elif finding_generation_status == "completed_limited":
        reasons.append("پوشش تولید یافته محدود است")
    if financial_state in {"critical_attention", "attention"}:
        overall = financial_state
    elif finding_generation_status is None:
        overall = "analysis_incomplete"
    elif limited:
        overall = "limited_visibility"
    else:
        overall = financial_state
    summaries = {
        "critical_attention": "حداقل یک یافته بحرانی باز وجود دارد و بررسی فوری لازم است.",
        "attention": "حداقل یک یافته با اولویت بالا برای بررسی وجود دارد.",
        "monitor": "یافته‌های باز نیازمند پایش و بررسی برنامه‌ریزی‌شده‌اند.",
        "stable": "در snapshot انتخابی یافته باز با اولویت قابل توجه ثبت نشده است.",
        "limited_visibility": "وضعیت قابل مشاهده است، اما محدودیت پوشش باید در تفسیر لحاظ شود.",
        "analysis_incomplete": "تحلیل موجود است، اما تولید یافته برای این snapshot کامل نشده است.",
    }
    return overall, financial_state, data_quality, summaries[overall], reasons
