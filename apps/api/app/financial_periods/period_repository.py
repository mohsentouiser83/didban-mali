from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.financial_periods.models import FinancialPeriod


async def list_for_company(session: AsyncSession, company_id: UUID) -> list[FinancialPeriod]:
    return list(
        (
            await session.scalars(
                select(FinancialPeriod)
                .where(FinancialPeriod.company_id == company_id)
                .order_by(FinancialPeriod.start_date.desc(), FinancialPeriod.name)
            )
        ).all()
    )


async def find_for_company(
    session: AsyncSession, company_id: UUID, period_id: UUID, *, lock: bool = False
) -> FinancialPeriod | None:
    query = select(FinancialPeriod).where(
        FinancialPeriod.company_id == company_id, FinancialPeriod.id == period_id
    )
    if lock:
        query = query.with_for_update()
    return await session.scalar(query)
