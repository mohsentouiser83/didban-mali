import pytest
from sqlalchemy import delete, select

from app.companies.models import Company, CompanyAccess
from app.core.database import async_session_factory
from app.core.tenant import set_request_company, set_request_user
from app.identity.models import User
from app.integrations.models import ConnectionStatus, IntegrationConnection
from app.integrations.schemas import (
    AgentRecordItem,
    AgentSyncPushRequest,
    IntegrationConnectionCreate,
)


@pytest.fixture(autouse=True)
async def cleanup_pool():
    from app.core.database import engine
    await engine.dispose()
    yield
    await engine.dispose()


@pytest.mark.asyncio
async def test_agent_key_generation_and_sync():
    async with async_session_factory() as db_session:
        # Get seeded admin user
        user = await db_session.scalar(select(User).where(User.email == "admin@didban.ir"))
        assert user is not None
        await set_request_user(db_session, user.id)

        # Get company
        stmt = (
            select(Company)
            .join(CompanyAccess, CompanyAccess.company_id == Company.id)
            .where(CompanyAccess.user_id == user.id)
            .limit(1)
        )
        company = (await db_session.execute(stmt)).scalar_one_or_none()
        assert company is not None
        await set_request_company(db_session, company.id)

        # Pre-clean any existing sepidar connection
        await db_session.execute(
            delete(IntegrationConnection).where(
                IntegrationConnection.company_id == company.id,
                IntegrationConnection.provider == "sepidar",
            )
        )
        await db_session.commit()

        from app.integrations.service import IntegrationService

        # Create Sepidar connection
        create_payload = IntegrationConnectionCreate(
            provider="sepidar",
            name="سپیدار سیستم دفتر مرکزی آزمایشی",
            config={"server_url": "http://192.168.1.100:8080"},
            credentials={},
            sync_interval_minutes=1440,
        )
        conn = await IntegrationService.create_connection(
            session=db_session,
            company_id=company.id,
            payload=create_payload,
            actor_id=user.id,
        )

        # 1. Generate Agent Key
        key_resp = await IntegrationService.get_or_create_agent_key(
            session=db_session,
            company_id=company.id,
            connection_id=conn.id,
            actor_id=user.id,
        )
        assert key_resp.agent_key.startswith("dmb_live_")
        assert key_resp.connection_id == conn.id

        # Verify key idempotency (retrieving again returns same key)
        key_resp_again = await IntegrationService.get_or_create_agent_key(
            session=db_session,
            company_id=company.id,
            connection_id=conn.id,
        )
        assert key_resp_again.agent_key == key_resp.agent_key

        # 2. Ingest valid agent batch
        records = [
            AgentRecordItem(
                source_entity_type="journal_entry",
                source_record_id="REC-001",
                record_date="1404/07/20",
                amount_irr=500000000,
                account_code="10101",
                account_name="بانک صادرات",
                description="واریز نقدی مشتری",
                counterparty="پخش سراسری البرز",
                reference="TR-10293",
                document_number="SANAD-99",
            ),
            AgentRecordItem(
                source_entity_type="journal_entry",
                source_record_id="REC-002",
                record_date="1404/07/20",
                amount_irr=250000000,
                account_code="40101",
                account_name="اسناد پرداختنی",
                description="تسویه چک تامین‌کننده",
                counterparty="تولیدی قطعات بهار",
                reference="CHQ-8890",
                document_number="SANAD-100",
            ),
        ]

        push_req = AgentSyncPushRequest(
            agent_key=key_resp.agent_key,
            source_system="sepidar",
            batch_id="batch-test-01",
            watermark="1404/07/20 12:00:00",
            records=records,
            metadata={"os": "Windows Server 2022", "db": "MSSQL 2019"},
        )

        receipt = await IntegrationService.ingest_agent_sync(
            session=db_session,
            company_id=company.id,
            connection_id=conn.id,
            payload=push_req,
        )

        assert receipt.success is True
        assert receipt.records_received == 2
        assert receipt.records_imported == 2
        assert receipt.records_skipped_duplicate == 0

        # Verify connection updated to CONNECTED
        updated_conn = await IntegrationService.get_connection(db_session, company.id, conn.id)
        assert updated_conn.status == ConnectionStatus.CONNECTED
        assert updated_conn.last_sync_record_count == 2
        assert updated_conn.last_sync_at is not None

        # 3. Test Idempotency: Send the exact same batch again -> records should be skipped
        repeat_receipt = await IntegrationService.ingest_agent_sync(
            session=db_session,
            company_id=company.id,
            connection_id=conn.id,
            payload=push_req,
        )
        assert repeat_receipt.success is True
        assert repeat_receipt.records_imported == 0
        assert repeat_receipt.records_skipped_duplicate == 2

        # 4. Test Invalid Key Authentication Rejection
        bad_req = AgentSyncPushRequest(
            agent_key="invalid_bad_key",
            source_system="sepidar",
            records=records,
        )
        with pytest.raises(PermissionError):
            await IntegrationService.ingest_agent_sync(
                session=db_session,
                company_id=company.id,
                connection_id=conn.id,
                payload=bad_req,
            )

        # Cleanup test connection
        await db_session.execute(
            delete(IntegrationConnection).where(
                IntegrationConnection.id == conn.id
            )
        )
        await db_session.commit()
