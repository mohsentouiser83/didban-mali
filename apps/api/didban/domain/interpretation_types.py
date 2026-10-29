from __future__ import annotations
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Question:
    code: str
    sheet: str
    field: str
    message: str
    choices: tuple[str, ...]
    account_code: str | None = None


@dataclass
class CanonicalRow:
    number: int
    raw: list
    values: dict
    errors: list[str] = field(default_factory=list)
    fingerprint: str = ""
    logical_key: str | None = None
    state: str = "valid"


@dataclass
class InterpretedSheet:
    name: str
    header_row: int
    mapping: dict[str, int]
    kind: str
    unit: str | None
    calendar: str | None
    provenance: str
    rows: list[CanonicalRow]
    controls: list[dict]
    skipped: bool = False
    skipped_count: int = 0
    structural_rows: list[CanonicalRow] = field(default_factory=list)


@dataclass
class Analysis:
    sheets: list[InterpretedSheet]
    previews: list[dict]
    question: Question | None = None
    related_sources: list[dict] = field(default_factory=list)
