"""Report Studio aggregation engine, AI template generator, and dashboard execution service."""

from datetime import date
from decimal import Decimal
from typing import Any
from uuid import uuid4

import jdatetime
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from . import system_report_templates as system_reports
from .cheque_models import Cheque
from .custom_reports.exports import export_custom_report_pdf
from .errors import DomainError, require
from .exports import localized
from .ingestion import normalized
from .native_invoice_models import NativeInvoiceSnapshot
from .native_reporting_models import NativeStatementRun
from .report_builder_models import SavedReportDefinition
from .report_studio_schemas import (
    StudioGlobalFilters,
    StudioLayoutSpec,
    StudioSaveDefinitionInput,
    StudioSectionSpec,
    StudioWidgetFilters,
    StudioWidgetSpec,
)
from .security import require_payroll_access
from .services import check_version, get_entity
from .workflow import audit


def _format_currency(val: Decimal | int | float | None, unit: str = "IRR") -> tuple[int, str]:
    if val is None:
        return 0, "—"
    dec = Decimal(str(val))
    if unit == "TOMAN":
        dec = (dec / Decimal("10")).quantize(Decimal("1"))
    int_val = int(dec)
    formatted = f"{int_val:,}".replace(",", "،")
    # Persian digits conversion
    persian_digits = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
    return int_val, formatted.translate(persian_digits)


