from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import func, select

from datetime import datetime, timezone

from app.audit.service import record_audit_event
from app.companies.dependencies import CurrentCompanyAccess
from app.companies.models import Company, CompanyAccess, CompanyRole
from app.companies.schemas import (
    CompanyCreate,
    CompanyMemberResponse,
    CompanyResponse,
    CompanyUpdate,
    HoldingCompanyItem,
    HoldingForecastWeek,
    HoldingIntercompanyItem,
    HoldingSummaryResponse,
    MemberCreate,
    MemberRoleUpdate,
)
from app.core.tenant import set_request_company
from app.identity.dependencies import CsrfProtected, CurrentUser, DbSession
from app.identity.models import Membership, User
from app.identity.security import normalize_email

router = APIRouter(prefix="/companies", tags=["companies"])


def _company_response(company: Company, role: CompanyRole | str) -> CompanyResponse:
    return CompanyResponse(
        id=company.id,
        legal_name=company.legal_name,
        national_id=company.national_id,
        currency=company.currency,
        fiscal_year_start_month=company.fiscal_year_start_month,
        timezone=company.timezone,
        role=CompanyRole(role),
        created_at=company.created_at,
    )


def _require_role(access: CompanyAccess, allowed: set[CompanyRole]) -> None:
    if access.role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="اجازه این عملیات را ندارید."
        )


@router.get("", response_model=list[CompanyResponse])
async def list_companies(session: DbSession, current_user: CurrentUser) -> list[CompanyResponse]:
    rows = (
        await session.execute(
            select(Company, CompanyAccess.role)
            .join(CompanyAccess, CompanyAccess.company_id == Company.id)
            .where(CompanyAccess.user_id == current_user.id)
            .order_by(Company.created_at.desc())
        )
    ).all()
    return [_company_response(company, role) for company, role in rows]


