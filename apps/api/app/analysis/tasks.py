import asyncio
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select

from app.analysis.models import AnalysisRun, AnalysisStatus
from app.analysis.service import calculate_analysis_run
from app.core.database import async_session_factory, engine
from app.core.tenant import set_request_company, set_request_user
from app.worker import celery_app


async def _mark_failed(run_id: UUID, company_id: UUID, actor_id: UUID, message: str) -> None:
    async with async_session_factory() as session:
        await set_request_user(session, actor_id)
        await set_request_company(session, company_id)
        run = await session.scalar(
            select(AnalysisRun).where(
                AnalysisRun.id == run_id, AnalysisRun.company_id == company_id
            )
        )
        if run is not None:
            run.status = AnalysisStatus.FAILED
            run.completed_at = datetime.now(UTC)
            run.failure_code = "FINANCIAL_CALCULATION_FAILED"
            run.failure_message = message[:500]
            await session.commit()


async def _execute(
    run_id: UUID, company_id: UUID, actor_id: UUID, *, mark_failed: bool
) -> dict[str, object]:
    try:
        async with async_session_factory() as session:
            await set_request_user(session, actor_id)
            await set_request_company(session, company_id)
            return await calculate_analysis_run(
                session, run_id=run_id, company_id=company_id, actor_id=actor_id
            )
    except Exception as exc:
        if mark_failed:
            await _mark_failed(run_id, company_id, actor_id, str(exc))
        raise
    finally:
        await engine.dispose()


@celery_app.task(
    bind=True,
    name="analysis.calculate_financial_metrics",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
)  # type: ignore[untyped-decorator]
def calculate_financial_metrics_task(
    self: Any, run_id: str, company_id: str, actor_id: str
) -> dict[str, object]:
    parsed = (UUID(run_id), UUID(company_id), UUID(actor_id))
    retries = int(getattr(getattr(self, "request", None), "retries", 0))
    max_retries = int(getattr(self, "max_retries", 3))
    return asyncio.run(_execute(*parsed, mark_failed=retries >= max_retries))
