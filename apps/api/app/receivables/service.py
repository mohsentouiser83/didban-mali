from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.engine import Row
from sqlalchemy.ext.asyncio import AsyncSession

from app.calculations.base import CalculationContext
from app.calculations.dso import DSOCalculator
from app.calculations.models import FinancialPolicy
from app.financial.models import Counterparty, SalesInvoice
from app.receivables.schemas import (
    AgingBucketDetail,
    BucketKey,
    CustomerReceivableItem,
    CustomersReceivablesResponse,
    InvoicesReceivablesResponse,
    ReceivableInvoiceItem,
    ReceivablesSummaryResponse,
    RiskLevel,
)

ZERO = Decimal(0)

BUCKET_CONFIG: list[tuple[BucketKey, str]] = [
    ("not_due", "جاری (قبل از سررسید)"),
    ("1_30", "۱ تا ۳۰ روز معوق"),
    ("31_60", "۳۱ تا ۶۰ روز معوق"),
    ("61_90", "۶۱ تا ۹۰ روز معوق"),
    ("90_plus", "بیش از ۹۰ روز معوق"),
    ("due_date_missing", "سررسید نامشخص"),
]


@dataclass
class _CustomerAccumulator:
    counterparty: Counterparty
    total_outstanding: Decimal = ZERO
    overdue_amount: Decimal = ZERO
    delays: list[int] = field(default_factory=list)
    buckets: dict[BucketKey, Decimal] = field(
        default_factory=lambda: {k: ZERO for k, _ in BUCKET_CONFIG}
    )
    open_count: int = 0


def _classify_delay(delay_days: int) -> BucketKey:
    if delay_days <= 0:
        return "not_due"
    if delay_days <= 30:
        return "1_30"
    if delay_days <= 60:
        return "31_60"
    if delay_days <= 90:
        return "61_90"
    return "90_plus"


async def _resolve_as_of_date(
    session: AsyncSession, company_id: UUID, explicit_date: date | None
) -> date:
    if explicit_date is not None:
        return explicit_date
    max_issue = (
        await session.execute(
            select(func.max(SalesInvoice.issue_date)).where(SalesInvoice.company_id == company_id)
        )
    ).scalar_one_or_none()
    today = date.today()
    if max_issue and max_issue > today:
        return max_issue
    return max_issue or today


async def get_receivables_summary(
    session: AsyncSession, company_id: UUID, as_of_date: date | None = None
) -> ReceivablesSummaryResponse:
    effective_date = await _resolve_as_of_date(session, company_id, as_of_date)

    query = (
        select(SalesInvoice, Counterparty)
        .join(Counterparty, SalesInvoice.counterparty_id == Counterparty.id)
        .where(SalesInvoice.company_id == company_id, SalesInvoice.issue_date <= effective_date)
    )
    results = (await session.execute(query)).all()

    bucket_totals: dict[BucketKey, Decimal] = {k: ZERO for k, _ in BUCKET_CONFIG}
    bucket_counts: dict[BucketKey, int] = {k: 0 for k, _ in BUCKET_CONFIG}
    total_receivables = ZERO
    total_overdue = ZERO
    all_customers: set[UUID] = set()

    for invoice, counterparty in results:
        remaining = invoice.gross_amount_irr - (invoice.paid_amount_irr or ZERO)
        if remaining <= ZERO:
            continue

        all_customers.add(counterparty.id)
        total_receivables += remaining

        delay = (effective_date - invoice.due_date).days if invoice.due_date else 0
        bucket = _classify_delay(delay) if invoice.due_date else "due_date_missing"

        bucket_totals[bucket] += remaining
        bucket_counts[bucket] += 1

        if delay > 0:
            total_overdue += remaining

    overdue_ratio = (
        float((total_overdue / total_receivables).quantize(Decimal("0.0001")))
        if total_receivables > ZERO
        else 0.0
    )

    buckets_detail: list[AgingBucketDetail] = []
    for key, label in BUCKET_CONFIG:
        amt = bucket_totals[key]
        cnt = bucket_counts[key]
        pct = (
            float((amt / total_receivables * 100).quantize(Decimal("0.1")))
            if total_receivables > ZERO
            else 0.0
        )
        buckets_detail.append(
            AgingBucketDetail(
                bucket_key=key,
                label_fa=label,
                amount_irr=amt,
                invoice_count=cnt,
                share_percentage=pct,
            )
        )

    policy = await session.scalar(
        select(FinancialPolicy).where(FinancialPolicy.company_id == company_id)
    )
    if policy is None:
        policy = FinancialPolicy(
            company_id=company_id, dso_period_days=90, dso_method="sales_proxy"
        )
    dso = await DSOCalculator().calculate(
        CalculationContext(
            company_id=company_id,
            as_of_date=effective_date,
            period_start=effective_date,
            period_end=effective_date,
            policy=policy,
            session=session,
            extra={"open_receivables": total_receivables},
        )
    )
    customer_items = _customer_items(results, effective_date)

    return ReceivablesSummaryResponse(
        as_of_date=effective_date,
        total_receivables_irr=total_receivables,
        total_overdue_irr=total_overdue,
        overdue_ratio=overdue_ratio,
        dso_days=float(dso.value_numeric) if dso.value_numeric is not None else None,
        dso_period_days=policy.dso_period_days,
        dso_warnings=dso.warnings,
        customer_count=len(all_customers),
        high_risk_customer_count=sum(
            item.risk_level in ("high", "critical") for item in customer_items
        ),
        buckets=buckets_detail,
    )


