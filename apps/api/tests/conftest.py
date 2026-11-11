"""Centralized test fixtures and configuration for Didban API tests."""

from collections.abc import Iterator
from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from didban import models as m


@pytest.fixture
def sqlite_engine() -> Iterator[Engine]:
    """Provide a fresh in-memory SQLite engine with all schema tables."""
    engine = create_engine("sqlite://", echo=False)
    m.Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def db_session(sqlite_engine: Engine) -> Iterator[Session]:
    """Provide an isolated database session for a single test."""
    with Session(sqlite_engine, expire_on_commit=False) as session:
        yield session


@pytest.fixture
def test_company_context(db_session: Session) -> dict:
    """Provide a standard company with owner, finance_manager, advisor, viewer users and a period."""
    company = m.Company(id="test_co", name="شرکت تست")
    other_company = m.Company(id="other_co", name="شرکت دیگر")
    db_session.add_all([company, other_company])

    users = {}
    memberships = {}
    for role in ("owner", "finance_manager", "advisor", "viewer"):
        u = m.User(id=f"u_{role}", email=f"{role}@test.local", name=role, password_hash="hash")
        db_session.add(u)
        users[role] = u

    db_session.flush()

    for role, u in users.items():
        mem = m.Membership(id=f"m_{role}", company_id=company.id, user_id=u.id, role=role)
        db_session.add(mem)
        memberships[role] = mem

    period = m.Period(
        id="test_period",
        company_id=company.id,
        name="دوره مالی ۱۴۰۵",
        start=date(2026, 1, 1),
        end=date(2026, 12, 29),
    )
    db_session.add(period)
    db_session.commit()

    return {
        "company": company,
        "other_company": other_company,
        "users": users,
        "memberships": memberships,
        "period": period,
    }
