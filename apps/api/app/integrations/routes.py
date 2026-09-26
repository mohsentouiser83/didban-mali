from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.companies.dependencies import CurrentCompanyAccess
from app.core.database import get_db
from app.identity.dependencies import get_current_user
from app.identity.models import User
from app.integrations.models import IntegrationConnection, IntegrationSyncJob
from app.integrations.schemas import (
    AgentKeyResponse,
    AgentSyncPushReceipt,
    AgentSyncPushRequest,
    ConnectionTestResult,
    IntegrationConnectionCreate,
    IntegrationConnectionResponse,
    IntegrationConnectionUpdate,
    IntegrationSyncJobResponse,
    TriggerSyncRequest,
)
from app.integrations.service import IntegrationService

router = APIRouter(prefix="/companies/{company_id}/integrations", tags=["integrations"])


def _to_conn_response(conn: IntegrationConnection) -> IntegrationConnectionResponse:
    return IntegrationConnectionResponse(
        id=conn.id,
        company_id=conn.company_id,
        provider=conn.provider,
        name=conn.name,
        status=conn.status,
        config=conn.config_json,
        last_sync_at=conn.last_sync_at,
        next_sync_at=conn.next_sync_at,
        last_error_message=conn.last_error_message,
        last_sync_record_count=conn.last_sync_record_count,
        sync_interval_minutes=conn.sync_interval_minutes,
        created_at=conn.created_at,
        updated_at=conn.updated_at,
    )


def _to_job_response(job: IntegrationSyncJob) -> IntegrationSyncJobResponse:
    return IntegrationSyncJobResponse(
        id=job.id,
        company_id=job.company_id,
        connection_id=job.connection_id,
        sync_type=job.sync_type,
        status=job.status,
        started_at=job.started_at,
        completed_at=job.completed_at,
        records_received=job.records_received,
        records_imported=job.records_imported,
        records_rejected=job.records_rejected,
        watermark_cursor=job.watermark_cursor,
        summary=job.summary_json,
        error_message=job.error_message,
        created_at=job.created_at,
    )


@router.get("", response_model=list[IntegrationConnectionResponse])
async def list_connections(
    company_id: UUID,
    access: CurrentCompanyAccess,
    session: AsyncSession = Depends(get_db),
) -> list[IntegrationConnectionResponse]:
    conns = await IntegrationService.list_connections(session, company_id)
    return [_to_conn_response(c) for c in conns]


@router.post("", response_model=IntegrationConnectionResponse, status_code=status.HTTP_201_CREATED)
async def create_connection(
    company_id: UUID,
    payload: IntegrationConnectionCreate,
    access: CurrentCompanyAccess,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> IntegrationConnectionResponse:
    conn = await IntegrationService.create_connection(
        session=session,
        company_id=company_id,
        payload=payload,
        actor_id=user.id,
    )
    return _to_conn_response(conn)


@router.get("/{connection_id}", response_model=IntegrationConnectionResponse)
async def get_connection(
    company_id: UUID,
    connection_id: UUID,
    access: CurrentCompanyAccess,
    session: AsyncSession = Depends(get_db),
) -> IntegrationConnectionResponse:
    conn = await IntegrationService.get_connection(session, company_id, connection_id)
    if not conn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="اتصال یافت نشد.")
    return _to_conn_response(conn)


@router.patch("/{connection_id}", response_model=IntegrationConnectionResponse)
async def update_connection(
    company_id: UUID,
    connection_id: UUID,
    payload: IntegrationConnectionUpdate,
    access: CurrentCompanyAccess,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> IntegrationConnectionResponse:
    try:
        conn = await IntegrationService.update_connection(
            session=session,
            company_id=company_id,
            connection_id=connection_id,
            payload=payload,
            actor_id=user.id,
        )
        return _to_conn_response(conn)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_connection(
    company_id: UUID,
    connection_id: UUID,
    access: CurrentCompanyAccess,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> None:
    try:
        await IntegrationService.delete_connection(
            session=session,
            company_id=company_id,
            connection_id=connection_id,
            actor_id=user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/{connection_id}/test", response_model=ConnectionTestResult)
async def test_connection(
    company_id: UUID,
    connection_id: UUID,
    access: CurrentCompanyAccess,
    session: AsyncSession = Depends(get_db),
) -> ConnectionTestResult:
    return await IntegrationService.test_connection(session, company_id, connection_id)


@router.post("/{connection_id}/sync", response_model=IntegrationSyncJobResponse)
async def trigger_sync(
    company_id: UUID,
    connection_id: UUID,
    payload: TriggerSyncRequest,
    access: CurrentCompanyAccess,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> IntegrationSyncJobResponse:
    try:
        job = await IntegrationService.trigger_sync(
            session=session,
            company_id=company_id,
            connection_id=connection_id,
            sync_type=payload.sync_type,
            actor_id=user.id,
        )
        return _to_job_response(job)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/{connection_id}/jobs", response_model=list[IntegrationSyncJobResponse])
async def list_sync_jobs(
    company_id: UUID,
    connection_id: UUID,
    access: CurrentCompanyAccess,
    session: AsyncSession = Depends(get_db),
) -> list[IntegrationSyncJobResponse]:
    jobs = await IntegrationService.list_sync_jobs(session, company_id, connection_id)
    return [_to_job_response(j) for j in jobs]


@router.get("/{connection_id}/agent-key", response_model=AgentKeyResponse)
@router.post("/{connection_id}/agent-key", response_model=AgentKeyResponse)
async def get_or_generate_agent_key(
    company_id: UUID,
    connection_id: UUID,
    access: CurrentCompanyAccess,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> AgentKeyResponse:
    try:
        return await IntegrationService.get_or_create_agent_key(
            session=session,
            company_id=company_id,
            connection_id=connection_id,
            actor_id=user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/{connection_id}/agent-sync", response_model=AgentSyncPushReceipt)
async def push_agent_sync(
    company_id: UUID,
    connection_id: UUID,
    payload: AgentSyncPushRequest,
    session: AsyncSession = Depends(get_db),
) -> AgentSyncPushReceipt:
    try:
        return await IntegrationService.ingest_agent_sync(
            session=session,
            company_id=company_id,
            connection_id=connection_id,
            payload=payload,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