def interpret(prompt: str, period_id: str, unit: str = "IRR") -> dict:
    """Interprets Persian natural language into a rich multi-section Studio layout."""
    text = normalized(prompt)
    global_filters = StudioGlobalFilters(period_id=period_id, unit=unit)

    # 1. Sales & Invoices focus
    if any(k in text for k in ("فروش", "فاکتور", "مشتری", "فروشگاه", "فاکتورها", "فروشنده")):
        sections = [
            StudioSectionSpec(
                id="sec-kpi-sales",
                title="شاخص‌های کلیدی فروش و وصول",
                description="وضعیت کلان فروش، مطالبات وصول‌نشده و فاکتورهای سررسیدگذشته",
                layout="grid-4",
                widgets=[
                    StudioWidgetSpec(
                        id="w-sales-total",
                        title="مجموع فروش دوره",
                        type="kpi_card",
                        entity="invoices",
                        metric="sales_total",
                        unit=unit,
                        color="primary",
                        filters=StudioWidgetFilters(direction="sales"),
                    ),
                    StudioWidgetSpec(
                        id="w-sales-unpaid",
                        title="مانده مطالبات فاکتوری",
                        type="kpi_card",
                        entity="invoices",
                        metric="sales_unpaid",
                        unit=unit,
                        color="amber",
                        filters=StudioWidgetFilters(direction="sales"),
                    ),
                    StudioWidgetSpec(
                        id="w-sales-overdue",
                        title="فاکتورهای سررسیدگذشته",
                        type="kpi_card",
                        entity="invoices",
                        metric="sales_overdue",
                        unit=unit,
                        color="rose",
                        filters=StudioWidgetFilters(direction="sales", overdue_only=True),
                    ),
                    StudioWidgetSpec(
                        id="w-sales-count",
                        title="تعداد کل فاکتورها",
                        type="kpi_card",
                        entity="invoices",
                        metric="invoice_count",
                        unit=unit,
                        color="emerald",
                        filters=StudioWidgetFilters(direction="sales"),
                    ),
                ],
            ),
            StudioSectionSpec(
                id="sec-sales-charts",
                title="روند و تحلیل طرف‌حساب‌های برتر",
                description="بررسی روند فروش در طول ماه‌ها و ۵ خریدار عمده",
                layout="grid-2",
                widgets=[
                    StudioWidgetSpec(
                        id="w-sales-trend",
                        title="روند ماهانه فروش",
                        type="line_chart",
                        entity="invoices",
                        metric="sales_total",
                        group_by="month",
                        unit=unit,
                        color="primary",
                        filters=StudioWidgetFilters(direction="sales"),
                    ),
                    StudioWidgetSpec(
                        id="w-top-customers",
                        title="۵ مشتری برتر بر اساس مبلغ",
                        type="bar_chart",
                        entity="invoices",
                        metric="sales_total",
                        group_by="party",
                        limit=5,
                        unit=unit,
                        color="emerald",
                        filters=StudioWidgetFilters(direction="sales"),
                    ),
                ],
            ),
            StudioSectionSpec(
                id="sec-sales-details",
                title="جزئیات فاکتورهای با اولویت وصول",
                layout="split-2-1",
                widgets=[
                    StudioWidgetSpec(
                        id="w-overdue-table",
                        title="لیست فاکتورهای سررسیدگذشته و در انتظار وصول",
                        type="data_table",
                        entity="invoices",
                        metric="sales_total",
                        limit=10,
                        unit=unit,
                        filters=StudioWidgetFilters(direction="sales", overdue_only=True),
                    ),
                    StudioWidgetSpec(
                        id="w-sales-ai",
                        title="تحلیل هوشمند وصول مطالبات",
                        type="ai_summary",
                        entity="invoices",
                        metric="sales_total",
                        unit=unit,
                    ),
                ],
            ),
        ]
        return StudioLayoutSpec(
            title="داشبورد جامع تحلیل فروش و مطالبات",
            description=f"بررسی عملکرد فروش و چرخه وصول بر اساس دستور «{prompt}»",
            global_filters=global_filters,
            sections=sections,
        ).model_dump()

    # 2. Profit & Loss / Expenses focus
    if any(k in text for k in ("سود", "زیان", "درآمد", "هزینه", "عملکرد مالی", "صورت مالی")):
        sections = [
            StudioSectionSpec(
                id="sec-pnl-kpis",
                title="شاخص‌های سود و زیان دفتری",
                layout="grid-4",
                widgets=[
                    StudioWidgetSpec(
                        id="w-pnl-revenue",
                        title="درآمد کل دفتر",
                        type="kpi_card",
                        entity="ledger",
                        metric="revenue",
                        unit=unit,
                        color="emerald",
                    ),
                    StudioWidgetSpec(
                        id="w-pnl-expense",
                        title="هزینه‌های عملیاتی",
                        type="kpi_card",
                        entity="ledger",
                        metric="expense",
                        unit=unit,
                        color="rose",
                    ),
                    StudioWidgetSpec(
                        id="w-pnl-profit",
                        title="سود ناخالص",
                        type="kpi_card",
                        entity="ledger",
                        metric="pre_tax_profit",
                        unit=unit,
                        color="primary",
                    ),
                    StudioWidgetSpec(
                        id="w-pnl-cash",
                        title="مانده نقدینگی و بانک",
                        type="kpi_card",
                        entity="ledger",
                        metric="cash",
                        unit=unit,
                        color="amber",
                    ),
                ],
            ),
            StudioSectionSpec(
                id="sec-pnl-breakdown",
                title="روند درآمد و ترکیب هزینه‌ها",
                layout="grid-2",
                widgets=[
                    StudioWidgetSpec(
                        id="w-revenue-expense-trend",
                        title="مقایسه درآمد و هزینه در طول دوره",
                        type="bar_chart",
                        entity="ledger",
                        metric="revenue_vs_expense",
                        group_by="month",
                        unit=unit,
                        color="primary",
                    ),
                    StudioWidgetSpec(
                        id="w-expense-donut",
                        title="سهم گروه‌های اصلی هزینه",
                        type="donut_chart",
                        entity="ledger",
                        metric="expense",
                        group_by="category",
                        unit=unit,
                    ),
                ],
            ),
            StudioSectionSpec(
                id="sec-pnl-summary",
                title="تحلیل هوش مصنوعی سودآوری",
                layout="grid-1",
                widgets=[
                    StudioWidgetSpec(
                        id="w-pnl-ai",
                        title="خلاصه تحلیل مدیریتی حاشیه سود",
                        type="ai_summary",
                        entity="ledger",
                        metric="pre_tax_profit",
                        unit=unit,
                    ),
                ],
            ),
        ]
        return StudioLayoutSpec(
            title="گزارش جامع سود و زیان و عملکرد مالی",
            description=f"تحلیل درآمد، هزینه‌ها و حاشیه سود مطابق درخواست «{prompt}»",
            global_filters=global_filters,
            sections=sections,
        ).model_dump()

    # 3. Treasury / Cheques / Cashflow focus
    if any(k in text for k in ("نقد", "بانک", "چک", "خزانه", "جریان نقد", "نقدینگی", "صیاد")):
        sections = [
            StudioSectionSpec(
                id="sec-treasury-kpis",
                title="شاخص‌های نقدینگی و خزانه",
                layout="grid-4",
                widgets=[
                    StudioWidgetSpec(
                        id="w-tr-cash",
                        title="مانده حساب‌های بانکی",
                        type="kpi_card",
                        entity="ledger",
                        metric="cash",
                        unit=unit,
                        color="emerald",
                    ),
                    StudioWidgetSpec(
                        id="w-tr-in-cheques",
                        title="چک‌های دریافتنی در جریان",
                        type="kpi_card",
                        entity="cheques",
                        metric="cheques_in_transit",
                        unit=unit,
                        color="primary",
                        filters=StudioWidgetFilters(direction="sales"),
                    ),
                    StudioWidgetSpec(
                        id="w-tr-out-cheques",
                        title="چک‌های پرداختنی نزد دیگران",
                        type="kpi_card",
                        entity="cheques",
                        metric="cheques_payable",
                        unit=unit,
                        color="amber",
                        filters=StudioWidgetFilters(direction="purchases"),
                    ),
                    StudioWidgetSpec(
                        id="w-tr-bounced",
                        title="چک‌های برگشتی",
                        type="kpi_card",
                        entity="cheques",
                        metric="cheques_bounced",
                        unit=unit,
                        color="rose",
                    ),
                ],
            ),
            StudioSectionSpec(
                id="sec-cheque-breakdown",
                title="سررسید چک‌ها و جریان وجوه نقد",
                layout="grid-2",
                widgets=[
                    StudioWidgetSpec(
                        id="w-cheques-maturity",
                        title="سررسید چک‌های دریافتنی و پرداختنی ماهانه",
                        type="bar_chart",
                        entity="cheques",
                        metric="cheques_maturity",
                        group_by="month",
                        unit=unit,
                    ),
                    StudioWidgetSpec(
                        id="w-cash-flow-trend",
                        title="روند مانده نقدینگی بانک‌ها",
                        type="line_chart",
                        entity="ledger",
                        metric="cash",
                        group_by="month",
                        unit=unit,
                        color="emerald",
                    ),
                ],
            ),
            StudioSectionSpec(
                id="sec-cheques-list",
                title="اسناد دریافتنی و پرداختنی با اولویت بالا",
                layout="grid-1",
                widgets=[
                    StudioWidgetSpec(
                        id="w-cheques-table",
                        title="فهرست چک‌های نزدیک به سررسید",
                        type="data_table",
                        entity="cheques",
                        metric="cheques_in_transit",
                        limit=10,
                        unit=unit,
                    ),
                ],
            ),
        ]
        return StudioLayoutSpec(
            title="داشبورد نقدینگی، بانک و اسناد تجاری",
            description=f"وضعیت اسناد دریافتنی، پرداختنی و مانده‌های بانکی برای «{prompt}»",
            global_filters=global_filters,
            sections=sections,
        ).model_dump()

    # 4. Default Balanced Executive Dashboard
    sections = [
        StudioSectionSpec(
            id="sec-exec-overview",
            title="نمای کلان مالی شرکت",
            description="مهم‌ترین شاخص‌های مالی و عملیاتی دوره جاری",
            layout="grid-4",
            widgets=[
                StudioWidgetSpec(
                    id="w-exec-revenue",
                    title="درآمد دوره",
                    type="kpi_card",
                    entity="ledger",
                    metric="revenue",
                    unit=unit,
                    color="emerald",
                ),
                StudioWidgetSpec(
                    id="w-exec-expense",
                    title="هزینه‌های جاری",
                    type="kpi_card",
                    entity="ledger",
                    metric="expense",
                    unit=unit,
                    color="rose",
                ),
                StudioWidgetSpec(
                    id="w-exec-cash",
                    title="موجودی نقد و بانک",
                    type="kpi_card",
                    entity="ledger",
                    metric="cash",
                    unit=unit,
                    color="primary",
                ),
                StudioWidgetSpec(
                    id="w-exec-ar",
                    title="کل مطالبات تجاری",
                    type="kpi_card",
                    entity="ledger",
                    metric="ar_ledger",
                    unit=unit,
                    color="amber",
                ),
            ],
        ),
        StudioSectionSpec(
            id="sec-exec-trends",
            title="روندهای زمانی و سهم هزینه‌ها",
            layout="grid-2",
            widgets=[
                StudioWidgetSpec(
                    id="w-exec-trend",
                    title="روند درآمد و هزینه در طول دوره",
                    type="line_chart",
                    entity="ledger",
                    metric="revenue_vs_expense",
                    group_by="month",
                    unit=unit,
                    color="primary",
                ),
                StudioWidgetSpec(
                    id="w-exec-expenses-pie",
                    title="ترکیب هزینه‌های دوره",
                    type="donut_chart",
                    entity="ledger",
                    metric="expense",
                    group_by="category",
                    unit=unit,
                ),
            ],
        ),
        StudioSectionSpec(
            id="sec-exec-bottom",
            title="طرف‌حساب‌های برتر و تحلیل مدیریتی",
            layout="split-2-1",
            widgets=[
                StudioWidgetSpec(
                    id="w-exec-top-parties",
                    title="۵ بدهکار عمده شرکت",
                    type="bar_chart",
                    entity="invoices",
                    metric="sales_unpaid",
                    group_by="party",
                    limit=5,
                    unit=unit,
                    color="amber",
                ),
                StudioWidgetSpec(
                    id="w-exec-ai",
                    title="ارزیابی هوشمند سلامت مالی",
                    type="ai_summary",
                    entity="ledger",
                    metric="revenue",
                    unit=unit,
                ),
            ],
        ),
    ]
    return StudioLayoutSpec(
        title=f"داشبورد تحلیلی: {prompt}" if prompt else "داشبورد جامع مدیریت مالی",
        description="ترکیب متوازن از شاخص‌های درآمدی، نقدینگی، مطالبات و هزینه‌ها",
        global_filters=global_filters,
        sections=sections,
    ).model_dump()


