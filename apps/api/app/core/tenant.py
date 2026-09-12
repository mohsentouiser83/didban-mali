from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


async def set_request_user(session: AsyncSession, user_id: UUID) -> None:
    await session.execute(select(func.set_config("app.user_id", str(user_id), True)))


async def set_request_company(session: AsyncSession, company_id: UUID) -> None:
    await session.execute(select(func.set_config("app.company_id", str(company_id), True)))
