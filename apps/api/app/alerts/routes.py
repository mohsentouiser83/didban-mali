from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.alerts.schemas import (
    AlertAcknowledgeRequest,
    AlertResolveRequest,
    AlertsListResponse,
    AlertsSummaryResponse,
    AlertWebhookCreateRequest,
    AlertWebhookItem,
    AlertWebhooksListResponse,
    AlertWebhookTestResult,
    EarlyWarningAlertItem,
)
from app.alerts.service import (
    acknowledge_alert,
    create_webhook,
    delete_webhook,
    evaluate_and_sync_alerts,
    get_alerts_summary,
    get_webhooks,
    resolve_alert,
    test_webhook,
)
from app.companies.dependencies import CurrentCompanyAccess
from app.identity.dependencies import CurrentUser, DbSession

router = APIRouter(prefix="/companies/{company_id}/alerts", tags=["alerts"])


@router.get("/summary", response_model=AlertsSummaryResponse)
async def get_summary(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> AlertsSummaryResponse:
    del access
    return await get_alerts_summary(session, company_id=company_id)


@router.get("", response_model=AlertsListResponse)
async def get_alerts_list(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> AlertsListResponse:
    del access
    items = await evaluate_and_sync_alerts(session, company_id=company_id)
    return AlertsListResponse(items=items, total_count=len(items))


@router.post("/{alert_id}/acknowledge", response_model=EarlyWarningAlertItem)
async def post_acknowledge(
    company_id: UUID,
    alert_id: UUID,
    req: AlertAcknowledgeRequest,
    session: DbSession,
    access: CurrentCompanyAccess,
    user: CurrentUser,
) -> EarlyWarningAlertItem:
    del access
    result = await acknowledge_alert(
        session,
        company_id=company_id,
        alert_id=alert_id,
        user_id=user.id,
        note=req.note,
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="هشدار مورد نظر یافت نشد.",
        )
    return result


@router.post("/{alert_id}/resolve", response_model=EarlyWarningAlertItem)
async def post_resolve(
    company_id: UUID,
    alert_id: UUID,
    req: AlertResolveRequest,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> EarlyWarningAlertItem:
    del access
    result = await resolve_alert(
        session,
        company_id=company_id,
        alert_id=alert_id,
        action_note=req.action_note,
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="هشدار مورد نظر یافت نشد.",
        )
    return result


@router.get("/webhooks", response_model=AlertWebhooksListResponse)
async def get_company_webhooks(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> AlertWebhooksListResponse:
    del access
    items = await get_webhooks(session, company_id=company_id)
    return AlertWebhooksListResponse(items=items)


@router.post("/webhooks", response_model=AlertWebhookItem, status_code=status.HTTP_201_CREATED)
async def post_create_webhook(
    company_id: UUID,
    req: AlertWebhookCreateRequest,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> AlertWebhookItem:
    del access
    return await create_webhook(session, company_id=company_id, req=req)


@router.delete("/webhooks/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company_webhook(
    company_id: UUID,
    webhook_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> None:
    del access
    deleted = await delete_webhook(session, company_id=company_id, webhook_id=webhook_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="کانال وب‌هوک یافت نشد.",
        )


@router.post("/webhooks/{webhook_id}/test", response_model=AlertWebhookTestResult)
async def post_test_webhook(
    company_id: UUID,
    webhook_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> AlertWebhookTestResult:
    del access
    return await test_webhook(session, company_id=company_id, webhook_id=webhook_id)