def _get_company_invoices(db: Session, company_id: str, period: m.Period) -> list[dict]:
    """Extracts all invoice records from NativeInvoiceSnapshot or ResultManifest."""
    # Try NativeInvoiceSnapshot first
    snap = db.scalar(
        select(NativeInvoiceSnapshot)
        .where(
            NativeInvoiceSnapshot.company_id == company_id,
            NativeInvoiceSnapshot.as_of >= period.start,
            NativeInvoiceSnapshot.as_of <= period.end,
        )
        .order_by(NativeInvoiceSnapshot.created_at.desc())
        .limit(1)
    )
    if snap and snap.payload:
        from .native_invoice_exports import invoice_rows

        return invoice_rows(snap.payload)

    # Fallback to ResultManifest
    manifest = db.scalar(
        select(m.ResultManifest)
        .where(m.ResultManifest.company_id == company_id, m.ResultManifest.period_id == period.id)
        .order_by(m.ResultManifest.created_at.desc())
        .limit(1)
    )
    if manifest and manifest.details and isinstance(manifest.details.get("invoices"), list):
        return manifest.details["invoices"]

    return []


def _get_company_ledger_metrics(db: Session, company_id: str, period: m.Period) -> dict[str, Any]:
    """Returns ledger metrics dictionary (cash, revenue, expense, pre_tax_profit, ar, ap)."""
    # Try NativeStatementRun
    native_run = db.scalar(
        select(NativeStatementRun)
        .where(
            NativeStatementRun.company_id == company_id,
            NativeStatementRun.snapshot["period_id"].as_string() == period.id,
        )
        .order_by(NativeStatementRun.created_at.desc())
        .limit(1)
    )
    if native_run and native_run.snapshot:
        from .native_assistant_service import native_context

        metrics_list = native_context(native_run).get("metrics", [])
        return {item["metric_key"]: item for item in metrics_list}

    # Fallback to ResultManifest
    manifest = db.scalar(
        select(m.ResultManifest)
        .where(m.ResultManifest.company_id == company_id, m.ResultManifest.period_id == period.id)
        .order_by(m.ResultManifest.created_at.desc())
        .limit(1)
    )
    if manifest and manifest.metrics:
        return {item["metric_key"]: item for item in manifest.metrics}

    return {}


def _unavailable_kpi(reason: str) -> dict:
    return {"value": None, "formatted_value": "—", "status": "unavailable", "subtitle": reason}


def _layout_uses_payroll(spec: StudioLayoutSpec | dict | None) -> bool:
    if spec is None:
        return False
    sections = spec.sections if isinstance(spec, StudioLayoutSpec) else spec.get("sections", [])
    if not isinstance(sections, list):
        return False
    for section in sections:
        sec_basis = section.basis if isinstance(section, StudioSectionSpec) else section.get("basis")
        if sec_basis == "payroll":
            return True
        widgets = section.widgets if isinstance(section, StudioSectionSpec) else section.get("widgets", [])
        if not isinstance(widgets, list):
            continue
        for widget in widgets:
            entity = widget.entity if isinstance(widget, StudioWidgetSpec) else widget.get("entity")
            metric = widget.metric if isinstance(widget, StudioWidgetSpec) else widget.get("metric")
            if entity == "payroll" or metric == "imported_payroll":
                return True
    return False


def _require_payroll_if_needed(
    db: Session,
    company_id: str,
    actor: m.User | None,
    *payloads: StudioLayoutSpec | dict | None,
) -> None:
    uses_payroll = False
    for payload in payloads:
        if payload is None:
            continue
        if isinstance(payload, StudioLayoutSpec):
            if _layout_uses_payroll(payload):
                uses_payroll = True
                break
        elif isinstance(payload, dict):
            candidates = (
                payload,
                payload.get("studio_spec"),
                payload.get("spec"),
                payload.get("dashboard"),
                payload.get("dashboard_snapshot", {}).get("spec")
                if isinstance(payload.get("dashboard_snapshot"), dict)
                else None,
                payload.get("dashboard_snapshot", {}).get("dashboard")
                if isinstance(payload.get("dashboard_snapshot"), dict)
                else None,
            )
            if any(_layout_uses_payroll(item) for item in candidates if item is not None):
                uses_payroll = True
                break
    if uses_payroll:
        require(
            actor is not None,
            "payroll_access_required",
            "مجوز مشاهده یا مدیریت اطلاعات حقوق و دستمزد را ندارید.",
            403,
        )
        assert actor is not None
        require_payroll_access(db, company_id, actor)


