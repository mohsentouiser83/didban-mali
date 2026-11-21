"""Tests for the Report Studio backend (interpret, preview, definitions CRUD)."""

from datetime import date

from test_posting import book as book

from didban import models as m
from didban.report_studio_schemas import (
    StudioGlobalFilters,
    StudioLayoutSpec,
    StudioSaveDefinitionInput,
    StudioSectionSpec,
    StudioWidgetSpec,
)
from didban.report_studio_service import (
    export_definition_pdf,
    get_active_dashboard,
    get_definition,
    interpret,
    list_definitions,
    preview,
    reset_active_dashboard,
    save,
    set_active_dashboard,
    set_official_report_as_dashboard,
)


def test_studio_interpret_sales_prompt():
    res = interpret("گزارش فروش فصلی و فاکتورهای سررسیدگذشته", "p1", "IRR")
    assert "فروش" in res["title"]
    assert len(res["sections"]) >= 2
    all_widgets = [w for sec in res["sections"] for w in sec["widgets"]]
    assert any(w["metric"] == "sales_total" for w in all_widgets)
    assert any(w["type"] == "kpi_card" for w in all_widgets)
    assert any(w["type"] in ("line_chart", "bar_chart") for w in all_widgets)


def test_studio_interpret_pnl_prompt():
    res = interpret("تحلیل سود و زیان و عملکرد مالی", "p1", "TOMAN")
    assert "سود و زیان" in res["title"]
    all_widgets = [w for sec in res["sections"] for w in sec["widgets"]]
    assert any(w["metric"] == "revenue" for w in all_widgets)
    assert any(w["type"] == "donut_chart" for w in all_widgets)


def test_studio_interpret_treasury_prompt():
    res = interpret("وضعیت نقدینگی، بانک و چک‌های صیادی", "p1", "IRR")
    assert "نقدینگی" in res["title"]
    all_widgets = [w for sec in res["sections"] for w in sec["widgets"]]
    assert any(w["entity"] == "cheques" for w in all_widgets)


def test_studio_preview_execution(book):
    db = book
    # Add a period for company "c"
    period = m.Period(
        id="p1",
        company_id="c",
        name="پاییز ۱۴۰۵",
        start=date(2026, 9, 23),
        end=date(2026, 12, 21),
    )
    db.add(period)

    # Create ResultManifest with metrics & invoices
    manifest = m.ResultManifest(
        id="man-1",
        company_id="c",
        period_id="p1",
        session_id="sess-1",
        digest="d1",
        selection={"period": {"start": "2026-09-23", "end": "2026-12-21"}},
        metrics=[
            {"metric_key": "revenue", "label": "درآمد کل", "value": "50000000", "unit": "IRR"},
            {"metric_key": "expense", "label": "هزینه کل", "value": "20000000", "unit": "IRR"},
            {"metric_key": "pre_tax_profit", "label": "سود", "value": "30000000", "unit": "IRR"},
            {"metric_key": "cash", "label": "بانک", "value": "15000000", "unit": "IRR"},
        ],
        details={
            "invoices": [
                {
                    "id": "inv-1",
                    "reference": "FAC-101",
                    "party_id": "شرکت الف",
                    "direction": "sale",
                    "amount": "25000000",
                    "remaining": "5000000",
                    "date": "2026-09-25",
                    "due_date": "2026-10-10",
                    "overdue": True,
                },
                {
                    "id": "inv-2",
                    "reference": "FAC-102",
                    "party_id": "شرکت ب",
                    "direction": "sale",
                    "amount": "25000000",
                    "remaining": "0",
                    "date": "2026-10-01",
                    "due_date": "2026-10-20",
                    "overdue": False,
                },
            ]
        },
    )
    db.add(manifest)
    db.flush()

    layout = StudioLayoutSpec(
        title="تست داشبورد",
        global_filters=StudioGlobalFilters(period_id="p1", unit="IRR"),
        sections=[
            StudioSectionSpec(
                id="sec-1",
                title="سکشن شاخص‌ها",
                layout="grid-2",
                widgets=[
                    StudioWidgetSpec(
                        id="w1",
                        title="فروش کل",
                        type="kpi_card",
                        entity="invoices",
                        metric="sales_total",
                    ),
                    StudioWidgetSpec(
                        id="w2",
                        title="درآمد دفتری",
                        type="kpi_card",
                        entity="ledger",
                        metric="revenue",
                    ),
                ],
            ),
            StudioSectionSpec(
                id="sec-2",
                title="سکشن جداول و تحلیل",
                layout="split-2-1",
                widgets=[
                    StudioWidgetSpec(
                        id="w3",
                        title="جدول فاکتورها",
                        type="data_table",
                        entity="invoices",
                    ),
                    StudioWidgetSpec(
                        id="w4",
                        title="تحلیل هوشمند",
                        type="ai_summary",
                        entity="ledger",
                    ),
                ],
            ),
        ],
    )

    res = preview(db, "c", layout)
    assert res["title"] == "تست داشبورد"
    assert len(res["sections"]) == 2
    sec1 = res["sections"][0]
    assert sec1["widgets"][0]["data"]["value"] == 50000000
    assert sec1["widgets"][1]["data"]["value"] == 50000000
    sec2 = res["sections"][1]
    assert len(sec2["widgets"][0]["data"]["rows"]) == 2
    assert "درآمد ناخالص" in sec2["widgets"][1]["data"]["insight"]


