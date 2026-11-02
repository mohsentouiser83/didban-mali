from datetime import date

from pydantic import Field

from .accounting_schemas import StrictInput


class PeriodLockInput(StrictInput):
    reason: str = Field(min_length=1, max_length=1000)
    acknowledge_warnings: bool = False
    expected_checklist_digest: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")


class PeriodChecklistItemInput(StrictInput):
    title: str = Field(min_length=1, max_length=200)
    required: bool = True
    responsible_member_id: str | None = Field(default=None, max_length=36)
    due_date: date | None = None
    active: bool = True
    completed: bool = False
    reason: str = Field(min_length=1, max_length=1000)
