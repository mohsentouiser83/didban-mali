"""Synthetic data in a disposable schema, never the public financial tables."""

import os
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import main  # noqa: F401
from app.companies.models import Company
from app.core.database import Base
from app.financial.models import BankAccount, BankTransaction, InvoiceAllocation, SalesInvoice
from app.financial.normalization import normalize_import
from app.identity.models import User, Workspace
from app.imports.models import (
    DataSource,
    ImportBatch,
    ImportStatus,
    MappingVersion,
    SourceFile,
    SourceKind,
    SourceRow,
)
from app.settlements.service import reverse

pytestmark = pytest.mark.skipif(
    not os.getenv("ACCOUNTING_TEST_DATABASE_URL"), reason="Explicit isolated DB required"
)


async def test_settlement_import_atomic_duplicates_conflicts_reversal_and_capacity():
    schema = f"settlement_test_{uuid4().hex}"
    url = os.environ["ACCOUNTING_TEST_DATABASE_URL"]
    admin = create_async_engine(url)
    async with admin.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_async_engine(url, connect_args={"server_settings": {"search_path": schema}})
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with async_sessionmaker(engine, expire_on_commit=False)() as s:
            user = User(
                id=uuid4(),
                email=f"{uuid4()}@example.com",
                full_name="test",
                password_hash="test-only",
            )
            s.add(user)
            await s.flush()
            ws = Workspace(id=uuid4(), owner_user_id=user.id, name="test")
            s.add(ws)
            await s.flush()
            company = Company(id=uuid4(), workspace_id=ws.id, legal_name="test")
            other = Company(id=uuid4(), workspace_id=ws.id, legal_name="other")
            s.add_all([company, other])
            await s.flush()
            cid, uid = company.id, user.id

            async def source(kind):
                ds = DataSource(id=uuid4(), company_id=cid, kind=kind, label=kind, created_by=uid)
                s.add(ds)
                await s.flush()
                sf = SourceFile(
                    id=uuid4(),
                    company_id=cid,
                    object_key=str(uuid4()),
                    original_name="test.csv",
                    sha256="0" * 64,
                    size_bytes=1,
                    mime_type="text/csv",
                    extension=".csv",
                    uploaded_by=uid,
                )
                s.add(sf)
                await s.flush()
                batch = ImportBatch(
                    id=uuid4(),
                    company_id=cid,
                    source_id=ds.id,
                    file_id=sf.id,
                    status=ImportStatus.COMPLETED,
                    idempotency_key=str(uuid4()),
                )
                s.add(batch)
                await s.flush()
                return ds, batch

            async def mapped(kind, rows):
                ds, batch = await source(kind)
                batch.accepted_count = batch.row_count = len(rows)
                batch.rejected_count = 0
                version = MappingVersion(
                    company_id=cid,
                    import_batch_id=batch.id,
                    version=1,
                    mapping_json={
                        "fields": {k: k for k in rows[0]},
                        "calendar": "gregorian",
                        "currency_unit": "rial",
                    },
                    transforms_json={},
                    confirmed_by=uid,
                    confirmed_at=datetime.now(UTC),
                )
                s.add(version)
                objects = []
                for n, values in enumerate(rows, 1):
                    row = SourceRow(
                        id=uuid4(),
                        company_id=cid,
                        import_batch_id=batch.id,
                        sheet="test",
                        row_number=n,
                        raw_hash=str(n),
                        raw_json=values,
                    )
                    s.add(row)
                    objects.append(row)
                await s.commit()
                return ds, batch, version, objects

            def inv(n):
                return {
                    "tax_id": str(n) * 22,
                    "issue_date": "2025-01-01",
                    "party_name": "test",
                    "gross_amount": "100",
                    "subject": "اصلی",
                    "status": "تایید شده",
                }

            await mapped(SourceKind.MOADIAN_SALES, [inv(1), inv(2), inv(3)])
            ds, bb = await source(SourceKind.BANK)
            acc = BankAccount(
                id=uuid4(), company_id=cid, data_source_id=ds.id, label="bank", bank_name="test"
            )
            s.add(acc)
            await s.flush()
            br = SourceRow(
                id=uuid4(),
                company_id=cid,
                import_batch_id=bb.id,
                sheet="test",
                row_number=1,
                raw_hash="b",
                raw_json={},
            )
            s.add(br)
            await s.flush()
            tx = BankTransaction(
                id=uuid4(),
                company_id=cid,
                bank_account_id=acc.id,
                source_row_id=br.id,
                booking_date=date(2025, 1, 2),
                amount_irr=Decimal(150),
                source_transaction_id="REF1",
                description="دریافت",
                description_normalized="دریافت",
            )
            s.add(tx)
            await s.commit()

            def settle(n, amount, sid):
                return {
                    "settlement_id": sid,
                    "tax_id": str(n) * 22,
                    "payment_date": "2025-01-02",
                    "settlement_amount": str(amount),
                    "bank_reference": "REF1",
                }

            async def run(values):
                ds, batch, version, rows = await mapped(SourceKind.SETTLEMENT_SALES, values)
                batch.status = ImportStatus.QUEUED
                await s.commit()
                await normalize_import(s, batch_id=batch.id, company_id=cid, actor_id=uid)
                return batch, rows

            batch, rows = await run(
                [settle(1, 40, "S1"), settle(2, 100, "S2"), settle(3, 20, "S3")]
            )
            assert [r.processing_result["status"] for r in rows] == ["matched", "matched", "review"]
            assert "ظرفیت" in rows[2].processing_result["reason"]
            assert await s.scalar(select(func.count(InvoiceAllocation.id))) == 2
            assert (
                await s.scalar(select(func.count(SalesInvoice.id))) == 1
            )  # partial payment is not full history
            allocation = await s.get(InvoiceAllocation, rows[0].processing_result["allocation_id"])
            assert allocation.settlement_source_row_id == rows[0].id
            await mapped(SourceKind.MOADIAN_SALES, [inv(1)])  # same tax invoice, new source row
            _, repeated = await run([settle(1, 40, "S1")])
            assert repeated[0].processing_result["status"] == "duplicate"
            assert await s.scalar(select(func.count(InvoiceAllocation.id))) == 2
            _, conflict = await run([settle(3, 5, "S4"), settle(3, 6, "S4")])
            assert all(r.processing_result["status"] == "review" for r in conflict)
            _, missing = await run([settle(3, 5, "S5") | {"bank_reference": "MISSING"}])
            assert missing[0].processing_result["status"] == "review"
            await reverse(s, cid, uid, allocation.id)
            _, reversed_rows = await run([settle(1, 40, "S1")])
            assert reversed_rows[0].processing_result["status"] == "review"
            assert "برگشت" in reversed_rows[0].processing_result["reason"]
            _, unknown = await run([settle(9, 5, "S6")])
            assert unknown[0].processing_result["status"] == "review"
    finally:
        await engine.dispose()
        async with admin.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        await admin.dispose()
