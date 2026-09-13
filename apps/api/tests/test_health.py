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
    assert "/api/v1/companies/{company_id}/analysis-runs" in response.json()["paths"]
    assert "/api/v1/companies/{company_id}/reconciliation-runs" in response.json()["paths"]
    assert "/api/v1/companies/{company_id}/finding-runs" in response.json()["paths"]
    assert (
        "/api/v1/companies/{company_id}/imports/source-files/{source_file_id}/download"
        in response.json()["paths"]
    )


def test_cors_preflight_allows_mapping_put_requests() -> None:
    response = TestClient(app).options(
        "/api/v1/companies/00000000-0000-0000-0000-000000000000/imports/00000000-0000-0000-0000-000000000000/mapping",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "Content-Type, Idempotency-Key, X-CSRF-Token",
        },
    )

    assert response.status_code == 200
    assert "PUT" in response.headers["access-control-allow-methods"]
