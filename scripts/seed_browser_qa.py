#!/usr/bin/env python3
"""Synthetic browser fixture installer, restricted to a separate local QA DB."""

import sys
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
from didban.config import settings  # noqa: E402

if settings.production or not settings.database_url.endswith("/browser-qa.db"):
    raise SystemExit(
        "This script only accepts a dedicated browser-qa.db in development"
    )

from fastapi.testclient import TestClient  # noqa: E402
from didban.api import app  # noqa: E402
from didban.db import initialize, transaction  # noqa: E402
from didban.models import User  # noqa: E402
from didban.security import hasher  # noqa: E402
from didban.worker import run_once  # noqa: E402

initialize()
with transaction() as db:
    db.add(
        User(
            name="آزمون مرورگر",
            email="qa@example.test",
            password_hash=hasher.hash("Browser-QA-2026-Only!"),
            installation_admin=True,
        )
    )
client = TestClient(app)
login = client.post(
    "/api/v1/auth/login",
    json={"email": "qa@example.test", "password": "Browser-QA-2026-Only!"},
)
csrf = login.json()["csrf"]


def headers(version=None):
    value = {"X-CSRF-Token": csrf, "Idempotency-Key": str(uuid4())}
    if version:
        value["If-Match"] = str(version)
    return value


def create(path, value, version=None):
    response = client.post("/api/v1" + path, json=value, headers=headers(version))
    assert response.is_success, response.text
    return response.json()


company = create("/companies", {"name": "شرکت آزمایشی؛ داده ساختگی"})
base = "/companies/" + company["id"]
period = create(
    base + "/financial-periods",
    {"name": "شهریور ۱۴۰۵؛ آزمون", "start": "2026-09-01", "end": "2026-09-30"},
)
session = create(base + "/processing-sessions", {"period_id": period["id"]})
path = base + "/processing-sessions/" + session["id"]
files = []
for filename in (
    "ledger.xlsx",
    "bank.xlsx",
    "invoices.xlsx",
    "settlements.csv",
    "moadian-sales.csv",
    "moadian-purchases.csv",
    "planned-payments.csv",
    "receipt-history.csv",
):
    with (ROOT / "docs/validation/rebuild-v1/inputs/baseline" / filename).open(
        "rb"
    ) as f:
        response = client.post(
            "/api/v1" + path + "/files",
            files={"file": (filename, f)},
            headers=headers(),
        )
    assert response.is_success, response.text
    files.append(response.json()["id"])
state = client.get("/api/v1" + path).json()
create(path + "/seal", {"file_ids": files}, state["version"])
run_once()
state = client.get("/api/v1" + path).json()
question = state["issues"][0]
assert question["code"] == "coverage", state
create(
    base + "/processing-issues/" + question["id"] + "/answers",
    {
        "value": {f["key"]: True for f in question["evidence"]["fields"]},
        "expected_version": question["version"],
    },
    state["version"],
)
run_once()
state = client.get("/api/v1" + path).json()
for _ in range(5):
    if state["state"] != "waiting_input":
        break
    question = state["issues"][0]
    prefix = question["code"].split(":")[0]
    assert prefix in ("receipt_date", "payment_date"), question
    expected_date = "2026-10-05" if prefix == "receipt_date" else "2026-10-12"
    create(
        base + "/processing-issues/" + question["id"] + "/answers",
        {"value": expected_date, "expected_version": question["version"]},
        state["version"],
    )
    run_once()
    state = client.get("/api/v1" + path).json()
assert state["state"] in ("completed", "completed_limited"), state
empty = create("/companies", {"name": "شرکت آزمایشی؛ بدون داده"})
print(
    "Synthetic QA installation created. Login: qa@example.test (test password is in this fixture script)."
)
