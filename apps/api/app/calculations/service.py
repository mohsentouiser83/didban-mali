from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, cast
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid6 import uuid7

from app.calculations.base import CalculationContext
from app.calculations.models import (
    CalculationRun,
    CalculationRunStatus,
    FinancialPolicy,
    MetricResult,
    MetricStatus,
    MetricUnit,
)
from app.calculations.registry import registry
from app.calculations.schemas import (
    DataFreshnessSource,
    DataFreshnessSummary,
    ExecutiveDashboardResponse,
    KeyChangeItem,
    MetricEvidenceDTO,
    MetricResultDTO,
    MetricTraceRecord,
    MetricTraceResponse,
)
from app.financial.models import (
    BankTransaction,
    JournalEntry,
    JournalLine,
    SalesInvoice,
)

ZERO = Decimal(0)


async def get_or_create_financial_policy(
    session: AsyncSession, company_id: UUID
) -> FinancialPolicy:
    policy = await session.scalar(
        select(FinancialPolicy).where(FinancialPolicy.company_id == company_id)
    )
    if not policy:
        policy = FinancialPolicy(
            id=uuid7(),
            company_id=company_id,
            dso_period_days=90,
            dso_method="strict",
            burn_trailing_days=90,
            default_reporting_unit="toman",
            excluded_internal_transfer_accounts=[],
            updated_at=datetime.now(),
        )
        session.add(policy)
        await session.flush()
    return policy


async def resolve_effective_as_of_date(
    session: AsyncSession, company_id: UUID, explicit_date: date | None = None
) -> date:
    if explicit_date is not None:
        return explicit_date

    max_bank_date = await session.scalar(
        select(func.max(BankTransaction.booking_date)).where(
            BankTransaction.company_id == company_id
        )
    )
    max_inv_date = await session.scalar(
        select(func.max(SalesInvoice.issue_date)).where(SalesInvoice.company_id == company_id)
    )
    max_entry_date = await session.scalar(
        select(func.max(JournalEntry.entry_date)).where(JournalEntry.company_id == company_id)
    )

    dates = [d for d in (max_bank_date, max_inv_date, max_entry_date) if d is not None]
    return max(dates) if dates else date.today()


async def execute_calculation_run(
    session: AsyncSession,
    company_id: UUID,
    as_of_date: date | None = None,
    period_start: date | None = None,
    period_end: date | None = None,
    trigger_source: str = "manual",
    triggered_by: UUID | None = None,
) -> CalculationRun:
    effective_as_of = await resolve_effective_as_of_date(session, company_id, as_of_date)
    p_end = period_end or effective_as_of
    p_start = period_start or (p_end - timedelta(days=30))

    policy = await get_or_create_financial_policy(session, company_id)

    run = CalculationRun(
        id=uuid7(),
        company_id=company_id,
        as_of_date=effective_as_of,
        period_start=p_start,
        period_end=p_end,
        engine_version="financial-metrics-v1",
        status=CalculationRunStatus.PROCESSING,
        trigger_source=trigger_source,
        triggered_by=triggered_by,
        summary_json={},
        started_at=datetime.now(),
    )
    session.add(run)
    await session.flush()

    ctx = CalculationContext(
        company_id=company_id,
        as_of_date=effective_as_of,
        period_start=p_start,
        period_end=p_end,
        policy=policy,
        session=session,
    )

    calculators = registry.get_ordered_calculators()
    results_map: dict[str, MetricResult] = {}
    has_warnings = False

    try:
        for calc in calculators:
            res = await calc.calculate(ctx)
            if (
                res.status in (MetricStatus.AVAILABLE_WITH_WARNING, MetricStatus.APPROXIMATE)
                or res.warnings
            ):
                has_warnings = True

            db_res = MetricResult(
                id=uuid7(),
                company_id=company_id,
                calculation_run_id=run.id,
                metric_key=res.metric_key,
                metric_version=res.metric_version,
                status=res.status,
                value_numeric=res.value_numeric,
                unit=res.unit,
                as_of_date=res.as_of_date,
                period_start=res.period_start,
                period_end=res.period_end,
                coverage_score=res.coverage_score,
                confidence=res.confidence,
                input_record_count=res.input_record_count,
                excluded_record_count=res.excluded_record_count,
                warnings=res.warnings,
                evidence_json=res.evidence_json,
                input_record_ids=res.input_record_ids,
                calculated_at=res.calculated_at,
            )
            session.add(db_res)
            results_map[res.metric_key] = db_res

        await session.flush()

        run.status = (
            CalculationRunStatus.COMPLETED_WITH_WARNINGS
            if has_warnings
            else CalculationRunStatus.COMPLETED
        )
        run.completed_at = datetime.now()
        run.summary_json = {
            "metrics_calculated_count": len(results_map),
            "warnings_count": sum(len(r.warnings) for r in results_map.values()),
            "as_of_date": str(effective_as_of),
        }
        await session.commit()
    except Exception as exc:
        await session.rollback()
        run.status = CalculationRunStatus.FAILED
        run.failure_message = str(exc)
        run.completed_at = datetime.now()
        session.add(run)
        await session.commit()
        raise

    return run


