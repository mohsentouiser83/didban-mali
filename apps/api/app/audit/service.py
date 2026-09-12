from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.models import AuditEvent


def record_audit_event(
    session: AsyncSession,
    *,
    action: str,
    entity_type: str,
    actor_id: UUID | None,
    entity_id: UUID | None = None,
    workspace_id: UUID | None = None,
    company_id: UUID | None = None,
    request_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    session.add(
        AuditEvent(
            action=action,
            entity_type=entity_type,
            actor_id=actor_id,
            entity_id=entity_id,
            workspace_id=workspace_id,
            company_id=company_id,
            request_id=request_id,
            metadata_json=metadata or {},
        )
    )
