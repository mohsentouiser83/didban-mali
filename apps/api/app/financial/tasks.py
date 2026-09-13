import asyncio
from typing import Any
from uuid import UUID

from sqlalchemy import select

from app.core.database import async_session_factory, engine
from app.core.tenant import set_request_company, set_request_user
from app.financial.normalization import normalize_import
from app.imports.models import ImportBatch, ImportStatus
from app.worker import celery_app


async def _run(batch_id: UUID, company_id: UUID, actor_id: UUID) -> dict[str, object]:
    async with async_session_factory() as session:
        await set_request_user(session, actor_id)
        await set_request_company(session, company_id)
        return await normalize_import(
            session, batch_id=batch_id, company_id=company_id, actor_id=actor_id
        )


async def _mark_failed(batch_id: UUID, company_id: UUID, actor_id: UUID, message: str) -> None:
    async with async_session_factory() as session:
        await set_request_user(session, actor_id)
        await set_request_company(session, company_id)
        batch = await session.scalar(
            select(ImportBatch).where(
                ImportBatch.id == batch_id, ImportBatch.company_id == company_id
            )
        )
        if batch is not None:
            batch.status = ImportStatus.FAILED
            batch.stage = "normalization_failed"
            batch.failure_code = "NORMALIZATION_FAILED"
            batch.failure_message = message[:500]
            batch.retryable = True
            await session.commit()


async def _run_and_dispose(
    batch_id: UUID,
    company_id: UUID,
    actor_id: UUID,
    *,
    mark_failed: bool,
) -> dict[str, object]:
    try:
        return await _run(batch_id, company_id, actor_id)
    except Exception as exc:
        if mark_failed:
            await _mark_failed(batch_id, company_id, actor_id, str(exc))
        raise
    finally:
        await engine.dispose()


@celery_app.task(
    bind=True,
    name="imports.normalize",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)  # type: ignore[untyped-decorator]
def normalize_import_task(
    self: Any, batch_id: str, company_id: str, actor_id: str
) -> dict[str, object]:
    parsed = (UUID(batch_id), UUID(company_id), UUID(actor_id))
    retries = int(getattr(getattr(self, "request", None), "retries", 0))
    max_retries = int(getattr(self, "max_retries", 3))
    return asyncio.run(_run_and_dispose(*parsed, mark_failed=retries >= max_retries))