async def get_latest_calculation_run(
    session: AsyncSession, company_id: UUID
) -> CalculationRun | None:
    return cast(
        CalculationRun | None,
        await session.scalar(
            select(CalculationRun)
            .where(
                CalculationRun.company_id == company_id,
                CalculationRun.status.in_(
                    [
                        CalculationRunStatus.COMPLETED,
                        CalculationRunStatus.COMPLETED_WITH_WARNINGS,
                    ]
                ),
            )
            .order_by(CalculationRun.as_of_date.desc(), CalculationRun.created_at.desc())
            .limit(1)
        ),
    )


def _to_metric_dto(res: MetricResult) -> MetricResultDTO:
    evidence_dto = None
    if res.evidence_json:
        ev = res.evidence_json
        evidence_dto = MetricEvidenceDTO(
            title_fa=ev.get("title_fa", res.metric_key),
            definition_fa=ev.get("definition_fa", ""),
            formula_fa=ev.get("formula_fa", ""),
            formula_version=ev.get("formula_version", res.metric_version),
            components=ev,
            breakdown=ev.get("breakdown", ev.get("weeks", ev.get("aging_buckets", []))),
            reconciliation_notes=ev.get("reconciliation_notes", []),
        )

    # Format numeric value readably in DTO
    val_formatted = None
    if res.value_numeric is not None:
        if res.unit == MetricUnit.IRR:
            # Show in Tomans for primary display: 1 Toman = 10 Rials
            toman_val = res.value_numeric / Decimal(10)
            if abs(toman_val) >= Decimal("1000000000"):
                b_val = toman_val / Decimal("1000000000")
                val_formatted = f"{b_val:.2f} میلیارد تومان"
            elif abs(toman_val) >= Decimal("1000000"):
                m_val = toman_val / Decimal("1000000")
                val_formatted = f"{m_val:.1f} میلیون تومان"
            else:
                val_formatted = f"{int(toman_val):,} تومان"
        elif res.unit == MetricUnit.DAY:
            val_formatted = f"{res.value_numeric:.1f} روز"
        elif res.unit == MetricUnit.MONTH:
            val_formatted = f"{res.value_numeric:.1f} ماه"
        elif res.unit == MetricUnit.RATIO:
            val_formatted = f"{float(res.value_numeric) * 100:.1f}٪"
        else:
            val_formatted = str(res.value_numeric)

    return MetricResultDTO(
        id=res.id,
        metric_key=res.metric_key,
        metric_version=res.metric_version,
        status=res.status,
        value_numeric=res.value_numeric,
        value_formatted=val_formatted,
        unit=res.unit,
        as_of_date=res.as_of_date,
        period_start=res.period_start,
        period_end=res.period_end,
        coverage_score=res.coverage_score,
        confidence=res.confidence,
        input_record_count=res.input_record_count,
        excluded_record_count=res.excluded_record_count,
        warnings=res.warnings if isinstance(res.warnings, list) else [],
        evidence=evidence_dto,
        calculated_at=res.calculated_at,
    )


