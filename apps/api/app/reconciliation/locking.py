"""Serialize canonical reconciliation writers without granting updates to source rows."""

from hashlib import blake2b
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


async def lock_reconciliation_company(session: AsyncSession, company_id: UUID) -> None:
    key = int.from_bytes(
        blake2b(company_id.bytes, digest_size=8, person=b"reconcile").digest(), signed=True
    )
    await session.execute(select(func.pg_advisory_xact_lock(key)))
