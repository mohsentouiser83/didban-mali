from datetime import datetime, timezone
import uuid
from typing import Any
from uuid import UUID

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.service import record_audit_event
from app.integrations.connectors.base import BaseConnector
from app.integrations.connectors.bank_direct import BankStatementConnectorV1
from app.integrations.connectors.sepidar import SepidarConnectorV1
from app.integrations.models import (
    ConnectionStatus,
    IntegrationConnection,
    IntegrationSyncJob,
    IntegrationSyncRecord,
    SyncJobStatus,
    SyncJobType,
    SyncRecordStatus,
)
from app.integrations.schemas import (
    ConnectionTestResult,
    IntegrationConnectionCreate,
    IntegrationConnectionUpdate,
)

# Registry of active production-grade connectors
CONNECTORS: dict[str, BaseConnector] = {
    "sepidar": SepidarConnectorV1(),
    "bank_direct": BankStatementConnectorV1(),
}


def get_connector(provider: str) -> BaseConnector:
    connector = CONNECTORS.get(provider)
    if not connector:
        raise ValueError(f"اتصال‌دهنده برای ارائه‌دهنده '{provider}' پشتیبانی نمی‌شود.")
    return connector


class IntegrationService:
    @staticmethod
    async def list_connections(
        session: AsyncSession, company_id: UUID
    ) -> list[IntegrationConnection]:
        stmt = (
            select(IntegrationConnection)
            .where(IntegrationConnection.company_id == company_id)
            .order_by(desc(IntegrationConnection.created_at))
        )
        res = await session.execute(stmt)
        return list(res.scalars().all())

    @staticmethod
    async def get_connection(
        session: AsyncSession, company_id: UUID, connection_id: UUID
    ) -> IntegrationConnection | None:
        stmt = select(IntegrationConnection).where(
            IntegrationConnection.id == connection_id,
            IntegrationConnection.company_id == company_id,
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    @staticmethod
    async def create_connection(
        session: AsyncSession,
        company_id: UUID,
        payload: IntegrationConnectionCreate,
        actor_id: UUID,
    ) -> IntegrationConnection:
        now = datetime.now(timezone.utc)
        conn = IntegrationConnection(
            id=uuid.uuid4(),
            company_id=company_id,
            provider=payload.provider,
            name=payload.name,
            status=ConnectionStatus.INACTIVE,
            config_json=payload.config,
            encrypted_credentials_json=payload.credentials,
            sync_interval_minutes=payload.sync_interval_minutes,
            created_at=now,
            updated_at=now,
        )
        session.add(conn)
        await session.flush()

        record_audit_event(
            session=session,
            action="integration.connection_created",
            entity_type="integration_connection",
            actor_id=actor_id,
            entity_id=conn.id,
            company_id=company_id,
        )
        await session.commit()
        return conn

    @staticmethod
    async def update_connection(
        session: AsyncSession,
        company_id: UUID,
        connection_id: UUID,
        payload: IntegrationConnectionUpdate,
        actor_id: UUID,
    ) -> IntegrationConnection:
        conn = await IntegrationService.get_connection(session, company_id, connection_id)
        if not conn:
            raise ValueError("اتصال مورد نظر یافت نشد.")

        if payload.name is not None:
            conn.name = payload.name
        if payload.config is not None:
            conn.config_json = payload.config
        if payload.credentials is not None:
            conn.encrypted_credentials_json = payload.credentials
        if payload.sync_interval_minutes is not None:
            conn.sync_interval_minutes = payload.sync_interval_minutes
        if payload.status is not None:
            conn.status = payload.status

        conn.updated_at = datetime.now(timezone.utc)
        await session.flush()

        record_audit_event(
            session=session,
            action="integration.connection_updated",
            entity_type="integration_connection",
            actor_id=actor_id,
            entity_id=conn.id,
            company_id=company_id,
        )
        await session.commit()
        return conn

    @staticmethod
    async def delete_connection(
        session: AsyncSession, company_id: UUID, connection_id: UUID, actor_id: UUID
    ) -> None:
        conn = await IntegrationService.get_connection(session, company_id, connection_id)
        if not conn:
            raise ValueError("اتصال مورد نظر یافت نشد.")

        await session.delete(conn)
        record_audit_event(
            session=session,
            action="integration.connection_deleted",
            entity_type="integration_connection",
            actor_id=actor_id,
            entity_id=connection_id,
            company_id=company_id,
        )
        await session.commit()

    @staticmethod
    async def test_connection(
        session: AsyncSession, company_id: UUID, connection_id: UUID
    ) -> ConnectionTestResult:
        conn = await IntegrationService.get_connection(session, company_id, connection_id)
        if not conn:
            return ConnectionTestResult(
                success=False,
                status="error",
                message_fa="اتصال یافت نشد.",
                latency_ms=0,
            )

        connector = get_connector(conn.provider)
        result = await connector.test_connection(
            config=conn.config_json,
            credentials=conn.encrypted_credentials_json,
        )

        if result.success:
            conn.status = ConnectionStatus.CONNECTED
            conn.last_error_message = None
        else:
            conn.status = result.status
            conn.last_error_message = result.message_fa

        conn.updated_at = datetime.now(timezone.utc)
        await session.commit()
        return result

    @staticmethod
    async def trigger_sync(
        session: AsyncSession,
        company_id: UUID,
        connection_id: UUID,
        sync_type: str = SyncJobType.MANUAL,
        actor_id: UUID | None = None,
    ) -> IntegrationSyncJob:
        conn = await IntegrationService.get_connection(session, company_id, connection_id)
        if not conn:
            raise ValueError("اتصال یافت نشد.")

        now = datetime.now(timezone.utc)
        conn.status = ConnectionStatus.SYNCING
        job = IntegrationSyncJob(
            id=uuid.uuid4(),
            company_id=company_id,
            connection_id=conn.id,
            sync_type=sync_type,
            status=SyncJobStatus.RUNNING,
            started_at=now,
            records_received=0,
            records_imported=0,
            records_rejected=0,
            summary_json={},
            created_at=now,
            updated_at=now,
        )
        session.add(job)
        await session.flush()

        try:
            connector = get_connector(conn.provider)
            # Fetch latest watermark from previous successful job
            watermark_stmt = (
                select(IntegrationSyncJob.watermark_cursor)
                .where(
                    IntegrationSyncJob.connection_id == conn.id,
                    IntegrationSyncJob.status == SyncJobStatus.COMPLETED,
                )
                .order_by(desc(IntegrationSyncJob.completed_at))
                .limit(1)
            )
            watermark_res = await session.execute(watermark_stmt)
            last_watermark = watermark_res.scalar_one_or_none()

            batch = await connector.fetch_batch(
                company_id=company_id,
                config=conn.config_json,
                credentials=conn.encrypted_credentials_json,
                watermark=last_watermark,
            )

            job.records_received = len(batch.records)
            imported_count = 0
            skipped_count = 0

            for raw in batch.records:
                # Idempotency check: see if fingerprint already exists
                fp_stmt = select(IntegrationSyncRecord.id).where(
                    IntegrationSyncRecord.company_id == company_id,
                    IntegrationSyncRecord.connection_id == conn.id,
                    IntegrationSyncRecord.source_fingerprint == raw.fingerprint,
                )
                existing = (await session.execute(fp_stmt)).scalar_one_or_none()

                if existing:
                    skipped_count += 1
                    continue

                # Record is brand new -> persist idempotently
                sync_rec = IntegrationSyncRecord(
                    id=uuid.uuid4(),
                    company_id=company_id,
                    connection_id=conn.id,
                    job_id=job.id,
                    source_entity_type=raw.source_entity_type,
                    source_record_id=raw.source_record_id,
                    source_fingerprint=raw.fingerprint,
                    status=SyncRecordStatus.IMPORTED,
                    raw_payload_json=raw.raw_payload,
                    created_at=now,
                )
                session.add(sync_rec)
                imported_count += 1

            job.records_imported = imported_count
            job.records_rejected = 0
            job.status = SyncJobStatus.COMPLETED
            job.completed_at = datetime.now(timezone.utc)
            job.watermark_cursor = batch.new_watermark
            job.summary_json = {
                **batch.summary,
                "skipped_duplicates": skipped_count,
            }

            conn.status = ConnectionStatus.CONNECTED
            conn.last_sync_at = job.completed_at
            conn.last_sync_record_count = imported_count
            conn.last_error_message = None

            if actor_id:
                record_audit_event(
                    session=session,
                    action="integration.sync_completed",
                    entity_type="integration_sync_job",
                    actor_id=actor_id,
                    entity_id=job.id,
                    company_id=company_id,
                )

        except Exception as exc:
            job.status = SyncJobStatus.FAILED
            job.completed_at = datetime.now(timezone.utc)
            job.error_message = str(exc)
            conn.status = ConnectionStatus.ERROR
            conn.last_error_message = f"خطا در همگام‌سازی: {str(exc)}"

        await session.commit()
        return job

    @staticmethod
    async def list_sync_jobs(
        session: AsyncSession, company_id: UUID, connection_id: UUID | None = None
    ) -> list[IntegrationSyncJob]:
        stmt = (
            select(IntegrationSyncJob)
            .where(IntegrationSyncJob.company_id == company_id)
            .order_by(desc(IntegrationSyncJob.created_at))
        )
        if connection_id:
            stmt = stmt.where(IntegrationSyncJob.connection_id == connection_id)
        stmt = stmt.limit(50)
        res = await session.execute(stmt)
        return list(res.scalars().all())
