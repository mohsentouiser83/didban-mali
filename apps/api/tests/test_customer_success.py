import time
from typing import Any
import httpx
import pytest

API_URL = "http://localhost:8000/api/v1"


def register(label: str) -> tuple[httpx.Client, dict[str, Any], str]:
    client = httpx.Client(base_url=API_URL)
    email = f"cs-{time.time_ns()}@example.com"
    res = client.post(
        "/auth/register",
        json={
            "email": email,
            "full_name": f"مدیر {label}",
            "password": "Secure-Pass-1234",
            "workspace_name": f"فضای {label}",
        },
    )
    assert res.status_code == 201, res.text
    return client, res.json()["user"], email


def create_company(client: httpx.Client, name: str) -> dict[str, Any]:
    res = client.post(
        "/companies",
        headers={"X-CSRF-Token": client.cookies["didban_csrf"]},
        json={
            "legal_name": name,
            "national_id": "14009988776",
            "fiscal_year_start_month": 1,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def test_customer_onboarding_validation_and_go_live() -> None:
    owner_client, _, _ = register("فاز۶")
    company = create_company(owner_client, "شرکت پیشرو آزمایشی فاز شش")
    company_id = company["id"]
    csrf = owner_client.cookies["didban_csrf"]

    # 1. Check initial onboarding state
    status_res = owner_client.get(f"/companies/{company_id}/onboarding")
    assert status_res.status_code == 200, status_res.text
    data = status_res.json()
    assert data["is_live"] is False
    assert data["progress_percentage"] >= 0
    assert len(data["steps"]) == 8
    assert data["active_blocker"] is not None

    # 2. Try go-live before financial validation -> must fail with 409
    bad_golive = owner_client.post(
        f"/companies/{company_id}/onboarding/go-live",
        headers={"X-CSRF-Token": csrf},
    )
    assert bad_golive.status_code == 409

    # 3. Submit baseline financial validation
    val_payload = {
        "cash_position_irr": "15000000000",
        "receivables_irr": "32000000000",
        "payables_irr": "18000000000",
        "reconciliation_difference_irr": "0",
        "opening_balance_confirmed": True,
        "user_statement": "تمامی ارقام نقدینگی و مطالبات با تراز افتتاحیه نرم‌افزار سپیدار تطبیق کامل دارد.",
    }
    val_res = owner_client.post(
        f"/companies/{company_id}/onboarding/validate",
        headers={"X-CSRF-Token": csrf},
        json=val_payload,
    )
    assert val_res.status_code == 201, val_res.text
    val_data = val_res.json()
    assert val_data["cash_position_irr"] == "15000000000"

    # 4. Trigger Go-Live successfully
    golive_res = owner_client.post(
        f"/companies/{company_id}/onboarding/go-live",
        headers={"X-CSRF-Token": csrf},
    )
    assert golive_res.status_code == 200, golive_res.text
    assert golive_res.json()["is_live"] is True

    # 5. Check onboarding state is now live
    updated_status = owner_client.get(f"/companies/{company_id}/onboarding")
    assert updated_status.status_code == 200
    assert updated_status.json()["is_live"] is True

    # 6. Submit a support ticket
    ticket_payload = {
        "category": "P3_NORMAL",
        "subject": "نحوه دسته‌بندی اقلام استثنا در مغایرت",
        "description": "در گزارش مغایرت بانکی، آیا امکان ثبت برچسب سفارشی برای کارمزدها وجود دارد؟",
        "current_route": "/reconciliation",
        "error_digest": None,
        "safe_diagnostic_json": {"screen": "reconciliation_summary"},
    }
    ticket_res = owner_client.post(
        f"/companies/{company_id}/support/tickets",
        headers={"X-CSRF-Token": csrf},
        json=ticket_payload,
    )
    assert ticket_res.status_code == 201, ticket_res.text
    assert ticket_res.json()["category"] == "P3_NORMAL"

    list_tickets = owner_client.get(f"/companies/{company_id}/support/tickets")
    assert list_tickets.status_code == 200
    assert len(list_tickets.json()) >= 1

    # 7. Submit product feedback
    feedback_payload = {
        "category": "REPORTING",
        "problem_statement": "نیاز به ارسال خلاصه هفتگی نقدینگی برای اعضای هیئت مدیره",
        "context": "در جلسه هفتگی مدیرعامل، گزارش PDF دیدبان مالی نمایش داده می‌شود.",
        "impact": "high",
        "workaround": "دانلود دستی گزارش PDF و ارسال با ایمیل",
        "requested_outcome": "امکان زمان‌بندی خروجی هفتگی",
    }
    fb_res = owner_client.post(
        f"/companies/{company_id}/feedback",
        headers={"X-CSRF-Token": csrf},
        json=feedback_payload,
    )
    assert fb_res.status_code == 201, fb_res.text

    # 8. Check admin health and metrics
    health_res = owner_client.get("/admin/customer-success/health")
    assert health_res.status_code == 200
    assert len(health_res.json()) >= 1

    metrics_res = owner_client.get("/admin/customer-success/metrics")
    assert metrics_res.status_code == 200
    metrics_data = metrics_res.json()
    assert metrics_data["total_companies"] >= 1
    assert metrics_data["mean_time_to_first_value_hours"] > 0