async def get_customer_receivables(
    session: AsyncSession, company_id: UUID, as_of_date: date | None = None
) -> CustomersReceivablesResponse:
    effective_date = await _resolve_as_of_date(session, company_id, as_of_date)

    query = (
        select(SalesInvoice, Counterparty)
        .join(Counterparty, SalesInvoice.counterparty_id == Counterparty.id)
        .where(SalesInvoice.company_id == company_id, SalesInvoice.issue_date <= effective_date)
    )
    results = (await session.execute(query)).all()

    return CustomersReceivablesResponse(
        as_of_date=effective_date, items=_customer_items(results, effective_date)
    )


def _customer_items(
    results: Sequence[Row[tuple[SalesInvoice, Counterparty]]], effective_date: date
) -> list[CustomerReceivableItem]:
    customer_map: dict[UUID, _CustomerAccumulator] = {}

    for invoice, counterparty in results:
        remaining = invoice.gross_amount_irr - (invoice.paid_amount_irr or ZERO)
        if remaining <= ZERO:
            continue

        cid = counterparty.id
        if cid not in customer_map:
            customer_map[cid] = _CustomerAccumulator(counterparty=counterparty)

        data = customer_map[cid]
        data.total_outstanding += remaining
        data.open_count += 1

        delay = (effective_date - invoice.due_date).days if invoice.due_date else 0
        bucket = _classify_delay(delay) if invoice.due_date else "due_date_missing"

        data.buckets[bucket] += remaining

        if delay > 0:
            data.overdue_amount += remaining
            data.delays.append(delay)

    items: list[CustomerReceivableItem] = []
    for cid, data in customer_map.items():
        counterparty = data.counterparty
        total_out = data.total_outstanding
        overdue_amt = data.overdue_amount
        delays = data.delays
        buckets = data.buckets
        open_count = data.open_count

        overdue_ratio = (
            float((overdue_amt / total_out).quantize(Decimal("0.0001")))
            if total_out > ZERO
            else 0.0
        )
        avg_delay = round(sum(delays) / len(delays)) if delays else 0

        # Scoring
        if overdue_amt == ZERO:
            risk_score = 10
            risk_level: RiskLevel = "low"
            action = "حفظ ارتباط دوره‌ای و صدور صورتحساب‌های آتی"
        else:
            share_pts = overdue_ratio * 45
            stale_pts = (
                35
                if (buckets["90_plus"] > ZERO)
                else (20 if (buckets["61_90"] > ZERO) else (10 if (buckets["31_60"] > ZERO) else 5))
            )
            delay_pts = min(20, round(avg_delay / 4))
            risk_score = min(100, max(0, round(share_pts + stale_pts + delay_pts)))

            if risk_score >= 70 or buckets["90_plus"] > (total_out * Decimal("0.4")):
                risk_level = "critical"
                action = "مانده و اسناد را تطبیق دهید؛ ارجاع به مدیر مالی برای بررسی برنامه وصول و شرایط اعتبار طبق سیاست شرکت."
            elif risk_score >= 45:
                risk_level = "high"
                action = "دریافت‌های جدید را تطبیق دهید و برنامه پرداخت را با مشتری بررسی کنید؛ شرایط اعتبار نیاز به تصمیم مدیر مالی دارد."
            elif risk_score >= 25:
                risk_level = "medium"
                action = "پیگیری تلفنی کارشناس وصول مطالبات و ارسال صورت‌وضعیت"
            else:
                risk_level = "low"
                action = "یادآوری سررسید و تطبیق حساب"

        formatted_buckets = {k: format(v, "f") for k, v in buckets.items()}

        items.append(
            CustomerReceivableItem(
                counterparty_id=cid,
                name=counterparty.name,
                national_id=counterparty.national_id,
                total_outstanding_irr=total_out,
                overdue_amount_irr=overdue_amt,
                overdue_ratio=overdue_ratio,
                avg_delay_days=avg_delay,
                risk_level=risk_level,
                risk_score=risk_score,
                recommended_action=action,
                risk_assessment_incomplete=buckets["due_date_missing"] > ZERO,
                buckets=formatted_buckets,
                open_invoices_count=open_count,
            )
        )

    # Sort customers by risk score descending, then overdue amount descending
    items.sort(key=lambda x: (x.risk_score, x.overdue_amount_irr), reverse=True)

    return items


