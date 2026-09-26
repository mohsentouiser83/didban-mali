from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.calculations.models import ConfidenceLevel, FinancialPolicy, MetricStatus, MetricUnit


@dataclass
class CalculationContext:
    company_id: UUID
    as_of_date: date
    period_start: date
    period_end: date
    policy: FinancialPolicy
    session: AsyncSession
    # Cached canonical data loaded during calculation run
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class CalculatedMetricResult:
    metric_key: str
    metric_version: str
    status: MetricStatus
    value_numeric: Decimal | None
    unit: MetricUnit
    as_of_date: date
    period_start: date | None = None
    period_end: date | None = None
    coverage_score: int = 100
    confidence: ConfidenceLevel = ConfidenceLevel.HIGH
    input_record_count: int = 0
    excluded_record_count: int = 0
    warnings: list[str] = field(default_factory=list)
    evidence_json: dict[str, Any] = field(default_factory=dict)
    input_record_ids: list[str] = field(default_factory=list)
    calculated_at: datetime = field(default_factory=lambda: datetime.now())


class MetricCalculatorInterface(ABC):
    @property
    @abstractmethod
    def metric_key(self) -> str:
        """Unique key for the metric (e.g. 'cash_position')."""
        pass

    @property
    @abstractmethod
    def metric_version(self) -> str:
        """Version of the formula/calculator (e.g. 'cash-position-v1')."""
        pass

    @property
    @abstractmethod
    def title_fa(self) -> str:
        """Persian title of the metric."""
        pass

    @abstractmethod
    async def calculate(self, ctx: CalculationContext) -> CalculatedMetricResult:
        """Executes deterministic calculation using only canonical inputs from context."""
        pass
