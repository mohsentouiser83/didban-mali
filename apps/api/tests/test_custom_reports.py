"""Tests for custom reports, multi-source data catalog, field registry, and block query engine."""

from datetime import date
from uuid import uuid4

from fastapi.testclient import TestClient

from didban import cheque_models
from didban import models as m
from didban.api import app
from didban.config import settings
from didban.custom_reports import (
    FinancialBlockQueryEngine,
    compose_report_block,
    get_entity_registry,
    list_data_sources,
)
from didban.db import initialize, transaction
from didban.security import hasher


def test_data_sources_catalog():
    sources = list_data_sources()
    assert len(sources) >= 11
    keys = {s["value"] for s in sources}
    assert "journal_lines" in keys
    assert "invoices" in keys
    assert "bank_movements" in keys
    assert "cheques" in keys
    assert "parties" in keys
    assert "inventory_items" in keys
    assert "personnel_records" in keys
    assert "dimensions" in keys
    assert "moadian_transmissions" in keys


def test_field_registry_definitions():
    for source_key in [
        "journal_lines",
        "invoices",
        "bank_movements",
        "cheques",
        "parties",
        "inventory_items",
        "personnel_records",
        "dimensions",
        "moadian_transmissions",
    ]:
        reg = get_entity_registry(source_key)
        assert reg is not None, f"Registry missing for {source_key}"
        assert len(reg.filterable) > 0
        assert len(reg.selectable) > 0


def test_ai_composer():
    # Cheques
    res = compose_report_block("گزارش چک‌های پرداختی برگشتی")
    assert res["entity_type"] == "cheques"
    assert any(f["field"] == "direction" and f["value"] == "payable" for f in res["filters"])
    assert any(f["field"] == "state" and f["value"] == "rejected" for f in res["filters"])

    # Bank
    res = compose_report_block("گردش واریزی‌های حساب بانکی به صورت نمودار")
    assert res["entity_type"] == "bank_movements"
    assert res["visualization"] == "line_chart"

    # Invoices
    res = compose_report_block("فاکتورهای فروش سررسید گذشته")
    assert res["entity_type"] == "invoices"
    assert any(f["field"] == "direction" and f["value"] == "sales" for f in res["filters"])
    assert any(f["field"] == "status" and f["value"] == "overdue" for f in res["filters"])


def test_custom_report_block_query_engine_cheques():
    initialize()
    c_id = f"c-cr-{uuid4().hex[:6]}"
    u_id = f"u-cr-{uuid4().hex[:6]}"
    with transaction() as db:
        user = m.User(id=u_id, email=f"{u_id}@test.local", name="مدیر", password_hash="hash")
        company = m.Company(id=c_id, name="شرکت تست گزارش سفارشی")
        db.add_all([user, company])
        db.flush()

        c1 = cheque_models.Cheque(
            company_id=c_id,
            direction="receivable",
            number="1001",
            bank_name="ملت",
            bank_account="1234567890",
            party_id="مشتری الف",
            amount="5000000",
            original_amount="5000000",
            original_unit="IRR",
            issue_date=date(2026, 7, 1),
            due_date=date(2026, 8, 15),
            state="cleared",
            actor_id=u_id,
        )
        c2 = cheque_models.Cheque(
            company_id=c_id,
            direction="payable",
            number="1002",
            bank_name="ملی",
            bank_account="9876543210",
            party_id="تامین‌کننده ب",
            amount="3000000",
            original_amount="3000000",
            original_unit="IRR",
            issue_date=date(2026, 7, 10),
            due_date=date(2026, 9, 20),
            state="rejected",
            actor_id=u_id,
        )
        db.add_all([c1, c2])
        db.flush()

        # Query 1: Data Table with filter
        block_table = {
            "entity_type": "cheques",
            "visualization": "data_table",
            "filters": [{"field": "state", "operator": "=", "value": "rejected"}],
            "columns": ["number", "bank_name", "amount", "state"],
        }
        result = FinancialBlockQueryEngine.execute(db, c_id, block_table)
        assert result["total"] == 1
        assert len(result["rows"]) == 1
        assert result["rows"][0]["number"] == "1002"
        assert result["rows"][0]["amount"] == 3000000

        # Query 2: Metric strip
        block_metric = {
            "entity_type": "cheques",
            "visualization": "metric_strip",
            "filters": [],
            "metrics": [
                {"function": "count", "label_fa": "تعداد چک‌ها"},
                {"function": "sum", "field": "amount", "label_fa": "مجموع مبالغ"},
            ],
        }
        result_metric = FinancialBlockQueryEngine.execute(db, c_id, block_metric)
        assert len(result_metric["metrics"]) == 2
        assert result_metric["metrics"][0]["value"] == 2
        assert result_metric["metrics"][1]["value"] == 8000000

        # Query 3: Chart
        block_chart = {
            "entity_type": "cheques",
            "visualization": "bar_chart",
            "group_by": "bank_name",
            "aggregation": {"function": "sum", "field": "amount"},
        }
        result_chart = FinancialBlockQueryEngine.execute(db, c_id, block_chart)
        assert len(result_chart["chart_data"]["labels"]) == 2
        assert "ملت" in result_chart["chart_data"]["labels"]
        assert "ملی" in result_chart["chart_data"]["labels"]