async def get_receivable_invoices(
    session: AsyncSession,
    company_id: UUID,
    as_of_date: date | None = None,
    bucket_key: BucketKey | None = None,
    counterparty_id: UUID | None = None,
) -> InvoicesReceivablesResponse:
    effective_date = await _resolve_as_of_date(session, company_id, as_of_date)

    query = (
        select(SalesInvoice, Counterparty)
        .join(Counterparty, SalesInvoice.counterparty_id == Counterparty.id)
        .where(SalesInvoice.company_id == company_id, SalesInvoice.issue_date <= effective_date)
    )
    if counterparty_id is not None:
        query = query.where(SalesInvoice.counterparty_id == counterparty_id)

    results = (await session.execute(query)).all()

    items: list[ReceivableInvoiceItem] = []
    for invoice, counterparty in results:
        remaining = invoice.gross_amount_irr - (invoice.paid_amount_irr or ZERO)
        if remaining <= ZERO:
            continue

        delay = (effective_date - invoice.due_date).days if invoice.due_date else 0
        bucket = _classify_delay(delay) if invoice.due_date else "due_date_missing"

        if bucket_key is not None and bucket != bucket_key:
            continue

        items.append(
            ReceivableInvoiceItem(
                id=invoice.id,
                invoice_no=invoice.invoice_no,
                counterparty_id=counterparty.id,
                counterparty_name=counterparty.name,
                issue_date=invoice.issue_date,
                due_date=invoice.due_date,
                gross_amount_irr=invoice.gross_amount_irr,
                paid_amount_irr=invoice.paid_amount_irr or ZERO,
                remaining_amount_irr=remaining,
                delay_days=max(0, delay),
                bucket_key=bucket,
                status=invoice.status,
            )
        )

    # Sort by delay days descending (highest overdue first)
    items.sort(key=lambda x: (x.delay_days, x.remaining_amount_irr), reverse=True)

    return InvoicesReceivablesResponse(as_of_date=effective_date, items=items)
