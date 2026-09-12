from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy import select

from app.companies.models import CompanyAccess
from app.core.tenant import set_request_company
from app.identity.dependencies import CurrentUser, DbSession


async def get_company_access(
    company_id: UUID, session: DbSession, current_user: CurrentUser
) -> CompanyAccess:
    access = await session.scalar(
        select(CompanyAccess).where(
            CompanyAccess.company_id == company_id,
            CompanyAccess.user_id == current_user.id,
        )
    )
    if access is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="شرکت پیدا نشد.")
    await set_request_company(session, company_id)
    return access


CurrentCompanyAccess = Annotated[CompanyAccess, Depends(get_company_access)]
