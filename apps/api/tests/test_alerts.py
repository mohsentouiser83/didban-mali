from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

from app.alerts.models import AlertCategory, AlertCode, AlertSeverity, AlertStatus
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
    AlertWebhookTestResult,
    EarlyWarningAlertItem,
)


def test_evaluate_runway_alert_levels() -> None:
    # Under 15 days is critical
    critical = evaluate_runway_alert(12)
    assert critical is not None
    assert critical["severity"] == AlertSeverity.CRITICAL
    assert critical["code"] == AlertCode.RUNWAY_CRITICAL
    assert critical["category"] == AlertCategory.LIQUIDITY

    # 16-30 days is warning
    warning = evaluate_runway_alert(25)
    assert warning is not None
    assert warning["severity"] == AlertSeverity.WARNING
    assert warning["code"] == AlertCode.RUNWAY_WARNING

    # > 30 days is safe
    safe = evaluate_runway_alert(45)
    assert safe is None


def test_evaluate_cash_gap_alert() -> None:
    gap = evaluate_cash_gap_alert(52)
    assert gap is not None
    assert gap["code"] == AlertCode.CASH_GAP_HIGH
    assert gap["category"] == AlertCategory.LIQUIDITY
    assert gap["current_value"] == Decimal(52)

    ok = evaluate_cash_gap_alert(30)
    assert ok is None


def test_evaluate_debtor_concentration_alert() -> None:
    # >= 50% is critical
    crit = evaluate_debtor_concentration_alert("شرکت آلفا", 52.4, Decimal("1000000000"))
    assert crit is not None
    assert crit["severity"] == AlertSeverity.CRITICAL
    assert crit["code"] == AlertCode.DEBTOR_CONCENTRATION

    # 35-49% is warning
    warn = evaluate_debtor_concentration_alert("شرکت بتا", 38.0, Decimal("800000000"))
    assert warn is not None
    assert warn["severity"] == AlertSeverity.WARNING

    # < 35% is safe
    safe = evaluate_debtor_concentration_alert("شرکت گاما", 20.0, Decimal("400000000"))
    assert safe is None


def test_evaluate_overdue_receivables_alert() -> None:
    hit = evaluate_overdue_receivables_alert(0.24, Decimal("600000000"))
    assert hit is not None
    assert hit["severity"] == AlertSeverity.CRITICAL
    assert hit["code"] == AlertCode.OVERDUE_RECEIVABLES_SURGE

    safe = evaluate_overdue_receivables_alert(0.12, Decimal("150000000"))
    assert safe is None


def test_evaluate_customer_credit_alert() -> None:
    hit = evaluate_customer_credit_alert(2, Decimal("1200000000"))
    assert hit is not None
    assert hit["severity"] == AlertSeverity.CRITICAL
    assert hit["code"] == AlertCode.CUSTOMER_CREDIT_ALERT
    assert hit["current_value"] == Decimal(2)

    safe = evaluate_customer_credit_alert(0, Decimal(0))
    assert safe is None


def test_evaluate_supplier_stoppage_alert() -> None:
    hit = evaluate_supplier_stoppage_alert(1, Decimal("350000000"))
    assert hit is not None
    assert hit["severity"] == AlertSeverity.CRITICAL
    assert hit["code"] == AlertCode.SUPPLIER_STOPPAGE_RISK
    assert hit["category"] == AlertCategory.SUPPLY_CHAIN

    safe = evaluate_supplier_stoppage_alert(0, Decimal(0))
    assert safe is None


def test_evaluate_payables_overdue_alert() -> None:
    hit = evaluate_payables_overdue_alert(0.35, Decimal("400000000"))
    assert hit is not None
    assert hit["severity"] == AlertSeverity.WARNING
    assert hit["code"] == AlertCode.PAYABLES_OVERDUE_SURGE

    safe = evaluate_payables_overdue_alert(0.18, Decimal("100000000"))
    assert safe is None


def test_alerts_schemas_serialization() -> None:
    now = datetime.now(UTC)
    alert = EarlyWarningAlertItem(
        id=uuid4(),
        company_id=uuid4(),
        code=AlertCode.RUNWAY_CRITICAL,
        category=AlertCategory.LIQUIDITY,
        severity=AlertSeverity.CRITICAL,
        title_fa="بحران نقدینگی",
        summary_fa="تاب‌آوری کمتر از ۱۵ روز",
        metric_key="runway_days",
        current_value=Decimal(11),
        threshold_value=Decimal(15),
        metric_unit="روز",
        suggested_action_fa="پیگیری فوری",
        target_route="/cashflow",
        status=AlertStatus.ACTIVE,
        triggered_at=now,
    )

    summary = AlertsSummaryResponse(
        total_active=1,
        critical_count=1,
        warning_count=0,
        info_count=0,
        liquidity_count=1,
        credit_risk_count=0,
        supply_chain_count=0,
        compliance_count=0,
        active_alerts=[alert],
    )
    assert summary.total_active == 1
    assert summary.critical_count == 1
    assert summary.active_alerts[0].code == AlertCode.RUNWAY_CRITICAL

    test_res = AlertWebhookTestResult(
        webhook_id=uuid4(),
        is_success=True,
        status_code=200,
        message="OK",
        duration_ms=45,
    )
    assert test_res.is_success is True
    assert test_res.duration_ms == 45
