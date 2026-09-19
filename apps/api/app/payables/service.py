from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.financial.models import (
    AccountClass,
    AccountClassification,
    BankTransaction,
    Counterparty,
    JournalEntry,
    JournalLine,
    SalesInvoice,
)
from app.payables.schemas import (
    PayableAgingBucketDetail,
    PayablesBucketKey,
    PayablesRiskLevel,
    PayablesSummaryResponse,
    VendorPayableItem,
    VendorsPayablesResponse,
)
from app.receivables.service import get_receivables_summary

ZERO = Decimal(0)

BUCKET_CONFIG: list[tuple[PayablesBucketKey, str]] = [
    ("not_due", "جاری (قبل از سررسید)"),
    ("1_30", "۱ تا ۳۰ روز تاخیر پرداخت"),
    ("31_60", "۳۱ تا ۶۰ روز تاخیر پرداخت"),
    ("61_90", "۶۱ تا ۹۰ روز تاخیر پرداخت"),
    ("90_plus", "بیش از ۹۰ روز تاخیر (خطر توقف تامین)"),
]


@dataclass
class _VendorAccumulator:
    counterparty: Counterparty
    total_payable: Decimal = ZERO
    overdue_amount: Decimal = ZERO
    delays: list[int] = field(default_factory=list)
    buckets: dict[PayablesBucketKey, Decimal] = field(
        default_factory=lambda: {k: ZERO for k, _ in BUCKET_CONFIG}
    )


def _classify_delay(delay_days: int) -> PayablesBucketKey:
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
    if explicit_date:
        return explicit_date

    max_bank_date = await session.scalar(
        select(func.max(BankTransaction.booking_date)).where(
            BankTransaction.company_id == company_id
        )
    )
    max_inv_date = await session.scalar(
        select(func.max(SalesInvoice.issue_date)).where(
            SalesInvoice.company_id == company_id
        )
    )

    dates = [d for d in (max_bank_date, max_inv_date) if d is not None]
    return max(dates) if dates else date.today()


async def get_payables_summary(
    session: AsyncSession, company_id: UUID, as_of_date: date | None = None
) -> PayablesSummaryResponse:
    effective_date = await _resolve_as_of_date(session, company_id, as_of_date)
    vendors_res = await get_vendors_payables(session, company_id, effective_date)

    total_payables = sum((v.total_payable_irr for v in vendors_res.items), ZERO)
    total_overdue = sum((v.overdue_amount_irr for v in vendors_res.items), ZERO)

    overdue_ratio = (
        float((total_overdue / total_payables).quantize(Decimal("0.0001")))
        if total_payables > ZERO
        else 0.0
    )

    high_risk_count = sum(1 for v in vendors_res.items if v.risk_level in ("high", "critical"))

    # Compute aggregate buckets
    bucket_sums: dict[PayablesBucketKey, Decimal] = {k: ZERO for k, _ in BUCKET_CONFIG}
    bucket_vendor_counts: dict[PayablesBucketKey, set[UUID]] = {k: set() for k, _ in BUCKET_CONFIG}

    for v in vendors_res.items:
        for k, _ in BUCKET_CONFIG:
            amt = Decimal(v.buckets[k])
            if amt > ZERO:
                bucket_sums[k] += amt
                bucket_vendor_counts[k].add(v.counterparty_id)

    buckets_detail: list[PayableAgingBucketDetail] = []
    for k, label in BUCKET_CONFIG:
        amt = bucket_sums[k]
        share = (
            float((amt / total_payables * 100).quantize(Decimal("0.1")))
            if total_payables > ZERO
            else 0.0
        )
        buckets_detail.append(
            PayableAgingBucketDetail(
                bucket_key=k,
                label_fa=label,
                amount_irr=amt,
                vendor_count=len(bucket_vendor_counts[k]),
                share_percentage=share,
            )
        )

    # Calculate DPO: (Total Payables / Annualized Outflows) * 365
    # Fetch outflows from preceding 90 days
    start_90_days = effective_date - timedelta(days=90)
    outflows_90 = await session.scalar(
        select(func.sum(func.abs(BankTransaction.amount_irr))).where(
            BankTransaction.company_id == company_id,
            BankTransaction.booking_date >= start_90_days,
            BankTransaction.booking_date <= effective_date,
            BankTransaction.amount_irr < 0,
        )
    )

    if outflows_90 and outflows_90 > ZERO and total_payables > ZERO:
        annualized_cogs = outflows_90 * Decimal(4)
        dpo_days = int((total_payables / annualized_cogs * Decimal(365)).quantize(Decimal("1")))
    else:
        dpo_days = 45 if total_payables > ZERO else 0

    # Fetch DSO from receivables
    try:
        rec_summary = await get_receivables_summary(session, company_id, effective_date)
        dso_days = rec_summary.dso_days
    except Exception:
        dso_days = 45

    # Cash Conversion Cycle (CCC = DSO - DPO)
    ccc_days = dso_days - dpo_days

    return PayablesSummaryResponse(
        as_of_date=effective_date,
        total_payables_irr=total_payables,
        total_overdue_irr=total_overdue,
        overdue_ratio=overdue_ratio,
        dpo_days=dpo_days,
        dso_days=dso_days,
        ccc_days=ccc_days,
        vendor_count=len(vendors_res.items),
        high_risk_vendor_count=high_risk_count,
        buckets=buckets_detail,
    )


