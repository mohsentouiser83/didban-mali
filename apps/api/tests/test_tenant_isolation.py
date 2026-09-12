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


def upload_csv(
    client: httpx.Client,
    company_id: str,
    name: str,
    content: bytes,
    idempotency_key: str | None = None,
) -> httpx.Response:
    return client.post(
        f"/companies/{company_id}/imports/uploads",
        headers={
            "X-CSRF-Token": client.cookies["didban_csrf"],
            "Idempotency-Key": idempotency_key or f"upload-{time.time_ns()}",
        },
        data={"source_kind": "accounting", "source_label": "دفتر آزمایشی"},
        files={"file": (name, content, "text/csv")},
        timeout=60,
    )


def wait_for_scan(client: httpx.Client, company_id: str, batch_id: str) -> dict[str, Any]:
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        response = client.get(f"/companies/{company_id}/imports/{batch_id}")
        assert response.status_code == 200, response.text
        batch = response.json()
        if batch["scan_status"] != "pending":
            return batch
        time.sleep(1)
    pytest.fail("Malware scan did not complete within 120 seconds")


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
    forbidden_upload = upload_csv(viewer, company_a["id"], "محدود.csv", b"id,amount\n1,10")
    assert forbidden_upload.status_code == 403

    with psycopg.connect(APP_DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config(%s, %s, true)", ("app.user_id", user_a["id"]))
            cursor.execute("SELECT id::text FROM companies ORDER BY id")
            visible_ids = [row[0] for row in cursor.fetchall()]
    assert visible_ids == [company_a["id"]]

    owner_a.close()
    owner_b.close()
    viewer.close()


@pytest.mark.integration
def test_secure_upload_scan_and_authorized_download() -> None:
    owner, _, _ = register("بارگذاری")
    outsider, outsider_user, _ = register("خارج")
    company = create_company(owner, "شرکت بارگذاری امن")
    clean_content = "شماره سند,شرح,مبلغ\n۱,فروش,۲۵۰۰۰۰\n".encode()

    idempotency_key = f"upload-{time.time_ns()}"
    uploaded = upload_csv(
        owner,
        company["id"],
        "دفتر شهریور.csv",
        clean_content,
        idempotency_key,
    )
    assert uploaded.status_code == 202, uploaded.text
    batch_id = uploaded.json()["id"]
    repeated = upload_csv(owner, company["id"], "تکرار.csv", clean_content, idempotency_key)
    assert repeated.status_code == 202
    assert repeated.json()["id"] == batch_id

    assert outsider.get(f"/companies/{company['id']}/imports/{batch_id}").status_code == 404
    assert (
        outsider.get(f"/companies/{company['id']}/imports/{batch_id}/download").status_code == 404
    )

    clean_batch = wait_for_scan(owner, company["id"], batch_id)
    assert clean_batch["status"] == "awaiting_mapping"
    assert clean_batch["scan_status"] == "clean"
    downloaded = owner.get(f"/companies/{company['id']}/imports/{batch_id}/download")
    assert downloaded.status_code == 200, downloaded.text
    assert downloaded.content == clean_content

    eicar = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
    infected = upload_csv(owner, company["id"], "نمونه-آلوده.csv", eicar)
    assert infected.status_code == 202, infected.text
    infected_batch = wait_for_scan(owner, company["id"], infected.json()["id"])
    assert infected_batch["status"] == "failed"
    assert infected_batch["scan_status"] == "infected"
    assert infected_batch["failure_code"] == "MALWARE_DETECTED"
    assert (
        owner.get(f"/companies/{company['id']}/imports/{infected_batch['id']}/download").status_code
        == 409
    )

    with psycopg.connect(APP_DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config(%s, %s, true)", ("app.user_id", outsider_user["id"]))
            cursor.execute(
                "SELECT id::text FROM import_batches WHERE company_id = %s", (company["id"],)
            )
            assert cursor.fetchall() == []

    owner.close()
    outsider.close()
