"""Run against an isolated, migrated PostgreSQL database; never uses the project database."""

import os
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.companies.models import Company, CompanyAccess, CompanyRole
from app.core import database
from app.core.tenant import reset_request_context, set_request_user
from app.financial.models import (
    Account,
    BankAccount,
    BankTransaction,
    Counterparty,
    InvoiceReceipt,
    JournalEntry,
    JournalLine,
    SalesInvoice,
)
from app.financial_periods.models import FinancialPeriod
from app.identity.models import Membership, User, Workspace, WorkspaceRole
from app.identity.security import _encode_token
from app.imports.models import DataSource, ImportBatch, SourceFile, SourceKind, SourceRow
from app.main import app

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        not os.getenv("PERIODS_TEST_ADMIN_URL"),
        reason="Requires an isolated migrated test database",
    ),
]


async def seed_period_data(factory):
    async with factory() as session:
        owner = User(
            email=f"period-owner-{uuid4().hex}@example.com",
            full_name="مدیر مالی آزمایشی",
            password_hash="unused",
        )
        viewer = User(
            email=f"period-viewer-{uuid4().hex}@example.com",
            full_name="مشاهده‌گر",
            password_hash="unused",
        )
        session.add_all([owner, viewer])
        await session.flush()
        workspace = Workspace(name="آزمون دوره مالی", owner_user_id=owner.id)
        session.add(workspace)
        await session.flush()
        session.add_all(
            [
                Membership(workspace_id=workspace.id, user_id=owner.id, role=WorkspaceRole.OWNER),
                Membership(workspace_id=workspace.id, user_id=viewer.id, role=WorkspaceRole.MEMBER),
            ]
        )
        company = Company(workspace_id=workspace.id, legal_name="شرکت آزمایش دوره مالی")
        foreign = Company(workspace_id=workspace.id, legal_name="شرکت دیگر")
        session.add_all([company, foreign])
        await session.flush()
        session.add_all(
            [
                CompanyAccess(company_id=company.id, user_id=owner.id, role=CompanyRole.OWNER),
                CompanyAccess(company_id=company.id, user_id=viewer.id, role=CompanyRole.VIEWER),
            ]
        )
        source = DataSource(
            company_id=company.id, kind=SourceKind.SALES, label="فروش آزمایشی", created_by=owner.id
        )
        file = SourceFile(
            company_id=company.id,
            object_key=uuid4().hex,
            original_name="test.csv",
            sha256="0" * 64,
            size_bytes=10,
            mime_type="text/csv",
            extension="csv",
            uploaded_by=owner.id,
        )
        session.add_all([source, file])
        await session.flush()
        batch = ImportBatch(
            company_id=company.id, source_id=source.id, file_id=file.id, idempotency_key=uuid4().hex
        )
        session.add(batch)
        await session.flush()
        rows = [
            SourceRow(
                company_id=company.id,
                import_batch_id=batch.id,
                sheet="test",
                row_number=i + 1,
                raw_json={},
                raw_hash=str(i) * 64,
            )
            for i in range(4)
        ]
        session.add_all(rows)
        await session.flush()
        cp = Counterparty(
            company_id=company.id, name="مشتری آزمایشی", normalized_name="مشتری آزمایشی"
        )
        account = BankAccount(
            company_id=company.id,
            data_source_id=source.id,
            bank_name="بانک آزمایشی",
            label="حساب اصلی",
        )
        session.add_all([cp, account])
        await session.flush()
        invoice = SalesInvoice(
            company_id=company.id,
            source_row_id=rows[0].id,
            counterparty_id=cp.id,
            invoice_no="INV-TEST",
            issue_date=date(2026, 3, 1),
            due_date=date(2026, 4, 5),
            gross_amount_irr=Decimal(10000000),
            paid_amount_irr=Decimal(8000000),
        )
        session.add(invoice)
        for row, day, amount, balance in zip(
            rows[1:],
            [date(2026, 3, 31), date(2026, 4, 1), date(2026, 4, 30)],
            [10000000, 3000000, -5000000],
            [10000000, None, 8000000],
            strict=True,
        ):
            session.add(
                BankTransaction(
                    company_id=company.id,
                    source_row_id=row.id,
                    bank_account_id=account.id,
                    booking_date=day,
                    amount_irr=amount,
                    running_balance_irr=balance,
                    description="گردش آزمایشی",
                    description_normalized="گردش آزمایشی",
                )
            )
        await session.commit()

        def token(user):
            return _encode_token(
                user_id=user.id,
                session_id=uuid4(),
                token_type="access",
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )

        return dict(
            company_id=str(company.id),
            foreign_id=str(foreign.id),
            invoice_id=str(invoice.id),
            owner_id=str(owner.id),
            viewer_id=str(viewer.id),
            owner_token=token(owner),
            viewer_token=token(viewer),
        )


