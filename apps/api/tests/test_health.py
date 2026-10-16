import httpx


async def test_live_health(asgi_client: httpx.AsyncClient) -> None:
    response = await asgi_client.get("/api/v1/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "دیدبان مالی"}


async def test_openapi_exposes_health_route(asgi_client: httpx.AsyncClient) -> None:
    response = await asgi_client.get("/openapi.json")

    assert response.status_code == 200
    assert "/api/v1/health/live" in response.json()["paths"]
    assert "/api/v1/companies/{company_id}/analysis-runs" in response.json()["paths"]
    assert "/api/v1/companies/{company_id}/moadian/comparison" in response.json()["paths"]
    assert "/api/v1/companies/{company_id}/reconciliation-runs" not in response.json()["paths"]
    assert "/api/v1/companies/{company_id}/findings/detect" in response.json()["paths"]
    assert "/api/v1/companies/{company_id}/finding-runs" not in response.json()["paths"]
    assert (
        "/api/v1/companies/{company_id}/imports/source-files/{source_file_id}/download"
        in response.json()["paths"]
    )


async def test_cors_preflight_allows_mapping_put_requests(asgi_client: httpx.AsyncClient) -> None:
    response = await asgi_client.options(
        "/api/v1/companies/00000000-0000-0000-0000-000000000000/imports/00000000-0000-0000-0000-000000000000/mapping",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "Content-Type, Idempotency-Key, X-CSRF-Token",
        },
    )

    assert response.status_code == 200
    assert "PUT" in response.headers["access-control-allow-methods"]
