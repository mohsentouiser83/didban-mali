from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from app.imports.models import DataSource, SourceKind
from app.imports.routes import _upload_source


async def test_new_bank_account_is_created_with_its_own_source():
    company_id, user_id = uuid4(), uuid4()
    source, account = await _upload_source(
        AsyncMock(), company_id, user_id, SourceKind.BANK, "ملت جاری", None
    )
    assert account is not None
    assert account.company_id == company_id
    assert account.data_source_id == source.id
    assert account.label == source.label == "ملت جاری"


async def test_subsequent_months_reuse_the_existing_source_without_creating_an_account():
    company_id, user_id, account_id = uuid4(), uuid4(), uuid4()
    existing = DataSource(id=uuid4(), company_id=company_id, kind=SourceKind.BANK, label="ملت")
    session = AsyncMock()
    session.scalar.return_value = existing
    for month in ("مهر", "آبان"):
        source, account = await _upload_source(
            session, company_id, user_id, SourceKind.BANK, month, account_id
        )
        assert source is existing
        assert account is None
    query = session.scalar.call_args.args[0].compile(dialect=postgresql.dialect())
    assert account_id in query.params.values()
    assert list(query.params.values()).count(company_id) == 2


async def test_unknown_or_other_company_account_is_rejected():
    session = AsyncMock()
    session.scalar.return_value = None
    with pytest.raises(HTTPException) as error:
        await _upload_source(session, uuid4(), uuid4(), SourceKind.BANK, "ملت", uuid4())
    assert error.value.status_code == 404


@pytest.mark.parametrize("kind", [SourceKind.ACCOUNTING, SourceKind.SALES])
async def test_bank_account_cannot_be_attached_to_another_document_kind(kind):
    session = AsyncMock()
    with pytest.raises(HTTPException) as error:
        await _upload_source(session, uuid4(), uuid4(), kind, "دفتر", uuid4())
    assert error.value.status_code == 422
    session.scalar.assert_not_awaited()
