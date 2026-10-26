"""Exercise real parsing, validation, normalization and saved comparisons, inside a rolled-back transaction."""

import hashlib
import io
import os
from datetime import date
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from starlette.requests import Request

from app.companies.models import Company, CompanyAccess, CompanyRole
from app.core.tenant import set_request_company, set_request_user
from app.financial.models import BankAccount, BankTransaction, SalesInvoice
from app.financial.normalization import normalize_import
from app.identity.models import User, Workspace
from app.imports import routes
from app.imports.mapping import DATE_FIELDS, MONEY_FIELDS
from app.imports.models import (
    DataSource,
    FileScanStatus,
    ImportBatch,
    ImportStatus,
    SourceFile,
    SourceKind,
    SourceRow,
)
from app.imports.schemas import MappingRequest
from app.moadian.models import InvoiceComparisonRun
from app.moadian.routes import review_comparison
from app.moadian.runs import create_run, decide_result, read_run
from app.moadian.schemas import ComparisonDecisionRequest, ComparisonRequest

URL = os.getenv("ACCOUNTING_TEST_DATABASE_URL")
pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not URL, reason="Requires migrated test database"),
]
TAX_A, TAX_B = "A" * 22, "B" * 22


class MemoryStorage:
    def __init__(self):
        self.files = {}

    def open(self, key):
        return io.BytesIO(self.files[key])


@pytest.fixture
async def world(monkeypatch):
    engine = create_async_engine(URL)
    async with engine.connect() as connection:
        transaction = await connection.begin()
        try:
            async with AsyncSession(
                bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False
            ) as session:
                user = User(
                    id=uuid4(),
                    email=f"structures-{uuid4()}@example.com",
                    full_name="آزمایش ساختار",
                    password_hash="test-only",
                    is_active=True,
                )
                session.add(user)
                await session.flush()
                workspace = Workspace(id=uuid4(), name="آزمایش", owner_user_id=user.id)
                session.add(workspace)
                await session.flush()
                company = Company(id=uuid4(), workspace_id=workspace.id, legal_name="آزمایش")
                other = Company(id=uuid4(), workspace_id=workspace.id, legal_name="غیرمجاز")
                session.add_all([company, other])
                await session.flush()
                membership = CompanyAccess(
                    id=uuid4(), company_id=company.id, user_id=user.id, role=CompanyRole.OWNER
                )
                session.add(membership)
                await session.flush()
                await set_request_user(session, user.id)
                await set_request_company(session, company.id)
                await session.execute(text("SET LOCAL ROLE didban_app"))
                storage = MemoryStorage()
                monkeypatch.setattr(routes, "get_storage", lambda: storage)
                monkeypatch.setattr(routes.normalize_import_task, "delay", lambda *args: None)
                request = Request({"type": "http", "headers": []})

                async def seed(kind, data, mapping, layout=None, extension=".csv"):
                    payload = data.encode() if isinstance(data, str) else data
                    source = DataSource(
                        id=uuid4(),
                        company_id=company.id,
                        kind=kind,
                        label="آزمایش",
                        created_by=user.id,
                    )
                    session.add(source)
                    await session.flush()
                    if kind == SourceKind.BANK:
                        session.add(
                            BankAccount(
                                id=uuid4(),
                                company_id=company.id,
                                data_source_id=source.id,
                                bank_name="آزمایش",
                                label="آزمایش",
                            )
                        )
                    key = str(uuid4())
                    storage.files[key] = payload
                    file = SourceFile(
                        id=uuid4(),
                        company_id=company.id,
                        object_key=key,
                        original_name="structure" + extension,
                        sha256=hashlib.sha256(payload).hexdigest(),
                        size_bytes=len(payload),
                        mime_type="text/csv",
                        extension=extension,
                        scan_status=FileScanStatus.CLEAN,
                        uploaded_by=user.id,
                    )
                    session.add(file)
                    await session.flush()
                    batch = ImportBatch(
                        id=uuid4(),
                        company_id=company.id,
                        source_id=source.id,
                        file_id=file.id,
                        status=ImportStatus.AWAITING_MAPPING,
                        stage="awaiting_mapping",
                        idempotency_key=str(uuid4()),
                    )
                    session.add(batch)
                    await session.flush()
                    await configure(batch, mapping, layout)
                    return batch

                async def configure(batch, mapping, layout=None):
                    transforms = {
                        key: ["normalize_digits", "parse_date"]
                        if key in DATE_FIELDS
                        else ["normalize_digits", "strip_thousands"]
                        if key in MONEY_FIELDS
                        else ["trim"]
                        for key in mapping
                    }
                    await routes.confirm_mapping(
                        company_id=company.id,
                        batch_id=batch.id,
                        session=session,
                        current_user=user,
                        request=request,
                        _csrf=None,
                        idempotency_key=str(uuid4()),
                        payload=MappingRequest(
                            mapping=mapping,
                            transforms=transforms,
                            currency_unit="rial",
                            calendar="gregorian",
                            layout=layout or {},
                        ),
                    )

                async def validate(batch):
                    return await routes.validate_import(
                        company_id=company.id,
                        batch_id=batch.id,
                        session=session,
                        current_user=user,
                        request=request,
                        _csrf=None,
                        idempotency_key=str(uuid4()),
                    )

                async def commit(batch):
                    await routes.commit_import(
                        company_id=company.id,
                        batch_id=batch.id,
                        session=session,
                        current_user=user,
                        request=request,
                        _csrf=None,
                        idempotency_key=str(uuid4()),
                    )
                    return await normalize_import(
                        session, batch_id=batch.id, company_id=company.id, actor_id=user.id
                    )

                yield (
                    session,
                    user,
                    company,
                    other,
                    request,
                    seed,
                    configure,
                    validate,
                    commit,
                    membership,
                )
        finally:
            await transaction.rollback()
    await engine.dispose()