async def test_journal_semantics_updates_respect_writer_roles():
    from uuid import UUID

    from sqlalchemy import update

    from app.financial.journal_types import update_import_entry_types

    admin = create_async_engine(os.environ["PERIODS_TEST_ADMIN_URL"])
    runtime = create_async_engine(os.environ["PERIODS_TEST_APP_URL"])
    admin_factory = async_sessionmaker(admin, expire_on_commit=False)
    seed = await seed_period_data(admin_factory)
    company_id = UUID(seed["company_id"])
    try:
        async with admin_factory() as session:
            row = await session.scalar(select(SourceRow).where(SourceRow.company_id == company_id))
            account = Account(
                company_id=company_id,
                source_code="opening",
                name="تراز افتتاحیه",
                normalized_name="تراز افتتاحیه",
            )
            entry = JournalEntry(
                company_id=company_id,
                import_batch_id=row.import_batch_id,
                source_row_id=row.id,
                source_entry_key="opening",
                entry_date=date(2026, 3, 21),
                description="افتتاحیه",
                description_normalized="افتتاحیه",
                fiscal_period="1405-01",
                entry_type_source="inferred",
            )
            session.add_all([account, entry])
            await session.flush()
            session.add(
                JournalLine(
                    company_id=company_id,
                    entry_id=entry.id,
                    account_id=account.id,
                    source_row_id=row.id,
                    debit_irr=Decimal(0),
                    credit_irr=Decimal(0),
                )
            )
            await session.commit()
            entry_id, batch_id = entry.id, row.import_batch_id

        async with async_sessionmaker(runtime, expire_on_commit=False)() as session:
            await set_request_user(session, UUID(seed["owner_id"]))
            await update_import_entry_types(session, company_id, batch_id)
            await session.commit()
            assert (
                await session.scalar(
                    select(JournalEntry.entry_type).where(JournalEntry.id == entry_id)
                )
                == "opening"
            )
            await set_request_user(session, UUID(seed["viewer_id"]))
            result = await session.execute(
                update(JournalEntry).where(JournalEntry.id == entry_id).values(entry_type="normal")
            )
            assert result.rowcount == 0
            await session.rollback()
            await set_request_user(session, uuid4())
            result = await session.execute(
                update(JournalEntry).where(JournalEntry.id == entry_id).values(entry_type="normal")
            )
            assert result.rowcount == 0
            await session.rollback()
    finally:
        await runtime.dispose()
        await admin.dispose()


