from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_serializer, model_validator

from app.receivables.schemas import AgingBucketDetail, CustomerReceivableItem, ReceivableInvoiceItem


class DateRange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def valid_range(self) -> "DateRange":
        if self.start_date > self.end_date or (self.end_date - self.start_date).days > 732:
            raise ValueError("بازه باید مرتب و حداکثر دو سال باشد.")
        if self.start_date == date.min:
            raise ValueError("تاریخ شروع معتبر نیست.")
        return self


class PeriodCreate(DateRange):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=120, pattern=r"\S")


class PeriodItem(PeriodCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID


class ReceiptCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    received_on: date
    amount_irr: Decimal = Field(gt=0, max_digits=20, decimal_places=0)
    reference: str | None = Field(default=None, max_length=200)

    @field_serializer("amount_irr")
    def amount(self, value: Decimal) -> str:
        return format(value, "f")


class ReceiptItem(ReceiptCreate):
    model_config = ConfigDict(from_attributes=True)
    id: UUID


class ReceiptHistory(BaseModel):
    model_config = ConfigDict(extra="forbid")
    receipts: list[ReceiptCreate] = Field(max_length=1000)
    # Full-history replacement is explicit, so an imported cumulative total is never guessed.
    confirm_complete: bool
    expected_version: int = Field(ge=0)


class InvoiceHistory(BaseModel):
    invoice_id: UUID
    invoice_no: str
    customer_name: str
    issue_date: date
    gross_amount_irr: str
    paid_amount_irr: str | None
    complete: bool
    version: int
    receipts: list[ReceiptItem]


class CashDay(BaseModel):
    date: date
    inflows_irr: str
    outflows_irr: str
    balance_irr: str | None


class CashPeriodReport(BaseModel):
    opening_balance_irr: str | None
    inflows_irr: str | None
    outflows_irr: str | None
    closing_balance_irr: str | None
    days: list[CashDay]
    warnings: list[str]


class ReceivablesPeriodReport(BaseModel):
    opening_balance_irr: str | None
    sales_irr: str | None
    receipts_irr: str | None
    closing_balance_irr: str | None
    overdue_irr: str | None
    history_complete: bool
    warnings: list[str]
    buckets: list[AgingBucketDetail]
    customers: list[CustomerReceivableItem]
    invoices: list[ReceivableInvoiceItem]


class PeriodReport(DateRange):
    cash: CashPeriodReport
    receivables: ReceivablesPeriodReport
