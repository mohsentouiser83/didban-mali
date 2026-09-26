from datetime import datetime, timezone
import uuid
import pytest
from sqlalchemy import select

from app.core.database import async_session_factory, engine
from app.core.tenant import set_request_user, set_request_company
from app.companies.models import Company, CompanyAccess, CompanyRole
from app.companies.routes import get_holding_summary
from app.identity.models import User, Workspace


@pytest.fixture(autouse=True)
async def cleanup_pool():
    await engine.dispose()
    yield
    await engine.dispose()


@pytest.mark.asyncio
async def test_holding_summary_consolidation():
    async with async_session_factory() as session:
        user = await session.scalar(select(User).where(User.email == "admin@didban.ir"))
        assert user is not None
        await set_request_user(session, user.id)

        summary = await get_holding_summary(
            session=session,
            current_user=user,
        )

        assert summary.companies_count >= 1
        assert len(summary.companies) == summary.companies_count
        assert summary.total_net_liquidity_irr == (
            summary.total_cash_balance_irr + summary.total_receivables_irr - summary.total_payables_irr
        )
        assert len(summary.weekly_forecast) == 13
        assert summary.generated_at is not None