async def test_multifile_invoice_lines_saved_evidence_review_and_company_isolation(world):
    from openpyxl import Workbook

    s, user, company, other, request, seed, _, validate, commit, access = world
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["invoice", "", "amount", ""])
    sheet.append(["tax_id", "date", "gross", "vat"])
    sheet.append([TAX_A, "2026-10-01", "100", "10"])
    sheet.append(["", "", "50", "5"])
    stream = io.BytesIO()
    workbook.save(stream)
    internal = await seed(
        SourceKind.SALES,
        stream.getvalue(),
        {
            "tax_id": "invoice / tax_id",
            "issue_date": "date",
            "gross_amount": "amount / gross",
            "tax_amount": "vat",
        },
        {
            "header_rows": 2,
            "fill_down_columns": ["invoice / tax_id", "date"],
            "invoice_rows": "line_totals",
        },
        ".xlsx",
    )
    result = await validate(internal)
    assert result.batch.accepted_count == 2
    await commit(internal)
    rows = (
        await s.scalars(
            select(SourceRow)
            .where(SourceRow.import_batch_id == internal.id)
            .order_by(SourceRow.row_number)
        )
    ).all()
    assert rows[1].raw_json["invoice / tax_id"] == ""
    assert rows[1].processing_result["inherited_values"]["invoice / tax_id"] == TAX_A
    assert (
        await s.scalar(
            select(func.count())
            .select_from(SalesInvoice)
            .where(SalesInvoice.company_id == company.id)
        )
        == 0
    )

    headers = "tax,date,gross,vat,subject,status\n"
    mapping = {
        "tax_id": "tax",
        "issue_date": "date",
        "gross_amount": "gross",
        "tax_amount": "vat",
        "subject": "subject",
        "status": "status",
    }
    portal = await seed(
        SourceKind.MOADIAN_SALES,
        headers
        + f"{TAX_A},2026-10-01,150,15,اصلی,تایید شده\n{TAX_B},2026-10-02,40,4,اصلی,تایید شده\n",
        mapping,
    )
    copy = await seed(
        SourceKind.MOADIAN_SALES, headers + f"{TAX_A},2026-10-01,150,15,اصلی,تایید شده\n", mapping
    )
    for batch in (portal, copy):
        await validate(batch)
        await commit(batch)
    payload = ComparisonRequest(
        internal_batch_ids=[internal.id],
        portal_batch_ids=[portal.id, copy.id],
        direction="sales",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 31),
    )
    key = uuid4()
    report = await create_run(s, company.id, user.id, payload, key)
    assert report.run_id and report.overlapping_copies == 1
    assert report.counts == {"matched": 1, "portal_only": 1}
    assert not report.coverage["internal"]["complete"]
    assert len(report.items[0].internal.source_rows) == 2
    assert len(report.items[0].portal.source_rows) == 2
    assert report.items[0].internal.gross_amount == "150"
    assert not report.items[1].absence_confirmed
    assert (await create_run(s, company.id, user.id, payload, key)).run_id == report.run_id
    assert (
        await s.scalar(
            select(func.count())
            .select_from(InvoiceComparisonRun)
            .where(InvoiceComparisonRun.company_id == company.id)
        )
        == 1
    )
    reviewed = await decide_result(
        s,
        company.id,
        user.id,
        report.run_id,
        report.items[1].key,
        ComparisonDecisionRequest(decision="resolved", note="اختلاف بررسی شد."),
    )
    assert reviewed.decision == "resolved"
    assert (await read_run(s, company.id, report.run_id, status="portal_only")).items[
        0
    ].note == "اختلاف بررسی شد."
    with pytest.raises(HTTPException) as missing:
        await read_run(s, other.id, report.run_id)
    assert missing.value.status_code == 404
    with pytest.raises(HTTPException) as immutable:
        await routes.delete_import_batch(company.id, internal.id, request, s, user, None)
    assert immutable.value.status_code == 409
    with pytest.raises(HTTPException) as viewer:
        await review_comparison(
            company.id,
            report.run_id,
            report.items[1].key,
            ComparisonDecisionRequest(decision="open", note="نباید ثبت شود"),
            s,
            user,
            CompanyAccess(role=CompanyRole.VIEWER),
            None,
        )
    assert viewer.value.status_code == 403


