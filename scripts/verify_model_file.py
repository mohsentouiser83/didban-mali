#!/usr/bin/env python3
"""Opt-in live upload/worker check using a synthetic CSV and isolated storage.

Runs a paid model request only with --live. Never reads company input files.
"""
import argparse
import json
import os
import sys
import tempfile
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", required=True)
    parser.parse_args()
    folder = Path(tempfile.mkdtemp(prefix="model-file-", dir=ROOT / "var"))
    os.environ.update({"DIDBAN_DATABASE_URL": f"sqlite:///{folder / 'check.db'}",
                       "DIDBAN_STORAGE": str(folder / "private"),
                       "DIDBAN_PRODUCTION": "false", "DIDBAN_MODEL_BUDGET_UNLIMITED": "true"})
    sys.path.insert(0, str(ROOT / "apps/api"))
    from fastapi.testclient import TestClient
    from sqlalchemy import select
    from didban.api import app
    from didban.db import initialize, transaction
    from didban.models import User, ModelRequest, BudgetReservation, Interpretation, BankMovement
    from didban.security import hasher
    from didban.worker import run_once
    from didban.model_gateway import ModelGateway
    provider_metadata = []
    original_send = ModelGateway._send
    async def observed_send(gateway, body):
        outcome = await original_send(gateway, body)
        envelope, error, _retryable, _rejected = outcome
        provider_metadata.append({"error": error, **({key: envelope.get(key) for key in
            ("model", "status", "service_tier", "usage", "tool_usage")} if envelope else {})})
        return outcome
    ModelGateway._send = observed_send
    initialize()
    password = "Synthetic-" + str(uuid4())
    with transaction() as db:
        db.add(User(name="آزمون مصنوعی", email="model-check@example.test",
                    password_hash=hasher.hash(password), installation_admin=True))
    client = TestClient(app)
    login = client.post("/api/v1/auth/login", json={"email": "model-check@example.test", "password": password})
    assert login.status_code == 200
    csrf = login.json()["csrf"]
    def headers(version=None):
        result = {"X-CSRF-Token": csrf, "Idempotency-Key": str(uuid4()), "Origin": "http://127.0.0.1:3010"}
        if version is not None:
            result["If-Match"] = str(version)
        return result
    def post(path, body, version=None):
        response = client.post(path, json=body, headers=headers(version))
        assert response.status_code in (200, 201, 202), (path, response.status_code)
        return response.json()
    company = post("/api/v1/companies", {"name": "شرکت مصنوعی آزمون مدل"})
    base = "/api/v1/companies/" + company["id"]
    period = post(base + "/financial-periods", {"name": "دوره آزمون", "start": "2026-09-01", "end": "2026-09-30"})
    session = post(base + "/processing-sessions", {"period_id": period["id"]})
    path = base + "/processing-sessions/" + session["id"]
    csv = b"D,A,R,C,account\n2026-09-01,100,REF1,IRR,SYNTHETIC-BANK-001\n2026-09-02,200,REF2,IRR,SYNTHETIC-BANK-001\n"
    response = client.post(path + "/files", files={"file": ("bank.csv", csv, "text/csv")}, headers=headers())
    assert response.status_code == 202
    file_id = response.json()["id"]
    session = client.get(path).json()
    post(path + "/seal", {"file_ids": [file_id]}, session["version"])
    run_once()
    session = client.get(path).json()
    barrier_verified = False
    if session["state"] == "waiting_input" and len(session["issues"]) == 1 and session["issues"][0]["code"] == "coverage":
        barrier_verified = client.get(path).json()["state"] == "waiting_input"
        question = session["issues"][0]
        # This two-row fixture asserts no complete period coverage.
        post(base + "/processing-issues/" + question["id"] + "/answers",
             {"value": {}, "expected_version": question["version"]}, session["version"])
        run_once()
        session = client.get(path).json()
    with transaction(company["id"]) as db:
        requests = list(db.scalars(select(ModelRequest)))
        interpretations = list(db.scalars(select(Interpretation).order_by(Interpretation.created_at)))
        reservations = list(db.scalars(select(BudgetReservation)))
        movements = list(db.scalars(select(BankMovement)))
        result = {"synthetic": True, "isolated": True, "budget_mode": "unlimited",
                  "coverage_barrier_verified": barrier_verified, "provider_metadata": provider_metadata, "session_state": session["state"], "file_rows": 2, "bank_movements": len(movements),
                  "requests": [{"model": r.model, "state": r.state, "error_code": r.error_code,
                                "attempts": r.attempts, "usage": r.usage} for r in requests],
                  "interpretations": [{"family": i.family, "provenance": i.provenance,
                                        "unit": i.unit, "calendar": i.calendar} for i in interpretations],
                  "costs": [{"state": r.state, "actual_cost_usd": r.actual_cost} for r in reservations],
                  "question_codes": [q["code"] for q in session["issues"]]}
    target = ROOT / "docs/validation/avalai-file-processing-2026-11-01.json"
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result, ensure_ascii=False))
    assert requests and all(r.state == "completed" for r in requests), "Live model proposal was not validated; see saved result"
    assert session["state"] in ("completed", "completed_limited") and len(movements) == 2, "Processing needs clarification; see saved result"


if __name__ == "__main__":
    main()