def _evaluate_widget(
    db: Session,
    company_id: str,
    period: m.Period,
    widget: StudioWidgetSpec,
    global_filters: StudioGlobalFilters,
    invoices: list[dict],
    ledger_metrics: dict[str, Any],
    section_basis: str = "all",
    *,
    actor: m.User | None = None,
) -> dict:
    unit = widget.unit or global_filters.unit
    w_type = widget.type
    entity = widget.entity
    metric = widget.metric
    limit = widget.limit or 8
    filters = widget.filters

    if entity == "payroll" or metric == "imported_payroll" or section_basis == "payroll":
        require(
            actor is not None,
            "payroll_access_required",
            "مجوز مشاهده یا مدیریت اطلاعات حقوق و دستمزد را ندارید.",
            403,
        )
        assert actor is not None
        require_payroll_access(db, company_id, actor)

    if metric in system_reports.TABLE_METRICS:
        expected_basis = "bank" if metric == "daily_cash" else "payroll" if metric == "imported_payroll" else "ledger"
        require(section_basis in {"all", expected_basis}, "system_report_basis", "مبنای بخش با منبع جدول سازگار نیست.")
        require(w_type == "data_table", "system_report_widget_type", "این منبع باید در جدول نمایش داده شود.")
        return system_reports.evaluate_table(db, company_id, period, widget, global_filters, actor=actor)

    # 1. KPI CARD WIDGET
    if w_type == "kpi_card":
        value = 0
        subtitle = ""
        status = "normal"
        trend_percent = None

        if entity == "invoices":
            if not invoices:
                return _unavailable_kpi("ردیف فاکتور معتبر برای این دوره موجود نیست.")
            sales = [inv for inv in invoices if inv.get("direction") in ("sale", "sales")]
            if metric in {"sales_unpaid", "sales_overdue"} and any(inv.get("remaining") is None for inv in sales):
                return _unavailable_kpi("ماندهٔ برخی فاکتورها مشخص نیست.")
            if metric == "sales_overdue" and any(
                inv.get("overdue") is None and Decimal(str(inv["remaining"])) > 0 for inv in sales
            ):
                return _unavailable_kpi("سررسید برخی فاکتورهای باز مشخص نیست.")
            filtered = [
                inv
                for inv in invoices
                if (
                    filters.direction == "all"
                    or inv.get("direction")
                    == (
                        "sale"
                        if filters.direction == "sales"
                        else "purchase"
                        if filters.direction == "purchases"
                        else filters.direction
                    )
                )
            ]
            if metric == "sales_total":
                if any(inv.get("amount") is None for inv in sales):
                    return _unavailable_kpi("مبلغ برخی فاکتورهای فروش مشخص نیست.")
                value = sum(Decimal(str(inv.get("amount") or 0)) for inv in sales)
                subtitle = "مجموع فاکتورهای فروش تأییدشده"
                status = "positive"
            elif metric == "sales_unpaid":
                value = sum(Decimal(str(inv.get("remaining") or 0)) for inv in sales)
                subtitle = "مانده در انتظار دریافت از خریداران"
                status = "warning"
            elif metric == "sales_overdue":
                overdue = [
                    inv
                    for inv in invoices
                    if inv.get("direction") in ("sale", "sales") and inv.get("overdue")
                ]
                value = sum(Decimal(str(inv.get("remaining") or 0)) for inv in overdue)
                subtitle = f"{len(overdue)} فاکتور با تأخیر در پرداخت"
                status = "danger" if value > 0 else "positive"
            elif metric == "invoice_count":
                value = len(filtered)
                int_val = int(value)
                return {
                    "value": int_val,
                    "formatted_value": f"{int_val:,}".translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")),
                    "unit": "عدد",
                    "status": "normal",
                    "subtitle": "تعداد فاکتورهای ثبتی",
                    "trend_percent": None,
                }
            else:
                if any(inv.get("amount") is None for inv in filtered):
                    return _unavailable_kpi("مبلغ برخی فاکتورها مشخص نیست.")
                value = sum(Decimal(str(inv["amount"])) for inv in filtered)
                subtitle = "مجموع مبالغ"

        elif entity == "ledger":
            key_map = {
                "revenue": "revenue",
                "expense": "expense",
                "pre_tax_profit": "pre_tax_profit",
                "net_profit": "net_profit",
                "cash": "cash",
                "ar_ledger": "ar_ledger",
                "ap_trade_ledger": "ap_trade_ledger",
            }
            mapped_key = key_map.get(metric, metric)
            m_data = ledger_metrics.get(mapped_key, {})
            raw_val = m_data.get("value")
            if raw_val is None:
                return _unavailable_kpi(m_data.get("reason") or "دادهٔ معتبر برای این شاخص موجود نیست.")
            value = Decimal(str(raw_val))
            subtitle = m_data.get("label") or "شاخص دفتری"
            status = (
                "positive"
                if value > 0 and mapped_key != "expense"
                else "danger"
                if mapped_key == "expense" and value > 0
                else "normal"
            )

        elif entity == "cheques":
            # Query cheques
            cheques = db.scalars(select(Cheque).where(Cheque.company_id == company_id)).all()
            if metric == "cheques_in_transit":
                in_ch = [
                    c for c in cheques if c.direction == "sales" and c.state in ("in_transit", "registered")
                ]
                value = sum(Decimal(str(c.amount or 0)) for c in in_ch)
                subtitle = f"{len(in_ch)} فقره چک دریافتنی نزد بانک"
                status = "positive"
            elif metric == "cheques_payable":
                out_ch = [
                    c
                    for c in cheques
                    if c.direction == "purchases" and c.state in ("in_transit", "registered")
                ]
                value = sum(Decimal(str(c.amount or 0)) for c in out_ch)
                subtitle = f"{len(out_ch)} فقره چک صادره در انتظار پاس"
                status = "warning"
            elif metric == "cheques_bounced":
                bounced = [c for c in cheques if c.state == "bounced"]
                value = sum(Decimal(str(c.amount or 0)) for c in bounced)
                subtitle = f"{len(bounced)} فقره چک برگشتی"
                status = "danger" if value > 0 else "positive"

        if entity == "ledger" and m_data.get("unit") not in (None, "IRR", "TOMAN"):
            return {
                "value": m_data["value"],
                "formatted_value": localized(m_data["value"], amount=True),
                "unit": m_data["unit"],
                "subtitle": subtitle,
                "status": status,
            }
        precise = Decimal(str(value))
        if unit == "TOMAN":
            precise /= Decimal(10)
        display_value = int(precise) if precise == precise.to_integral_value() else format(precise, "f")
        formatted = localized(display_value, amount=True)
        return {
            "value": display_value,
            "formatted_value": formatted,
            "unit": "تومان" if unit == "TOMAN" else "ریال",
            "subtitle": subtitle,
            "status": status,
            "trend_percent": trend_percent,
        }

    # 2. LINE / BAR CHARTS
    if w_type in ("line_chart", "bar_chart"):
        chart_data = []

        if entity == "invoices" and widget.group_by == "party":
            # Group invoices by party
            party_totals: dict[str, Decimal] = {}
            for inv in invoices:
                p_name = inv.get("party_id") or "نامشخص"
                amt = Decimal(str(inv.get("amount") or 0))
                party_totals[p_name] = party_totals.get(p_name, Decimal("0")) + amt
            sorted_parties = sorted(party_totals.items(), key=lambda x: x[1], reverse=True)[:limit]
            for p_name, total in sorted_parties:
                int_v, _ = _format_currency(total, unit)
                chart_data.append({"name": p_name, "مبلغ": int_v})
            return chart_data

        if entity == "invoices" and widget.group_by == "month":
            month_totals: dict[tuple[int, int], Decimal] = {}
            for invoice in invoices:
                if invoice.get("direction") not in ("sale", "sales"):
                    continue
                try:
                    invoice_date = date.fromisoformat(invoice.get("date") or "")
                except ValueError:
                    return []
                if invoice.get("amount") is None:
                    return []
                jalali = jdatetime.date.fromgregorian(date=invoice_date)
                month_key = (jalali.year, jalali.month)
                month_totals[month_key] = month_totals.get(month_key, Decimal(0)) + Decimal(
                    str(invoice["amount"])
                )
            return [
                {"name": localized(f"{year}/{month:02}"), "فروش": _format_currency(total, unit)[0]}
                for (year, month), total in sorted(month_totals.items())
            ]

        return chart_data

    # 3. DONUT / PIE CHARTS
    if w_type == "donut_chart":
        donut_data = []
        if entity == "invoices":
            sales_amt = sum(
                Decimal(str(inv.get("amount") or 0))
                for inv in invoices
                if inv.get("direction") in ("sale", "sales")
            )
            purch_amt = sum(
                Decimal(str(inv.get("amount") or 0))
                for inv in invoices
                if inv.get("direction") in ("purchase", "purchases")
            )
            s_val, _ = _format_currency(sales_amt, unit)
            p_val, _ = _format_currency(purch_amt, unit)
            total = (s_val + p_val) or 1
            return [
                {
                    "name": "فروش",
                    "value": s_val,
                    "color": "#5556DE",
                    "percentage": int((s_val / total) * 100),
                },
                {
                    "name": "خرید",
                    "value": p_val,
                    "color": "#F59E0B",
                    "percentage": int((p_val / total) * 100),
                },
            ]

        return donut_data

    # 4. DATA TABLE
    if w_type == "data_table":
        if entity == "invoices":
            filtered = [inv for inv in invoices if not filters.overdue_only or inv.get("overdue")][:limit]
            columns = [
                {"key": "reference", "label": "شماره فاکتور"},
                {"key": "party_id", "label": "طرف حساب"},
                {"key": "date", "label": "تاریخ فاکتور"},
                {"key": "due_date", "label": "سررسید"},
                {"key": "amount", "label": "مبلغ کل"},
                {"key": "remaining", "label": "مانده وصول‌نشده"},
                {"key": "status", "label": "وضعیت"},
            ]
            rows = []
            for inv in filtered:
                _, amt_str = _format_currency(inv.get("amount"), unit)
                _, rem_str = _format_currency(inv.get("remaining"), unit)
                rows.append(
                    {
                        "id": inv.get("reference") or str(uuid4()),
                        "reference": inv.get("reference") or "—",
                        "party_id": inv.get("party_id") or "نامشخص",
                        "date": inv.get("date") or "—",
                        "due_date": inv.get("due_date") or "—",
                        "amount": f"{amt_str} {unit}",
                        "remaining": f"{rem_str} {unit}",
                        "status": "سررسیدگذشته" if inv.get("overdue") else "در جریان",
                    }
                )
            return {"columns": columns, "rows": rows, "total_count": len(filtered)}

        if entity == "cheques":
            cheques = db.scalars(select(Cheque).where(Cheque.company_id == company_id).limit(limit)).all()
            columns = [
                {"key": "number", "label": "شماره صیادی"},
                {"key": "party_id", "label": "طرف حساب"},
                {"key": "bank_name", "label": "بانک"},
                {"key": "due_date", "label": "سررسید"},
                {"key": "amount", "label": "مبلغ چک"},
                {"key": "state", "label": "وضعیت"},
            ]
            rows = []
            for ch in cheques:
                _, ch_amt = _format_currency(ch.amount, unit)
                state_fa = {"in_transit": "در جریان", "cleared": "وصول‌شده", "bounced": "برگشتی"}.get(
                    ch.state, ch.state
                )
                rows.append(
                    {
                        "id": ch.id,
                        "number": ch.number,
                        "party_id": ch.party_id or "—",
                        "bank_name": ch.bank_name or "—",
                        "due_date": str(ch.due_date),
                        "amount": f"{ch_amt} {unit}",
                        "state": state_fa,
                    }
                )
            return {"columns": columns, "rows": rows, "total_count": len(rows)}

        return {"columns": [], "rows": [], "total_count": 0}

    # 5. AI SUMMARY WIDGET
    if w_type == "ai_summary":
        labels = {
            "revenue": "درآمد ناخالص",
            "expense": "هزینه‌های عملیاتی",
            "cash": "ماندهٔ نقد",
            "pre_tax_profit": "سود پیش از مالیات",
        }
        highlights = []
        missing = []
        for key, label in labels.items():
            value = ledger_metrics.get(key, {}).get("value")
            if value is None:
                missing.append(label)
            else:
                highlights.append(f"{label} {_format_currency(value, unit)[1]} {unit}")
        insight = (
            f"دادهٔ معتبر برای {'، '.join(missing)} موجود نیست."
            if missing
            else " · ".join(highlights[:2])
        )
        sentiment = "caution" if missing else "neutral"
        return {
            "insight": insight,
            "highlights": highlights,
            "sentiment": sentiment,
        }

    return {}


