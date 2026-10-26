"""Supported configuration parameters; structural validity is not statistical proof."""

from __future__ import annotations
from ..errors import ApiError


def validate_parameters(kind: str, parameters: dict, settings) -> tuple[dict, str]:
    def invalid():
        raise ApiError(422, "invalid_policy_parameters", "پارامتر سیاست معتبر نیست.")

    if kind == "forecast":
        if set(parameters) != {"minimum_events", "lookback_days", "delay_method"}:
            invalid()
        if (
            type(parameters["minimum_events"]) is not int
            or not 1 <= parameters["minimum_events"] <= 10000
            or type(parameters["lookback_days"]) is not int
            or not 1 <= parameters["lookback_days"] <= 3650
            or parameters["delay_method"] != "amount_weighted_median"
        ):
            invalid()
        return parameters, "proposed"
    if kind == "upload":
        keys = {"max_files", "max_data_rows", "max_file_bytes", "max_expanded_bytes"}
        if set(parameters) != keys or any(
            type(v) is not int or v < 1 for v in parameters.values()
        ):
            invalid()
        if (
            parameters["max_files"] > 10
            or parameters["max_data_rows"] > settings.max_rows
            or parameters["max_file_bytes"] > settings.max_file_bytes
            or parameters["max_expanded_bytes"] > settings.max_expanded_bytes
        ):
            invalid()
        return parameters | {
            "max_nonempty_rows": parameters["max_data_rows"],
            "auto_interpretation": settings.auto_interpretation,
            "auto_financial": settings.auto_financial,
            "auto_analysis": settings.auto_analysis,
        }, "evaluated"
    raise ApiError(
        422, "unsupported_policy_kind", "تنظیم این نوع سیاست هنوز پشتیبانی نمی‌شود."
    )
