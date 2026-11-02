from pydantic import Field

from .accounting_schemas import StrictInput
from .scenario_schemas import EventShift, HypotheticalEvent


class NativeScenarioInput(StrictInput):
    name: str = Field(min_length=1, max_length=120)
    native_statement_id: str = Field(min_length=1, max_length=36)
    forecast_run_id: str | None = Field(default=None, min_length=1, max_length=36)
    horizon_days: int = Field(default=30, ge=1, le=366)
    shifts: list[EventShift] = Field(default_factory=list, max_length=200)
    hypothetical: list[HypotheticalEvent] = Field(default_factory=list, max_length=200)
