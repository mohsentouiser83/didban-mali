"""Optional isolated PostgreSQL test; never depends on private financial files."""

import os
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import main  # noqa: F401 -- register every application model
from app.analysis.calculations import calculate_ledger_metrics
from app.analysis.models import MetricCode
from app.analysis.service import _ledger_lines
from app.companies.models import Company
from app.core.database import Base
from app.financial.models import Account, JournalLine
from app.financial.normalization import normalize_import
from app.identity.models import User, Workspace
from app.imports.mapping import raw_row_hash
from app.imports.models import (
    DataSource,
    ImportBatch,
    ImportStatus,
    MappingVersion,
    SourceFile,
    SourceKind,
    SourceRow,
)
from app.payables.service import get_vendors_payables

pytestmark = pytest.mark.skipif(
    not os.getenv("ACCOUNTING_TEST_DATABASE_URL"),
    reason="Requires an explicit isolated PostgreSQL URL",
)


async def test_hierarchical_import_across_chunks_preserves_closing_balances(monkeypatch):
    schema = f"accounting_test_{uuid4().hex}"
    url = os.environ["ACCOUNTING_TEST_DATABASE_URL"]
    admin = create_async_engine(url)
    async with admin.begin() as connection:
        await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_async_engine(url, connect_args={"server_settings": {"search_path": schema}})
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        monkeypatch.setattr("app.financial.normalization.CHUNK_SIZE", 2)
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            user = User(
                id=uuid4(),
                email=f"{uuid4()}@example.com",
                full_name="آزمون",
                password_hash="test-only",
            )
            session.add(user)
            await session.flush()
            workspace = Workspace(id=uuid4(), owner_user_id=user.id, name="آزمون")
            session.add(workspace)
            await session.flush()
            company = Company(
                id=uuid4(), workspace_id=workspace.id, legal_name="آزمون", fiscal_year_start_month=1
            )
            session.add(company)
            await session.flush()
            source = DataSource(
                id=uuid4(),
                company_id=company.id,
                kind=SourceKind.ACCOUNTING,
                label="دفتر",
                created_by=user.id,
            )
            file = SourceFile(
                id=uuid4(),
                company_id=company.id,
                object_key=f"test/{uuid4()}",
                original_name="ledger.xlsx",
                sha256="0" * 64,
                size_bytes=1,
                mime_type="application/octet-stream",
                extension=".xlsx",
                uploaded_by=user.id,
            )
            session.add_all([source, file])
            await session.flush()
            batch = ImportBatch(
                id=uuid4(),
                company_id=company.id,
                source_id=source.id,
                file_id=file.id,
                status=ImportStatus.QUEUED,
                idempotency_key=uuid4().hex,
            )
            session.add(batch)
            await session.flush()
            fields = [
                "entry_id",
                "entry_date",
                "general_code",
                "general_name",
                "subsidiary_code",
                "subsidiary_name",
                "debit",
                "credit",
                "entry_type",
            ]
            records = [
                ["1", "1403/01/01", "102", "بانکها", "0001", "بانک نمونه", "100", "0", "opening"],
                ["1", "1403/01/01", "506", "سرمایه", "", "", "0", "100", "opening"],
                ["2", "1403/02/01", "801", "خرید", "", "", "40", "0", ""],
                ["2", "1403/02/01", "401", "بستانکاران", "0001", "فروشنده نمونه", "0", "40", ""],
                ["3", "1403/02/02", "401", "بستانکاران", "0001", "فروشنده نمونه", "25", "0", ""],
                ["3", "1403/02/02", "102", "بانکها", "0001", "بانک نمونه", "0", "25", ""],
                ["4", "1403/03/01", "102", "بانکها", "0001", "بانک نمونه", "100", "0", ""],
                ["4", "1403/03/01", "901", "فروش", "", "", "0", "100", ""],
                ["5", "1403/12/29", "901", "فروش", "", "", "100", "0", ""],
                ["5", "1403/12/29", "801", "خرید", "", "", "0", "40", ""],
                ["5", "1403/12/29", "503", "سود و زیان جاری", "", "", "0", "60", ""],
                ["6", "1403/12/29", "102", "بانکها", "0001", "بانک نمونه", "0", "175", ""],
                ["6", "1403/12/29", "401", "بستانکاران", "0001", "فروشنده نمونه", "15", "0", ""],
                ["6", "1403/12/29", "506", "سرمایه", "", "", "100", "0", ""],
                ["6", "1403/12/29", "503", "سود و زیان جاری", "", "", "60", "0", ""],
            ]
            session.add(
                MappingVersion(
                    company_id=company.id,
                    import_batch_id=batch.id,
                    mapping_json={
                        "fields": {key: key for key in fields},
                        "calendar": "jalali",
                        "currency_unit": "rial",
                    },
                    transforms_json={},
                    confirmed_by=user.id,
                    confirmed_at=datetime.now(UTC),
                )
            )
            for number, values in enumerate(records, 2):
                raw = dict(zip(fields, values, strict=True))
                session.add(
                    SourceRow(
                        company_id=company.id,
                        import_batch_id=batch.id,
                        sheet="ledger",
                        row_number=number,
                        raw_json=raw,
                        raw_hash=raw_row_hash(raw),
                    )
                )
            batch.accepted_count = batch.row_count = len(records)
            await session.commit()
            await normalize_import(
                session, batch_id=batch.id, company_id=company.id, actor_id=user.id
            )
            lines = await _ledger_lines(session, company.id, date(2025, 3, 20))
            metrics, _ = calculate_ledger_metrics(lines, date(2024, 3, 20), date(2025, 3, 20))
            assert metrics[MetricCode.NET_PROFIT_IRR].value_irr == Decimal(60)
            assert metrics[MetricCode.TOTAL_ASSETS_IRR].value_irr == Decimal(175)
            vendors = await get_vendors_payables(session, company.id, date(2025, 3, 20))
            assert len(vendors.items) == 1
            assert vendors.items[0].total_payable_irr == Decimal(15)
            assert vendors.items[0].risk_assessment_incomplete
            assert await _ledger_lines(session, uuid4(), date(2025, 3, 20)) == []
            await normalize_import(
                session, batch_id=batch.id, company_id=company.id, actor_id=user.id
            )
            assert await session.scalar(select(func.count(JournalLine.id))) == len(records)
            assert await session.scalar(select(func.count(Account.id))) == 6
    finally:
        await engine.dispose()
        async with admin.begin() as connection:
            await connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        await admin.dispose()
