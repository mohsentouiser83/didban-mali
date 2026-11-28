"""Tests for B2B client contracts, milestone billing, and statutory retentions."""

from datetime import date
from uuid import uuid4

import pytest

from didban import contract_service as service
from didban import models as m
from didban.commercial_models import CommercialCounterparty
from didban.dimensions_models import Dimension
from didban.errors import DomainError


@pytest.fixture
def contract_env(db_session):
    user = m.User(
        id=str(uuid4()),
        email="contract_admin@example.com",
        name="مدیر قراردادها",
        password_hash="fake",
    )
    company = m.Company(id=str(uuid4()), name="شرکت نرم‌افزاری نمونه", business_mode="service")
    member = m.Membership(
        id=str(uuid4()),
        user_id=user.id,
        company_id=company.id,
        role="finance_manager",
    )
    cp = CommercialCounterparty(
        id=str(uuid4()),
        company_id=company.id,
        code="CUST-100",
        name="بانک نمونه",
        type="customer",
        entity_kind="legal_entity",
    )
    dim = Dimension(
        id=str(uuid4()),
        company_id=company.id,
        kind="project",
        code="PRJ-CRM",
        name="پروژه CRM",
        active=True,
    )
    db_session.add_all([user, company, member, cp, dim])
    db_session.flush()
    return {"user": user, "company": company.id, "counterparty": cp, "dimension": dim}


def test_client_contract_lifecycle_and_retentions(db_session, contract_env):
    company = contract_env["company"]
    user = contract_env["user"]
    cp = contract_env["counterparty"]
    dim = contract_env["dimension"]

    created = service.create_contract(
        db_session,
        company,
        user,
        {
            "contract_number": "CNT-1403-01",
            "title": "قرارداد توسعه و پشتیبانی CRM",
            "counterparty_id": cp.id,
            "dimension_id": dim.id,
            "contract_kind": "fixed_project",
            "start_date": date(2024, 4, 1),
            "total_amount_irr": "1000000000",
            "insurance_retention_rate": "5",
            "performance_retention_rate": "10",
            "withholding_tax_rate": "0",
            "milestones": [
                {"sequence": 1, "title": "تحویل فاز اول", "amount_irr": "400000000"},
                {"sequence": 2, "title": "تحویل نهایی", "amount_irr": "600000000"},
            ],
        },
    )
    assert created["contract_number"] == "CNT-1403-01"
    assert len(created["milestones"]) == 2
    assert created["summary"]["remaining_to_invoice_irr"] == "1000000000"

    with pytest.raises(DomainError) as dup:
        service.create_contract(
            db_session,
            company,
            user,
            {
                "contract_number": "CNT-1403-01",
                "title": "قرارداد تکراری",
                "counterparty_id": cp.id,
                "start_date": date(2024, 4, 1),
                "total_amount_irr": "100000000",
            },
        )
    assert dup.value.code == "duplicate_contract_number"

    ms1 = created["milestones"][0]
    billed = service.bill_milestone(db_session, company, user, created["id"], ms1["id"], {})
    assert billed["status"] == "invoiced"
    assert billed["invoiced_amount_irr"] == "400000000"

    collected = service.collect_milestone(
        db_session,
        company,
        user,
        created["id"],
        ms1["id"],
        {"auto_compute_retentions": True},
    )
    assert collected["status"] == "settled"
    assert collected["insurance_retained_irr"] == "20000000"
    assert collected["performance_retained_irr"] == "40000000"
    assert collected["collected_cash_irr"] == "340000000"

    with pytest.raises(DomainError) as over:
        service.collect_milestone(
            db_session,
            company,
            user,
            created["id"],
            ms1["id"],
            {"cash_received_irr": "1"},
        )
    assert over.value.code == "collection_exceeds_invoiced"

    detail = service.get_contract(db_session, company, created["id"])
    assert detail["summary"]["invoiced_total_irr"] == "400000000"
    assert detail["summary"]["collected_cash_irr"] == "340000000"
    assert detail["summary"]["unreleased_retention_irr"] == "60000000"
    assert detail["summary"]["remaining_to_invoice_irr"] == "600000000"
    assert detail["summary"]["remaining_to_collect_irr"] == "0"

    released = service.release_milestone_retention(db_session, company, user, created["id"], ms1["id"])
    assert released["retention_released"] is True

    detail_after = service.get_contract(db_session, company, created["id"])
    assert detail_after["summary"]["unreleased_retention_irr"] == "0"
