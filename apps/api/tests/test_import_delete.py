from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.companies.models import CompanyAccess, CompanyRole
from app.identity.models import User
from app.imports.models import (
    DataSource,
    ImportBatch,
    ImportStatus,
    SourceFile,
    SourceKind,
)
from app.imports.routes import delete_import_batch
from app.main import app


def test_import_delete_openapi_path() -> None:
    client = TestClient(app)
    response = client.get("/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    assert "/api/v1/companies/{company_id}/imports/{batch_id}" in paths
    assert "delete" in paths["/api/v1/companies/{company_id}/imports/{batch_id}"]


@pytest.mark.asyncio
async def test_delete_import_batch_forbidden_for_viewer() -> None:
    company_id = uuid4()
    batch_id = uuid4()
    user = User(
        id=uuid4(),
        email="viewer@example.com",
        full_name="مشاهده‌گر",
        password_hash="hash",
    )
    request = MagicMock(spec=Request)
    request.headers = {}
    session = AsyncMock()

    viewer_access = CompanyAccess(company_id=company_id, user_id=user.id, role=CompanyRole.VIEWER)
    with patch("app.imports.routes._access", AsyncMock(return_value=viewer_access)):
        with pytest.raises(HTTPException) as exc_info:
            await delete_import_batch(
                company_id=company_id,
                batch_id=batch_id,
                request=request,
                session=session,
                current_user=user,
                _=None,
            )
        assert exc_info.value.status_code == 403
        assert "اجازه حذف فایل" in exc_info.value.detail


@pytest.mark.asyncio
async def test_delete_import_batch_not_found() -> None:
    company_id = uuid4()
    batch_id = uuid4()
    user = User(
        id=uuid4(),
        email="owner@example.com",
        full_name="مالک",
        password_hash="hash",
    )
    request = MagicMock(spec=Request)
    request.headers = {}
    session = AsyncMock()

    owner_access = CompanyAccess(company_id=company_id, user_id=user.id, role=CompanyRole.OWNER)
    with patch("app.imports.routes._access", AsyncMock(return_value=owner_access)), \
         patch("app.imports.routes._batch_row", AsyncMock(return_value=None)):
        with pytest.raises(HTTPException) as exc_info:
            await delete_import_batch(
                company_id=company_id,
                batch_id=batch_id,
                request=request,
                session=session,
                current_user=user,
                _=None,
            )
        assert exc_info.value.status_code == 404
        assert "واردسازی پیدا نشد" in exc_info.value.detail


@pytest.mark.asyncio
async def test_delete_import_batch_success() -> None:
    company_id = uuid4()
    batch_id = uuid4()
    user = User(
        id=uuid4(),
        email="owner@example.com",
        full_name="مالک",
        password_hash="hash",
    )
    request = MagicMock(spec=Request)
    request.headers = {"X-Request-ID": "test-req-123"}

    source = DataSource(
        id=uuid4(),
        company_id=company_id,
        kind=SourceKind.ACCOUNTING,
        label="دفتر کل",
        created_by=user.id,
    )
    source_file = SourceFile(
        id=uuid4(),
        company_id=company_id,
        object_key="clean/test/file.csv",
        original_name="accounting.csv",
        sha256="a" * 64,
        size_bytes=1024,
        mime_type="text/csv",
        extension=".csv",
        uploaded_by=user.id,
    )
    batch = ImportBatch(
        id=batch_id,
        company_id=company_id,
        source_id=source.id,
        file_id=source_file.id,
        status=ImportStatus.COMPLETED,
        idempotency_key="idemp-123",
    )

    owner_access = CompanyAccess(company_id=company_id, user_id=user.id, role=CompanyRole.OWNER)
    session = AsyncMock()
    session.scalar.side_effect = [0, 0]

    mock_storage = MagicMock()
    with patch("app.imports.routes._access", AsyncMock(return_value=owner_access)), \
         patch(
             "app.imports.routes._batch_row",
             AsyncMock(return_value=(batch, source_file, source)),
         ), \
         patch("app.imports.routes.get_storage", return_value=mock_storage), \
         patch("app.imports.routes.record_audit_event") as mock_audit:
        response = await delete_import_batch(
            company_id=company_id,
            batch_id=batch_id,
            request=request,
            session=session,
            current_user=user,
            _=None,
        )

        assert response.status_code == 204
        assert session.execute.call_count >= 10
        session.delete.assert_any_call(batch)
        session.delete.assert_any_call(source_file)
        session.delete.assert_any_call(source)
        session.commit.assert_awaited_once()
        mock_storage.delete.assert_called_once_with(source_file.object_key)
        mock_audit.assert_called_once()
