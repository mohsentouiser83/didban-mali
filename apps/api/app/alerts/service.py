import json
import time
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid6 import uuid7

from app.alerts.models import (
    AlertCategory,
    AlertSeverity,
    AlertStatus,
    AlertWebhookConfig,
    AlertWebhookDeliveryLog,
    EarlyWarningAlert,
)
from app.alerts.rules import (
    evaluate_cash_gap_alert,
    evaluate_customer_credit_alert,
    evaluate_debtor_concentration_alert,
    evaluate_overdue_receivables_alert,
    evaluate_payables_overdue_alert,
    evaluate_runway_alert,
    evaluate_supplier_stoppage_alert,
)
from app.alerts.schemas import (
    AlertsSummaryResponse,
    AlertWebhookCreateRequest,
    AlertWebhookItem,
    AlertWebhookTestResult,
    EarlyWarningAlertItem,
)
from app.cashflow.service import get_cashflow_summary
from app.payables.service import get_payables_summary, get_vendors_payables
from app.receivables.service import get_customer_receivables, get_receivables_summary


async def evaluate_and_sync_alerts(
    session: AsyncSession, company_id: UUID
) -> list[EarlyWarningAlertItem]:
    """Runs deterministic rules against current financial metrics and updates active alerts."""
    cashflow = await get_cashflow_summary(session, company_id=company_id)
    receivables = await get_receivables_summary(session, company_id=company_id)
    customers = await get_customer_receivables(session, company_id=company_id)
    payables = await get_payables_summary(session, company_id=company_id)
    vendors = await get_vendors_payables(session, company_id=company_id)

    candidate_alerts: list[dict[str, Any]] = []

    # 1. Runway check
    runway_hit = evaluate_runway_alert(cashflow.runway_days)
    if runway_hit:
        candidate_alerts.append(runway_hit)

    # 2. Cash conversion cycle gap check
    gap_hit = evaluate_cash_gap_alert(payables.ccc_days)
    if gap_hit:
        candidate_alerts.append(gap_hit)

    # 3. Debtor concentration
    if customers.items and receivables.total_receivables_irr > 0:
        top_customer = max(customers.items, key=lambda c: c.total_outstanding_irr)
        share_pct = float(
            (top_customer.total_outstanding_irr / receivables.total_receivables_irr) * 100
        )
        conc_hit = evaluate_debtor_concentration_alert(
            top_customer.name,
            share_pct,
            top_customer.total_outstanding_irr,
        )
        if conc_hit:
            candidate_alerts.append(conc_hit)

    # 4. Receivables overdue 90+ ratio
    rec_90_plus = next((b for b in receivables.buckets if b.bucket_key == "90_plus"), None)
    if rec_90_plus and receivables.total_receivables_irr > 0:
        ratio_90 = float(rec_90_plus.amount_irr / receivables.total_receivables_irr)
        rec_hit = evaluate_overdue_receivables_alert(ratio_90, rec_90_plus.amount_irr)
        if rec_hit:
            candidate_alerts.append(rec_hit)

    # 5. Customer credit default risk
    high_risk_customers = [c for c in customers.items if c.risk_score >= 70]
    if high_risk_customers:
        total_risk_exposure = sum(
            (c.total_outstanding_irr for c in high_risk_customers), Decimal(0)
        )
        cust_hit = evaluate_customer_credit_alert(len(high_risk_customers), total_risk_exposure)
        if cust_hit:
            candidate_alerts.append(cust_hit)

    # 6. Critical supplier stoppage risk (vendors with overdue > 60 days)
    stoppage_vendors = [
        v
        for v in vendors.items
        if (Decimal(v.buckets.get("61_90", "0")) + Decimal(v.buckets.get("90_plus", "0"))) > 0
    ]
    if stoppage_vendors:
        total_stoppage_overdue = sum(
            (
                Decimal(v.buckets.get("61_90", "0")) + Decimal(v.buckets.get("90_plus", "0"))
                for v in stoppage_vendors
            ),
            Decimal(0),
        )
        stop_hit = evaluate_supplier_stoppage_alert(len(stoppage_vendors), total_stoppage_overdue)
        if stop_hit:
            candidate_alerts.append(stop_hit)

    # 7. Payables overdue surge
    pay_hit = evaluate_payables_overdue_alert(payables.overdue_ratio, payables.total_overdue_irr)
    if pay_hit:
        candidate_alerts.append(pay_hit)

    # Try syncing to DB if tables exist
    try:
        existing_alerts = list(
            await session.scalars(
                select(EarlyWarningAlert).where(
                    EarlyWarningAlert.company_id == company_id,
                    EarlyWarningAlert.status.in_([AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]),
                )
            )
        )
        existing_by_code = {a.code: a for a in existing_alerts}
        candidate_codes = {c["code"] for c in candidate_alerts}

        # Update or insert candidates
        for c in candidate_alerts:
            code = c["code"]
            if code in existing_by_code:
                alert_obj = existing_by_code[code]
                alert_obj.current_value = c["current_value"]
                alert_obj.threshold_value = c["threshold_value"]
                alert_obj.summary_fa = c["summary_fa"]
                alert_obj.suggested_action_fa = c["suggested_action_fa"]
            else:
                new_alert = EarlyWarningAlert(
                    id=uuid7(),
                    company_id=company_id,
                    code=c["code"],
                    category=c["category"],
                    severity=c["severity"],
                    title_fa=c["title_fa"],
                    summary_fa=c["summary_fa"],
                    metric_key=c["metric_key"],
                    current_value=c["current_value"],
                    threshold_value=c["threshold_value"],
                    metric_unit=c["metric_unit"],
                    suggested_action_fa=c["suggested_action_fa"],
                    target_route=c["target_route"],
                    status=AlertStatus.ACTIVE,
                    triggered_at=datetime.now(UTC),
                )
                session.add(new_alert)

        # Auto-resolve alerts that are no longer triggered
        for code, existing_obj in existing_by_code.items():
            if code not in candidate_codes and existing_obj.status == AlertStatus.ACTIVE:
                existing_obj.status = AlertStatus.RESOLVED
                existing_obj.resolved_at = datetime.now(UTC)
                existing_obj.action_note = "برطرف‌شده خودکار بر مبنای بهبود شاخص مالی."

        await session.commit()

        # Query all active/acknowledged alerts
        refreshed = list(
            await session.scalars(
                select(EarlyWarningAlert)
                .where(
                    EarlyWarningAlert.company_id == company_id,
                    EarlyWarningAlert.status.in_([AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]),
                )
                .order_by(EarlyWarningAlert.triggered_at.desc())
            )
        )
        return [EarlyWarningAlertItem.model_validate(a) for a in refreshed]
    except Exception:
        # Fallback for environments without DB migration or mocks
        now = datetime.now(UTC)
        return [
            EarlyWarningAlertItem(
                id=uuid7(),
                company_id=company_id,
                code=c["code"],
                category=c["category"],
                severity=c["severity"],
                title_fa=str(c["title_fa"]),
                summary_fa=str(c["summary_fa"]),
                metric_key=str(c["metric_key"]),
                current_value=c["current_value"],
                threshold_value=c["threshold_value"],
                metric_unit=str(c["metric_unit"]),
                suggested_action_fa=str(c["suggested_action_fa"]),
                target_route=str(c["target_route"]),
                status=AlertStatus.ACTIVE,
                triggered_at=now,
            )
            for c in candidate_alerts
        ]


