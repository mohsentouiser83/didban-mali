from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.companies.models import CompanyAccess, CompanyRole
from app.core.database import get_db
from app.customer_success.models import (
    SupportTicket,
)
from app.customer_success.schemas import (
    GoLiveResponse,
    GoLiveValidationRequest,
    GoLiveValidationResponse,
    OnboardingStatusResponse,
    ProductFeedbackCreate,
    ProductFeedbackResponse,
    SupportTicketCreate,
    SupportTicketResponse,
)
from app.customer_success.service import (
    complete_go_live,
    create_support_ticket,
    get_company_onboarding_status,
    record_go_live_validation,
    submit_product_feedback,
)
from app.identity.dependencies import CsrfProtected, CurrentUser

router = APIRouter(tags=["customer_success"])


async def _require_company_access(
    session: AsyncSession, company_id: UUID, user_id: UUID
) -> CompanyAccess:
    access = await session.scalar(
        select(CompanyAccess).where(
            CompanyAccess.company_id == company_id, CompanyAccess.user_id == user_id
        )
    )
    if access is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="دسترسی به این شرکت برای شما مجاز نیست."
        )
    return access


@router.get(
    "/companies/{company_id}/onboarding",
    response_model=OnboardingStatusResponse,
)
async def get_onboarding_status(
    company_id: UUID,
    current_user: CurrentUser,
    session: AsyncSession = Depends(get_db),
) -> OnboardingStatusResponse:
    await _require_company_access(session, company_id, current_user.id)
    return await get_company_onboarding_status(session, company_id)


@router.post(
    "/companies/{company_id}/onboarding/validate",
    response_model=GoLiveValidationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def validate_baseline_numbers(
    company_id: UUID,
    payload: GoLiveValidationRequest,
    current_user: CurrentUser,
    _: CsrfProtected,
    session: AsyncSession = Depends(get_db),
) -> GoLiveValidationResponse:
    access = await _require_company_access(session, company_id, current_user.id)
    if access.role not in (CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="فقط مالک یا مدیر مالی شرکت مجاز به تایید نهایی ارقام پایه است.",
        )
    val = await record_go_live_validation(session, company_id, current_user.id, payload)
    return GoLiveValidationResponse(
        id=val.id,
        company_id=val.company_id,
        validated_by_user_id=val.validated_by_user_id,
        validated_at=val.validated_at,
        cash_position_irr=val.cash_position_irr,
        receivables_irr=val.receivables_irr,
        payables_irr=val.payables_irr,
        reconciliation_difference_irr=val.reconciliation_difference_irr,
        opening_balance_confirmed=val.opening_balance_confirmed,
        user_statement=val.user_statement,
    )


@router.post(
    "/companies/{company_id}/onboarding/go-live",
    response_model=GoLiveResponse,
)
async def trigger_company_go_live(
    company_id: UUID,
    current_user: CurrentUser,
    _: CsrfProtected,
    session: AsyncSession = Depends(get_db),
) -> GoLiveResponse:
    access = await _require_company_access(session, company_id, current_user.id)
    if access.role not in (CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="فقط مالک یا مدیر مالی شرکت مجاز به فعال‌سازی نهایی بهره‌برداری است.",
        )
    company = await complete_go_live(session, company_id, current_user.id)
    return GoLiveResponse(
        company_id=company.id,
        is_live=company.is_live,
        go_live_at=company.go_live_at,
        message_fa="سامانه دیدبان مالی با موفقیت وارد فاز بهره‌برداری رسمی شد.",
    )


@router.post(
    "/companies/{company_id}/support/tickets",
    response_model=SupportTicketResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_ticket(
    company_id: UUID,
    payload: SupportTicketCreate,
    current_user: CurrentUser,
    _: CsrfProtected,
    session: AsyncSession = Depends(get_db),
) -> SupportTicketResponse:
    await _require_company_access(session, company_id, current_user.id)
    ticket = await create_support_ticket(session, company_id, current_user.id, payload)
    return SupportTicketResponse(
        id=ticket.id,
        company_id=ticket.company_id,
        user_id=ticket.user_id,
        category=ticket.category,
        subject=ticket.subject,
        description=ticket.description,
        current_route=ticket.current_route,
        error_digest=ticket.error_digest,
        status=ticket.status,
        created_at=ticket.created_at,
        resolved_at=ticket.resolved_at,
    )


@router.get(
    "/companies/{company_id}/support/tickets",
    response_model=list[SupportTicketResponse],
)
async def list_tickets(
    company_id: UUID,
    current_user: CurrentUser,
    session: AsyncSession = Depends(get_db),
) -> list[SupportTicketResponse]:
    await _require_company_access(session, company_id, current_user.id)
    tickets = (
        await session.scalars(
            select(SupportTicket)
            .where(SupportTicket.company_id == company_id)
            .order_by(SupportTicket.created_at.desc())
        )
    ).all()
    return [
        SupportTicketResponse(
            id=t.id,
            company_id=t.company_id,
            user_id=t.user_id,
            category=t.category,
            subject=t.subject,
            description=t.description,
            current_route=t.current_route,
            error_digest=t.error_digest,
            status=t.status,
            created_at=t.created_at,
            resolved_at=t.resolved_at,
        )
        for t in tickets
    ]


@router.post(
    "/companies/{company_id}/feedback",
    response_model=ProductFeedbackResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_feedback(
    company_id: UUID,
    payload: ProductFeedbackCreate,
    current_user: CurrentUser,
    _: CsrfProtected,
    session: AsyncSession = Depends(get_db),
) -> ProductFeedbackResponse:
    await _require_company_access(session, company_id, current_user.id)
    fb = await submit_product_feedback(session, company_id, current_user.id, payload)
    return ProductFeedbackResponse(
        id=fb.id,
        company_id=fb.company_id,
        user_id=fb.user_id,
        category=fb.category,
        problem_statement=fb.problem_statement,
        context=fb.context,
        impact=fb.impact,
        workaround=fb.workaround,
        requested_outcome=fb.requested_outcome,
        created_at=fb.created_at,
    )
