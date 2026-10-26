"""Explicit source-layout operations; original cells remain immutable."""

from collections.abc import Iterator, Sequence
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class InputScope(BaseModel):
    completeness: Literal["unknown", "partial", "complete"] = "unknown"
    start_date: date | None = None
    end_date: date | None = None

    @model_validator(mode="after")
    def validate_range(self) -> "InputScope":
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("شروع دوره باید قبل از پایان باشد.")
        if self.completeness == "complete" and not (self.start_date and self.end_date):
            raise ValueError("برای تأیید کامل‌بودن، ابتدا و انتهای دوره را مشخص کنید.")
        return self


class SourceLayout(BaseModel):
    number_format: Literal["standard", "dot_thousands"] = "standard"
    row_filter_column: str | None = None
    row_filter_value: str = Field(default="", max_length=160)
    header_rows: int = Field(default=1, ge=1, le=5)
    fill_down_columns: list[str] = Field(default_factory=list, max_length=20)
    invoice_direction: Literal["sales", "purchases", "mixed"] = "mixed"
    invoice_rows: Literal["records", "line_totals", "repeated_totals"] = "records"


def inherited_rows(
    rows: Sequence[tuple[int, dict[str, object]]], columns: Sequence[str]
) -> Iterator[tuple[int, dict[str, object], dict[str, object]]]:
    previous: dict[str, object] = {}
    for number, raw in rows:
        inherited: dict[str, object] = {}
        # A repeated header / total is a group boundary, not a prior document.
        is_header = sum(str(value or "").strip() == key for key, value in raw.items()) >= 2
        if is_header:
            previous.clear()
        else:
            for column in columns:
                value = raw.get(column)
                if value is not None and str(value).strip():
                    previous[column] = value
                elif column in previous:
                    inherited[column] = previous[column]
        yield number, raw, inherited


def effective_raw(raw: dict[str, object], processing: dict[str, object]) -> dict[str, object]:
    inherited = processing.get("inherited_values")
    return {**raw, **inherited} if isinstance(inherited, dict) else raw


def validate_layout(layout: SourceLayout, mapping: dict[str, str], columns: list[str]) -> list[str]:
    if set(layout.fill_down_columns) - set(columns):
        return ["ستون تکرارشونده در فایل وجود ندارد."]
    # Never propagate financial amounts, IDs of individual cash movements, or statuses.
    if layout.row_filter_column:
        if layout.row_filter_column not in columns or not layout.row_filter_value.strip():
            return ["ستون و مقدار حساب موردنظر برای انتخاب ردیف‌ها را مشخص کنید."]
        if layout.row_filter_column not in {
            mapping.get("iban"),
            mapping.get("bank_account_number"),
        }:
            return ["انتخاب ردیف‌ها فقط با ستون شبا یا شماره حساب مجاز است."]
    context = {
        "entry_id",
        "entry_date",
        "account_code",
        "account_name",
        "general_code",
        "general_name",
        "subsidiary_code",
        "subsidiary_name",
        "detail_code",
        "detail_name",
        "invoice_no",
        "tax_id",
        "issue_date",
        "party_name",
        "party_id",
        "customer_name",
        "customer_national_id",
        "subject",
        "reference_tax_id",
        "iban",
        "bank_account_number",
    }
    allowed = {source for target, source in mapping.items() if target in context}
    if set(layout.fill_down_columns) - allowed:
        return ["فقط مشخصات مشترک سند یا فاکتور قابل تکرار هستند؛ مبلغ هر ردیف باید مستقل باشد."]
    return []


def combined_header(rows: Sequence[Sequence[object]]) -> list[object]:
    width = max((len(row) for row in rows), default=0)
    result: list[object] = []
    for index in range(width):
        parts = list(
            dict.fromkeys(
                str(row[index]).strip()
                for row in rows
                if index < len(row) and row[index] is not None and str(row[index]).strip()
            )
        )
        result.append(" / ".join(parts))
    return result


def select_rows(
    rows: list[tuple[int, dict[str, object]]],
    layout: SourceLayout,
) -> tuple[list[tuple[int, dict[str, object]]], int]:
    if not layout.row_filter_column:
        return rows, 0
    from app.imports.mapping import normalize_digits

    def key(value: object) -> str:
        return "".join(normalize_digits(value).upper().split())

    column = layout.row_filter_column
    selected = [
        (number, raw)
        for number, raw, inherited in inherited_rows(rows, layout.fill_down_columns)
        if key(inherited.get(column, raw.get(column, ""))) == key(layout.row_filter_value)
    ]
    return selected, len(rows) - len(selected)


def unknown_filter_rows(rows: list[tuple[int, dict[str, object]]], layout: SourceLayout) -> int:
    column = layout.row_filter_column
    if not column:
        return 0
    return sum(
        not str(inherited.get(column, raw.get(column)) or "").strip()
        for _, raw, inherited in inherited_rows(rows, layout.fill_down_columns)
    )