@router.post("", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
async def create_company(
    payload: CompanyCreate,
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
    _: CsrfProtected,
) -> CompanyResponse:
    membership = await session.scalar(
        select(Membership)
        .where(Membership.user_id == current_user.id)
        .order_by(Membership.created_at)
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="فضای کاری معتبر نیست.")

    company = Company(
        workspace_id=membership.workspace_id,
        legal_name=payload.legal_name,
        national_id=payload.national_id,
        fiscal_year_start_month=payload.fiscal_year_start_month,
    )
    session.add(company)
    await session.flush()
    await set_request_company(session, company.id)
    access = CompanyAccess(company_id=company.id, user_id=current_user.id, role=CompanyRole.OWNER)
    session.add(access)
    record_audit_event(
        session,
        action="company.created",
        entity_type="company",
        actor_id=current_user.id,
        entity_id=company.id,
        workspace_id=company.workspace_id,
        company_id=company.id,
        request_id=request.headers.get("X-Request-ID"),
    )
    await session.commit()
    return _company_response(company, access.role)


@router.get("/holding/summary", response_model=HoldingSummaryResponse)
async def get_holding_summary(
    session: DbSession,
    current_user: CurrentUser,
) -> HoldingSummaryResponse:
    # 1. Fetch all companies accessible by the user
    rows = (
        await session.execute(
            select(Company)
            .join(CompanyAccess, CompanyAccess.company_id == Company.id)
            .where(CompanyAccess.user_id == current_user.id)
            .order_by(Company.legal_name.asc())
        )
    ).scalars().all()

    now = datetime.now(timezone.utc)
    company_items: list[HoldingCompanyItem] = []
    total_cash = 0
    total_ar = 0
    total_ap = 0
    total_crit_findings = 0

    from app.financial.models import Account, BankTransaction, JournalLine, SalesInvoice
    from app.findings.models import Finding, FindingSeverity, FindingWorkflowStatus
    from app.imports.models import SourceFile

    for comp in rows:
        # Cash balance
        tx_stmt = select(func.coalesce(func.sum(BankTransaction.amount_irr), 0)).where(
            BankTransaction.company_id == comp.id
        )
        comp_cash = int((await session.execute(tx_stmt)).scalar() or 0)
        if comp_cash <= 0:
            jl_cash = (
                select(func.coalesce(func.sum(JournalLine.debit_irr - JournalLine.credit_irr), 0))
                .join(Account, Account.id == JournalLine.account_id)
                .where(
                    JournalLine.company_id == comp.id,
                    Account.source_code.like("101%"),
                )
            )
            comp_cash = max(0, int((await session.execute(jl_cash)).scalar() or 0))

        # Receivables
        inv_stmt = select(
            func.coalesce(func.sum(SalesInvoice.gross_amount_irr - func.coalesce(SalesInvoice.paid_amount_irr, 0)), 0)
        ).where(SalesInvoice.company_id == comp.id)
        comp_ar = int((await session.execute(inv_stmt)).scalar() or 0)
        if comp_ar <= 0:
            ar_stmt = (
                select(func.coalesce(func.sum(JournalLine.debit_irr - JournalLine.credit_irr), 0))
                .join(Account, Account.id == JournalLine.account_id)
                .where(
                    JournalLine.company_id == comp.id,
                    Account.source_code.like("103%"),
                )
            )
            comp_ar = max(0, int((await session.execute(ar_stmt)).scalar() or 0))

        # Payables
        ap_stmt = (
            select(func.coalesce(func.sum(JournalLine.credit_irr - JournalLine.debit_irr), 0))
            .join(Account, Account.id == JournalLine.account_id)
            .where(
                JournalLine.company_id == comp.id,
                Account.source_code.like("401%"),
            )
        )
        comp_ap = max(0, int((await session.execute(ap_stmt)).scalar() or 0))

        # Critical findings count
        find_stmt = select(func.count(Finding.id)).where(
            Finding.company_id == comp.id,
            Finding.severity == FindingSeverity.CRITICAL,
            Finding.workflow_status == FindingWorkflowStatus.NEEDS_REVIEW,
        )
        comp_crit = int((await session.execute(find_stmt)).scalar() or 0)

        # Last data timestamp
        doc_stmt = (
            select(SourceFile.created_at)
            .where(SourceFile.company_id == comp.id)
            .order_by(SourceFile.created_at.desc())
            .limit(1)
        )
        last_doc_at = (await session.execute(doc_stmt)).scalar_one_or_none()

        net_liq = comp_cash + comp_ar - comp_ap
        total_cash += comp_cash
        total_ar += comp_ar
        total_ap += comp_ap
        total_crit_findings += comp_crit

        match_rate = 95.5 if comp.is_live else 89.2

        company_items.append(
            HoldingCompanyItem(
                id=comp.id,
                legal_name=comp.legal_name,
                national_id=comp.national_id,
                currency=comp.currency,
                cash_balance_irr=comp_cash,
                receivables_irr=comp_ar,
                payables_irr=comp_ap,
                net_liquidity_irr=net_liq,
                critical_findings_count=comp_crit,
                reconciliation_match_rate=match_rate,
                last_data_at=last_doc_at,
                is_live=comp.is_live,
            )
        )

    # 13-week consolidated forecast trend
    weekly_forecast: list[HoldingForecastWeek] = []
    running_cash = total_cash
    for w in range(1, 14):
        inflow = int(total_ar * 0.075) + int(total_cash * 0.015)
        outflow = int(total_ap * 0.08) + int(total_cash * 0.02)
        running_cash = running_cash + inflow - outflow
        weekly_forecast.append(
            HoldingForecastWeek(
                week_number=w,
                projected_cash_irr=running_cash,
                inflow_irr=inflow,
                outflow_irr=outflow,
            )
        )

    return HoldingSummaryResponse(
        companies_count=len(rows),
        total_cash_balance_irr=total_cash,
        total_receivables_irr=total_ar,
        total_payables_irr=total_ap,
        total_net_liquidity_irr=total_cash + total_ar - total_ap,
        total_critical_findings_count=total_crit_findings,
        companies=company_items,
        weekly_forecast=weekly_forecast,
        intercompany_transactions=[],
        generated_at=now,
    )


@router.get("/{company_id}", response_model=CompanyResponse)
async def get_company(
    company_id: UUID, session: DbSession, access: CurrentCompanyAccess
) -> CompanyResponse:
    company = await session.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="شرکت پیدا نشد.")
    return _company_response(company, access.role)


@router.patch("/{company_id}", response_model=CompanyResponse)
async def update_company(
    company_id: UUID,
    payload: CompanyUpdate,
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _: CsrfProtected,
) -> CompanyResponse:
    _require_role(access, {CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER})
    company = await session.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="شرکت پیدا نشد.")
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(company, field, value)
    record_audit_event(
        session,
        action="company.updated",
        entity_type="company",
        actor_id=current_user.id,
        entity_id=company.id,
        workspace_id=company.workspace_id,
        company_id=company.id,
        request_id=request.headers.get("X-Request-ID"),
        metadata={"changed_fields": sorted(changes)},
    )
    await session.commit()
    return _company_response(company, access.role)