def preview(
    db: Session,
    company_id: str,
    spec: StudioLayoutSpec,
    *,
    manifest: m.ResultManifest | None = None,
    live_actor: m.User | None = None,
    actor: m.User | None = None,
) -> dict:
    """Renders the entire Studio Layout by computing all section and widget data."""
    effective_actor = actor or live_actor
    _require_payroll_if_needed(db, company_id, effective_actor, spec)
    period = None
    if spec.global_filters.period_id and spec.global_filters.period_id != "default-period":
        period = db.scalar(
            select(m.Period).where(
                m.Period.company_id == company_id,
                m.Period.id == spec.global_filters.period_id,
            )
        )
        require(period is not None, "studio_period_not_found", "دورهٔ مالی انتخاب‌شده یافت نشد.", 404)
    else:
        period = db.scalar(
            select(m.Period)
            .where(m.Period.company_id == company_id)
            .order_by(m.Period.created_at.desc())
            .limit(1)
        )

    company = db.get(m.Company, company_id)
    company_name = company.name if company else company_id

    if not period:
        return {
            "title": spec.title,
            "description": spec.description,
            "period_title": "بدون دوره مالی",
            "company_name": company_name,
            "rendered_at": m.now().isoformat(),
            "sections": [
                {
                    "id": section.id,
                    "title": section.title,
                    "description": section.description,
                    "layout": section.layout,
                    "widgets": [
                        {
                            "id": widget.id,
                            "title": widget.title,
                            "type": widget.type,
                            "entity": widget.entity,
                            "metric": widget.metric,
                            "group_by": widget.group_by,
                            "filters": widget.filters.model_dump(),
                            "limit": widget.limit,
                            "unit": widget.unit or spec.global_filters.unit,
                            "color": widget.color or "primary",
                            "col_span": getattr(widget, "col_span", None) or (3 if widget.type == "kpi_card" else 6 if "chart" in widget.type else 12),
                            "data": {},
                        }
                        for widget in section.widgets
                    ],
                }
                for section in spec.sections
            ],
        }

    basis = "منابع ویجت‌ها"
    as_of = period.end.isoformat()
    if manifest is not None:
        invoices = (manifest.details or {}).get("invoices") or []
        ledger_metrics = {item["metric_key"]: item for item in (manifest.metrics or [])}
        basis = "گزارش ذخیره‌شده"
        as_of = manifest.created_at.isoformat()
    elif live_actor is not None:
        invoices, ledger_metrics, basis, as_of = _live_data(db, company_id, live_actor, period)
    else:
        invoices = _get_company_invoices(db, company_id, period)
        ledger_metrics = _get_company_ledger_metrics(db, company_id, period)

    rendered_sections = []
    for section in spec.sections:
        sec_basis = getattr(section, "basis", "all")
        rendered_widgets = []
        for widget in section.widgets:
            data = _evaluate_widget(
                db=db,
                company_id=company_id,
                period=period,
                widget=widget,
                global_filters=spec.global_filters,
                invoices=invoices,
                ledger_metrics=ledger_metrics,
                section_basis=sec_basis,
                actor=effective_actor,
            )
            rendered_widgets.append(
                {
                    "id": widget.id,
                    "title": widget.title,
                    "type": widget.type,
                    "entity": widget.entity,
                    "metric": widget.metric,
                    "group_by": widget.group_by,
                    "filters": widget.filters.model_dump(),
                    "limit": widget.limit,
                    "unit": widget.unit or spec.global_filters.unit,
                    "color": widget.color or "primary",
                    "col_span": getattr(widget, "col_span", None) or (3 if widget.type == "kpi_card" else 6 if "chart" in widget.type else 12),
                    "data": data,
                }
            )

        rendered_sections.append(
            {
                "id": section.id,
                "title": section.title,
                "description": section.description,
                "layout": section.layout,
                "basis": sec_basis,
                "widgets": rendered_widgets,
            }
        )

    return {
        "title": spec.title,
        "description": spec.description,
        "company_name": company_name,
        "period": {
            "id": period.id,
            "name": period.name,
            "start": str(period.start),
            "end": str(period.end),
        },
        "global_filters": spec.global_filters.model_dump(),
        "basis_label": basis,
        "as_of": as_of,
        "sections": rendered_sections,
    }


