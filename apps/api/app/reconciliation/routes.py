from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.companies.dependencies import CurrentCompanyAccess
from app.companies.models import CompanyRole
from app.identity.dependencies import CsrfProtected, CurrentUser, DbSession
from app.reconciliation.account_links import AccountLinkConflict, list_accounts, set_account_link
from app.reconciliation.pipeline import reconcile_and_detect

router = APIRouter(prefix="/companies/{company_id}/bank-account-links", tags=["reconciliation"])


class AccountLinkRequest(BaseModel):
    bank_account_id: UUID | None


class AccountLinkResponse(BaseModel):
    account_id: UUID
    code: str
    name: str
    bank_account_id: UUID | None


@router.get("", response_model=list[AccountLinkResponse])
async def accounts(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    query: str = Query(default="", max_length=160),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[AccountLinkResponse]:
    return [
        AccountLinkResponse(**item)
        for item in await list_accounts(
            session,
            company_id,
            query=query,
            limit=limit,
            offset=offset,
        )
    ]


@router.put("/{account_id}", response_model=dict[str, object])
async def update_link(
    company_id: UUID,
    account_id: UUID,
    payload: AccountLinkRequest,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
) -> dict[str, object]:
    if access.role not in {CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER, CompanyRole.ADVISOR}:
        raise HTTPException(403, "اجازه تغییر ارتباط حساب‌ها را ندارید.")
    try:
        await set_account_link(
            session,
            company_id=company_id,
            account_id=account_id,
            bank_account_id=payload.bank_account_id,
            actor_id=current_user.id,
        )
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except AccountLinkConflict as exc:
        raise HTTPException(409, str(exc)) from exc
    return await reconcile_and_detect(session, company_id=company_id, actor_id=current_user.id)
