from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from didban import numbering_service as service
from didban.api import app
from didban.config import settings
from didban.db import initialize, transaction
from didban.errors import DomainError
from didban.models import Company, Membership, User
from didban.security import hasher


@pytest.fixture(autouse=True)
def init_db():
    initialize()


@pytest.fixture
def auth_context():
    cid = f"test-co-{uuid4().hex[:8]}"
    uid = f"test-user-{uuid4().hex[:8]}"
    email = f"{uid}@example.test"
    password = "Synthetic-password-2026!"

    with transaction() as db:
        user = User(
            id=uid,
            email=email,
            name="کاربر مالی",
            password_hash=hasher.hash(password),
        )
        company = Company(id=cid, name="شرکت آزمایشی")
        membership = Membership(company_id=cid, user_id=uid, role="owner")
        db.add_all([user, company])
        db.flush()
        db.add(membership)

    client = TestClient(app)
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_resp.status_code == 200, login_resp.text
    csrf = login_resp.json()["csrf"]

    def make_headers(version=None):
        h = {
            "X-CSRF-Token": csrf,
            "Idempotency-Key": str(uuid4()),
            "Origin": settings.web_origin,
        }
        if version:
            h["If-Match"] = str(version)
        return h

    return {"client": client, "company_id": cid, "user_id": uid, "headers": make_headers}


def test_default_numbering_rules_created_with_001(auth_context):
    with transaction(auth_context["company_id"]) as db:
        user = db.get(User, auth_context["user_id"])
        rules = service.list_rules(db, auth_context["company_id"], user)

    assert len(rules) >= 11
    expected_entities = {
        "journal_entry",
        "sales_invoice",
        "purchase_invoice",
        "proforma_invoice",
        "counterparty",
        "cheque",
        "inventory_item",
        "inventory_warehouse",
        "inventory_movement",
        "dimension",
        "personnel",
    }
    present_entities = {r["entity_type"] for r in rules}
    assert expected_entities.issubset(present_entities)

    # Every entity must default to starting with "001"
    for rule in rules:
        assert rule["current_number"] == 1
        assert rule["start_number"] == 1
        assert rule["padding"] == 3
        assert rule["prefix"] == ""
        assert rule["suffix"] == ""
        assert rule["sample"] == "001"
        assert rule["is_system"] is True


def test_update_numbering_rule(auth_context):
    cid = auth_context["company_id"]
    with transaction(cid) as db:
        user = db.get(User, auth_context["user_id"])
        rules = service.list_rules(db, cid, user)
        invoice_rule = next(r for r in rules if r["entity_type"] == "sales_invoice")

        updated = service.update_rule(
            db,
            cid,
            user,
            invoice_rule["id"],
            {
                "prefix": "FAC-",
                "padding": 4,
                "current_number": 5,
                "suffix": "-1403",
                "description": "فاکتورهای رسمی فروش",
            },
            invoice_rule["version"],
        )

    assert updated["prefix"] == "FAC-"
    assert updated["padding"] == 4
    assert updated["current_number"] == 5
    assert updated["suffix"] == "-1403"
    assert updated["sample"] == "FAC-0005-1403"
    assert updated["version"] == invoice_rule["version"] + 1


def test_delete_numbering_rule_forbidden(auth_context):
    cid = auth_context["company_id"]
    with transaction(cid) as db:
        user = db.get(User, auth_context["user_id"])
        rules = service.list_rules(db, cid, user)
        first_rule = rules[0]

        with pytest.raises(DomainError) as exc_info:
            service.delete_rule(db, cid, user, first_rule["id"])
        assert exc_info.value.code == "cannot_delete_numbering_system"
        assert exc_info.value.status == 400


def test_generate_next_number_preview_and_consume(auth_context):
    cid = auth_context["company_id"]
    with transaction(cid) as db:
        user = db.get(User, auth_context["user_id"])
        preview = service.generate_next_number(db, cid, user, "journal_entry", consume=False)
        assert preview["number"] == "001"
        assert preview["current_number"] == 1

        consumed = service.generate_next_number(db, cid, user, "journal_entry", consume=True)
        assert consumed["number"] == "001"
        assert consumed["current_number"] == 2

        preview2 = service.generate_next_number(db, cid, user, "journal_entry", consume=False)
        assert preview2["number"] == "002"
        assert preview2["current_number"] == 2


def test_api_numbering_endpoints(auth_context):
    client = auth_context["client"]
    cid = auth_context["company_id"]
    headers = auth_context["headers"]

    # 1. Listing
    res = client.get(f"/api/v1/companies/{cid}/numbering")
    assert res.status_code == 200, res.text
    items = res.json()
    assert len(items) >= 11
    # Check default 001
    for item in items:
        assert item["sample"] == "001"

    # 2. Patch
    target = items[0]
    patch_res = client.patch(
        f"/api/v1/companies/{cid}/numbering/{target['id']}",
        json={"prefix": "SANAD-", "padding": 5, "current_number": 1},
        headers=headers(version=target["version"]),
    )
    assert patch_res.status_code == 200, patch_res.text
    patched_body = patch_res.json()
    assert patched_body["sample"] == "SANAD-00001"
    assert patched_body["version"] == target["version"] + 1

    # 3. Delete must fail with 400
    del_res = client.delete(
        f"/api/v1/companies/{cid}/numbering/{target['id']}",
        headers=headers(),
    )
    assert del_res.status_code == 400
    assert del_res.json()["code"] == "cannot_delete_numbering_system"

    # 4. Next number API
    next_res = client.post(
        f"/api/v1/companies/{cid}/numbering/next/sales_invoice?consume=true",
        headers=headers(),
    )
    assert next_res.status_code == 200
    assert next_res.json()["number"] == "001"
    assert next_res.json()["current_number"] == 2

    # 5. Create custom numbering rule
    create_res = client.post(
        f"/api/v1/companies/{cid}/numbering",
        json={
            "entity_type": "custom_contract",
            "entity_title": "قراردادهای پیمانکاری",
            "prefix": "CTR-",
            "start_number": 10,
            "current_number": 10,
            "padding": 4,
            "suffix": "-1403",
            "description": "شماره‌گذاری قراردادهای پیمانکاری",
        },
        headers=headers(),
    )
    assert create_res.status_code == 201, create_res.text
    created = create_res.json()
    assert created["entity_type"] == "custom_contract"
    assert created["entity_title"] == "قراردادهای پیمانکاری"
    assert created["sample"] == "CTR-0010-1403"
    assert created["is_system"] is False

    # 6. Duplicate entity_type should return 409
    dup_res = client.post(
        f"/api/v1/companies/{cid}/numbering",
        json={
            "entity_type": "custom_contract",
            "entity_title": "قرارداد تکراری",
        },
        headers=headers(),
    )
    assert dup_res.status_code == 409

    # 7. Delete custom rule should succeed
    del_custom = client.delete(
        f"/api/v1/companies/{cid}/numbering/{created['id']}",
        headers=headers(),
    )
    assert del_custom.status_code == 200
