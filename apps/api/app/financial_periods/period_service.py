from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.service import record_audit_event
from app.financial_periods import period_repository as repository
from app.financial_periods.models import FinancialPeriod
from app.financial_periods.schemas import PeriodCreate


class PeriodNotFound(Exception):
    pass


class PeriodNameConflict(Exception):
    pass


async def save_period(
    session: AsyncSession,
    company_id: UUID,
    actor_id: UUID,
    payload: PeriodCreate,
    period_id: UUID | None = None,
) -> FinancialPeriod:
    if period_id is None:
        period = FinancialPeriod(company_id=company_id, **payload.model_dump())
        session.add(period)
        action = "financial_period.created"
    else:
        period = await repository.find_for_company(session, company_id, period_id, lock=True)
        if period is None:
            raise PeriodNotFound
        for key, value in payload.model_dump().items():
            setattr(period, key, value)
        action = "financial_period.updated"
    try:
        await session.flush()
        record_audit_event(
            session,
            action=action,
            entity_type="financial_period",
            entity_id=period.id,
            company_id=company_id,
            actor_id=actor_id,
            metadata=payload.model_dump(mode="json"),
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        if getattr(exc.orig, "sqlstate", None) == "23505":
            raise PeriodNameConflict from exc
        raise
    return period


async def remove_period(
    session: AsyncSession, company_id: UUID, actor_id: UUID, period_id: UUID
) -> None:
    period = await repository.find_for_company(session, company_id, period_id, lock=True)
    if period is None:
        raise PeriodNotFound
    await session.delete(period)
    record_audit_event(
        session,
        action="financial_period.deleted",
        entity_type="financial_period",
        entity_id=period_id,
        company_id=company_id,
        actor_id=actor_id,
    )
    await session.commit()
