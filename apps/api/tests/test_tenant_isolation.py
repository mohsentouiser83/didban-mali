import os
import time
from typing import Any

import httpx
import psycopg
import pytest

RUN_INTEGRATION_TESTS = os.getenv("RUN_INTEGRATION_TESTS") == "1"
API_URL = os.getenv("INTEGRATION_API_URL", "http://localhost:8000/api/v1")
APP_DATABASE_URL = os.getenv(
    "INTEGRATION_DATABASE_URL",
    "postgresql://didban_app:change-me-app-password@localhost:55432/didban_mali",
)

pytestmark = pytest.mark.skipif(
    not RUN_INTEGRATION_TESTS,
    reason="Set RUN_INTEGRATION_TESTS=1 while the local Docker stack is running.",
)


def register(label: str) -> tuple[httpx.Client, dict[str, Any], str]:
    client = httpx.Client(base_url=API_URL)
    email = f"tenant-{time.time_ns()}@example.com"
    response = client.post(
        "/auth/register",
        json={
            "email": email,
            "full_name": f"کاربر {label}",
            "password": "Secure-Pass-1234",
            "workspace_name": f"فضای {label}",
        },
    )
    assert response.status_code == 201, response.text
    return client, response.json()["user"], email


def create_company(client: httpx.Client, name: str) -> dict[str, Any]:
    response = client.post(
        "/companies",
        headers={"X-CSRF-Token": client.cookies["didban_csrf"]},
        json={
            "legal_name": name,
            "national_id": "14001234567",
            "fiscal_year_start_month": 1,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.integration
def test_tenants_are_isolated_and_roles_are_enforced() -> None:
    owner_a, user_a, _ = register("الف")
    owner_b, _, _ = register("ب")
    viewer, _, viewer_email = register("مشاهده‌گر")

    without_csrf = owner_a.post("/companies", json={"legal_name": "بدون توکن"})
    assert without_csrf.status_code == 403

    company_a = create_company(owner_a, "شرکت مستقل الف")
    create_company(owner_b, "شرکت مستقل ب")

    visible_to_a = owner_a.get("/companies").json()
    assert [company["id"] for company in visible_to_a] == [company_a["id"]]
    assert owner_b.get(f"/companies/{company_a['id']}").status_code == 404

    added = owner_a.post(
        f"/companies/{company_a['id']}/members",
        headers={"X-CSRF-Token": owner_a.cookies["didban_csrf"]},
        json={"email": viewer_email, "role": "viewer"},
    )
    assert added.status_code == 201, added.text

    forbidden_update = viewer.patch(
        f"/companies/{company_a['id']}",
        headers={"X-CSRF-Token": viewer.cookies["didban_csrf"]},
        json={"legal_name": "تغییر غیرمجاز"},
    )
    assert forbidden_update.status_code == 403

    with psycopg.connect(APP_DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config(%s, %s, true)", ("app.user_id", user_a["id"]))
            cursor.execute("SELECT id::text FROM companies ORDER BY id")
            visible_ids = [row[0] for row in cursor.fetchall()]
    assert visible_ids == [company_a["id"]]

    owner_a.close()
    owner_b.close()
    viewer.close()
