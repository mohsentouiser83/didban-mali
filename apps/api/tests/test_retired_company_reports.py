"""Retired group reports must not remain callable through their former API."""

import pytest
from fastapi.testclient import TestClient

from didban.api import app
from didban.models import Base


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "company-groups"),
        ("POST", "company-groups"),
        ("PATCH", "company-groups/group"),
        ("POST", "company-groups/group/runs"),
        ("GET", "company-groups/runs/history"),
        ("GET", "company-groups/runs/run"),
        ("GET", "company-groups/runs/run/export"),
        ("GET", "consolidation/mappings"),
        ("POST", "consolidation/mappings"),
        ("GET", "consolidation/sources"),
        ("GET", "consolidation/drafts"),
        ("POST", "consolidation/drafts"),
        ("GET", "consolidation/drafts/draft"),
        ("GET", "consolidation/drafts/draft/export"),
        ("GET", "consolidation/drafts/draft/approval-preview"),
        ("POST", "consolidation/drafts/draft/approvals"),
    ],
)
def test_retired_group_report_endpoints_are_not_callable(method: str, path: str):
    # No lifespan: checking an unmatched route must not initialize an installation.
    client = TestClient(app)
    response = client.request(method, f"/api/v1/companies/company/{path}")
    assert response.status_code == 404


def test_fresh_schema_and_openapi_exclude_retired_group_reports():
    retired = {
        "company_groups", "company_comparison_runs", "intercompany_mappings",
        "draft_consolidation_runs", "consolidation_approvals",
    }
    assert retired.isdisjoint(Base.metadata.tables)
    paths = app.openapi()["paths"]
    assert not any("company-groups" in path or "consolidation" in path for path in paths)
    assert "financial_dimensions" in Base.metadata.tables
    assert any("/dimensions" in path for path in paths)
