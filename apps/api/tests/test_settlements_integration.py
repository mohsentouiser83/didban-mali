"""Explicit isolated DB only; synthetic invoices prove capacities and receipt history."""

import os
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app import main  # noqa: F401
from app.companies.models import Company
from app.core.database import Base
from app.financial.models import (
    BankAccount,
    BankTransaction,
    InvoiceAllocation,
    InvoiceReceipt,
    SalesInvoice,
)
from app.financial.normalization import _normalize_bank_chunk
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
from app.settlements.catalog import invoice_catalog
from app.settlements.schemas import AllocationInput, HistoryConfirmation
from app.settlements.service import allocate, confirm_history, detail, reverse

pytestmark = pytest.mark.skipif(
    not os.getenv("ACCOUNTING_TEST_DATABASE_URL"), reason="Requires explicit isolated DB"
)


async def test_allocations_split_capacity_receipt_history_replay_and_tenant_isolation():
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
            cid, uid, other_id = company.id, user.id, other.id

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

            ds, batch = await source(SourceKind.MOADIAN_SALES)
            fields = {
                v: v
                for v in ["tax_id", "issue_date", "party_name", "gross_amount", "subject", "status"]
            }
            s.add(
                MappingVersion(
                    company_id=cid,
                    import_batch_id=batch.id,
                    version=1,
                    mapping_json={
                        "fields": fields,
                        "calendar": "gregorian",
                        "currency_unit": "rial",
                    },
                    transforms_json={},
                    confirmed_by=uid,
                    confirmed_at=datetime.now(UTC),
                )
            )
            ids = []
            for n in range(2):
                row = SourceRow(
                    id=uuid4(),
                    company_id=cid,
                    import_batch_id=batch.id,
                    sheet="test",
                    row_number=n + 1,
                    raw_hash=str(n),
                    raw_json={
                        "tax_id": str(n + 1) * 22,
                        "issue_date": "2025-01-01",
                        "party_name": "مشتری آزمون",
                        "gross_amount": "100",
                        "subject": "اصلی",
                        "status": "تایید شده",
                    },
                )
                s.add(row)
                ids.append(row.id)
            bank_source, bank_batch = await source(SourceKind.BANK)
            account = BankAccount(
                id=uuid4(),
                company_id=cid,
                data_source_id=bank_source.id,
                bank_name="test",
                label="test",
            )
            s.add(account)
            await s.flush()
            bank_row = SourceRow(
                id=uuid4(),
                company_id=cid,
                import_batch_id=bank_batch.id,
                sheet="test",
                row_number=1,
                raw_json={},
                raw_hash="b",
            )
            s.add(bank_row)
            await s.flush()
            bank = BankTransaction(
                id=uuid4(),
                company_id=cid,
                bank_account_id=account.id,
                source_row_id=bank_row.id,
                booking_date=date(2025, 1, 2),
                amount_irr=Decimal(150),
                description="دریافت تجمیعی",
                description_normalized="دریافت تجمیعی",
            )
            s.add(bank)
            await s.commit()
            bank_id = bank.id

            async def pay(row, amount, key=None, complete=False):
                return await allocate(
                    s,
                    cid,
                    uid,
                    AllocationInput(
                        invoice_source_row_id=row,
                        bank_transaction_id=bank_id,
                        amount_irr=Decimal(amount),
                        request_key=key or str(uuid4()),
                        confirm_history_complete=complete,
                    ),
                )

            key = str(uuid4())
            aid = await pay(ids[0], 40, key)
            assert await pay(ids[0], 40, key) == aid
            assert await s.scalar(select(func.count(SalesInvoice.id))) == 0, (
                "unknown history must not become an AR balance"
            )
            with pytest.raises(HTTPException) as ex:
                await confirm_history(
                    s,
                    cid,
                    uid,
                    ids[0],
                    HistoryConfirmation(
                        expected_allocated_amount_irr=Decimal(40), confirm_complete=False
                    ),
                )
            assert ex.value.status_code == 422
            await s.rollback()
            await confirm_history(
                s,
                cid,
                uid,
                ids[0],
                HistoryConfirmation(
                    expected_allocated_amount_irr=Decimal(40), confirm_complete=True
                ),
            )
            assert (await detail(s, cid, ids[0])).receipt_history_complete
            await pay(ids[0], 60)
            canonical = await s.scalar(
                select(SalesInvoice).where(SalesInvoice.source_row_id == ids[0])
            )
            assert canonical.paid_amount_irr == 100 and canonical.receipt_history_complete
            assert await s.scalar(select(func.count(InvoiceReceipt.id))) == 2
            await pay(ids[1], 50, complete=True)
            assert (await detail(s, cid, ids[1])).invoice.allocated_amount_irr == 50
            with pytest.raises(HTTPException) as ex:
                await pay(ids[1], 1)
            assert ex.value.status_code == 409
            await s.rollback()
            assert await invoice_catalog(s, other_id) == []
            with pytest.raises(HTTPException) as ex:
                await allocate(
                    s,
                    other_id,
                    uid,
                    AllocationInput(
                        invoice_source_row_id=ids[0],
                        bank_transaction_id=bank_id,
                        amount_irr=Decimal(1),
                        request_key=str(uuid4()),
                    ),
                )
            assert ex.value.status_code == 404
            await s.rollback()
            await reverse(s, cid, uid, aid)
            await reverse(s, cid, uid, aid)
            await s.refresh(canonical)
            assert canonical.paid_amount_irr == 60 and not canonical.receipt_history_complete
            assert await s.scalar(select(func.count(InvoiceAllocation.id))) == 3
            assert await s.scalar(select(func.count(BankTransaction.id))) == 1
            assert (await detail(s, cid, ids[0])).invoice.unallocated_amount_irr == 40

            # A later export must reuse the operational invoice anchored to the earlier source row.
            _, reexport = await source(SourceKind.MOADIAN_SALES)
            s.add(
                MappingVersion(
                    company_id=cid,
                    import_batch_id=reexport.id,
                    version=1,
                    mapping_json={
                        "fields": {
                            v: v
                            for v in [
                                "tax_id",
                                "issue_date",
                                "party_name",
                                "gross_amount",
                                "subject",
                                "status",
                            ]
                        },
                        "calendar": "gregorian",
                        "currency_unit": "rial",
                    },
                    transforms_json={},
                    confirmed_by=uid,
                    confirmed_at=datetime.now(UTC),
                )
            )
            original = await s.get(SourceRow, ids[0])
            fresh_row = SourceRow(
                id=uuid4(),
                company_id=cid,
                import_batch_id=reexport.id,
                sheet="test",
                row_number=1,
                raw_hash=str(uuid4()),
                raw_json=dict(original.raw_json),
            )
            s.add(fresh_row)
            await s.commit()
            fresh_id = fresh_row.id
            exported = await detail(s, cid, fresh_id)
            assert exported.invoice.canonical_invoice_id == canonical.id
            assert len(await invoice_catalog(s, cid)) == 2
            await confirm_history(
                s,
                cid,
                uid,
                fresh_id,
                HistoryConfirmation(
                    expected_allocated_amount_irr=Decimal(60), confirm_complete=True
                ),
            )
            assert await s.scalar(select(func.count(SalesInvoice.id))) == 2
            assert await s.scalar(select(func.count(InvoiceReceipt.id))) == 2

            # Overlapping PDF exports can renumber rows and use another upload source.
            async def bank_pdf_rows(offset):
                ds, batch = await source(SourceKind.BANK)
                fields = {
                    name: name
                    for name in [
                        "transaction_id",
                        "booking_date",
                        "amount_signed",
                        "description",
                        "running_balance",
                        "iban",
                    ]
                }
                version = MappingVersion(
                    company_id=cid,
                    import_batch_id=batch.id,
                    version=1,
                    mapping_json={
                        "fields": fields,
                        "currency_unit": "rial",
                        "calendar": "gregorian",
                    },
                    transforms_json={},
                    confirmed_by=uid,
                    confirmed_at=datetime.now(UTC),
                )
                s.add(version)
                rows = []
                for n, amount, balance in [(1, "1000", "1000"), (2, "-1", "999")]:
                    row = SourceRow(
                        id=uuid4(),
                        company_id=cid,
                        import_batch_id=batch.id,
                        sheet="bank",
                        row_number=n,
                        raw_hash=str(uuid4()),
                        raw_json={
                            "transaction_id": f"55:{n + offset}",
                            "booking_date": "2025-01-02",
                            "amount_signed": amount,
                            "description": "اصل تراکنش" if n == 1 else "کارمزد",
                            "running_balance": balance,
                            "iban": "IR000000000000000000010001",
                            "شماره سپرده": "123.2.456.1",
                        },
                    )
                    rows.append(row)
                    s.add(row)
                await s.flush()
                await _normalize_bank_chunk(s, batch, ds, version, rows)
                await s.commit()
                return batch, ds, version, rows

            await bank_pdf_rows(0)
            assert await s.scalar(select(func.count(BankTransaction.id))) == 3
            batch, ds, version, rows = await bank_pdf_rows(100)
            assert await s.scalar(select(func.count(BankTransaction.id))) == 3
            rows[0].raw_json = {**rows[0].raw_json, "iban": "IR000000000000000000020001"}
            with pytest.raises(ValueError, match="حساب بانکی"):
                await _normalize_bank_chunk(s, batch, ds, version, rows)
            await s.rollback()
    finally:
        await engine.dispose()
        async with admin.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        await admin.dispose()
