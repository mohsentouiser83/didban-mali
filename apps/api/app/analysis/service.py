from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from uuid6 import uuid7

from app.analysis.calculations import CalculatedMetric, LedgerLine, calculate_ledger_metrics
from app.analysis.models import AnalysisRun, AnalysisStatus, MetricCode, MetricObservation
from app.audit.service import record_audit_event
from app.financial.models import (
    AccountClassification,
    BankTransaction,
    JournalEntry,
    JournalLine,
    SalesInvoice,
)
from app.imports.models import ImportBatch, ImportStatus


async def _ledger_lines(
    session: AsyncSession, company_id: UUID, period_end: date
) -> list[LedgerLine]:
    classification = (
        select(AccountClassification.account_class)
        .where(
            AccountClassification.company_id == company_id,
            AccountClassification.account_id == JournalLine.account_id,
            AccountClassification.effective_from <= JournalEntry.entry_date,
        )
        .order_by(AccountClassification.effective_from.desc())
        .limit(1)
        .correlate(JournalLine, JournalEntry)
        .scalar_subquery()
    )
    rows = (
        await session.execute(
            select(
                JournalEntry.entry_date,
                JournalLine.debit_irr,
                JournalLine.credit_irr,
                classification.label("account_class"),
            )
            .join(JournalLine, JournalLine.entry_id == JournalEntry.id)
            .where(
                JournalEntry.company_id == company_id,
                JournalEntry.entry_date <= period_end,
            )
            .order_by(JournalEntry.entry_date, JournalLine.id)
        )
    ).all()
    return [
        LedgerLine(
            entry_date=row.entry_date,
            debit_irr=Decimal(row.debit_irr),
            credit_irr=Decimal(row.credit_irr),
            account_class=row.account_class,
        )
        for row in rows
    ]


async def _optional_source_metrics(
    session: AsyncSession, company_id: UUID, period_start: date, period_end: date
) -> tuple[dict[MetricCode, CalculatedMetric], dict[str, object]]:
    bank_count, bank_total = (
        await session.execute(
            select(func.count(BankTransaction.id), func.sum(BankTransaction.amount_irr)).where(
                BankTransaction.company_id == company_id,
                BankTransaction.booking_date.between(period_start, period_end),
            )
        )
    ).one()
    sales_count, invoiced, collected = (
        await session.execute(
            select(
                func.count(SalesInvoice.id),
                func.sum(SalesInvoice.gross_amount_irr),
                func.sum(SalesInvoice.paid_amount_irr),
            ).where(
                SalesInvoice.company_id == company_id,
                SalesInvoice.issue_date.between(period_start, period_end),
            )
        )
    ).one()
    metrics: dict[MetricCode, CalculatedMetric] = {}
    coverage: dict[str, object] = {
        "bank_cash_flow": {
            "available": bool(bank_count),
            "score": 100 if bank_count else 0,
            "reasons": [] if bank_count else ["در دوره انتخابی داده بانکی وجود ندارد"],
        },
        "sales": {
            "available": bool(sales_count),
            "score": 100 if sales_count else 0,
            "reasons": [] if sales_count else ["در دوره انتخابی داده فروش وجود ندارد"],
        },
    }

    def source_formula(formula: str, count: int) -> dict[str, object]:
        return {"formula": formula, "record_count": count, "unit": "IRR"}

    if bank_count:
        metrics[MetricCode.NET_CASH_MOVEMENT_IRR] = CalculatedMetric(
            value_irr=Decimal(bank_total or 0),
            value_ratio=None,
            calculation=source_formula("sum(bank_transaction.amount_irr)", bank_count),
        )
    if sales_count:
        invoice_value = Decimal(invoiced or 0)
        collected_value = Decimal(collected or 0)
        metrics.update(
            {
                MetricCode.SALES_INVOICED_IRR: CalculatedMetric(
                    invoice_value,
                    None,
                    source_formula("sum(sales_invoice.gross_amount_irr)", sales_count),
                ),
                MetricCode.SALES_COLLECTED_IRR: CalculatedMetric(
                    collected_value,
                    None,
                    source_formula("sum(coalesce(sales_invoice.paid_amount_irr, 0))", sales_count),
                ),
                MetricCode.SALES_OUTSTANDING_IRR: CalculatedMetric(
                    invoice_value - collected_value,
                    None,
                    source_formula("sales_invoiced_irr - sales_collected_irr", sales_count),
                ),
            }
        )
    return metrics, coverage


