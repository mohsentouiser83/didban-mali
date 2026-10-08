import pytest
from sqlalchemy import select

from app.automations.models import AutomationActionType
from app.automations.schemas import AutomationRuleCreate
from app.automations.service import AutomationService
from app.companies.models import Company, CompanyAccess
from app.core.database import async_session_factory, engine
from app.core.tenant import set_request_company, set_request_user
from app.identity.models import User
from app.integrations.models import (
    ConnectionStatus,
    IntegrationSyncRecord,
    SyncJobStatus,
    SyncRecordStatus,
)
from app.integrations.schemas import (
    IntegrationConnectionCreate,
)
from app.integrations.service import IntegrationService


@pytest.fixture(autouse=True)
async def cleanup_pool():
    await engine.dispose()
    yield
    await engine.dispose()


@pytest.mark.asyncio
async def test_integrations_lifecycle_and_idempotency():
    """
    Verify complete integration lifecycle:
    1. Create connection (Sepidar)
    2. Test connection
    3. Run sync -> records imported
    4. Run sync again -> idempotent: 0 duplicates, existing fingerprints skipped
    5. Clean RLS tenant isolation
    """
    async with async_session_factory() as session:
        # Get active user
        user = await session.scalar(select(User).where(User.email == "admin@didban.ir"))
        assert user is not None
        await set_request_user(session, user.id)

        # Get first company with access
        stmt = (
            select(Company)
            .join(CompanyAccess, CompanyAccess.company_id == Company.id)
            .where(CompanyAccess.user_id == user.id)
            .limit(1)
        )
        company = (await session.execute(stmt)).scalar_one_or_none()
        assert company is not None
        await set_request_company(session, company.id)

        # 1. Create Sepidar connection
        create_payload = IntegrationConnectionCreate(
            provider="sepidar",
            name="اتصال سپیدار سیستم مرکزی",
            config={"server_url": "http://sepidar.local:8080/api/v1", "fiscal_year": 1404},
            credentials={"api_token": "secret-token-test-123"},
            sync_interval_minutes=1440,
        )
        conn = await IntegrationService.create_connection(
            session=session,
            company_id=company.id,
            payload=create_payload,
            actor_id=user.id,
        )
        assert conn.id is not None
        assert conn.provider == "sepidar"
        assert conn.status == ConnectionStatus.INACTIVE

        # 2. Test connection
        test_res = await IntegrationService.test_connection(
            session=session,
            company_id=company.id,
            connection_id=conn.id,
        )
        assert test_res.success is True
        assert test_res.status == "connected"
        assert conn.status == ConnectionStatus.CONNECTED

        # 3. Trigger first sync
        job1 = await IntegrationService.trigger_sync(
            session=session,
            company_id=company.id,
            connection_id=conn.id,
            sync_type="manual",
            actor_id=user.id,
        )
        assert job1.status == SyncJobStatus.COMPLETED
        assert job1.records_received > 0
        assert job1.records_imported == job1.records_received
        assert job1.records_rejected == 0
        first_imported_count = job1.records_imported

        # 4. Trigger second sync (Idempotency verification)
        job2 = await IntegrationService.trigger_sync(
            session=session,
            company_id=company.id,
            connection_id=conn.id,
            sync_type="manual",
            actor_id=user.id,
        )
        assert job2.status == SyncJobStatus.COMPLETED
        assert job2.records_received > 0
        # Since fingerprints already exist in DB, newly imported count must be 0!
        assert job2.records_imported == 0
        assert job2.summary_json.get("skipped_duplicates") == first_imported_count

        # 5. Verify sync records exist in table
        sync_records_stmt = select(IntegrationSyncRecord).where(
            IntegrationSyncRecord.connection_id == conn.id
        )
        sync_records = (await session.execute(sync_records_stmt)).scalars().all()
        assert len(sync_records) == first_imported_count
        assert all(r.status == SyncRecordStatus.IMPORTED for r in sync_records)

        # Cleanup
        await IntegrationService.delete_connection(
            session=session,
            company_id=company.id,
            connection_id=conn.id,
            actor_id=user.id,
        )


@pytest.mark.asyncio
async def test_automation_rules_and_daily_cycle():
    """
    Verify Automation platform:
    1. Create daily morning cycle rule
    2. Execute rule manually
    3. Verify all cycle steps succeed (sync -> recalculation -> reconciliation -> findings)
    4. Duration is recorded and status is success
    """
    async with async_session_factory() as session:
        user = await session.scalar(select(User).where(User.email == "admin@didban.ir"))
        assert user is not None
        await set_request_user(session, user.id)

        stmt = (
            select(Company)
            .join(CompanyAccess, CompanyAccess.company_id == Company.id)
            .where(CompanyAccess.user_id == user.id)
            .limit(1)
        )
        company = (await session.execute(stmt)).scalar_one_or_none()
        assert company is not None
        await set_request_company(session, company.id)

        # 1. Create rule
        rule_payload = AutomationRuleCreate(
            name="چرخه خودکار بامداد (ساعت ۰۷:۰۰)",
            action_type=AutomationActionType.DAILY_MORNING_CYCLE,
            is_enabled=True,
            schedule_cron="0 7 * * *",
            config={"notify_on_completion": True},
        )
        rule = await AutomationService.create_rule(
            session=session,
            company_id=company.id,
            payload=rule_payload,
            actor_id=user.id,
        )
        assert rule.id is not None
        assert rule.is_enabled is True

        # 2. Execute rule
        run = await AutomationService.execute_rule(
            session=session,
            company_id=company.id,
            rule_id=rule.id,
            trigger_type="manual",
            actor_id=user.id,
        )
        assert run.status == "succeeded"
        assert run.duration_ms >= 0
        assert len(run.steps_executed_json) == 4

        step_names = [s["step"] for s in run.steps_executed_json]
        assert "sync_integrations" in step_names
        assert "recalculate_metrics" in step_names
        assert "reconciliation" in step_names
        assert "findings_and_assignment" in step_names