async def test_saved_periods_history_report_and_rls(monkeypatch):
    admin = create_async_engine(os.environ["PERIODS_TEST_ADMIN_URL"])
    runtime = create_async_engine(os.environ["PERIODS_TEST_APP_URL"])
    admin_factory = async_sessionmaker(admin, expire_on_commit=False)
    factory = async_sessionmaker(runtime, expire_on_commit=False)
    seed = await seed_period_data(admin_factory)

    monkeypatch.setattr(database, "async_session_factory", factory)
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
            cookies={"didban_access": seed["owner_token"], "didban_csrf": "period-test"},
        ) as client:
            headers = {"X-CSRF-Token": "period-test"}
            base = f"/api/v1/companies/{seed['company_id']}"
            period = {
                "name": "فروردین آزمایشی",
                "start_date": "2026-04-01",
                "end_date": "2026-04-30",
            }
            created = await client.post(base + "/financial-periods", json=period, headers=headers)
            assert created.status_code == 201, created.text
            assert (await client.get(base + "/financial-periods")).json()[0]["name"] == period[
                "name"
            ]
            assert (
                await client.post(base + "/financial-periods", json=period, headers=headers)
            ).status_code == 409
            assert (
                await client.post(base + "/financial-periods", json={**period, "name": "بدون توکن"})
            ).status_code == 403
            period_url = base + f"/financial-periods/{created.json()['id']}"
            assert (await client.get(period_url)).json()["name"] == period["name"]
            revised = {**period, "name": "فروردین ویرایش‌شده", "start_date": "2026-03-31"}
            updated = await client.put(period_url, json=revised, headers=headers)
            assert updated.status_code == 200, updated.text
            assert updated.json()["start_date"] == revised["start_date"]
            assert (await client.get(period_url)).json()["name"] == revised["name"]
            assert (
                await client.put(
                    period_url, json={**revised, "end_date": "2026-03-01"}, headers=headers
                )
            ).status_code == 422
            assert (await client.put(period_url, json=revised)).status_code == 403
            assert (
                await client.put(
                    base + f"/financial-periods/{uuid4()}", json=revised, headers=headers
                )
            ).status_code == 404
            another = await client.post(
                base + "/financial-periods", json={**period, "name": "دوره دوم"}, headers=headers
            )
            another_url = base + f"/financial-periods/{another.json()['id']}"
            assert (await client.put(another_url, json=revised, headers=headers)).status_code == 409
            assert (await client.delete(another_url, headers=headers)).status_code == 204
            assert (await client.get(another_url)).status_code == 404
            report_path = (
                base + "/financial-periods/report?start_date=2026-04-01&end_date=2026-04-30"
            )
            before = (await client.get(report_path)).json()
            assert before["receivables"]["closing_balance_irr"] is None
            payload = {
                "confirm_complete": True,
                "expected_version": 0,
                "receipts": [
                    {"received_on": "2026-04-30", "amount_irr": "3000000"},
                    {"received_on": "2026-05-01", "amount_irr": "5000000"},
                ],
            }
            saved = await client.put(
                base + f"/receivables/invoices/{seed['invoice_id']}/receipt-history",
                json=payload,
                headers=headers,
            )
            assert saved.status_code == 200, saved.text
            report = await client.get(report_path)
            assert report.status_code == 200, report.text
            body = report.json()
            assert body["receivables"]["closing_balance_irr"] == "7000000"
            assert body["receivables"]["receipts_irr"] == "3000000"
            assert body["receivables"]["customers"][0]["total_outstanding_irr"] == "7000000"
            assert body["cash"]["opening_balance_irr"] == "10000000"
            assert body["cash"]["closing_balance_irr"] == "8000000"
            assert (
                await client.put(
                    base + f"/receivables/invoices/{seed['invoice_id']}/receipt-history",
                    json=payload,
                    headers=headers,
                )
            ).status_code == 409
            assert (
                await client.get(
                    report_path.replace("start_date=2026-04-01", "start_date=2026-05-01")
                )
            ).status_code == 422
            foreign = f"/api/v1/companies/{seed['foreign_id']}"
            assert (await client.get(foreign + "/financial-periods")).status_code == 404
            assert (
                await client.put(
                    foreign + f"/receivables/invoices/{seed['invoice_id']}/receipt-history",
                    json=payload,
                    headers=headers,
                )
            ).status_code == 404
            assert (
                await client.put(
                    period_url.replace(seed["company_id"], seed["foreign_id"]),
                    json=revised,
                    headers=headers,
                )
            ).status_code == 404
            client.cookies.set("didban_access", seed["viewer_token"])
            assert (await client.get(period_url)).status_code == 200
            assert (await client.put(period_url, json=revised, headers=headers)).status_code == 403
            assert (await client.delete(period_url, headers=headers)).status_code == 403
            assert (await client.get(report_path)).status_code == 200
            assert (
                await client.post(
                    base + "/financial-periods",
                    json={**period, "name": "دوره مشاهده‌گر"},
                    headers=headers,
                )
            ).status_code == 403
            assert (
                await client.put(
                    base + f"/receivables/invoices/{seed['invoice_id']}/receipt-history",
                    json={**payload, "expected_version": 1},
                    headers=headers,
                )
            ).status_code == 403
        # RLS itself isolates data even without route filters.
        async with factory() as session:
            assert not (await session.scalars(select(FinancialPeriod))).all()
            assert not (await session.scalars(select(InvoiceReceipt))).all()
            from uuid import UUID

            await set_request_user(session, UUID(seed["viewer_id"]))
            assert len((await session.scalars(select(FinancialPeriod))).all()) == 1
            await reset_request_context(session)
    finally:
        await runtime.dispose()
        await admin.dispose()


