"""Reconcile committed canonical inputs before publishing review findings."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.companies.models import Company
from app.core.tenant import set_request_company, set_request_user
from app.findings.engine import execute_finding_detection
from app.reconciliation.service import run_canonical_reconciliation


async def reconcile_and_detect(
    session: AsyncSession, *, company_id: UUID, actor_id: UUID
) -> dict[str, object]:
    await set_request_user(session, actor_id)
    await set_request_company(session, company_id)
    # Serialize competing uploads and manual checks for this company. Both stages
    # share the transaction so findings cannot observe half-persisted matches.
    await session.execute(select(Company.id).where(Company.id == company_id).with_for_update())
    run = await run_canonical_reconciliation(
        session, company_id=company_id, actor_id=actor_id, commit=False
    )
    detection = await execute_finding_detection(
        session,
        company_id=company_id,
        actor_id=actor_id,
        trigger_type="post_reconciliation",
        reconciliation_run_id=run.id,
        commit=False,
    )
    await session.commit()
    return {
        "run_id": str(run.id),
        "detection_run_id": str(detection.id),
        "findings_detected": detection.findings_detected,
        "matched_count": run.matched_count,
        "unmatched_bank_count": run.unmatched_bank_count,
        "unmatched_journal_count": run.unmatched_journal_count,
        "available": bool(run.counts_json.get("inputs_available")),
    }
