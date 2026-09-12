from fastapi.testclient import TestClient

from app.main import app


def test_live_health() -> None:
    response = TestClient(app).get("/api/v1/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "دیدبان مالی"}


def test_openapi_exposes_health_route() -> None:
    response = TestClient(app).get("/openapi.json")

    assert response.status_code == 200
    assert "/api/v1/health/live" in response.json()["paths"]