async def test_automatic_account_classification_updates_preserve_permissions():
    from uuid import UUID

    from sqlalchemy import update
    from sqlalchemy.exc import DBAPIError

    from app.financial.models import AccountClass, AccountClassification

    admin = create_async_engine(os.environ["PERIODS_TEST_ADMIN_URL"])
    runtime = create_async_engine(os.environ["PERIODS_TEST_APP_URL"])
    admin_factory = async_sessionmaker(admin, expire_on_commit=False)
    try:
        seed = await seed_period_data(admin_factory)
        company_id, owner_id = UUID(seed["company_id"]), UUID(seed["owner_id"])
        async with admin_factory() as session:
            account = Account(
                company_id=company_id, source_code="legacy", name="بانک", normalized_name="بانک"
            )
            session.add(account)
            await session.flush()
            legacy = AccountClassification(
                company_id=company_id,
                account_id=account.id,
                account_class=AccountClass.OTHER,
                effective_from=date(2026, 1, 1),
                confirmed_by=owner_id,
                rule_version="auto-v1",
                confirmed_at=datetime.now(UTC),
            )
            manual = AccountClassification(
                company_id=company_id,
                account_id=account.id,
                account_class=AccountClass.LIABILITY,
                effective_from=date(2026, 1, 2),
                confirmed_by=owner_id,
                rule_version="manual",
                confirmed_at=datetime.now(UTC),
            )
            session.add_all([legacy, manual])
            await session.commit()
            legacy_id, manual_id = legacy.id, manual.id

        async with async_sessionmaker(runtime, expire_on_commit=False)() as session:
            upgrade = (
                update(AccountClassification)
                .where(AccountClassification.id == legacy_id)
                .values(account_class=AccountClass.ASSET, rule_version="semantic-v2")
            )
            for unauthorized in (UUID(seed["viewer_id"]), uuid4()):
                await set_request_user(session, unauthorized)
                assert (await session.execute(upgrade)).rowcount == 0
                await session.rollback()

            await set_request_user(session, owner_id)
            assert (
                await session.execute(
                    update(AccountClassification)
                    .where(AccountClassification.id == manual_id)
                    .values(account_class=AccountClass.ASSET, rule_version="semantic-v2")
                )
            ).rowcount == 0
            with pytest.raises(DBAPIError, match="row-level security"):
                await session.execute(
                    update(AccountClassification)
                    .where(AccountClassification.id == legacy_id)
                    .values(rule_version="manual")
                )
            await session.rollback()

            await set_request_user(session, owner_id)
            assert (await session.execute(upgrade)).rowcount == 1
            await session.commit()
            # An automatic upgrade cannot subsequently rewrite semantic or manual classifications.
            assert (await session.execute(upgrade)).rowcount == 0

        async with admin_factory() as session:
            upgraded = await session.get(AccountClassification, legacy_id)
            preserved = await session.get(AccountClassification, manual_id)
            assert (upgraded.account_class, upgraded.rule_version, upgraded.confirmed_by) == (
                AccountClass.ASSET,
                "semantic-v2",
                owner_id,
            )
            assert (preserved.account_class, preserved.rule_version) == (
                AccountClass.LIABILITY,
                "manual",
            )
    finally:
        await runtime.dispose()
        await admin.dispose()
