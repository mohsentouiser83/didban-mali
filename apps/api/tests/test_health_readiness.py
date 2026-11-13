"""Tests for OPS-03: Current-architecture health and incident monitoring."""

from fastapi.testclient import TestClient

from didban.api import app


def test_health_liveness_endpoint():
    client = TestClient(app)
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "deployment_mode" in data
    assert "scanner_status" in data


def test_health_readiness_endpoint():
    client = TestClient(app)
    res = client.get("/api/v1/health/readiness")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ready"
    assert data["database"]["status"] == "connected"
    assert data["storage"]["status"] == "ready"
    assert "worker" in data
    assert "pending_jobs" in data["worker"]
    assert "running_jobs" in data["worker"]
    assert "stuck_jobs" in data["worker"]
    assert "failed_jobs" in data["worker"]
    assert "model" in data
    assert "bots" in data
    assert "timestamp" in data
