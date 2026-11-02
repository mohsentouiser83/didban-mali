"""Allowlisted report descriptions; no expression, SQL or model arithmetic."""

from typing import Literal

from pydantic import Field, model_validator

from .schemas import InputModel

METRIC_KEYS = {
    "revenue",
    "expense",
    "pre_tax_profit",
    "net_profit",
    "ar_ledger",
    "ap_trade_ledger",
    "debt_total_ledger",
    "cash",
    "cash_subset",
    "ar_invoice",
    "ap_invoice",
    "ar_difference",
    "ap_difference",
}
INVOICE_COLUMNS = {"reference", "party_id", "date", "due_date", "amount", "paid", "remaining", "status"}
METRIC_COLUMNS = {"label", "value", "unit", "status", "reason"}


class ReportFilters(InputModel):
    direction: Literal["all", "sales", "purchases"] = "all"
    party_id: str = Field(default="", max_length=100)
    overdue_only: bool = False


class ReportSpec(InputModel):
    period_id: str = Field(min_length=1, max_length=36)
    source: Literal["imported_manifest", "native_statement", "native_invoice"] = "imported_manifest"
    kind: Literal["metrics", "invoices"] = "metrics"
    basis: Literal["ledger", "bank", "invoice", "comparable_difference"] = "ledger"
    metric_keys: list[str] = Field(
        default_factory=lambda: ["revenue", "expense", "net_profit"], max_length=13
    )
    columns: list[str] = Field(
        default_factory=lambda: ["label", "value", "status"], min_length=1, max_length=6
    )
    filters: ReportFilters = Field(default_factory=ReportFilters)

    @model_validator(mode="after")
    def validate_selection(self):
        if self.source == "native_invoice" and self.kind != "invoices":
            raise ValueError("منبع فاکتور بومی فقط گزارش فاکتورها را پشتیبانی می‌کند.")
        if self.source == "native_statement" and (
            self.kind != "metrics"
            or self.basis != "ledger"
            or not set(self.metric_keys)
            <= {"cash", "revenue", "expense", "pre_tax_profit", "ar_ledger", "ap_trade_ledger"}
        ):
            raise ValueError("دفتر اصلی فقط شاخص‌های گزارش مالی ثابت را پشتیبانی می‌کند.")
        if len(set(self.columns)) != len(self.columns) or len(set(self.metric_keys)) != len(self.metric_keys):
            raise ValueError("ستون یا شاخص تکراری است.")
        if self.kind == "metrics":
            if (
                not self.metric_keys
                or not set(self.metric_keys) <= METRIC_KEYS
                or not set(self.columns) <= METRIC_COLUMNS
            ):
                raise ValueError("شاخص یا ستون پشتیبانی نمی‌شود.")
            if self.filters != ReportFilters():
                raise ValueError("فیلتر طرف حساب و سررسید فقط برای گزارش فاکتورها است.")
        elif self.basis != "invoice" or self.metric_keys or not set(self.columns) <= INVOICE_COLUMNS:
            raise ValueError("گزارش فاکتور باید مبنای فاکتوری و ستون‌های معتبر داشته باشد.")
        return self


class PreviewInput(InputModel):
    spec: ReportSpec


class SaveReportInput(InputModel):
    name: str = Field(min_length=1, max_length=120)
    spec: ReportSpec
    preview_manifest_id: str | None = Field(default=None, min_length=1, max_length=36)
    preview_native_statement_id: str | None = Field(default=None, min_length=1, max_length=36)

    preview_native_invoice_snapshot_id: str | None = Field(default=None, min_length=1, max_length=36)

    @model_validator(mode="after")
    def exact_source(self):
        ids = {
            "imported_manifest": self.preview_manifest_id,
            "native_statement": self.preview_native_statement_id,
            "native_invoice": self.preview_native_invoice_snapshot_id,
        }
        if not ids[self.spec.source] or sum(value is not None for value in ids.values()) != 1:
            raise ValueError("فقط نسخهٔ دقیق منبع انتخاب‌شده را پیش‌نمایش کنید.")
        return self


class RerunInput(InputModel):
    expected_version: int = Field(ge=1)


class InterpretReportInput(InputModel):
    source: Literal["imported_manifest", "native_statement", "native_invoice"] = "imported_manifest"
    question: str = Field(min_length=1, max_length=1000)
    period_id: str = Field(min_length=1, max_length=36)
