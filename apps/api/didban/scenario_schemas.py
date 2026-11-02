"""Explicit scenario assumptions; no implicit amount or date defaults."""

from datetime import date
from typing import Literal

from pydantic import Field

from .accounting_schemas import StrictInput


class EventShift(StrictInput):
    event_id: str = Field(min_length=1, max_length=80)
    date: date


class HypotheticalEvent(StrictInput):
    label: str = Field(min_length=1, max_length=120)
    date: date
    direction: Literal["receipt", "payment"]
    amount: str = Field(min_length=1, max_length=80)
    unit: Literal["IRR", "TOMAN"]


class ScenarioInput(StrictInput):
    name: str = Field(min_length=1, max_length=120)
    manifest_id: str = Field(min_length=1, max_length=36)
    shifts: list[EventShift] = Field(default_factory=list, max_length=200)
    hypothetical: list[HypotheticalEvent] = Field(default_factory=list, max_length=200)
