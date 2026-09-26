from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID


@dataclass
class FindingEvidenceSpec:
    ordinal: int
    evidence_type: str
    title_fa: str
    description_fa: str
    payload: dict[str, Any]


@dataclass
class FindingCandidate:
    fingerprint: str
    rule_code: str
    category: str
    severity: str
    title_fa: str
    summary_fa: str
    financial_impact_irr: Decimal | None
    source_entity_type: str | None
    source_entity_id: UUID | None
    period_start: date
    period_end: date
    evidence_items: list[FindingEvidenceSpec] = field(default_factory=list)
    reconciliation_match_id: UUID | None = None
    calculation_run_id: UUID | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class BaseFindingRule(ABC):
    @property
    @abstractmethod
    def rule_code(self) -> str:
        """Unique deterministic code of the rule."""
        pass

    @property
    @abstractmethod
    def default_severity(self) -> str:
        """Default severity: critical, high, medium, low."""
        pass

    @property
    @abstractmethod
    def category(self) -> str:
        """Category: cash_and_bank, revenue_and_ar, liquidity_and_runway."""
        pass

    @abstractmethod
    async def evaluate(self, context: Any) -> list[FindingCandidate]:
        """Evaluate the rule against context and return candidate findings."""
        pass