def _live_data(db: Session, company: str, actor: m.User, period: m.Period) -> tuple:
    from .accounting_setup_models import CompanyAccountingSetup
    from .native_assistant_service import CORE_METRICS
    from .native_invoice_evidence import _today
    from .native_invoice_exports import invoice_rows
    from .native_invoice_service import current
    from .native_reporting_reasons import REASONS
    from .native_reporting_service import build_statement

    cutoff = min(period.end, _today(db, company))
    setup = db.get(CompanyAccountingSetup, company)
    if setup is not None and setup.mode == "primary":
        require(cutoff >= period.start, "studio_period_in_future", "دورهٔ مالی هنوز شروع نشده است.")
        statement = build_statement(db, company, actor, period.id, cutoff)
        source = {metric["metric_key"]: metric for metric in statement["metrics"]}
        metrics = {}
        for source_key, key, label in CORE_METRICS:
            metric = source.get(source_key, {})
            metrics[key] = metric | {
                "label": label,
                "reason": "، ".join(REASONS.get(code, code) for code in metric.get("reason_codes", [])),
            }
        invoices = [
            row for row in invoice_rows(current(db, company, actor, cutoff))
            if row.get("date") and row["date"] >= period.start.isoformat()
        ]
        return invoices, metrics, "دفتر و فاکتورهای بومی", cutoff.isoformat()
    manifest = db.scalar(
        select(m.ResultManifest)
        .where(m.ResultManifest.company_id == company, m.ResultManifest.period_id == period.id)
        .order_by(m.ResultManifest.created_at.desc(), m.ResultManifest.id.desc())
        .limit(1)
    )
    if manifest is None:
        return [], {}, "ورودی پردازش‌شده", cutoff.isoformat()
    return (
        (manifest.details or {}).get("invoices") or [],
        {item["metric_key"]: item for item in (manifest.metrics or [])},
        "آخرین ورودی پردازش‌شده",
        manifest.created_at.isoformat(),
    )


def save(
    db: Session,
    company_id: str,
    user: m.User,
    data: StudioSaveDefinitionInput,
    definition_id: str | None = None,
    expected_version: int | None = None,
    *,
    dashboard_mode: str = "fixed",
    manifest: m.ResultManifest | None = None,
) -> dict:
    """Saves or updates a Studio Dashboard definition."""
    layout_dict = data.spec.model_dump()
    is_dashboard = bool(getattr(data, "is_dashboard", False))

    if definition_id:
        definition = db.scalar(select(SavedReportDefinition).where(
            SavedReportDefinition.company_id == company_id, SavedReportDefinition.id == definition_id,
        ))
        system_key = system_reports.template_key(company_id, definition_id)
        if definition is None and system_key:
            require(expected_version == 1, "version_conflict", "قالب تغییر کرده است؛ دوباره بارگذاری کنید.", 409)
            definition = SavedReportDefinition(id=definition_id, company_id=company_id,
                name=data.name, spec={}, actor_id=user.id, version=1)
            db.add(definition)
        if definition is None:
            definition = get_entity(db, SavedReportDefinition, company_id, definition_id)
        check_version(definition, expected_version)
        definition.name = data.name
        if getattr(data, "is_dashboard", None) is None and isinstance(definition.spec, dict):
            is_dashboard = bool(definition.spec.get("is_dashboard"))

        spec_payload = {
            "layout_kind": "studio",
            "studio_spec": layout_dict,
            "is_dashboard": is_dashboard,
        }
        if system_key:
            spec_payload["system_key"] = system_key
        if is_dashboard and definition.spec.get("is_dashboard"):
            for key in ("dashboard_mode", "dashboard_snapshot"):
                if key in definition.spec:
                    spec_payload[key] = definition.spec[key]
        definition.spec = spec_payload
        definition.version += 1
    else:
        spec_payload = {
            "layout_kind": "studio",
            "studio_spec": layout_dict,
            "is_dashboard": is_dashboard,
        }
        definition = SavedReportDefinition(
            company_id=company_id,
            name=data.name,
            spec=spec_payload,
            actor_id=user.id,
        )
        db.add(definition)

    db.flush()
    if is_dashboard:
        if "dashboard_mode" not in definition.spec:
            _configure_dashboard(db, company_id, definition, dashboard_mode, manifest, actor=user)
        all_defs = db.scalars(
            select(SavedReportDefinition).where(
                SavedReportDefinition.company_id == company_id,
                SavedReportDefinition.id != definition.id,
            )
        ).all()
        for d in all_defs:
            if isinstance(d.spec, dict) and d.spec.get("is_dashboard"):
                updated = dict(d.spec)
                updated["is_dashboard"] = False
                d.spec = updated
        db.flush()
    audit(
        db,
        company_id,
        user.id,
        "report_studio.definition_saved",
        definition.id,
        {"version": definition.version, "name": definition.name, "is_dashboard": is_dashboard},
    )
    return {
        "id": definition.id,
        "name": definition.name,
        "version": definition.version,
        "system_key": definition.spec.get("system_key"),
        "can_delete": False,
        "is_dashboard": is_dashboard,
        "spec": data.spec.model_dump(),
    }


def list_definitions(db: Session, company_id: str) -> list[dict]:
    """Lists saved Studio dashboard templates."""
    definitions = db.scalars(
        select(SavedReportDefinition)
        .where(SavedReportDefinition.company_id == company_id)
        .order_by(SavedReportDefinition.created_at.desc())
    ).all()

    results = []
    for d in definitions:
        if isinstance(d.spec, dict) and d.spec.get("layout_kind") == "studio":
            results.append(
                {
                    "id": d.id,
                    "name": d.name,
                    "version": d.version,
                    "system_key": d.spec.get("system_key"),
                    "can_delete": False,
                    "created_at": d.created_at.isoformat() if d.created_at else None,
                    "spec": d.spec.get("studio_spec"),
                    "is_dashboard": bool(d.spec.get("is_dashboard")),
                }
            )
    existing = {row["id"] for row in results}
    return [row for row in system_reports.definitions(company_id) if row["id"] not in existing] + results