async def get_alerts_summary(session: AsyncSession, company_id: UUID) -> AlertsSummaryResponse:
    alerts = await evaluate_and_sync_alerts(session, company_id=company_id)
    critical_count = sum(1 for a in alerts if a.severity == AlertSeverity.CRITICAL)
    warning_count = sum(1 for a in alerts if a.severity == AlertSeverity.WARNING)
    info_count = sum(1 for a in alerts if a.severity == AlertSeverity.INFO)
    liquidity_count = sum(1 for a in alerts if a.category == AlertCategory.LIQUIDITY)
    credit_risk_count = sum(1 for a in alerts if a.category == AlertCategory.CREDIT_RISK)
    supply_chain_count = sum(1 for a in alerts if a.category == AlertCategory.SUPPLY_CHAIN)
    compliance_count = sum(1 for a in alerts if a.category == AlertCategory.COMPLIANCE)

    return AlertsSummaryResponse(
        total_active=len(alerts),
        critical_count=critical_count,
        warning_count=warning_count,
        info_count=info_count,
        liquidity_count=liquidity_count,
        credit_risk_count=credit_risk_count,
        supply_chain_count=supply_chain_count,
        compliance_count=compliance_count,
        active_alerts=alerts,
    )


async def acknowledge_alert(
    session: AsyncSession,
    company_id: UUID,
    alert_id: UUID,
    user_id: UUID,
    note: str | None = None,
) -> EarlyWarningAlertItem | None:
    alert = await session.scalar(
        select(EarlyWarningAlert).where(
            EarlyWarningAlert.id == alert_id,
            EarlyWarningAlert.company_id == company_id,
        )
    )
    if not alert:
        return None

    alert.status = AlertStatus.ACKNOWLEDGED
    alert.acknowledged_at = datetime.now(UTC)
    alert.acknowledged_by_user_id = user_id
    if note:
        alert.action_note = note
    await session.commit()
    await session.refresh(alert)
    return EarlyWarningAlertItem.model_validate(alert)


