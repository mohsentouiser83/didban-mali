from typing import Literal

from pydantic import Field, model_validator

from .accounting_schemas import StrictInput


class BotNotificationInput(StrictInput):
    enabled: bool = False
    events: list[
        Literal["report_ready", "question_open", "daily_summary", "cheque_due", "draft_approval"]
    ] = Field(default_factory=list, max_length=5)
    quiet_enabled: bool = False
    quiet_start: str = Field(default="22:00", pattern=r"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")
    quiet_end: str = Field(default="08:00", pattern=r"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")
    summary_time: str = Field(default="09:00", pattern=r"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")

    @model_validator(mode="after")
    def consistent(self):
        if len(self.events) != len(set(self.events)):
            raise ValueError("Duplicate events")
        if self.enabled and not self.events:
            raise ValueError("Select events")
        if self.quiet_enabled and self.quiet_start == self.quiet_end:
            raise ValueError("Quiet boundaries must differ")
        return self


class DeliverDocumentInput(StrictInput):
    provider: Literal["telegram", "bale"]
    export_type: Literal["report_builder", "native_statement", "financial_report"]
    export_id: str = Field(min_length=1, max_length=64)
    caption: str | None = Field(default=None, max_length=1024)
