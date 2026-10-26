from __future__ import annotations
from dataclasses import dataclass
from datetime import date, datetime


@dataclass(frozen=True)
class Row:
    number: int
    values: list
    formulas: frozenset[int] = frozenset()


@dataclass(frozen=True)
class Sheet:
    name: str
    rows: list[Row]


def raw_value(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if value is None:
        return None
    return str(value)
