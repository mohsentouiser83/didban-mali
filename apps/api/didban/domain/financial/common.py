from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation
import re

from .types import EvidenceSpec, FinancialRow, MetricResult, PeriodSpec

ZERO = Decimal(0)
LIMIT = Decimal(10) ** 32


class UnsafeFinancialData(ValueError):
    pass


def amount(value: object) -> Decimal:
    if not isinstance(value, str) or not re.fullmatch(r"-?\d+(?:\.\d{1,6})?", value):
        raise UnsafeFinancialData("invalid_amount")
    try:
        result = Decimal(value)
    except InvalidOperation as exc:
        raise UnsafeFinancialData("invalid_amount") from exc
    if not result.is_finite() or abs(result) >= LIMIT:
        raise UnsafeFinancialData("invalid_amount")
    return result


def day(value: object) -> date:
    try:
        if not isinstance(value, str):
            raise ValueError()
        return date.fromisoformat(value)
    except ValueError as exc:
        raise UnsafeFinancialData("invalid_date") from exc


def decimal_text(value: Decimal) -> str:
    rendered = format(value, "f") if value else "0"
    return rendered.rstrip("0").rstrip(".") if "." in rendered else rendered


def usable(row: FinancialRow) -> bool:
    return (
        row.state == "valid" and not row.error_codes and row.values.get("unit") == "IRR"
    )


def coverage(kind: str, start: date, end: date, declarations: dict) -> tuple[dict, ...]:
    raw = declarations.get("coverage", {}).get(kind, {})
    items = raw if isinstance(raw, list) else [raw]
    return tuple(
        {"scope_key": kind, **item} for item in items if isinstance(item, dict)
    )


def coverage_reason(
    kind: str, start: date, end: date, declarations: dict
) -> str | None:
    items = coverage(kind, start, end, declarations)
    for item in items:
        try:
            if (
                item.get("provenance")
                and day(item.get("starts_on")) <= start
                and day(item.get("ends_on")) >= end
            ):
                if item.get("state") == "complete":
                    return None
                return "coverage_incomplete"
        except UnsafeFinancialData:
            continue
    return "coverage_unknown"


def result(
    key: str,
    basis: str,
    value: Decimal | None,
    rows: list[FinancialRow],
    reasons: list[str] | tuple[str, ...] = (),
    scopes: tuple[dict, ...] = (),
    details: dict | None = None,
) -> MetricResult:
    codes = list(dict.fromkeys(reasons))
    if value is not None and abs(value) >= LIMIT:
        value = None
        codes.append("aggregate_out_of_range")
    return MetricResult(
        key,
        basis,
        None if value is None else decimal_text(value),
        "unavailable" if value is None else "available",
        tuple(dict.fromkeys(codes)),
        scopes,
        (
            EvidenceSpec(
                f"financial.{key}.v1",
                "محاسبه قطعی از ردیف‌های منبع و کنترل‌های مستقل",
                tuple(dict.fromkeys(r.source_row_id for r in rows)),
                () if value is None else (decimal_text(value),),
                {
                    "normalized_ids": [r.normalized_id for r in rows],
                    "interpretation_ids": sorted({r.interpretation_id for r in rows}),
                    "reason_codes": codes,
                },
            ),
        ),
        details=details or {},
    )


def selected(rows: list[FinancialRow], kind: str) -> list[FinancialRow]:
    # Deduplicate the same pinned row only. Equal independent transactions remain.
    unique: dict[str, FinancialRow] = {}
    for row in rows:
        if row.kind == kind and row.state != "excluded_overlap":
            old = unique.get(row.normalized_id)
            if old is not None and old != row:
                raise UnsafeFinancialData("conflicting_row_identity")
            unique[row.normalized_id] = row
    return list(unique.values())


def period_valid(period: PeriodSpec) -> bool:
    return (
        period.starts_on <= period.ends_on
        and period.starts_on <= period.cutoff <= period.ends_on
    )
