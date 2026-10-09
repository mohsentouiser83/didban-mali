from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.imports.models import FileScanStatus, SourceFile
from app.imports.routes import _access, _source_file_response, download_evidence_source_file
from app.main import app


def test_removed_features_are_absent_from_api_contract() -> None:
    paths = app.openapi()["paths"]
    removed = {
        "/api/v1/companies/holding/summary",
        "/api/v1/admin/customer-success/health",
        "/api/v1/admin/customer-success/metrics",
        "/api/v1/companies/{company_id}/data/overview",
        "/api/v1/companies/{company_id}/data/quality",
        "/api/v1/companies/{company_id}/readiness",
        "/api/v1/companies/{company_id}/control/policies",
        "/api/v1/companies/{company_id}/control/policies/{rule_code}",
        "/api/v1/companies/{company_id}/automations",
        "/api/v1/health/metrics",
    }
    assert removed.isdisjoint(paths)
    assert not any("/ai/" in path or "/alerts" in path for path in paths)
    assert "patch" not in paths["/api/v1/companies/{company_id}"]
    imports = [path for path in paths if "/imports" in path]
    assert imports == ["/api/v1/companies/{company_id}/imports/source-files/{source_file_id}/download"]
    for suffix in ("/control/overview", "/cashflow/summary", "/data/lineage/{entity_type}/{record_id}"):
        assert f"/api/v1/companies/{{company_id}}{suffix}" in paths
    assert "/api/v1/health/live" in paths
    assert "/api/v1/health/ready" in paths


async def test_evidence_download_requires_company_access() -> None:
    session = AsyncMock()
    session.scalar.return_value = None
    with pytest.raises(HTTPException) as error:
        await _access(session, uuid4(), uuid4())
    assert error.value.status_code == 404


async def test_evidence_download_does_not_return_another_companys_file() -> None:
    session = AsyncMock()
    session.scalar.side_effect = [object(), None]
    company_id, source_id = uuid4(), uuid4()
    with pytest.raises(HTTPException) as error:
        await download_evidence_source_file(company_id, source_id, session, type("User", (), {"id": uuid4()})())
    assert error.value.status_code == 404
    query = session.scalar.call_args.args[0]
    params = query.compile().params
    assert company_id in params.values()
    assert source_id in params.values()


async def test_evidence_download_still_rejects_unscanned_files() -> None:
    source_file = SourceFile(scan_status=FileScanStatus.PENDING)
    with pytest.raises(HTTPException) as error:
        await _source_file_response(source_file)
    assert error.value.status_code == 409