def test_studio_crud_definition(book):
    db = book
    user = db.get(m.User, "owner")
    period = m.Period(
        id="p1",
        company_id="c",
        name="دوره مالی",
        start=date(2026, 1, 1),
        end=date(2026, 12, 29),
    )
    db.add(period)
    db.flush()

    layout = StudioLayoutSpec(
        title="قالب فروش",
        global_filters=StudioGlobalFilters(period_id="p1"),
        sections=[],
    )
    saved = save(db, "c", user, StudioSaveDefinitionInput(name="قالب من", spec=layout))
    assert saved["name"] == "قالب من"
    assert saved["version"] == 1

    defs = list_definitions(db, "c")
    assert len(defs) == 1
    assert defs[0]["id"] == saved["id"]

    one = get_definition(db, "c", saved["id"])
    assert one["name"] == "قالب من"
    assert one["spec"]["title"] == "قالب فروش"


def test_studio_dashboard_conversion(book):
    db = book
    user = db.get(m.User, "owner")
    period = m.Period(
        id="p1",
        company_id="c",
        name="دوره مالی",
        start=date(2026, 1, 1),
        end=date(2026, 12, 29),
    )
    db.add(period)
    db.flush()

    layout1 = StudioLayoutSpec(
        title="گزارش یک",
        global_filters=StudioGlobalFilters(period_id="p1"),
        sections=[],
    )
    layout2 = StudioLayoutSpec(
        title="گزارش دو",
        global_filters=StudioGlobalFilters(period_id="p1"),
        sections=[],
    )

    # 1. Initially no active dashboard
    active = get_active_dashboard(db, "c")
    assert active["has_custom_dashboard"] is False

    # 2. Save definition 1 without dashboard flag
    def1 = save(db, "c", user, StudioSaveDefinitionInput(name="گزارش ۱", spec=layout1, is_dashboard=False))
    assert def1["is_dashboard"] is False
    assert get_active_dashboard(db, "c")["has_custom_dashboard"] is False

    # 3. Save definition 2 with is_dashboard=True
    def2 = save(db, "c", user, StudioSaveDefinitionInput(name="گزارش ۲", spec=layout2, is_dashboard=True))
    assert def2["is_dashboard"] is True

    active = get_active_dashboard(db, "c")
    assert active["has_custom_dashboard"] is True
    assert active["definition_id"] == def2["id"]
    assert active["definition_name"] == "گزارش ۲"

    # 4. Set definition 1 as dashboard explicitly
    set_res = set_active_dashboard(db, "c", user, def1["id"])
    assert set_res["is_dashboard"] is True

    active = get_active_dashboard(db, "c")
    assert active["has_custom_dashboard"] is True
    assert active["definition_id"] == def1["id"]

    # Verify definition 2 is no longer active dashboard
    d2 = get_definition(db, "c", def2["id"])
    assert d2["is_dashboard"] is False

    # 5. Reset dashboard
    reset_res = reset_active_dashboard(db, "c", user)
    assert reset_res["has_custom_dashboard"] is False

    active = get_active_dashboard(db, "c")
    assert active["has_custom_dashboard"] is False

    # 6. Test PDF export of report definition
    pdf_bytes = export_definition_pdf(db, "c", def1["id"])
    assert isinstance(pdf_bytes, bytes)
    assert pdf_bytes.startswith(b"%PDF")

    # 7. Test converting an official Report into a dashboard
    manifest = m.ResultManifest(
        id="man-official-1",
        company_id="c",
        period_id="p1",
        session_id="sess-official-1",
        digest="d-off-1",
        selection={},
        metrics=[{"metric_key": "revenue", "label": "درآمد کل", "value": "10000000", "unit": "IRR"}],
        details={},
    )
    report = m.Report(
        id="rep-official-1",
        company_id="c",
        manifest_id="man-official-1",
        title="تراز آزمایشی رسمی",
        version=1,
    )
    db.add_all([manifest, report])
    db.flush()

    official_dash = set_official_report_as_dashboard(db, "c", user, report.id)
    assert official_dash["is_dashboard"] is True
    active_now = get_active_dashboard(db, "c")
    assert active_now["has_custom_dashboard"] is True
    assert "تراز آزمایشی" in active_now["definition_name"]


