"""Data presence and declared coverage are separate from successful row parsing."""

from collections.abc import Sequence
from datetime import date, timedelta
from typing import Any

from app.imports.structure import InputScope


def assess_coverage(
    batches: Sequence[Any],
    start: date,
    end: date,
    *,
    confirmed: bool = False,
) -> dict[str, Any]:
    rejected = sum(batch.rejected_count for batch in batches)
    unclassified = sum(
        batch.coverage_json.get("row_selection", {}).get("unclassified", 0) for batch in batches
    )
    intervals: list[tuple[date, date]] = []
    for batch in batches:
        scope = InputScope.model_validate(batch.coverage_json.get("input_scope", {}))
        if scope.completeness == "complete" and scope.start_date and scope.end_date:
            intervals.append((scope.start_date, scope.end_date))
    cursor = start
    covered = False
    for left, right in sorted(intervals):
        if left > cursor:
            break
        if right >= end:
            covered = True
            break
        if right >= cursor:
            cursor = right + timedelta(days=1)
    period_complete = confirmed or covered
    reasons: list[str] = []
    if not batches:
        reasons.append("فایل متناظر انتخاب نشده است.")
    elif not period_complete:
        reasons.append("کامل‌بودن فایل‌ها در بازه انتخاب‌شده تأیید نشده است.")
    if rejected:
        reasons.append(f"{rejected} ردیف دارای خطا از تطبیق کنار گذاشته شده است.")
    if unclassified:
        reasons.append(f"حساب بانکی {unclassified} ردیف برای انتخاب داده‌ها مشخص نیست.")
    return {
        "complete": bool(batches) and period_complete and rejected == 0 and unclassified == 0,
        "period_confirmed": period_complete,
        "rejected_rows": rejected,
        "reasons": reasons,
        "batch_ids": [str(batch.id) for batch in batches],
    }
