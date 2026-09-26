from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.companies.models import Company, CompanyAccess, CompanyRole
from app.core.tenant import set_request_company
from app.findings.models import (
    Finding,
    FindingActivity,
    FindingCategory,
    FindingSeverity,
    FindingStatus,
)
from app.findings.service import (
    assign_finding,
    get_my_action_queue,
    resolve_finding,
    verify_finding,
)
from app.identity.models import User, Workspace

ADMIN_URL = (
    "postgresql+asyncpg://didban_admin:change-me-in-real-environments@localhost:55432/didban_mali"
)
test_engine = create_async_engine(ADMIN_URL, poolclass=NullPool)
db_session_factory = async_sessionmaker(test_engine, expire_on_commit=False)


@pytest.mark.asyncio
async def test_maker_checker_workflow_and_separation_of_duties() -> None:
    """Test assigning, resolving, maker-checker rejection on self-verification, and successful manager verification."""
    async with db_session_factory() as session:
        # Users
        user_maker = User(
            id=uuid4(),
            email=f"maker_{uuid4()}@example.com",
            full_name="حسابدار مجری",
            password_hash="hash",
            is_active=True,
        )
        user_checker = User(
            id=uuid4(),
            email=f"checker_{uuid4()}@example.com",
            full_name="مدیر مالی ناظر",
            password_hash="hash",
            is_active=True,
        )
        session.add_all([user_maker, user_checker])
        await session.flush()

        # Create Workspace & Company
        ws = Workspace(id=uuid4(), name=f"WS_{uuid4()}", owner_user_id=user_checker.id)
        session.add(ws)
        await session.flush()

        company = Company(
            id=uuid4(),
            workspace_id=ws.id,
            legal_name="شرکت آزمون تفکیک وظایف",
            national_id=f"103{uuid4().int % 100000000:08d}",
            fiscal_year_start_month=1,
        )
        session.add(company)
        await session.flush()
        await set_request_company(session, company.id)

        access_maker = CompanyAccess(
            id=uuid4(),
            company_id=company.id,
            user_id=user_maker.id,
            role=CompanyRole.FINANCE_MANAGER,
        )
        access_checker = CompanyAccess(
            id=uuid4(),
            company_id=company.id,
            user_id=user_checker.id,
            role=CompanyRole.OWNER,
        )
        session.add_all([access_maker, access_checker])
        await session.flush()

        # Create a Critical Finding
        now = datetime.now(UTC)
        finding = Finding(
            id=uuid4(),
            company_id=company.id,
            rule_code="LARGE_UNRECONCILED_TX",
            category=FindingCategory.RECONCILIATION,
            severity=FindingSeverity.CRITICAL,
            status=FindingStatus.OPEN,
            title_fa="تراکنش بانکی کلان تطبیق‌نشده",
            description_fa="یک تراکنش ۱.۲ میلیارد ریالی بیش از ۷ روز بدون سند باقی مانده است.",
            impact_irr=Decimal("1200000000"),
            action_owner_id=None,
            fingerprint="fp_critical_1",
            period_start=now.date(),
            period_end=now.date(),
            created_at=now,
            updated_at=now,
        )
        session.add(finding)
        await session.commit()

        # 1. Assign to User A (Maker)
        updated_f = await assign_finding(
            session,
            company_id=company.id,
            finding_id=finding.id,
            assigned_to_user_id=user_maker.id,
            actor_id=user_checker.id,
            note="لطفاً با امور مشتریان پیگیری کنید",
        )
        assert updated_f.status in (FindingStatus.TRIAGED, FindingStatus.IN_PROGRESS)
        assert updated_f.action_owner_id == user_maker.id

        # Check personal queue for Maker
        my_queue = await get_my_action_queue(
            session,
            company_id=company.id,
            user_id=user_maker.id,
            role=CompanyRole.FINANCE_MANAGER,
        )
        assert any(item.id == finding.id for item in my_queue["assigned_findings"])

        # 2. User A resolves finding
        resolved_f = await resolve_finding(
            session,
            company_id=company.id,
            finding_id=finding.id,
            actor_id=user_maker.id,
            resolution_type="accounting_adjusted",
            resolution_note="سند حسابداری شماره ۷۸۹ به تاریخ ۱۴۰۵/۰۶/۱۰ ثبت گردید. مشتری وجه را بابت پیش‌پرداخت فاکتور واریز کرده بود.",
        )
        assert resolved_f.status == FindingStatus.RESOLVED
        assert resolved_f.resolved_by == user_maker.id
        assert resolved_f.resolved_at is not None

        # Check queue: should now appear in pending_verification queue
        mgr_queue = await get_my_action_queue(
            session,
            company_id=company.id,
            user_id=user_checker.id,
            role=CompanyRole.OWNER,
        )
        assert any(item.id == finding.id for item in mgr_queue["verification_queue"])

        # 3. Maker-Checker Enforcement:
        # User A (the resolver) tries to verify their own Critical finding -> MUST BE REJECTED
        with pytest.raises(PermissionError, match="تفکیک وظایف"):
            await verify_finding(
                session,
                company_id=company.id,
                finding_id=finding.id,
                actor_id=user_maker.id,
                verification_note="خودم بررسی کردم و تایید است",
            )

        # 4. User B (Checker) approves and verifies the finding
        verified_f = await verify_finding(
            session,
            company_id=company.id,
            finding_id=finding.id,
            actor_id=user_checker.id,
            verification_note="سند شماره ۷۸۹ در سامانه حسابداری رویت و انطباق آن تایید شد.",
        )
        assert verified_f.status == FindingStatus.VERIFIED
        assert verified_f.verified_by == user_checker.id
        assert verified_f.verified_at is not None

        # Verify activity audit trail
        activities = (
            await session.scalars(
                select(FindingActivity)
                .where(FindingActivity.finding_id == finding.id)
                .order_by(FindingActivity.created_at.asc())
            )
        ).all()
        actions = [a.action_type for a in activities]
        assert "assigned" in actions
        assert "resolved" in actions
        assert "verified" in actions