async def _input_manifest(session: AsyncSession, run: AnalysisRun) -> dict[str, object]:
    completed_statuses = [ImportStatus.COMPLETED, ImportStatus.COMPLETED_LIMITED]
    batch_ids = list(
        await session.scalars(
            select(ImportBatch.id)
            .where(
                ImportBatch.company_id == run.company_id,
                ImportBatch.status.in_(completed_statuses),
            )
            .order_by(ImportBatch.id)
        )
    )
    journal_count = int(
        (
            await session.scalar(
                select(func.count(JournalLine.id))
                .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
                .where(
                    JournalLine.company_id == run.company_id,
                    JournalEntry.entry_date <= run.period_end,
                )
            )
        )
        or 0
    )
    return {
        "import_batch_ids": [str(item) for item in batch_ids],
        "journal_line_count_through_period_end": journal_count,
        "period_start": run.period_start.isoformat(),
        "period_end": run.period_end.isoformat(),
    }


async def calculate_analysis_run(
    session: AsyncSession, *, run_id: UUID, company_id: UUID, actor_id: UUID
) -> dict[str, object]:
    run = await session.scalar(
        select(AnalysisRun)
        .where(AnalysisRun.id == run_id, AnalysisRun.company_id == company_id)
        .with_for_update()
    )
    if run is None:
        raise ValueError("Analysis run is not accessible")
    if run.status in {AnalysisStatus.COMPLETED, AnalysisStatus.COMPLETED_LIMITED}:
        return {"status": run.status.value, "analysis_run_id": str(run.id)}
    if run.status not in {AnalysisStatus.QUEUED, AnalysisStatus.PROCESSING}:
        raise ValueError("Analysis run is not ready")

    run.status = AnalysisStatus.PROCESSING
    run.started_at = run.started_at or datetime.now(UTC)
    run.failure_code = None
    run.failure_message = None

    from app.core.tenant import set_request_company, set_request_user

    await set_request_user(session, actor_id)
    await set_request_company(session, company_id)
    lines = await _ledger_lines(session, company_id, run.period_end)
    metrics, accounting_coverage = calculate_ledger_metrics(lines, run.period_start, run.period_end)
    optional_metrics, optional_coverage = await _optional_source_metrics(
        session, company_id, run.period_start, run.period_end
    )
    metrics.update(optional_metrics)
    manifest = await _input_manifest(session, run)
    now = datetime.now(UTC)
    values = [
        {
            "id": uuid7(),
            "company_id": company_id,
            "analysis_run_id": run.id,
            "metric_code": code,
            "period_start": run.period_start,
            "period_end": run.period_end,
            "value_irr": metric.value_irr,
            "value_ratio": metric.value_ratio,
            "calculation_json": metric.calculation,
            "calculated_at": now,
        }
        for code, metric in metrics.items()
    ]
    if values:
        await session.execute(
            insert(MetricObservation)
            .values(values)
            .on_conflict_do_nothing(constraint="uq_metric_observation_run_code")
        )
    coverage: dict[str, object] = {
        "accounting": accounting_coverage,
        **optional_coverage,
        "gross_profit": {
            "available": False,
            "score": 0,
            "reasons": ["حساب‌های بهای تمام‌شده در طبقه‌بندی فعلی از هزینه تفکیک نشده‌اند"],
        },
    }
    accounting_available = bool(accounting_coverage["available"])
    accounting_complete = accounting_coverage["score"] == 100
    optional_sources_complete = all(
        bool(coverage[name]["available"])  # type: ignore[index]
        for name in ("bank_cash_flow", "sales")
    )
    run.input_manifest_json = manifest
    run.coverage_json = coverage
    run.status = (
        AnalysisStatus.COMPLETED
        if accounting_available and accounting_complete and optional_sources_complete
        else AnalysisStatus.COMPLETED_LIMITED
    )
    run.completed_at = now
    record_audit_event(
        session,
        action="analysis.completed",
        entity_type="analysis_run",
        actor_id=actor_id,
        entity_id=run.id,
        company_id=company_id,
        metadata={
            "period_start": run.period_start.isoformat(),
            "period_end": run.period_end.isoformat(),
            "metric_count": len(metrics),
            "status": run.status.value,
            "rule_set_version": run.rule_set_version,
        },
    )
    await session.commit()
    return {
        "status": run.status.value,
        "analysis_run_id": str(run.id),
        "metric_count": len(metrics),
        "coverage": coverage,
    }
