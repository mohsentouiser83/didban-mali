"""Tests for financial period dependencies, composite FKs, and CRUD guards."""

from datetime import date

import pytest
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from didban import cheque_service
from didban import models as m
from didban.errors import DomainError
from didban.services import period_has_dependencies, save_period


def test_period_has_dependencies_covers_cheque_comparison_and_payroll(db_session: Session, test_company_context):
    db = db_session
    company = test_company_context["company"].id
    owner = test_company_context["users"]["owner"]
    p1 = test_company_context["period"]

    # Create an empty non-overlapping period p2 in 2025/2026 prior to today
    p0_dict = save_period(
        db,
        company,
        owner,
        {"name": "دوره پایه", "start": date(2025, 1, 1), "end": date(2025, 6, 30)},
    )
    p2_dict = save_period(
        db,
        company,
        owner,
        {"name": "دوره دوم", "start": date(2025, 7, 1), "end": date(2025, 12, 31)},
    )
    p0_id = p0_dict["id"]
    p2_id = p2_dict["id"]
    period = db.get(m.Period, p2_id)
    period.previous_period_id = p0_id
    db.flush()

    # p0 is referenced by p2 as previous_period_id -> p0 is in_use!
    assert period_has_dependencies(db, company, p0_id) is True
    assert period_has_dependencies(db, company, p2_id) is False

    renamed = save_period(db, company, owner, {
        "name": "دوره دوم ویرایش‌شده", "start": period.start, "end": period.end,
    }, period)
    assert renamed["previous_period_id"] == p0_id

    # Reversed dates and overlap rejected
    with pytest.raises(DomainError) as err:
        save_period(db, company, owner, {"name": "وارونه", "start": date(2028, 5, 1), "end": date(2028, 4, 1)})
    assert err.value.code == "invalid_period_dates"
    with pytest.raises(DomainError) as err:
        save_period(db, company, owner, {"name": "همپوشان", "start": date(2025, 8, 1), "end": date(2025, 9, 1)})
    assert err.value.code == "overlapping_period"

    # Register a cheque in p2 -> p2 becomes in_use!
    cheque_service.create(
        db,
        company,
        owner,
        {
            "period_id": p2_id,
            "direction": "received",
            "number": "CHK-9001",
            "bank_name": "بانک ملت",
            "bank_account": "123456",
            "party_id": "CUST-1",
            "amount": "500000",
            "unit": "IRR",
            "issue_date": date(2025, 8, 1),
            "due_date": date(2025, 9, 1),
        },
    )
    assert period_has_dependencies(db, company, p2_id) is True

    # Changing dates of p2 now fails with period_in_use
    with pytest.raises(DomainError) as err:
        save_period(
            db,
            company,
            owner,
            {"name": "دوره دوم", "start": date(2025, 7, 2), "end": date(2025, 12, 31)},
            db.get(m.Period, p2_id),
        )
    assert err.value.code == "period_in_use"
    assert p1.id

    # Composite FK exists on cheque_events
    fks = inspect(db.bind).get_foreign_keys("cheque_events")
    assert any(fk["referred_table"] == "financial_periods" for fk in fks)


def test_http_period_delete_blocks_cheque_comparison_and_closed_period_and_allows_empty(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
owner = client_for("owner")
manager = client_for("finance_manager")

p1 = command(owner, "POST", base + "/financial-periods", {"name": "دوره ۱", "start": "2025-01-01", "end": "2025-06-30"})
assert p1.status_code == 201, p1.text
p1_data = p1.json()

p2_body = {"name": "دوره ۲", "start": "2025-07-01", "end": "2025-12-31"}
comparison_body = {**p2_body, "previous_period_id": p1_data["id"]}
assert command(owner, "POST", base + "/financial-periods", comparison_body).status_code == 422
p2 = command(owner, "POST", base + "/financial-periods", p2_body)
assert p2.status_code == 201, p2.text
p2_data = p2.json()
assert command(owner, "PATCH", base + "/financial-periods/" + p2_data["id"], comparison_body, version=p2_data["version"]).status_code == 422
from didban.models import Period
with transaction("company-a") as db:
    db.get(Period, p2_data["id"]).previous_period_id = p1_data["id"]

# p1 has comparison dependency from p2 -> in_use True and DELETE -> 409
periods = owner.get(base + "/financial-periods").json()["items"]
p1_listed = next(x for x in periods if x["id"] == p1_data["id"])
p2_listed = next(x for x in periods if x["id"] == p2_data["id"])
assert p1_listed["in_use"] is True
assert p2_listed["in_use"] is False
assert command(owner, "DELETE", base + "/financial-periods/" + p1_data["id"], version=p1_data["version"]).status_code == 409

# Register a cheque in p2 -> p2 becomes in_use and cannot be deleted
chk = command(owner, "POST", base + "/cheques", {
    "period_id": p2_data["id"],
    "direction": "received",
    "number": "1001",
    "bank_name": "ملت",
    "bank_account": "111",
    "party_id": "P1",
    "amount": "100000",
    "unit": "IRR",
    "issue_date": "2025-07-05",
    "due_date": "2025-08-05",
})
assert chk.status_code == 201, chk.text
assert command(owner, "DELETE", base + "/financial-periods/" + p2_data["id"], version=p2_data["version"]).status_code == 409

# Empty period p3 can be deleted
p3 = command(owner, "POST", base + "/financial-periods", {"name": "دوره خالی", "start": "2027-01-01", "end": "2027-12-29"})
assert p3.status_code == 201, p3.text
p3_data = p3.json()
assert command(owner, "DELETE", base + "/financial-periods/" + p3_data["id"], version=p3_data["version"]).status_code == 200

# Closed period cannot be edited
p4 = command(owner, "POST", base + "/financial-periods", {"name": "دوره بسته", "start": "2028-01-01", "end": "2028-12-29"}).json()
closed = command(manager, "POST", base + "/financial-periods/" + p4["id"] + "/close", {"reason": "بستن آزمایشی", "acknowledge_warnings": True}, version=1)
assert closed.status_code == 200, closed.text
assert command(owner, "PATCH", base + "/financial-periods/" + p4["id"], {"name": "تغییر نام", "start": "2028-01-01", "end": "2028-12-29"}, version=p4["version"]).status_code == 409
""",
    )