async def get_vendors_payables(
    session: AsyncSession, company_id: UUID, as_of_date: date | None = None
) -> VendorsPayablesResponse:
    effective_date = await _resolve_as_of_date(session, company_id, as_of_date)

    # 1. Fetch liability journal lines with counterparty
    query = (
        select(JournalLine, JournalEntry, Counterparty)
        .join(JournalEntry, JournalLine.entry_id == JournalEntry.id)
        .join(Counterparty, JournalLine.counterparty_id == Counterparty.id)
        .join(
            AccountClassification,
            (AccountClassification.account_id == JournalLine.account_id)
            & (AccountClassification.account_class == AccountClass.LIABILITY),
        )
        .where(
            JournalLine.company_id == company_id,
            JournalEntry.entry_date <= effective_date,
        )
    )
    results = (await session.execute(query)).all()

    vendor_map: dict[UUID, _VendorAccumulator] = {}

    for line, entry, counterparty in results:
        # For liability: net balance is credit - debit
        net_amount = line.credit_irr - line.debit_irr
        if net_amount == ZERO:
            continue

        cid = counterparty.id
        if cid not in vendor_map:
            vendor_map[cid] = _VendorAccumulator(counterparty=counterparty)

        data = vendor_map[cid]
        data.total_payable += net_amount

        # Delay relative to entry date + standard 45-day vendor credit term
        due_date = entry.entry_date + timedelta(days=45)
        delay = (effective_date - due_date).days
        bucket = _classify_delay(delay)

        if net_amount > ZERO:
            data.buckets[bucket] += net_amount
            if delay > 0:
                data.overdue_amount += net_amount
                data.delays.append(delay)

    # Also check counterparties marked as vendor/supplier that have no journal lines yet
    vendor_cparties = (
        await session.execute(
            select(Counterparty).where(
                Counterparty.company_id == company_id,
                Counterparty.kind.in_(["vendor", "supplier"]),
            )
        )
    ).scalars().all()

    for cp in vendor_cparties:
        if cp.id not in vendor_map:
            vendor_map[cp.id] = _VendorAccumulator(counterparty=cp)

    total_all_payables = sum(
        (data.total_payable for data in vendor_map.values() if data.total_payable > ZERO),
        ZERO,
    )

    items: list[VendorPayableItem] = []
    for cid, data in vendor_map.items():
        if data.total_payable <= ZERO:
            continue

        total_pay = data.total_payable
        overdue_amt = min(total_pay, data.overdue_amount)
        delays = data.delays
        buckets = data.buckets

        overdue_ratio = (
            float((overdue_amt / total_pay).quantize(Decimal("0.0001")))
            if total_pay > ZERO
            else 0.0
        )
        avg_delay = round(sum(delays) / len(delays)) if delays else 0
        share_total = (
            float((total_pay / total_all_payables * 100).quantize(Decimal("0.1")))
            if total_all_payables > ZERO
            else 0.0
        )

        # Risk scoring
        if overdue_amt == ZERO:
            risk_score = 10
            risk_level: PayablesRiskLevel = "low"
            action = "حفظ اعتبار تجاری و پرداخت در موعد سررسید توافقی"
        else:
            share_pts = overdue_ratio * 40
            stale_pts = (
                35
                if buckets["90_plus"] > ZERO
                else (20 if buckets["61_90"] > ZERO else (10 if buckets["31_60"] > ZERO else 5))
            )
            delay_pts = min(25, round(avg_delay / 4))
            risk_score = min(100, max(0, round(share_pts + stale_pts + delay_pts)))

            if risk_score >= 70 or buckets["90_plus"] > (total_pay * Decimal("0.3")):
                risk_level = "critical"
                action = "مذاکره فوری مدیرعامل/مالی جهت جلوگیری از لغو قرارداد و توقف خط تولید"
            elif risk_score >= 45:
                risk_level = "high"
                action = "صدور چک صیادی جدید یا تسویه بخشی از بدهی معوق جهت حفظ سفارشات جاری"
            elif risk_score >= 25:
                risk_level = "medium"
                action = "هماهنگی با امور مالی تامین‌کننده و درخواست تمدید مهلت پرداخت"
            else:
                risk_level = "low"
                action = "یادآوری سررسید و تطبیق حساب معین بستانکاران"

        formatted_buckets = {k: format(v, "f") for k, v in buckets.items()}

        items.append(
            VendorPayableItem(
                counterparty_id=cid,
                name=data.counterparty.name,
                national_id=data.counterparty.national_id,
                total_payable_irr=total_pay,
                overdue_amount_irr=overdue_amt,
                overdue_ratio=overdue_ratio,
                avg_delay_days=avg_delay,
                risk_level=risk_level,
                risk_score=risk_score,
                recommended_action=action,
                buckets=formatted_buckets,
                share_of_total_payables=share_total,
            )
        )

    # Sort vendors by risk score descending, then total payable descending
    items.sort(key=lambda x: (x.risk_score, x.total_payable_irr), reverse=True)

    return VendorsPayablesResponse(as_of_date=effective_date, items=items)