def test_studio_api_routes():
    from uuid import uuid4

    from fastapi.testclient import TestClient
    from sqlalchemy import text

    from didban.api import app
    from didban.config import settings
    from didban.db import transaction
    from didban.security import hasher

    c_id = f"c-api-stu-{uuid4().hex[:6]}"
    u_id = f"u-api-stu-{uuid4().hex[:6]}"
    p_id = f"p-api-stu-{uuid4().hex[:6]}"
    email = f"{u_id}@test.local"
    pwd = "Secret-password-123!"

    with transaction() as db:
        user = m.User(id=u_id, email=email, name="مدیر مالی", password_hash=hasher.hash(pwd))
        company = m.Company(id=c_id, name="شرکت تست استودیو")
        db.add_all([user, company])
        db.flush()

        db.execute(text(f"SET LOCAL didban.company_id = '{c_id}'"))
        member = m.Membership(company_id=c_id, user_id=u_id, role="owner", active=True)
        period = m.Period(
            id=p_id,
            company_id=c_id,
            name="دوره تستی",
            start=date(2026, 1, 1),
            end=date(2026, 12, 29),
        )
        db.add_all([member, period])
        db.flush()

    client = TestClient(app)
    login = client.post("/api/v1/auth/login", json={"email": email, "password": pwd})
    assert login.status_code == 200
    csrf = login.json()["csrf"]
    headers = {"X-CSRF-Token": csrf, "Origin": settings.web_origin}

    # 1. Test Interpret endpoint
    resp = client.post(
        f"/api/v1/companies/{c_id}/report-studio/interpret",
        headers=headers,
        json={"prompt": "گزارش فروش و مشتریان برتر", "period_id": p_id, "unit": "IRR"},
    )
    assert resp.status_code == 200, resp.text
    interpreted = resp.json()
    assert "فروش" in interpreted["title"]
    assert len(interpreted["sections"]) > 0

    # 2. Test Preview endpoint
    resp_prev = client.post(
        f"/api/v1/companies/{c_id}/report-studio/preview",
        headers=headers,
        json={"spec": interpreted},
    )
    assert resp_prev.status_code == 200, resp_prev.text
    prev_data = resp_prev.json()
    assert len(prev_data["sections"]) > 0

    # 3. Test Save Definition endpoint
    mutate_headers = {**headers, "Idempotency-Key": str(uuid4())}
    resp_save = client.post(
        f"/api/v1/companies/{c_id}/report-studio/definitions",
        headers=mutate_headers,
        json={"name": "قالب فروش تست", "spec": interpreted},
    )
    assert resp_save.status_code == 201, resp_save.text
    saved_def = resp_save.json()
    assert saved_def["name"] == "قالب فروش تست"

    # 4. Test List Definitions endpoint
    resp_list = client.get(f"/api/v1/companies/{c_id}/report-studio/definitions", headers=headers)
    assert resp_list.status_code == 200, resp_list.text
    defs = resp_list.json()
    assert len(defs) == 1
    assert defs[0]["id"] == saved_def["id"]

    # 5. Test Get Definition endpoint
    resp_get = client.get(
        f"/api/v1/companies/{c_id}/report-studio/definitions/{saved_def['id']}", headers=headers
    )
    assert resp_get.status_code == 200, resp_get.text
    assert resp_get.json()["name"] == "قالب فروش تست"

    # 6. Test Set Dashboard endpoint
    mutate_dash = {**headers, "Idempotency-Key": str(uuid4())}
    resp_set_dash = client.post(
        f"/api/v1/companies/{c_id}/report-studio/definitions/{saved_def['id']}/set-dashboard",
        headers=mutate_dash,
    )
    assert resp_set_dash.status_code == 200, resp_set_dash.text
    assert resp_set_dash.json()["is_dashboard"] is True

    # 7. Test Get Active Dashboard endpoint
    resp_active = client.get(f"/api/v1/companies/{c_id}/report-studio/active-dashboard", headers=headers)
    assert resp_active.status_code == 200, resp_active.text
    active_data = resp_active.json()
    assert active_data["has_custom_dashboard"] is True
    assert active_data["definition_id"] == saved_def["id"]

    # 8. Test Reset Active Dashboard endpoint
    mutate_reset = {**headers, "Idempotency-Key": str(uuid4())}
    resp_reset = client.post(f"/api/v1/companies/{c_id}/report-studio/active-dashboard/reset", headers=mutate_reset)
    assert resp_reset.status_code == 200, resp_reset.text
    assert resp_reset.json()["has_custom_dashboard"] is False

    # Verify active dashboard is now cleared
    resp_active2 = client.get(f"/api/v1/companies/{c_id}/report-studio/active-dashboard", headers=headers)
    assert resp_active2.status_code == 200
    assert resp_active2.json()["has_custom_dashboard"] is False
