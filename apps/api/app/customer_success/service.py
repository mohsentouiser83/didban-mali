from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid6 import uuid7

from app.audit.service import record_audit_event
from app.companies.models import Company, CompanyAccess
from app.customer_success.models import (
    CustomerSuccessRecord,
    GoLiveValidation,
    ProductAnalyticsEvent,
    ProductFeedback,
    SupportTicket,
)
from app.customer_success.schemas import (
    CustomerHealthSummary,
    GoLiveValidationRequest,
    OnboardingStatusResponse,
    OnboardingStep,
    ProductFeedbackCreate,
    SupportTicketCreate,
    ValueMetricsOverview,
)
from app.imports.models import DataSource, ImportBatch, ImportStatus, SourceKind


async def get_company_onboarding_status(
    session: AsyncSession, company_id: UUID
) -> OnboardingStatusResponse:
    company = await session.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="شرکت پیدا نشد.")

    # 1. Company Setup
    step1_done = bool(company.legal_name and company.currency)

    # 2. Accounting Data
    has_accounting = bool(
        await session.scalar(
            select(func.count(ImportBatch.id))
            .join(DataSource, DataSource.id == ImportBatch.source_id)
            .where(
                ImportBatch.company_id == company_id,
                DataSource.kind == SourceKind.ACCOUNTING,
                ImportBatch.status.in_([ImportStatus.COMPLETED, ImportStatus.COMPLETED_LIMITED]),
            )
        )
    )

    # 3. Bank Data
    has_bank = bool(
        await session.scalar(
            select(func.count(ImportBatch.id))
            .join(DataSource, DataSource.id == ImportBatch.source_id)
            .where(
                ImportBatch.company_id == company_id,
                DataSource.kind == SourceKind.BANK,
                ImportBatch.status.in_([ImportStatus.COMPLETED, ImportStatus.COMPLETED_LIMITED]),
            )
        )
    )

    # 4. Sales / Receivables Data
    has_sales = bool(
        await session.scalar(
            select(func.count(ImportBatch.id))
            .join(DataSource, DataSource.id == ImportBatch.source_id)
            .where(
                ImportBatch.company_id == company_id,
                DataSource.kind == SourceKind.SALES,
                ImportBatch.status.in_([ImportStatus.COMPLETED, ImportStatus.COMPLETED_LIMITED]),
            )
        )
    )

    # 5. Financial Validation
    validation_record = await session.scalar(
        select(GoLiveValidation)
        .where(GoLiveValidation.company_id == company_id)
        .order_by(GoLiveValidation.created_at.desc())
        .limit(1)
    )
    step5_done = validation_record is not None

    # 6. Control Configuration
    step6_done = step5_done  # Configured during/after baseline confirmation

    # 7. Team Setup
    user_count = int(
        await session.scalar(
            select(func.count(CompanyAccess.id)).where(CompanyAccess.company_id == company_id)
        )
        or 0
    )
    step7_done = user_count >= 2

    # 8. Ready / Live
    step8_done = bool(company.is_live)

    # Determine step statuses
    steps: list[OnboardingStep] = [
        OnboardingStep(
            key="company_setup",
            title_fa="اطلاعات پایه شرکت",
            status="completed" if step1_done else "in_progress",
            responsible_role="مالک شرکت / مدیر مالی",
        ),
        OnboardingStep(
            key="accounting_data",
            title_fa="داده‌های حسابداری و اسناد",
            status="completed" if has_accounting else ("in_progress" if step1_done else "pending"),
            blocker_message="اسناد حسابداری هنوز بارگذاری یا تایید نهایی نشده است." if not has_accounting else None,
            cta_label="بارگذاری اسناد حسابداری" if not has_accounting else None,
            cta_route="/data" if not has_accounting else None,
            responsible_role="حسابدار ارشد",
        ),
        OnboardingStep(
            key="bank_data",
            title_fa="اطلاعات و صورتحساب‌های بانکی",
            status="completed" if has_bank else ("in_progress" if has_accounting else "pending"),
            blocker_message="صورتحساب حداقل یک حساب بانکی اصلی وارد نشده است." if not has_bank and has_accounting else None,
            cta_label="بارگذاری گردش بانک" if not has_bank and has_accounting else None,
            cta_route="/data" if not has_bank and has_accounting else None,
            responsible_role="خزانه‌دار",
        ),
        OnboardingStep(
            key="sales_receivables",
            title_fa="فروش و مطالبات",
            status="completed" if (has_sales or (has_accounting and has_bank)) else "pending",
            responsible_role="مدیر فروش / حسابدار",
        ),
        OnboardingStep(
            key="financial_validation",
            title_fa="تأیید اعداد مالی پایه",
            status="completed" if step5_done else ("in_progress" if has_accounting and has_bank else "pending"),
            blocker_message="اعداد نقدینگی و مطالبات باید پیش از راه‌اندازی توسط مدیر مالی تأیید شوند." if not step5_done and has_accounting and has_bank else None,
            cta_label="تأیید اعداد مالی" if not step5_done and has_accounting and has_bank else None,
            cta_route="/control" if not step5_done and has_accounting and has_bank else None,
            responsible_role="مدیر مالی",
        ),
        OnboardingStep(
            key="control_configuration",
            title_fa="تنظیم قواعد کنترل و تطبیق",
            status="completed" if step6_done else "pending",
            responsible_role="مدیر مالی",
        ),
        OnboardingStep(
            key="team_invitation",
            title_fa="دعوت تیم مالی",
            status="completed" if step7_done else ("in_progress" if step5_done else "pending"),
            blocker_message="حداقل دو کاربر مالی جهت تفکیک نقش‌ها و کنترل چند سطحی لازم است." if not step7_done and step5_done else None,
            cta_label="دعوت همکاران" if not step7_done and step5_done else None,
            cta_route="/settings" if not step7_done and step5_done else None,
            responsible_role="مالک شرکت",
        ),
        OnboardingStep(
            key="ready_for_go_live",
            title_fa="آماده بهره‌برداری رسمی",
            status="completed" if step8_done else ("in_progress" if (step5_done and step7_done) else "pending"),
            cta_label="راه‌اندازی نهایی دیدبان مالی" if not step8_done and step5_done else None,
            responsible_role="مالک شرکت / مدیر مالی",
        ),
    ]

    completed_count = sum(1 for s in steps if s.status == "completed")
    progress_percentage = int((completed_count / len(steps)) * 100)

    # Active Blocker identification
    active_blocker = None
    next_action_fa = None
    responsible_party_fa = None
    for step in steps:
        if step.status in ("in_progress", "blocked") and step.blocker_message:
            active_blocker = step.blocker_message
            next_action_fa = step.cta_label
            responsible_party_fa = step.responsible_role
            break

    if not active_blocker and not step8_done:
        if not has_accounting:
            active_blocker = "بارگذاری اولیه دفاتر حسابداری الزامی است."
            next_action_fa = "بارگذاری فایل دفتر روزنامه"
            responsible_party_fa = "حسابدار ارشد"
        elif not has_bank:
            active_blocker = "بارگذاری فایل گردش حساب‌های بانکی الزامی است."
            next_action_fa = "بارگذاری گردش بانک"
            responsible_party_fa = "خزانه‌دار"
        elif not step5_done:
            active_blocker = "اعداد مانده نقدینگی و مطالبات باید رسماً تأیید شوند."
            next_action_fa = "تأیید و انطباق اعداد با نرم‌افزار حسابداری"
            responsible_party_fa = "مدیر مالی"
        elif not step7_done:
            active_blocker = "حداقل یک کاربر مالی دیگر را برای گردش کار دعوت کنید."
            next_action_fa = "دعوت کاربر"
            responsible_party_fa = "مالک شرکت"
        else:
            next_action_fa = "تأیید راه‌اندازی نهایی (Go-Live)"
            responsible_party_fa = "مدیر مالی"

    return OnboardingStatusResponse(
        company_id=company_id,
        is_live=bool(company.is_live),
        onboarding_stage=company.onboarding_stage,
        progress_percentage=progress_percentage,
        steps=steps,
        active_blocker=active_blocker,
        next_action_fa=next_action_fa,
        responsible_party_fa=responsible_party_fa,
    )