async def test_mixed_account_file_is_blocked_then_can_be_reinterpreted_without_reupload(world):
    s, user, company, _, _, seed, configure, validate, commit, _ = world
    mapping = {"booking_date": "date", "amount_signed": "amount", "bank_account_number": "account"}
    batch = await seed(
        SourceKind.BANK, "date,amount,account\n2026-10-01,100,123\n2026-10-02,200,456\n", mapping
    )
    result = await validate(batch)
    assert result.issue_counts.get("blocking") == 1
    from app.imports.revisions import revise_structure

    revised = await revise_structure(s, batch, user.id)
    await s.commit()
    assert revised.file_id == batch.file_id and batch.status == ImportStatus.CANCELLED
    assert (await revise_structure(s, batch, user.id)).id == revised.id
    await configure(revised, mapping, {"row_filter_column": "account", "row_filter_value": "123"})
    result = await validate(revised)
    assert result.batch.accepted_count == 1
    assert result.coverage["row_selection"]["excluded"] == 1
    await commit(revised)
    amounts = (
        await s.scalars(
            select(BankTransaction.amount_irr).where(BankTransaction.company_id == company.id)
        )
    ).all()
    assert amounts == [100]


async def test_blank_receipt_values_do_not_become_unpaid_invoices(world):
    s, _, company, _, _, seed, _, validate, commit, _ = world
    batch = await seed(
        SourceKind.SALES,
        "number,date,name,gross,paid\n1,2026-10-01,نمونه,100,\n2,2026-10-01,نمونه,100,—\n3,2026-10-01,نمونه,100,0\n",
        {
            "invoice_no": "number",
            "issue_date": "date",
            "customer_name": "name",
            "gross_amount": "gross",
            "paid_amount": "paid",
        },
    )
    validation = await validate(batch)
    assert validation.batch.accepted_count == 3
    assert not validation.batch.coverage["receivables"]["available"]
    assert validation.batch.coverage["receivables"]["missing_balance_rows"] == 2
    await commit(batch)
    invoices = (
        await s.scalars(select(SalesInvoice).where(SalesInvoice.company_id == company.id))
    ).all()
    assert len(invoices) == 1
    assert invoices[0].invoice_no == "3"
    assert invoices[0].paid_amount_irr == 0
