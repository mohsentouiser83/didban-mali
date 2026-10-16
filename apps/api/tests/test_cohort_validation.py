"""Validate a disposable five-company cohort without relying on seeded admin data."""

from collections.abc import AsyncIterator
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.companies.models import Company, CompanyAccess, CompanyRole
from app.core.database import async_session_factory, engine
from app.core.tenant import set_request_company, set_request_user
from app.customer_success.models import CustomerSuccessRecord, GoLiveValidation
from app.customer_success.schemas import GoLiveValidationRequest
from app.customer_success.service import complete_go_live, record_go_live_validation
from app.identity.models import Membership, User, Workspace, WorkspaceRole

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
async def cleanup_pool() -> AsyncIterator[None]:
    await engine.dispose()
    yield
    await engine.dispose()


async def test_cohort_companies_validation() -> None:
    # Service commits release savepoints only; all test data is rolled back on exit.
    async with engine.connect() as connection, connection.begin() as transaction:
        async with async_session_factory(
            bind=connection, join_transaction_mode="create_savepoint"
        ) as session:
            user = User(
                email=f"cohort-{uuid4().hex}@example.com",
                full_name="مدیر آزمایشی پایلوت",
                password_hash="unused-test-account",
            )
            session.add(user)
            await session.flush()
            await set_request_user(session, user.id)
            workspace = Workspace(name="پایلوت آزمایشی", owner_user_id=user.id)
            session.add(workspace)
            await session.flush()
            session.add(
                Membership(workspace_id=workspace.id, user_id=user.id, role=WorkspaceRole.OWNER)
            )
            await session.flush()
            company_ids = []
            for number in range(5):
                company = Company(
                    workspace_id=workspace.id,
                    legal_name=f"شرکت پایلوت آزمایشی {number + 1}",
                    champion_name="مدیر مالی",
                )
                session.add(company)
                await session.flush()
                session.add(
                    CompanyAccess(company_id=company.id, user_id=user.id, role=CompanyRole.OWNER)
                )
                await session.flush()
                await set_request_company(session, company.id)
                session.add(
                    CustomerSuccessRecord(
                        company_id=company.id,
                        industry="خدمات",
                        main_pain_point="کنترل مطالبات",
                        primary_use_case="گزارش مالی",
                        champion_name="مدیر مالی",
                        health_status="healthy" if number % 2 else "needs_attention",
                        pricing_tier=("core", "control", "advanced")[number % 3],
                        monthly_contract_value_irr=Decimal("100000000"),
                        implementation_hours_consultant=Decimal("6"),
                        baseline_process_json={"monthly_close_days": 12},
                        review_30d_json={"monthly_close_days": 8},
                        review_60d_json={"monthly_close_days": 6},
                        review_90d_json={"monthly_close_days": 4},
                    )
                )
                await record_go_live_validation(
                    session,
                    company.id,
                    user.id,
                    GoLiveValidationRequest(
                        cash_position_irr=Decimal("15000000000"),
                        receivables_irr=Decimal("32000000000"),
                        payables_irr=Decimal("18000000000"),
                        reconciliation_difference_irr=Decimal(0),
                        opening_balance_confirmed=True,
                        user_statement="ارقام پایه مالی با دفاتر شرکت تطبیق داده شده و تأیید می‌شود.",
                    ),
                )
                await complete_go_live(session, company.id, user.id)
                company_ids.append(company.id)

            records = (
                await session.execute(
                    select(CustomerSuccessRecord, Company, GoLiveValidation)
                    .join(Company, Company.id == CustomerSuccessRecord.company_id)
                    .join(GoLiveValidation, GoLiveValidation.company_id == Company.id)
                    .where(Company.id.in_(company_ids))
                )
            ).all()
            assert len(records) == 5
            for record, company, validation in records:
                assert company.is_live is True
                assert company.onboarding_stage == "live"
                assert company.go_live_at is not None
                assert company.champion_name is not None
                assert record.health_status in ("healthy", "needs_attention")
                assert record.pricing_tier in ("core", "control", "advanced")
                assert record.monthly_contract_value_irr > Decimal(0)
                assert record.implementation_hours_consultant > Decimal(0)
                assert "monthly_close_days" in record.baseline_process_json
                assert record.review_30d_json is not None
                assert record.review_60d_json is not None
                assert record.review_90d_json is not None
                assert validation.validated_by_user_id == user.id
                assert validation.opening_balance_confirmed is True
                assert validation.reconciliation_difference_irr == Decimal(0)
        await transaction.rollback()