async def record_go_live_validation(
    session: AsyncSession,
    company_id: UUID,
    user_id: UUID,
    payload: GoLiveValidationRequest,
) -> GoLiveValidation:
    validation = GoLiveValidation(
        id=uuid7(),
        company_id=company_id,
        validated_by_user_id=user_id,
        validated_at=datetime.now(UTC),
        cash_position_irr=payload.cash_position_irr,
        receivables_irr=payload.receivables_irr,
        payables_irr=payload.payables_irr,
        reconciliation_difference_irr=payload.reconciliation_difference_irr,
        opening_balance_confirmed=payload.opening_balance_confirmed,
        user_statement=payload.user_statement,
    )
    session.add(validation)

    company = await session.get(Company, company_id)
    if company:
        company.onboarding_stage = "control_configuration"
        session.add(company)

    record_audit_event(
        session,
        action="onboarding.financial_baseline_validated",
        entity_type="go_live_validation",
        actor_id=user_id,
        entity_id=validation.id,
        company_id=company_id,
        metadata={
            "cash_position_irr": str(payload.cash_position_irr),
            "reconciliation_difference_irr": str(payload.reconciliation_difference_irr),
        },
    )

    # Privacy-conscious value analytics event
    event = ProductAnalyticsEvent(
        id=uuid7(),
        company_id=company_id,
        user_id=user_id,
        event_name="financial_metrics_validated",
        properties_json={"has_difference": payload.reconciliation_difference_irr != 0},
    )
    session.add(event)
    await session.commit()
    return validation


