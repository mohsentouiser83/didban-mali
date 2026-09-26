from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
import hashlib
import json
from typing import Any
from uuid import UUID

from app.integrations.schemas import ConnectionTestResult


@dataclass
class RawRecord:
    source_entity_type: str  # journal_entry, invoice, bank_transaction
    source_record_id: str
    fingerprint: str
    raw_payload: dict[str, Any]
    occurred_at: datetime


@dataclass
class SyncBatch:
    records: list[RawRecord]
    new_watermark: str | None
    has_more: bool
    summary: dict[str, Any]


class BaseConnector(ABC):
    provider_name: str

    @abstractmethod
    async def test_connection(
        self,
        config: dict[str, Any],
        credentials: dict[str, Any],
    ) -> ConnectionTestResult:
        """Verify endpoint connectivity and credentials validity."""
        pass

    @abstractmethod
    async def fetch_batch(
        self,
        company_id: UUID,
        config: dict[str, Any],
        credentials: dict[str, Any],
        watermark: str | None = None,
        limit: int = 500,
    ) -> SyncBatch:
        """Fetch raw data incrementally from the external financial system."""
        pass

    @staticmethod
    def compute_fingerprint(company_id: UUID, provider: str, entity_type: str, record_id: str, signature_data: dict[str, Any]) -> str:
        """
        Compute deterministic SHA256 fingerprint for idempotency.
        Ensures identical financial events are not duplicated across multiple syncs.
        """
        data = {
            "company_id": str(company_id),
            "provider": provider,
            "entity_type": entity_type,
            "record_id": str(record_id),
            "sig": signature_data,
        }
        serialized = json.dumps(data, sort_keys=True, default=str)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()