async def compute_data_freshness(
    session: AsyncSession, company_id: UUID, as_of_date: date
) -> DataFreshnessSummary:
    # 1. Bank freshness
    max_bank_date = await session.scalar(
        select(func.max(BankTransaction.booking_date)).where(
            BankTransaction.company_id == company_id
        )
    )
    # 2. Sales freshness
    max_sales_date = await session.scalar(
        select(func.max(SalesInvoice.issue_date)).where(SalesInvoice.company_id == company_id)
    )
    # 3. Accounting freshness
    max_acc_date = await session.scalar(
        select(func.max(JournalEntry.entry_date)).where(JournalEntry.company_id == company_id)
    )

    sources: list[DataFreshnessSource] = []
    today = date.today()
    is_any_stale = False

    def eval_source(kind: str, title: str, last_dt: date | None) -> DataFreshnessSource:
        nonlocal is_any_stale
        if last_dt is None:
            return DataFreshnessSource(
                source_kind=kind,
                title_fa=title,
                last_record_date=None,
                days_stale=999,
                is_stale=True,
                message=f"داده‌ای برای {title} بارگذاری نشده است.",
            )
        days = (today - last_dt).days
        stale = days > 14
        if stale:
            is_any_stale = True
        return DataFreshnessSource(
            source_kind=kind,
            title_fa=title,
            last_record_date=last_dt,
            days_stale=days,
            is_stale=stale,
            message=f"{title} تا تاریخ {last_dt} ({days} روز پیش) ثبت شده است.",
        )

    sources.append(eval_source("banking", "اطلاعات بانکی", max_bank_date))
    sources.append(eval_source("sales", "فروش و فاکتورها", max_sales_date))
    sources.append(eval_source("accounting", "دفاتر حسابداری", max_acc_date))

    return DataFreshnessSummary(
        as_of_date=as_of_date,
        is_any_stale=is_any_stale,
        sources=sources,
    )