async def complete_go_live(
    session: AsyncSession, company_id: UUID, user_id: UUID
) -> Company:
    company = await session.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="شرکت پیدا نشد.")

    # Validation: Must have at least one validation record
    has_validation = await session.scalar(
        select(func.count(GoLiveValidation.id)).where(GoLiveValidation.company_id == company_id)
    )
    if not has_validation:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="پیش از راه‌اندازی رسمی، تأیید اعداد پایه مالی توسط مدیر مالی الزامی است.",
        )

    now = datetime.now(UTC)
    company.is_live = True
    company.go_live_at = now
    company.onboarding_stage = "live"
    session.add(company)

    record_audit_event(
        session,
        action="onboarding.company_go_live_completed",
        entity_type="company",
        actor_id=user_id,
        entity_id=company_id,
        company_id=company_id,
        metadata={"go_live_at": now.isoformat()},
    )

    event = ProductAnalyticsEvent(
        id=uuid7(),
        company_id=company_id,
        user_id=user_id,
        event_name="company_activated",
        properties_json={"stage": "live"},
    )
    session.add(event)
    await session.commit()
    return company


async def create_support_ticket(
    session: AsyncSession, company_id: UUID, user_id: UUID, payload: SupportTicketCreate
) -> SupportTicket:
    ticket = SupportTicket(
        id=uuid7(),
        company_id=company_id,
        user_id=user_id,
        category=payload.category,
        subject=payload.subject,
        description=payload.description,
        current_route=payload.current_route,
        error_digest=payload.error_digest,
        safe_diagnostic_json=payload.safe_diagnostic_json or {},
        status="open",
    )
    session.add(ticket)
    record_audit_event(
        session,
        action="support.ticket_created",
        entity_type="support_ticket",
        actor_id=user_id,
        entity_id=ticket.id,
        company_id=company_id,
        metadata={"category": payload.category, "subject": payload.subject},
    )
    await session.commit()
    return ticket


async def submit_product_feedback(
    session: AsyncSession, company_id: UUID, user_id: UUID, payload: ProductFeedbackCreate
) -> ProductFeedback:
    feedback = ProductFeedback(
        id=uuid7(),
        company_id=company_id,
        user_id=user_id,
        category=payload.category,
        problem_statement=payload.problem_statement,
        context=payload.context,
        impact=payload.impact,
        workaround=payload.workaround,
        requested_outcome=payload.requested_outcome,
    )
    session.add(feedback)
    record_audit_event(
        session,
        action="feedback.submitted",
        entity_type="product_feedback",
        actor_id=user_id,
        entity_id=feedback.id,
        company_id=company_id,
        metadata={"category": payload.category, "impact": payload.impact},
    )
    await session.commit()
    return feedback


async def get_customer_health_overview(
    session: AsyncSession,
) -> list[CustomerHealthSummary]:
    companies = (await session.scalars(select(Company).order_by(Company.created_at.desc()))).all()
    summaries: list[CustomerHealthSummary] = []
    now = datetime.now(UTC)

    for c in companies:
        cs_record = await session.scalar(
            select(CustomerSuccessRecord).where(CustomerSuccessRecord.company_id == c.id)
        )
        last_refresh = await session.scalar(
            select(func.max(ImportBatch.created_at)).where(
                ImportBatch.company_id == c.id,
                ImportBatch.status.in_([ImportStatus.COMPLETED, ImportStatus.COMPLETED_LIMITED]),
            )
        )

        active_users = int(
            await session.scalar(
                select(func.count(CompanyAccess.id)).where(CompanyAccess.company_id == c.id)
            )
            or 0
        )

        # Health determination
        health: str = "healthy"
        if not last_refresh or (now - last_refresh.replace(tzinfo=UTC) > timedelta(days=14)):
            health = "at_risk"
        elif (now - last_refresh.replace(tzinfo=UTC) > timedelta(days=7)) or active_users < 2:
            health = "needs_attention"

        dev_hours = cs_record.implementation_hours_dev if cs_record else Decimal(0)
        consultant_hours = cs_record.implementation_hours_consultant if cs_record else Decimal(0)
        cs_hours = cs_record.implementation_hours_cs if cs_record else Decimal(0)
        total_hours = dev_hours + consultant_hours + cs_hours

        summaries.append(
            CustomerHealthSummary(
                company_id=c.id,
                company_name=c.legal_name,
                is_live=bool(c.is_live),
                health_status=health,  # type: ignore
                last_data_refresh=last_refresh,
                last_user_activity=now,
                critical_findings_count=0,
                unreconciled_transactions_count=0,
                active_finance_users_count=active_users,
                implementation_hours_total=total_hours,
                primary_business_objective=c.primary_business_objective,
            )
        )
    return summaries