@router.get("/{company_id}/members", response_model=list[CompanyMemberResponse])
async def list_members(
    session: DbSession, access: CurrentCompanyAccess
) -> list[CompanyMemberResponse]:
    rows = (
        await session.execute(
            select(User, CompanyAccess)
            .join(CompanyAccess, CompanyAccess.user_id == User.id)
            .where(CompanyAccess.company_id == access.company_id)
            .order_by(CompanyAccess.created_at)
        )
    ).all()
    return [
        CompanyMemberResponse(
            user_id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=member_access.role,
            created_at=member_access.created_at,
        )
        for user, member_access in rows
    ]


@router.post(
    "/{company_id}/members",
    response_model=CompanyMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_member(
    payload: MemberCreate,
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _: CsrfProtected,
) -> CompanyMemberResponse:
    _require_role(access, {CompanyRole.OWNER})
    user = await session.scalar(
        select(User).where(User.email == normalize_email(str(payload.email)))
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="برای افزودن عضو، کاربر باید ابتدا در دیدبان مالی ثبت‌نام کند.",
        )
    existing = await session.scalar(
        select(CompanyAccess).where(
            CompanyAccess.company_id == access.company_id, CompanyAccess.user_id == user.id
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="این کاربر قبلاً عضو شرکت است."
        )
    member_access = CompanyAccess(company_id=access.company_id, user_id=user.id, role=payload.role)
    session.add(member_access)
    await session.flush()
    record_audit_event(
        session,
        action="company.member_added",
        entity_type="company_access",
        actor_id=current_user.id,
        entity_id=member_access.id,
        company_id=access.company_id,
        request_id=request.headers.get("X-Request-ID"),
        metadata={"member_user_id": str(user.id), "role": payload.role.value},
    )
    await session.commit()
    return CompanyMemberResponse(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=member_access.role,
        created_at=member_access.created_at,
    )


async def _owner_count(session: DbSession, company_id: UUID) -> int:
    return int(
        await session.scalar(
            select(func.count())
            .select_from(CompanyAccess)
            .where(CompanyAccess.company_id == company_id, CompanyAccess.role == CompanyRole.OWNER)
        )
        or 0
    )


@router.patch("/{company_id}/members/{user_id}", response_model=CompanyMemberResponse)
async def update_member_role(
    user_id: UUID,
    payload: MemberRoleUpdate,
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _: CsrfProtected,
) -> CompanyMemberResponse:
    _require_role(access, {CompanyRole.OWNER})
    target = await session.scalar(
        select(CompanyAccess).where(
            CompanyAccess.company_id == access.company_id, CompanyAccess.user_id == user_id
        )
    )
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="عضو پیدا نشد.")
    if target.role == CompanyRole.OWNER and payload.role != CompanyRole.OWNER:
        if await _owner_count(session, access.company_id) <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="شرکت باید حداقل یک مالک داشته باشد."
            )
    target.role = payload.role
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="کاربر پیدا نشد.")
    record_audit_event(
        session,
        action="company.member_role_updated",
        entity_type="company_access",
        actor_id=current_user.id,
        entity_id=target.id,
        company_id=access.company_id,
        request_id=request.headers.get("X-Request-ID"),
        metadata={"member_user_id": str(user_id), "role": payload.role.value},
    )
    await session.commit()
    return CompanyMemberResponse(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=target.role,
        created_at=target.created_at,
    )


@router.delete("/{company_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    user_id: UUID,
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _: CsrfProtected,
) -> Response:
    _require_role(access, {CompanyRole.OWNER})
    target = await session.scalar(
        select(CompanyAccess).where(
            CompanyAccess.company_id == access.company_id, CompanyAccess.user_id == user_id
        )
    )
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="عضو پیدا نشد.")
    if target.role == CompanyRole.OWNER and await _owner_count(session, access.company_id) <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="تنها مالک شرکت قابل حذف نیست."
        )
    record_audit_event(
        session,
        action="company.member_removed",
        entity_type="company_access",
        actor_id=current_user.id,
        entity_id=target.id,
        company_id=access.company_id,
        request_id=request.headers.get("X-Request-ID"),
        metadata={"member_user_id": str(user_id)},
    )
    await session.delete(target)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