async def compute_deterministic_key_changes(
    session: AsyncSession, company_id: UUID, current_run: CalculationRun
) -> list[KeyChangeItem]:
    # Find previous run before current_run.as_of_date
    prev_run = await session.scalar(
        select(CalculationRun)
        .where(
            CalculationRun.company_id == company_id,
            CalculationRun.id != current_run.id,
            CalculationRun.status.in_(
                [
                    CalculationRunStatus.COMPLETED,
                    CalculationRunStatus.COMPLETED_WITH_WARNINGS,
                ]
            ),
            CalculationRun.as_of_date < current_run.as_of_date,
        )
        .order_by(CalculationRun.as_of_date.desc(), CalculationRun.created_at.desc())
        .limit(1)
    )

    if not prev_run:
        return []

    # Load metrics from both runs
    curr_metrics = {
        m.metric_key: m
        for m in (
            await session.scalars(
                select(MetricResult).where(MetricResult.calculation_run_id == current_run.id)
            )
        ).all()
    }
    prev_metrics = {
        m.metric_key: m
        for m in (
            await session.scalars(
                select(MetricResult).where(MetricResult.calculation_run_id == prev_run.id)
            )
        ).all()
    }

    changes: list[KeyChangeItem] = []

    # 1. Cash Position Change
    curr_cash = curr_metrics.get("cash_position")
    prev_cash = prev_metrics.get("cash_position")
    if (
        curr_cash
        and prev_cash
        and curr_cash.value_numeric is not None
        and prev_cash.value_numeric is not None
    ):
        delta = curr_cash.value_numeric - prev_cash.value_numeric
        if abs(delta) > ZERO:
            delta_toman = delta / Decimal(10)
            direction = "increase" if delta > 0 else "decrease"
            severity = "positive" if delta > 0 else "warning"
            changes.append(
                KeyChangeItem(
                    metric_key="cash_position",
                    title_fa="تغییر موجودی نقد",
                    change_statement=(
                        f"نقدینگی در دسترس نسبت به دوره قبل {abs(delta_toman):,.0f} تومان "
                        f"{'افزایش' if delta > 0 else 'کاهش'} یافته است."
                    ),
                    direction=direction,
                    previous_value=prev_cash.value_numeric,
                    current_value=curr_cash.value_numeric,
                    unit="ریال",
                    severity=severity,
                )
            )

    # 2. Open Receivables Change
    curr_ar = curr_metrics.get("open_receivables")
    prev_ar = prev_metrics.get("open_receivables")
    if (
        curr_ar
        and prev_ar
        and curr_ar.value_numeric is not None
        and prev_ar.value_numeric is not None
    ):
        delta = curr_ar.value_numeric - prev_ar.value_numeric
        if abs(delta) > ZERO and prev_ar.value_numeric > ZERO:
            pct = float((delta / prev_ar.value_numeric * 100).quantize(Decimal("0.1")))
            direction = "increase" if delta > 0 else "decrease"
            severity = "warning" if delta > 0 else "positive"
            changes.append(
                KeyChangeItem(
                    metric_key="open_receivables",
                    title_fa="مطالبات باز",
                    change_statement=(
                        f"مطالبات تجاری نسبت به دوره قبل {abs(pct)}٪ "
                        f"{'افزایش' if delta > 0 else 'کاهش'} یافته است."
                    ),
                    direction=direction,
                    previous_value=prev_ar.value_numeric,
                    current_value=curr_ar.value_numeric,
                    unit="درصد",
                    severity=severity,
                )
            )

    # 3. DSO Change
    curr_dso = curr_metrics.get("dso")
    prev_dso = prev_metrics.get("dso")
    if (
        curr_dso
        and prev_dso
        and curr_dso.value_numeric is not None
        and prev_dso.value_numeric is not None
    ):
        diff_days = curr_dso.value_numeric - prev_dso.value_numeric
        if abs(diff_days) >= Decimal("1"):
            direction = "increase" if diff_days > 0 else "decrease"
            severity = "warning" if diff_days > 0 else "positive"
            changes.append(
                KeyChangeItem(
                    metric_key="dso",
                    title_fa="دوره وصول مطالبات (DSO)",
                    change_statement=(
                        f"دوره وصول مطالبات از {prev_dso.value_numeric:.1f} روز به "
                        f"{curr_dso.value_numeric:.1f} روز رسیده است "
                        f"({abs(diff_days):.1f} روز {'افزایش' if diff_days > 0 else 'بهبود'})."
                    ),
                    direction=direction,
                    previous_value=prev_dso.value_numeric,
                    current_value=curr_dso.value_numeric,
                    unit="روز",
                    severity=severity,
                )
            )

    return changes


async def get_executive_dashboard(
    session: AsyncSession, company_id: UUID, as_of_date: date | None = None
) -> ExecutiveDashboardResponse:
    # 1. Fetch latest calculation run or execute if none exists
    run = await get_latest_calculation_run(session, company_id)
    if not run:
        run = await execute_calculation_run(session, company_id, as_of_date=as_of_date)

    # 2. Load metrics for this run
    metrics_list = (
        await session.scalars(select(MetricResult).where(MetricResult.calculation_run_id == run.id))
    ).all()

    metrics_map = {m.metric_key: _to_metric_dto(m) for m in metrics_list}

    # 3. Four primary executive KPIs
    primary_kpis: dict[str, MetricResultDTO] = {}
    if "cash_position" in metrics_map:
        primary_kpis["cash_position"] = metrics_map["cash_position"]
    if "open_receivables" in metrics_map:
        primary_kpis["open_receivables"] = metrics_map["open_receivables"]
    if "open_payables" in metrics_map:
        primary_kpis["open_payables"] = metrics_map["open_payables"]

    # Fourth card: Runway if valid, or Cash Forecast outlook
    runway_metric = metrics_map.get("runway")
    if runway_metric and runway_metric.status == MetricStatus.AVAILABLE:
        primary_kpis["runway"] = runway_metric
    elif "cash_forecast_13w" in metrics_map:
        primary_kpis["cash_forecast_13w"] = metrics_map["cash_forecast_13w"]
    elif runway_metric:
        primary_kpis["runway"] = runway_metric

    # 4. Forecast outlook summary
    forecast_metric = metrics_map.get("cash_forecast_13w")
    forecast_outlook: dict[str, Any] = {}
    if forecast_metric and forecast_metric.evidence:
        comp = forecast_metric.evidence.components
        forecast_outlook = {
            "status": forecast_metric.status,
            "starting_cash_irr": comp.get("starting_cash_irr"),
            "lowest_projected_cash_irr": comp.get("lowest_projected_cash_irr"),
            "first_deficit_week": comp.get("first_deficit_week"),
            "inflow_coverage_percentage": comp.get("inflow_coverage_percentage"),
            "outflow_coverage_percentage": comp.get("outflow_coverage_percentage"),
            "weeks_count": len(comp.get("weeks", [])),
            "weeks": comp.get("weeks", []),
            "weeks_preview": comp.get("weeks", [])[:4],
        }

    # 5. Deterministic key changes
    key_changes = await compute_deterministic_key_changes(session, company_id, run)

    # 6. Freshness
    freshness = await compute_data_freshness(session, company_id, run.as_of_date)

    return ExecutiveDashboardResponse(
        calculation_run_id=run.id,
        as_of_date=run.as_of_date,
        period_start=run.period_start,
        period_end=run.period_end,
        engine_version=run.engine_version,
        primary_kpis=primary_kpis,
        key_changes=key_changes,
        forecast_outlook=forecast_outlook,
        freshness=freshness,
    )


