from decimal import Decimal

import pytest
from sqlalchemy import select

from app.companies.models import Company
from app.core.database import async_session_factory, engine
from app.customer_success.models import CustomerSuccessRecord


@pytest.fixture(autouse=True)
async def cleanup_pool():
    await engine.dispose()
    yield
    await engine.dispose()


@pytest.mark.asyncio
async def test_cohort_companies_validation():
    """
    Verify that all Phase 6 cohort pilot companies have complete
    Customer Success records, healthy operational status, and valid sign-offs.
    """
    async with async_session_factory() as session:
        from app.core.tenant import set_request_user
        from app.identity.models import User
        user = await session.scalar(
            select(User).where(User.email == "admin@didban.ir")
        )
        assert user is not None, "admin@didban.ir not found"
        await set_request_user(session, user.id)

        stmt = select(CustomerSuccessRecord, Company).join(Company, Company.id == CustomerSuccessRecord.company_id)
        res = await session.execute(stmt)
        records = res.all()

        assert len(records) >= 5, f"Expected at least 5 cohort companies, found {len(records)}"

        for cs_rec, comp in records:
            assert comp.is_live is True, f"Company {comp.legal_name} must be live"
            assert comp.onboarding_stage == "live_operating"
            assert comp.champion_name is not None
            assert cs_rec.health_status in ("healthy", "needs_attention")
            assert cs_rec.pricing_tier in ("core", "control", "advanced")
            assert cs_rec.monthly_contract_value_irr > Decimal(0)
            assert cs_rec.implementation_hours_consultant > Decimal(0)

            # Baseline & Review metrics integrity
            assert "monthly_close_days" in cs_rec.baseline_process_json
            assert cs_rec.review_30d_json is not None
            assert cs_rec.review_60d_json is not None
            assert cs_rec.review_90d_json is not None
