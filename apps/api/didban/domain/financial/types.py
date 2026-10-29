"""Immutable boundary objects for the database-independent financial engine."""

from dataclasses import dataclass, field
from datetime import date


@dataclass(frozen=True)
class FinancialRow:
    normalized_id: str
    source_row_id: str
    file_id: str
    interpretation_id: str
    sheet: str
    row_number: int
    kind: str
    values: dict
    state: str = "valid"
    error_codes: tuple[str, ...] = ()
    source_name: str | None = None


@dataclass(frozen=True)
class PeriodSpec:
    id: str
    starts_on: date
    ends_on: date
    as_of_date: date | None = None

    @property
    def cutoff(self) -> date:
        return self.as_of_date or self.ends_on


@dataclass(frozen=True)
class EvidenceSpec:
    rule_key: str
    description_fa: str
    source_row_ids: tuple[str, ...] = ()
    fact_values: tuple[str, ...] = ()
    facts: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Comparison:
    period_id: str
    value: str | None
    delta: str | None
    percent: str | None
    reason_codes: tuple[str, ...] = ()


@dataclass(frozen=True)
class MetricResult:
    metric_key: str
    basis: str
    value: str | None
    status: str
    reason_codes: tuple[str, ...] = ()
    coverage: tuple[dict, ...] = ()
    evidence: tuple[EvidenceSpec, ...] = ()
    comparison: Comparison | None = None
    formula_version: str = "financial-v1.1"
    details: dict = field(default_factory=dict)
