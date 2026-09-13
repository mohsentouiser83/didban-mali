from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Request, status
from sqlalchemy import exists, select
from sqlalchemy.exc import IntegrityError
from uuid6 import uuid7

from app.audit.service import record_audit_event
from app.companies.dependencies import CurrentCompanyAccess
from app.companies.models import CompanyRole
from app.financial.models import Account, AccountClassification
from app.financial.schemas import (
    AccountClassificationRequest,
    AccountClassificationResponse,
    AccountResponse,
)
from app.identity.dependencies import CsrfProtected, CurrentUser, DbSession

router = APIRouter(prefix="/companies/{company_id}/accounts", tags=["accounts"])
CLASSIFY_ROLES = {CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER, CompanyRole.ADVISOR}


def _classification_response(item: AccountClassification) -> AccountClassificationResponse:
    return AccountClassificationResponse(
        id=item.id,
        account_id=item.account_id,
        account_class=item.account_class,
        effective_from=item.effective_from,
        rule_version=item.rule_version,
        confirmed_by=item.confirmed_by,
        confirmed_at=item.confirmed_at,
    )


@router.get("/unclassified", response_model=list[AccountResponse])
async def list_unclassified_accounts(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> list[AccountResponse]:
    del access
    rows = (
        await session.scalars(
            select(Account)
            .where(
                Account.company_id == company_id,
                ~exists(
                    select(AccountClassification.id).where(
                        AccountClassification.account_id == Account.id
                    )
                ),
            )
            .order_by(Account.source_code)
        )
    ).all()
    return [
        AccountResponse(
            id=account.id,
            source_code=account.source_code,
            name=account.name,
            normalized_name=account.normalized_name,
            created_at=account.created_at,
        )
        for account in rows
    ]


@router.put("/{account_id}/classification", response_model=AccountClassificationResponse)
async def classify_account(
    company_id: UUID,
    account_id: UUID,
    payload: AccountClassificationRequest,
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> AccountClassificationResponse:
    del idempotency_key
    if access.role not in CLASSIFY_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="اجازه طبقه‌بندی حساب را ندارید."
        )
    account = await session.scalar(
        select(Account).where(Account.id == account_id, Account.company_id == company_id)
    )
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="حساب پیدا نشد.")
    existing = await session.scalar(
        select(AccountClassification).where(
            AccountClassification.account_id == account_id,
            AccountClassification.effective_from == payload.effective_from,
        )
    )
    if existing is not None:
        if (
            existing.account_class != payload.account_class
            or existing.rule_version != payload.rule_version
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="برای این تاریخ قبلاً طبقه‌بندی متفاوتی ثبت شده است.",
            )
        return _classification_response(existing)
    item = AccountClassification(
        id=uuid7(),
        company_id=company_id,
        account_id=account_id,
        account_class=payload.account_class,
        effective_from=payload.effective_from,
        confirmed_by=current_user.id,
        rule_version=payload.rule_version,
        confirmed_at=datetime.now(UTC),
    )
    session.add(item)
    record_audit_event(
        session,
        action="account.classified",
        entity_type="account_classification",
        actor_id=current_user.id,
        entity_id=item.id,
        company_id=company_id,
        request_id=request.headers.get("X-Request-ID"),
        metadata={
            "account_id": str(account_id),
            "account_class": payload.account_class.value,
            "effective_from": payload.effective_from.isoformat(),
            "rule_version": payload.rule_version,
        },
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="طبقه‌بندی هم‌زمان دیگری برای این تاریخ ثبت شده است.",
        ) from exc
    return _classification_response(item)
