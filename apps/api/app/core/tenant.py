from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


async def set_request_user(session: AsyncSession, user_id: UUID) -> None:
    session.info["app.user_id"] = user_id
    await session.execute(select(func.set_config("app.user_id", str(user_id), False)))


async def set_request_company(session: AsyncSession, company_id: UUID) -> None:
    session.info["app.company_id"] = company_id
    await session.execute(select(func.set_config("app.company_id", str(company_id), False)))


async def reset_request_context(session: AsyncSession) -> None:
    session.info.pop("app.user_id", None)
    session.info.pop("app.company_id", None)
    await session.execute(select(func.set_config("app.user_id", "", False)))
    await session.execute(select(func.set_config("app.company_id", "", False)))