async def get_metric_trace(
    session: AsyncSession, company_id: UUID, metric_key: str
) -> MetricTraceResponse:
    run = await get_latest_calculation_run(session, company_id)
    if not run:
        raise ValueError("هیچ اجرای محاسباتی برای این شرکت یافت نشد.")

    metric = await session.scalar(
        select(MetricResult).where(
            MetricResult.calculation_run_id == run.id,
            MetricResult.metric_key == metric_key,
        )
    )
    if not metric:
        raise ValueError(f"شاخص {metric_key} در محاسبات یافت نشد.")

    sample_records: list[MetricTraceRecord] = []

    # Trace back to canonical tables and Phase 1 source_files/rows
    if metric_key in ("open_receivables", "dso", "cash_forecast_13w"):
        # Sales invoices
        invoices = (
            await session.scalars(
                select(SalesInvoice)
                .where(
                    SalesInvoice.company_id == company_id,
                )
                .limit(20)
            )
        ).all()

        for inv in invoices:
            # Query source row from Phase 1
            sample_records.append(
                MetricTraceRecord(
                    entity_type="sales_invoice",
                    record_id=inv.id,
                    description=f"فاکتور {inv.invoice_no}",
                    amount_irr=inv.gross_amount_irr,
                    date=inv.issue_date,
                    source_file_id=inv.source_row_id,  # references Phase 1 source row
                )
            )

    elif metric_key in ("cash_position", "net_cash_movement", "net_cash_burn"):
        # Bank transactions
        txs = (
            await session.scalars(
                select(BankTransaction)
                .where(
                    BankTransaction.company_id == company_id,
                )
                .limit(20)
            )
        ).all()

        for tx in txs:
            sample_records.append(
                MetricTraceRecord(
                    entity_type="bank_transaction",
                    record_id=tx.id,
                    description=tx.description[:100],
                    amount_irr=tx.amount_irr,
                    date=tx.booking_date,
                    source_file_id=tx.source_row_id,
                )
            )

    elif metric_key in ("open_payables", "dpo"):
        # Journal lines
        lines = (
            await session.scalars(
                select(JournalLine)
                .where(
                    JournalLine.company_id == company_id,
                )
                .limit(20)
            )
        ).all()

        for jl in lines:
            sample_records.append(
                MetricTraceRecord(
                    entity_type="journal_line",
                    record_id=jl.id,
                    description=f"آرتیکل بستانکار {jl.invoice_ref or ''}",
                    amount_irr=jl.credit_irr,
                    date=date.today(),
                    source_file_id=jl.source_row_id,
                )
            )

    return MetricTraceResponse(
        metric_key=metric.metric_key,
        metric_version=metric.metric_version,
        calculation_run_id=run.id,
        total_records=metric.input_record_count,
        excluded_records=metric.excluded_record_count,
        sample_records=sample_records,
    )