async def resolve_alert(
    session: AsyncSession,
    company_id: UUID,
    alert_id: UUID,
    action_note: str,
) -> EarlyWarningAlertItem | None:
    alert = await session.scalar(
        select(EarlyWarningAlert).where(
            EarlyWarningAlert.id == alert_id,
            EarlyWarningAlert.company_id == company_id,
        )
    )
    if not alert:
        return None

    alert.status = AlertStatus.RESOLVED
    alert.resolved_at = datetime.now(UTC)
    alert.action_note = action_note
    await session.commit()
    await session.refresh(alert)
    return EarlyWarningAlertItem.model_validate(alert)


async def get_webhooks(session: AsyncSession, company_id: UUID) -> list[AlertWebhookItem]:
    try:
        rows = list(
            await session.scalars(
                select(AlertWebhookConfig)
                .where(AlertWebhookConfig.company_id == company_id)
                .order_by(AlertWebhookConfig.created_at.desc())
            )
        )
        return [AlertWebhookItem.model_validate(w) for w in rows]
    except Exception:
        return []


async def create_webhook(
    session: AsyncSession, company_id: UUID, req: AlertWebhookCreateRequest
) -> AlertWebhookItem:
    new_wh = AlertWebhookConfig(
        id=uuid7(),
        company_id=company_id,
        name=req.name,
        url=req.url,
        secret_token=req.secret_token,
        min_severity=req.min_severity,
        is_active=True,
    )
    session.add(new_wh)
    await session.commit()
    await session.refresh(new_wh)
    return AlertWebhookItem.model_validate(new_wh)


async def delete_webhook(session: AsyncSession, company_id: UUID, webhook_id: UUID) -> bool:
    wh = await session.scalar(
        select(AlertWebhookConfig).where(
            AlertWebhookConfig.id == webhook_id,
            AlertWebhookConfig.company_id == company_id,
        )
    )
    if not wh:
        return False
    await session.delete(wh)
    await session.commit()
    return True


async def test_webhook(
    session: AsyncSession, company_id: UUID, webhook_id: UUID
) -> AlertWebhookTestResult:
    wh = await session.scalar(
        select(AlertWebhookConfig).where(
            AlertWebhookConfig.id == webhook_id,
            AlertWebhookConfig.company_id == company_id,
        )
    )
    if not wh:
        return AlertWebhookTestResult(
            webhook_id=webhook_id,
            is_success=False,
            message="کانال وب‌هوک یافت نشد.",
            duration_ms=0,
        )

    test_payload = {
        "event": "early_warning_test_ping",
        "company_id": str(company_id),
        "webhook_id": str(webhook_id),
        "message": "این یک پیام آزمایشی اعتبارسنجی اتصال از سامانه دیدبان مالی است.",
        "timestamp": datetime.now(UTC).isoformat(),
    }
    headers = {"Content-Type": "application/json", "User-Agent": "DidbanMali-Webhook/1.0"}
    if wh.secret_token:
        headers["X-Didban-Signature"] = wh.secret_token

    start = time.perf_counter()
    is_success = False
    status_code: int | None = None
    resp_text: str | None = None
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.post(wh.url, json=test_payload, headers=headers)
            status_code = resp.status_code
            resp_text = resp.text[:1000]
            is_success = 200 <= status_code < 300
    except Exception as exc:
        resp_text = f"خطای ارتباط: {exc!s}"
        is_success = False

    duration_ms = int((time.perf_counter() - start) * 1000)

    # Record delivery log
    try:
        wh.last_triggered_at = datetime.now(UTC)
        wh.last_delivery_status = "success" if is_success else "failed"
        wh.last_delivery_code = status_code
        log = AlertWebhookDeliveryLog(
            id=uuid7(),
            webhook_id=webhook_id,
            alert_id=None,
            request_payload_json=json.dumps(test_payload),
            response_status_code=status_code,
            response_body=resp_text,
            is_success=is_success,
            duration_ms=duration_ms,
        )
        session.add(log)
        await session.commit()
    except Exception:
        pass

    message = (
        f"ارسال با موفقیت انجام شد (کد {status_code} در {duration_ms} میلی‌ثانیه)."
        if is_success
        else f"عدم موفقیت در تحویل وب‌هوک: {resp_text or 'پاسخ نامعتبر'}"
    )

    return AlertWebhookTestResult(
        webhook_id=webhook_id,
        is_success=is_success,
        status_code=status_code,
        message=message,
        duration_ms=duration_ms,
    )
