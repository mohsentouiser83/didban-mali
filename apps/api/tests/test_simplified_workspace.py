from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.companies.models import CompanyAccess, CompanyRole
from app.integrations import routes
from app.main import app


def test_removed_pages_have_no_standalone_api():
    paths = app.openapi()["paths"]
    assert not any(
        any(
            part in path
            for part in ("/simulation", "/reconciliation", "/actions/", "/in-app-alerts")
        )
        for path in paths
    )
    for path in paths:
        if "/findings/{finding_id}" in path:
            if path.endswith("/findings/{finding_id}"):
                assert set(paths[path]) == {"get"}
            else:
                assert path == (
                    "/api/v1/companies/{company_id}/findings/{finding_id}"
                    "/proposals/{proposal_id}/decision"
                )
                assert set(paths[path]) == {"post"}
    assert set(paths["/api/v1/companies/{company_id}/analysis-runs"]) == {"get", "post"}
    assert "/api/v1/companies/{company_id}/metrics" not in paths
    for suffix in ("/integrations", "/members", "/reports", "/findings", "/cashflow/summary"):
        assert f"/api/v1/companies/{{company_id}}{suffix}" in paths


@pytest.mark.parametrize("role", [CompanyRole.ADVISOR, CompanyRole.VIEWER])
async def test_read_only_roles_cannot_trigger_connection_test(role):
    access = CompanyAccess(role=role)
    with patch.object(
        routes.IntegrationService, "test_connection", new_callable=AsyncMock
    ) as service:
        with pytest.raises(HTTPException) as error:
            await routes.test_connection(uuid4(), uuid4(), access, None, AsyncMock())
        assert error.value.status_code == 403
        service.assert_not_awaited()


@pytest.mark.parametrize("role", [CompanyRole.OWNER, CompanyRole.FINANCE_MANAGER])
def test_financial_managers_can_manage_connections(role):
    routes._require_manage(CompanyAccess(role=role))