def test_custom_reports_http_endpoints():
    initialize()
    c_id = f"c-api-cr-{uuid4().hex[:6]}"
    u_id = f"u-api-cr-{uuid4().hex[:6]}"
    email = f"{u_id}@test.local"
    pwd = "Secret-password-123!"

    with transaction() as db:
        user = m.User(id=u_id, email=email, name="مدیر مالی", password_hash=hasher.hash(pwd))
        company = m.Company(id=c_id, name="شرکت تست گزارش ساز")
        db.add_all([user, company])
        db.flush()

        member = m.Membership(company_id=c_id, user_id=u_id, role="owner", active=True)
        db.add(member)
        db.flush()

    client = TestClient(app)
    login = client.post("/api/v1/auth/login", json={"email": email, "password": pwd})
    assert login.status_code == 200
    csrf = login.json()["csrf"]
    headers = {"X-CSRF-Token": csrf, "Origin": settings.web_origin}

    # 1. GET data-sources
    resp = client.get(f"/api/v1/companies/{c_id}/report-builder/data-sources", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "data_sources" in data
    assert len(data["data_sources"]) >= 11

    # 2. GET field-registry
    resp_reg = client.get(f"/api/v1/companies/{c_id}/report-builder/field-registry/cheques", headers=headers)
    assert resp_reg.status_code == 200
    reg = resp_reg.json()
    assert reg["entity_type"] == "cheques"
    assert len(reg["filterable"]) > 0

    # 3. POST block-preview
    preview_payload = {
        "block": {
            "entity_type": "cheques",
            "visualization": "data_table",
            "filters": [],
            "columns": ["number", "amount", "bank_name"],
        }
    }
    resp_prev = client.post(
        f"/api/v1/companies/{c_id}/report-builder/block-preview",
        json=preview_payload,
        headers=headers,
    )
    assert resp_prev.status_code == 200
    res = resp_prev.json()
    assert res["entity_type"] == "cheques"
    assert "columns" in res
    assert "rows" in res

    # 4. POST ai-compose
    ai_payload = {"prompt": "گزارش واریزی‌های بانکی"}
    resp_ai = client.post(
        f"/api/v1/companies/{c_id}/report-builder/ai-compose", json=ai_payload, headers=headers
    )
    assert resp_ai.status_code == 200
    ai_res = resp_ai.json()
    assert ai_res["entity_type"] == "bank_movements"

    # 5. POST export (XLSX)
    export_payload = {
        "report_name": "گزارش آزمایشی چک‌ها",
        "blocks_results": [res],
        "format": "xlsx",
    }
    resp_exp = client.post(
        f"/api/v1/companies/{c_id}/report-builder/export", json=export_payload, headers=headers
    )
    assert resp_exp.status_code == 200
    assert "spreadsheetml" in resp_exp.headers.get("Content-Type", "")

    # 6. POST export (PDF)
    export_payload["format"] = "pdf"
    resp_pdf = client.post(
        f"/api/v1/companies/{c_id}/report-builder/export", json=export_payload, headers=headers
    )
    assert resp_pdf.status_code == 200
    assert "pdf" in resp_pdf.headers.get("Content-Type", "")

    # 7. POST & GET custom-definitions
    mutate_headers = {**headers, "Idempotency-Key": str(uuid4())}
    save_payload = {
        "name": "قالب چک‌های معوق",
        "blocks": [preview_payload["block"]],
    }
    resp_save = client.post(
        f"/api/v1/companies/{c_id}/report-builder/custom-definitions",
        json=save_payload,
        headers=mutate_headers,
    )
    assert resp_save.status_code == 201
    saved = resp_save.json()
    assert saved["name"] == "قالب چک‌های معوق"

    resp_list = client.get(
        f"/api/v1/companies/{c_id}/report-builder/custom-definitions", headers=headers
    )
    assert resp_list.status_code == 200
    defs = resp_list.json()
    assert len(defs) == 1
    assert defs[0]["name"] == "قالب چک‌های معوق"