def get_definition(db: Session, company_id: str, definition_id: str) -> dict:
    """Retrieves a single saved Studio dashboard template."""
    for definition in list_definitions(db, company_id):
        if definition["id"] == definition_id:
            return definition
    definition = get_entity(db, SavedReportDefinition, company_id, definition_id)
    studio_spec = definition.spec.get("studio_spec") if isinstance(definition.spec, dict) else None
    return {
        "id": definition.id,
        "name": definition.name,
        "version": definition.version,
        "created_at": definition.created_at.isoformat() if definition.created_at else None,
        "spec": studio_spec,
        "is_dashboard": bool(definition.spec.get("is_dashboard")) if isinstance(definition.spec, dict) else False,
    }


def set_active_dashboard(
    db: Session,
    company_id: str,
    user: m.User,
    definition_id: str,
    *,
    mode: str = "fixed",
) -> dict:
    """Designates a saved report definition as the company's active dashboard."""
    definition = get_entity(db, SavedReportDefinition, company_id, definition_id)
    require(isinstance(definition.spec, dict), "invalid_spec", "تعریف گزارش معتبر نیست.")

    all_defs = db.scalars(
        select(SavedReportDefinition).where(SavedReportDefinition.company_id == company_id)
    ).all()
    for d in all_defs:
        if isinstance(d.spec, dict) and d.spec.get("is_dashboard"):
            updated = dict(d.spec)
            updated["is_dashboard"] = False
            d.spec = updated

    _configure_dashboard(db, company_id, definition, mode, actor=user)
    definition.version += 1
    db.flush()

    audit(
        db,
        company_id,
        user.id,
        "report_studio.set_active_dashboard",
        definition.id,
        {"name": definition.name, "version": definition.version, "mode": mode},
    )
    return {
        "id": definition.id,
        "name": definition.name,
        "is_dashboard": True,
        "version": definition.version,
    }


def reset_active_dashboard(
    db: Session,
    company_id: str,
    user: m.User,
) -> dict:
    """Resets company dashboard back to the standard Didban financial dashboard."""
    all_defs = db.scalars(
        select(SavedReportDefinition).where(SavedReportDefinition.company_id == company_id)
    ).all()
    for d in all_defs:
        if isinstance(d.spec, dict) and d.spec.get("is_dashboard"):
            updated = dict(d.spec)
            updated["is_dashboard"] = False
            d.spec = updated

    db.flush()
    audit(
        db,
        company_id,
        user.id,
        "report_studio.reset_active_dashboard",
        company_id,
        {},
    )
    return {
        "has_custom_dashboard": False,
    }


def get_active_dashboard(
    db: Session,
    company_id: str,
    period_id: str | None = None,
    *,
    actor: m.User | None = None,
) -> dict:
    """Returns the active custom dashboard and its evaluated preview if one is configured."""
    all_defs = db.scalars(
        select(SavedReportDefinition).where(SavedReportDefinition.company_id == company_id)
    ).all()

    active_def = None
    for d in all_defs:
        if isinstance(d.spec, dict) and d.spec.get("is_dashboard"):
            active_def = d
            break

    if not active_def or not isinstance(active_def.spec, dict):
        return {
            "has_custom_dashboard": False,
            "definition_id": None,
            "definition_name": None,
            "dashboard": None,
        }

    mode = active_def.spec.get("dashboard_mode", "legacy")
    result = {
        "has_custom_dashboard": True,
        "definition_id": active_def.id,
        "definition_name": active_def.name,
        "mode": mode,
    }
    snapshot = active_def.spec.get("dashboard_snapshot")
    _require_payroll_if_needed(db, company_id, actor, active_def.spec, snapshot)
    if mode == "fixed" and snapshot is not None:
        return result | snapshot

    try:
        spec = _dashboard_layout(active_def, period_id)
        rendered = preview(
            db,
            company_id,
            spec,
            live_actor=actor if mode == "live" else None,
            actor=actor,
        )
        return result | {"spec": spec.model_dump(), "dashboard": rendered}
    except DomainError as exc:
        if exc.status == 403:
            raise
        return result | {"error": exc.message, "dashboard": None}
    except ValidationError:
        return result | {"error": "تعریف داشبورد نامعتبر است.", "dashboard": None}


def _dashboard_layout(definition: SavedReportDefinition, period_id: str | None = None) -> StudioLayoutSpec:
    studio_spec_dict = definition.spec.get("studio_spec")
    if not studio_spec_dict:
        classic_spec = definition.spec
        period_id_val = period_id or classic_spec.get("period_id") or "default-period"
        kind = classic_spec.get("kind", "metrics")
        basis = classic_spec.get("basis", "ledger")
        basis_mapping = {
            "ledger": "ledger",
            "bank": "bank",
            "invoice": "invoice",
            "comparable_difference": "all",
        }
        studio_basis = basis_mapping.get(basis, "all")

        widgets = []
        if kind == "metrics":
            metric_keys = classic_spec.get("metric_keys") or ["revenue", "expense", "net_profit"]
            for m_key in metric_keys:
                widgets.append(
                    {
                        "id": f"kpi-{m_key}",
                        "title": m_key,
                        "type": "kpi_card",
                        "entity": "ledger",
                        "metric": m_key,
                        "group_by": "none",
                        "limit": 1,
                        "filters": {},
                        "unit": "IRR",
                        "color": "primary",
                        "col_span": 4 if len(metric_keys) <= 3 else 3,
                    }
                )
        else:
            widgets.append(
                {
                    "id": "table-invoices",
                    "title": "فاکتورها",
                    "type": "data_table",
                    "entity": "invoices",
                    "metric": "total_amount",
                    "group_by": "none",
                    "limit": 15,
                    "filters": {},
                    "unit": "IRR",
                    "color": "primary",
                    "col_span": 12,
                }
            )

        spec_data = {
            "title": definition.name,
            "description": "داشبورد تبدیل‌شده از گزارش سازمانی",
            "global_filters": {
                "period_id": period_id_val,
                "basis": studio_basis,
                "unit": "IRR",
            },
            "sections": [
                {
                    "id": "section-main",
                    "title": definition.name,
                    "description": None,
                    "layout": "grid-2",
                    "basis": studio_basis,
                    "widgets": widgets,
                }
            ],
        }
    else:
        spec_data = dict(studio_spec_dict)
        if period_id and "global_filters" in spec_data:
            spec_data["global_filters"] = dict(spec_data["global_filters"])
            spec_data["global_filters"]["period_id"] = period_id

    return StudioLayoutSpec.model_validate(spec_data)


def _configure_dashboard(
    db: Session,
    company_id: str,
    definition: SavedReportDefinition,
    mode: str,
    manifest: m.ResultManifest | None = None,
    *,
    actor: m.User | None = None,
) -> None:
    require(mode in {"fixed", "live"}, "invalid_dashboard_mode", "نوع داشبورد نامعتبر است.")
    spec = dict(definition.spec)
    spec["is_dashboard"] = True
    spec["dashboard_mode"] = mode
    spec.pop("dashboard_snapshot", None)
    if mode == "fixed":
        layout = _dashboard_layout(definition)
        spec["dashboard_snapshot"] = {
            "spec": layout.model_dump(),
            "dashboard": preview(db, company_id, layout, manifest=manifest, actor=actor),
        }
    definition.spec = spec


