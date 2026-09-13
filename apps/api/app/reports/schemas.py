from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.reports.models import ReportStatus


class ReportCreateRequest(BaseModel):
    analysis_run_id: UUID | None = None
    period_start: date | None = None
    period_end: date | None = None
    title_fa: str = Field(default="گزارش بررسی مالی", min_length=1, max_length=200)
    advisor_note: str | None = Field(default=None, max_length=4000)

    @field_validator("title_fa")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("عنوان گزارش نباید خالی باشد.")
        return normalized

    @field_validator("advisor_note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("یادداشت مشاور نباید خالی باشد.")
        return normalized

    @model_validator(mode="after")
    def validate_selector(self) -> "ReportCreateRequest":
        has_period = self.period_start is not None or self.period_end is not None
        if has_period and (self.period_start is None or self.period_end is None):
            raise ValueError("ابتدا و انتهای دوره باید با هم ارسال شوند.")
        if self.analysis_run_id is not None and has_period:
            raise ValueError("فقط یکی از شناسه تحلیل یا دوره را انتخاب کنید.")
        if self.period_start and self.period_end and self.period_start > self.period_end:
            raise ValueError("ابتدای دوره نباید پس از انتهای دوره باشد.")
        return self


class ReportResponse(BaseModel):
    id: UUID
    company_id: UUID
    analysis_run_id: UUID
    period_start: date
    period_end: date
    title_fa: str
    advisor_note: str | None
    payload: dict[str, Any]
    status: ReportStatus
    progress: int
    stage: str
    download_ready: bool
    pdf_sha256: str | None
    pdf_size_bytes: int | None
    created_by: UUID
    started_at: datetime | None
    completed_at: datetime | None
    failure_code: str | None
    failure_message: str | None
    created_at: datetime
