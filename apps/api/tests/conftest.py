import os
from collections.abc import AsyncIterator
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.companies.models import Company, CompanyAccess, CompanyRole
from app.core.tenant import set_request_company, set_request_user
from app.identity.models import User, Workspace
from app.main import app


@pytest.fixture
async def asgi_client() -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client


@pytest.fixture
async def integration_company() -> AsyncIterator[tuple[AsyncSession, User, Company]]:
    """Seed a private company and roll back even application service commits."""
    url = os.getenv("ACCOUNTING_TEST_DATABASE_URL")
    if not url:
        pytest.skip(
            "Requires ACCOUNTING_TEST_DATABASE_URL pointing to an isolated migrated database"
        )
    engine = create_async_engine(url, poolclass=NullPool)
    try:
        async with engine.connect() as connection:
            transaction = await connection.begin()
            try:
                async with AsyncSession(
                    bind=connection,
                    expire_on_commit=False,
                    join_transaction_mode="create_savepoint",
                ) as session:
                    user = User(
                        email=f"integration-{uuid4()}@example.com",
                        full_name="آزمون",
                        password_hash="unused",
                    )
                    session.add(user)
                    await session.flush()
                    workspace = Workspace(name="آزمون", owner_user_id=user.id)
                    session.add(workspace)
                    await session.flush()
                    company = Company(workspace_id=workspace.id, legal_name="شرکت آزمون")
                    session.add(company)
                    await session.flush()
                    session.add(
                        CompanyAccess(
                            company_id=company.id, user_id=user.id, role=CompanyRole.OWNER
                        )
                    )
                    await session.flush()
                    await session.execute(text("SET LOCAL ROLE didban_app"))
                    await set_request_user(session, user.id)
                    await set_request_company(session, company.id)
                    yield session, user, company
            finally:
                await transaction.rollback()
    finally:
        await engine.dispose()