def export_definition_pdf(
    db: Session,
    company_id: str,
    definition_id: str,
    period_id: str | None = None,
    *,
    actor: m.User | None = None,
) -> bytes:
    """Renders a report definition into a downloadable PDF document."""
    definition = get_entity(db, SavedReportDefinition, company_id, definition_id)
    _require_payroll_if_needed(db, company_id, actor, definition.spec)
    company = db.get(m.Company, company_id)
    company_name = company.name if company else company_id

    if isinstance(definition.spec, dict) and definition.spec.get("layout_kind") == "studio":
        studio_spec_dict = dict(definition.spec["studio_spec"])
        if period_id and "global_filters" in studio_spec_dict:
            studio_spec_dict["global_filters"] = dict(studio_spec_dict["global_filters"])
            studio_spec_dict["global_filters"]["period_id"] = period_id

        spec_obj = StudioLayoutSpec.model_validate(studio_spec_dict)
        rendered = preview(db, company_id, spec_obj, actor=actor)

        blocks_results = []
        for sec in rendered.get("sections", []):
            sec_title = sec.get("title") or "بخش گزارش"
            kpis = []
            for w in sec.get("widgets", []):
                w_type = w.get("type")
                w_title = w.get("title") or ""
                w_data = w.get("data") or {}

                if w_type == "kpi_card":
                    kpis.append(
                        {
                            "title": w_title,
                            "value": localized(w_data.get("value"), amount=True),
                            "unit": "ریال" if w.get("unit") == "IRR" else "تومان",
                        }
                    )
                elif w_type == "data_table":
                    cols = w_data.get("columns", [])
                    rows = w_data.get("rows", [])
                    if cols and rows:
                        total = w_data.get("total_count", len(rows))
                        shown = min(40, len(rows))
                        notes = [w_data["reason"]] if w_data.get("reason") else []
                        if total > shown:
                            notes.append(f"{localized(shown)} ردیف از {localized(total)}")
                        block_title = " · ".join([f"{sec_title} - {w_title}", *notes])
                        money_keys = {col["key"] for col in cols if col.get("format") == "money"}
                        export_rows = [
                            {key: localized(value, amount=True) if key in money_keys else value
                             for key, value in row.items()}
                            for row in rows
                        ]
                        blocks_results.append(
                            {
                                "title": block_title,
                                "columns": [
                                    {**col, "label_fa": col.get("label_fa") or col.get("label") or col["key"]}
                                    for col in cols
                                ],
                                "rows": export_rows,
                            }
                        )
                    elif w_data.get("reason"):
                        blocks_results.append({"title": w_data["reason"], "columns": [], "rows": []})
                elif "chart" in w_type:
                    categories = w_data.get("categories") or []
                    series = w_data.get("series") or []
                    if categories and series and isinstance(series, list) and len(series) > 0:
                        first_series = (
                            series[0] if isinstance(series[0], dict) else {"data": series}
                        )
                        values = first_series.get("data") or []
                        chart_rows = []
                        for c_label, c_val in zip(categories, values, strict=False):
                            chart_rows.append(
                                {
                                    "category": str(c_label),
                                    "value": localized(c_val, amount=True),
                                }
                            )
                        if chart_rows:
                            blocks_results.append(
                                {
                                    "title": f"{sec_title} - {w_title}",
                                    "columns": [
                                        {"key": "category", "label_fa": "دسته‌بندی"},
                                        {"key": "value", "label_fa": "مبلغ"},
                                    ],
                                    "rows": chart_rows,
                                }
                            )
                elif w_type == "ai_summary":
                    insight = w_data.get("insight")
                    if insight:
                        blocks_results.append(
                            {
                                "title": f"{sec_title} - {w_title}",
                                "summary": insight,
                            }
                        )

            if kpis:
                blocks_results.insert(
                    0,
                    {
                        "title": f"{sec_title} - شاخص‌های کلیدی",
                        "columns": [
                            {"key": "title", "label_fa": "عنوان شاخص"},
                            {"key": "value", "label_fa": "مقدار"},
                            {"key": "unit", "label_fa": "واحد"},
                        ],
                        "rows": kpis,
                    },
                )

        return export_custom_report_pdf(company_name, definition.name, blocks_results)

    # Classic Report Builder fallback
    from . import report_builder_service
    from .report_builder_exports import pdf_run
    from .report_builder_schemas import ReportSpec

    classic_spec = ReportSpec.model_validate(definition.spec)
    preview_data = report_builder_service.preview(db, company_id, classic_spec)
    return pdf_run({"snapshot": preview_data})


def set_official_report_as_dashboard(
    db: Session,
    company_id: str,
    user: m.User,
    report_id: str,
    *,
    mode: str = "fixed",
) -> dict:
    """Creates and designates a dashboard definition from an official Report record."""
    report = get_entity(db, m.Report, company_id, report_id)
    manifest = db.get(m.ResultManifest, report.manifest_id)
    require(manifest is not None, "manifest_not_found", "داده‌های محاسباتی این گزارش یافت نشد.")

    metrics = manifest.metrics or []
    kpi_widgets = []
    for met in metrics:
        m_key = met.get("metric_key") or "metric"
        m_label = met.get("label") or m_key
        kpi_widgets.append(
            {
                "id": f"kpi-{m_key}",
                "title": m_label,
                "type": "kpi_card",
                "entity": "ledger",
                "metric": m_key,
                "group_by": "none",
                "limit": 1,
                "filters": {},
                "unit": "IRR",
                "color": "primary",
                "col_span": 3,
            }
        )

    sections = [
        {
            "id": "section-official-kpis",
            "title": report.title,
            "description": "داشبورد تولیدشده از صورت مالی رسمی",
            "layout": "grid-4",
            "basis": "all",
            "widgets": kpi_widgets[:8],
        }
    ]

    invs = (manifest.details or {}).get("invoices") or []
    if invs:
        sections.append(
            {
                "id": "section-official-invoices",
                "title": "فاکتورهای مرتبط با دوره",
                "layout": "grid-1",
                "basis": "invoice",
                "widgets": [
                    {
                        "id": "widget-inv-table",
                        "title": "فهرست فاکتورها",
                        "type": "data_table",
                        "entity": "invoices",
                        "metric": "total_amount",
                        "group_by": "none",
                        "limit": 10,
                        "filters": {},
                        "unit": "IRR",
                        "color": "primary",
                        "col_span": 12,
                    }
                ],
            }
        )

    layout_spec = {
        "title": report.title,
        "description": f"داشبورد مشتق‌شده از {report.title}",
        "global_filters": {
            "period_id": manifest.period_id,
            "basis": "all",
            "unit": "IRR",
        },
        "sections": sections,
    }

    save_input = StudioSaveDefinitionInput(
        name=report.title,
        spec=StudioLayoutSpec.model_validate(layout_spec),
        is_dashboard=True,
    )
    return save(db, company_id, user, save_input, dashboard_mode=mode, manifest=manifest)
