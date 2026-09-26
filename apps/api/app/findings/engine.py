import hashlib
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid6 import uuid7

from app.analysis.models import MetricCode
from app.audit.service import record_audit_event
from app.calculations.models import CalculationRun, CalculationRunStatus, MetricResult
from app.financial.models import BankTransaction, Counterparty, SalesInvoice
from app.findings.models import (
    AssertionStatus,
    FinancialControlPolicy,
    Finding,
    FindingActivity,
    FindingCategory,
    FindingCode,
    FindingDetectionRun,
    FindingEvidence,
    FindingKind,
    FindingSeverity,
    FindingStatus,
    FindingSuppression,
    InAppAlert,
)
from app.findings.rules.base import FindingCandidate as RuleFindingCandidate
from app.findings.rules.registry import ALL_RULES
from app.reconciliation.models import MatchLevel, MatchStatus, ReconciliationMatch
from app.reconciliation.service import get_unmatched_records


@dataclass
class FindingEvaluationContext:
    company_id: UUID
    as_of_date: date
    policies: dict[str, dict[str, Any]] = field(default_factory=dict)
    suppressions: dict[str, FindingSuppression] = field(default_factory=dict)
    unmatched_bank_transactions: list[Any] = field(default_factory=list)
    unmatched_journal_lines: list[Any] = field(default_factory=list)
    duplicate_matches: list[Any] = field(default_factory=list)
    overdue_invoices: list[Any] = field(default_factory=list)
    customer_overdue_concentrations: list[dict[str, Any]] = field(default_factory=list)
    latest_calculation_run: CalculationRun | None = None
    metrics_by_key: dict[str, MetricResult] = field(default_factory=dict)


async def build_evaluation_context(
    session: AsyncSession,
    *,
    company_id: UUID,
    as_of_date: date | None = None,
    calculation_run_id: UUID | None = None,
    reconciliation_run_id: UUID | None = None,
) -> FindingEvaluationContext:
    now = datetime.now(UTC)
    current_date = as_of_date or now.date()

    # 1. Fetch company control policies
    policies_db = (
        await session.scalars(
            select(FinancialControlPolicy).where(FinancialControlPolicy.company_id == company_id)
        )
    ).all()
    policies: dict[str, dict[str, Any]] = {
        p.rule_code: {
            "is_enabled": p.is_enabled,
            "severity_override": p.severity_override,
            "thresholds": p.thresholds_json or {},
        }
        for p in policies_db
    }

    # 2. Fetch active suppressions
    suppressions_db = (
        await session.scalars(
            select(FindingSuppression).where(
                FindingSuppression.company_id == company_id,
                or_(
                    FindingSuppression.expires_at.is_(None),
                    FindingSuppression.expires_at > now,
                ),
            )
        )
    ).all()
    # Key by (rule_code, entity_id)
    suppressions: dict[str, FindingSuppression] = {
        f"{s.rule_code}:{s.entity_id}": s for s in suppressions_db
    }

    # 3. Fetch unmatched records
    unmatched_data = await get_unmatched_records(session, company_id=company_id)
    unmatched_banks = (
        await session.scalars(
            select(BankTransaction).where(
                BankTransaction.company_id == company_id,
                BankTransaction.id.in_([b["id"] for b in unmatched_data["bank_transactions"]]),
            )
        )
    ).all() if unmatched_data["bank_transactions"] else []

    # 4. Fetch duplicate reconciliation matches
    dup_matches = (
        await session.scalars(
            select(ReconciliationMatch).where(
                ReconciliationMatch.company_id == company_id,
                ReconciliationMatch.match_level == MatchLevel.DUPLICATE,
            )
        )
    ).all()

    # 5. Fetch overdue sales invoices
    invoices_db = (
        await session.scalars(
            select(SalesInvoice).where(
                SalesInvoice.company_id == company_id,
                SalesInvoice.due_date < current_date,
            )
        )
    ).all()

    # Calculate customer overdue concentrations
    def _inv_bal(inv: SalesInvoice) -> Decimal:
        return Decimal(inv.gross_amount_irr or 0) - Decimal(inv.paid_amount_irr or 0)

    total_overdue = sum((_inv_bal(inv) for inv in invoices_db), Decimal(0))
    customer_overdue_map: dict[UUID, Decimal] = {}
    for inv in invoices_db:
        if inv.counterparty_id:
            customer_overdue_map[inv.counterparty_id] = (
                customer_overdue_map.get(inv.counterparty_id, Decimal(0)) + _inv_bal(inv)
            )

    concentrations: list[dict[str, Any]] = []
    if total_overdue > 0:
        c_ids = list(customer_overdue_map.keys())
        parties = (
            await session.scalars(
                select(Counterparty).where(
                    Counterparty.company_id == company_id,
                    Counterparty.id.in_(c_ids),
                )
            )
        ).all() if c_ids else []
        party_names = {p.id: p.name for p in parties}

        for p_id, amt in customer_overdue_map.items():
            share = (amt / total_overdue) * Decimal(100)
            concentrations.append({
                "counterparty_id": p_id,
                "counterparty_name": party_names.get(p_id, "نامشخص"),
                "overdue_amount_irr": amt,
                "total_overdue_irr": total_overdue,
                "share_percentage": share,
            })

    # 6. Fetch calculation run & metrics
    calc_run: CalculationRun | None = None
    if calculation_run_id:
        calc_run = await session.scalar(
            select(CalculationRun).where(
                CalculationRun.id == calculation_run_id,
                CalculationRun.company_id == company_id,
            )
        )
    else:
        calc_run = await session.scalar(
            select(CalculationRun)
            .where(
                CalculationRun.company_id == company_id,
                CalculationRun.status == CalculationRunStatus.COMPLETED,
            )
            .order_by(CalculationRun.created_at.desc())
            .limit(1)
        )

    metrics_by_key: dict[str, MetricResult] = {}
    if calc_run:
        metrics = (
            await session.scalars(
                select(MetricResult).where(
                    MetricResult.company_id == company_id,
                    MetricResult.calculation_run_id == calc_run.id,
                )
            )
        ).all()
        metrics_by_key = {m.metric_key: m for m in metrics}

    return FindingEvaluationContext(
        company_id=company_id,
        as_of_date=current_date,
        policies=policies,
        suppressions=suppressions,
        unmatched_bank_transactions=list(unmatched_banks),
        unmatched_journal_lines=unmatched_data["journal_lines"],
        duplicate_matches=list(dup_matches),
        overdue_invoices=list(invoices_db),
        customer_overdue_concentrations=concentrations,
        latest_calculation_run=calc_run,
        metrics_by_key=metrics_by_key,
    )


async def execute_finding_detection(
    session: AsyncSession,
    *,
    company_id: UUID,
    actor_id: UUID,
    trigger_type: str = "manual",
    period_start: date | None = None,
    period_end: date | None = None,
    calculation_run_id: UUID | None = None,
    reconciliation_run_id: UUID | None = None,
) -> FindingDetectionRun:
    """Execute all deterministic finding rules, updating existing findings or creating new ones."""
    now = datetime.now(UTC)
    context = await build_evaluation_context(
        session,
        company_id=company_id,
        as_of_date=period_end or now.date(),
        calculation_run_id=calculation_run_id,
        reconciliation_run_id=reconciliation_run_id,
    )

    all_candidates: list[RuleFindingCandidate] = []
    for rule in ALL_RULES:
        policy = context.policies.get(rule.rule_code, {})
        # Skip if explicitly disabled in policy
        if policy.get("is_enabled") is False:
            continue
        try:
            candidates = await rule.evaluate(context)
            all_candidates.extend(candidates)
        except Exception:
            # Keep evaluation resilient across rules
            continue

    created_count = 0
    updated_count = 0
    suppressed_count = 0

    # Fetch existing findings for this company to match fingerprints
    fps = [c.fingerprint for c in all_candidates]
    existing_findings_db = (
        await session.scalars(
            select(Finding).where(
                Finding.company_id == company_id,
                Finding.fingerprint.in_(fps),
            )
        )
    ).all() if fps else []
    existing_by_fp = {f.fingerprint: f for f in existing_findings_db}

    for c in all_candidates:
        suppression_key = f"{c.rule_code}:{c.source_entity_id}"
        is_supp = suppression_key in context.suppressions
        if is_supp:
            suppressed_count += 1

        if c.fingerprint in existing_by_fp:
            # Update existing finding
            f = existing_by_fp[c.fingerprint]
            f.severity = c.severity
            f.title_fa = c.title_fa
            f.summary_fa = c.summary_fa
            f.financial_impact_irr = c.financial_impact_irr
            f.is_suppressed = is_supp
            f.updated_at = now
            updated_count += 1
        else:
            # Create new finding
            new_id = uuid7()
            f = Finding(
                id=new_id,
                company_id=company_id,
                fingerprint=c.fingerprint,
                rule_code=c.rule_code,
                category=c.category,
                severity=c.severity,
                title_fa=c.title_fa,
                summary_fa=c.summary_fa,
                financial_impact_irr=c.financial_impact_irr,
                status=FindingStatus.NEW,
                source_entity_type=c.source_entity_type,
                source_entity_id=c.source_entity_id,
                reconciliation_match_id=c.reconciliation_match_id,
                calculation_run_id=c.calculation_run_id,
                is_suppressed=is_supp,
                period_start=c.period_start,
                period_end=c.period_end,
                created_at=now,
                updated_at=now,
            )
            session.add(f)
            created_count += 1

            # Insert evidence items
            for ev in c.evidence_items:
                session.add(
                    FindingEvidence(
                        id=uuid7(),
                        company_id=company_id,
                        finding_id=new_id,
                        ordinal=ev.ordinal,
                        evidence_type=ev.evidence_type,
                        title_fa=ev.title_fa,
                        description_fa=ev.description_fa,
                        payload_json=ev.payload,
                        created_at=now,
                    )
                )

            # Insert detection activity
            session.add(
                FindingActivity(
                    id=uuid7(),
                    company_id=company_id,
                    finding_id=new_id,
                    user_id=None,
                    action_type="detected",
                    old_state=None,
                    new_state=FindingStatus.NEW,
                    note=f"شناسایی خودکار مغایرت توسط قانون «{c.rule_code}» با سطح اهمیت {c.severity}",
                    metadata_json={"rule_code": c.rule_code, "severity": c.severity},
                    created_at=now,
                )
            )

            # If CRITICAL or HIGH, generate an In-App Alert
            if c.severity in {"critical", "high"} and not is_supp:
                session.add(
                    InAppAlert(
                        id=uuid7(),
                        company_id=company_id,
                        finding_id=new_id,
                        user_id=None,  # company-wide notification
                        title_fa=f"هشدار کنترل مالی: {c.title_fa}",
                        summary_fa=c.summary_fa,
                        severity=c.severity,
                        is_read=False,
                        created_at=now,
                    )
                )

    run = FindingDetectionRun(
        id=uuid7(),
        company_id=company_id,
        trigger_type=trigger_type,
        status="completed",
        period_start=period_start or context.as_of_date,
        period_end=period_end or context.as_of_date,
        calculation_run_id=calculation_run_id or (context.latest_calculation_run.id if context.latest_calculation_run else None),
        reconciliation_run_id=reconciliation_run_id,
        findings_detected=len(all_candidates),
        findings_created=created_count,
        findings_updated=updated_count,
        findings_suppressed=suppressed_count,
        summary_json={
            "total_candidates": len(all_candidates),
            "created": created_count,
            "updated": updated_count,
            "suppressed": suppressed_count,
        },
        created_by=actor_id,
        started_at=now,
        completed_at=now,
        created_at=now,
    )
    session.add(run)

    record_audit_event(
        session,
        action="findings.detection_completed",
        entity_type="finding_detection_run",
        actor_id=actor_id,
        entity_id=run.id,
        company_id=company_id,
        metadata={
            "detected": len(all_candidates),
            "created": created_count,
            "updated": updated_count,
            "suppressed": suppressed_count,
        },
    )

    await session.commit()
    await session.refresh(run)
    return run


# ==========================================
# Legacy Compatibility Classes & Functions
# ==========================================

@dataclass(frozen=True)
class FindingConfig:
    trend_ratio: Decimal = Decimal("0.10")
    minimum_amount_irr: Decimal = Decimal("1000000")


@dataclass(frozen=True)
class ReconciliationSignal:
    id: UUID
    bank_transaction_id: UUID | None
    journal_entry_id: UUID | None
    status: MatchStatus
    score: Decimal
    amount_difference_irr: Decimal | None
    date_difference_days: int | None
    rule_code: str
    reference_amount_irr: Decimal | None = None


@dataclass(frozen=True)
class FindingCandidate:
    finding_code: FindingCode
    kind: FindingKind
    category: FindingCategory
    title_fa: str
    summary_fa: str
    assertion_status: AssertionStatus
    severity: FindingSeverity
    confidence_score: Decimal
    confidence_basis: dict[str, object]
    affected_amount_irr: Decimal | None
    affected_ratio: Decimal | None
    reason_code: str
    reason_parameters: dict[str, object]
    calculation: dict[str, object]
    source_key: str
    reconciliation_match_id: UUID | None = None

    def fingerprint(self, analysis_run_id: UUID, rule_version: str) -> str:
        payload = f"{analysis_run_id}:{self.finding_code.value}:{self.source_key}:{rule_version}"
        return hashlib.sha256(payload.encode()).hexdigest()


RECONCILIATION_META = {
    FindingCode.POTENTIAL_MISSING_TRANSACTION: (
        FindingKind.RISK,
        "تراکنش احتمالاً فاقد ثبت متناظر است — نیازمند بررسی",
    ),
    FindingCode.DUPLICATE_TRANSACTION: (
        FindingKind.ANOMALY,
        "تراکنش تکراری احتمالی — نیازمند بررسی",
    ),
    FindingCode.AMOUNT_MISMATCH: (
        FindingKind.DISCREPANCY,
        "مغایرت مبلغ میان بانک و حسابداری مشاهده شد",
    ),
    FindingCode.DATE_MISMATCH: (
        FindingKind.DISCREPANCY,
        "مغایرت تاریخ میان بانک و حسابداری مشاهده شد",
    ),
}


def reconciliation_findings(
    signals: list[ReconciliationSignal],
) -> list[FindingCandidate]:
    candidates: list[FindingCandidate] = []
    potential_bank_seen: set[UUID] = set()
    for signal in signals:
        code: FindingCode | None = None
        if signal.status in {MatchStatus.UNRESOLVED, MatchStatus.POTENTIAL_MATCH}:
            if signal.status == MatchStatus.POTENTIAL_MATCH and signal.bank_transaction_id:
                if signal.bank_transaction_id in potential_bank_seen:
                    continue
                potential_bank_seen.add(signal.bank_transaction_id)
            code = FindingCode.POTENTIAL_MISSING_TRANSACTION
        elif signal.status in {MatchStatus.DUPLICATE_HIGH, MatchStatus.DUPLICATE_POSSIBLE}:
            code = FindingCode.DUPLICATE_TRANSACTION
        elif signal.status == MatchStatus.AMOUNT_MISMATCH:
            code = FindingCode.AMOUNT_MISMATCH
        elif signal.status == MatchStatus.DATE_MISMATCH:
            code = FindingCode.DATE_MISMATCH
        if code is None:
            continue
        kind, title = RECONCILIATION_META[code]
        hypothesis = code in {
            FindingCode.POTENTIAL_MISSING_TRANSACTION,
            FindingCode.DUPLICATE_TRANSACTION,
        }
        amount = (
            abs(signal.amount_difference_irr)
            if signal.amount_difference_irr
            else (
                abs(signal.reference_amount_irr)
                if signal.reference_amount_irr is not None
                else None
            )
        )
        source_key = str(signal.bank_transaction_id or signal.journal_entry_id or signal.id)
        candidates.append(
            FindingCandidate(
                finding_code=code,
                kind=kind,
                category=FindingCategory.RECONCILIATION,
                title_fa=title,
                summary_fa=(
                    "تطبیق قطعی برای این رکورد پیدا نشده و تصمیم نهایی به بررسی انسانی نیاز دارد."
                    if code == FindingCode.POTENTIAL_MISSING_TRANSACTION
                    else "نتیجه بر پایه مقایسه قطعی ویژگی‌های دو منبع ثبت شده است."
                ),
                assertion_status=(
                    AssertionStatus.HYPOTHESIS if hypothesis else AssertionStatus.DETERMINISTIC
                ),
                severity=(
                    FindingSeverity.HIGH
                    if code == FindingCode.AMOUNT_MISMATCH
                    else FindingSeverity.MEDIUM
                ),
                confidence_score=(
                    Decimal("100") if not hypothesis else min(Decimal("95"), signal.score)
                ),
                confidence_basis={
                    "reconciliation_status": signal.status.value,
                    "match_score": str(signal.score),
                    "rule_code": signal.rule_code,
                },
                affected_amount_irr=amount,
                affected_ratio=None,
                reason_code=f"RECONCILIATION_{signal.status.value.upper()}",
                reason_parameters={
                    "bank_transaction_id": (
                        str(signal.bank_transaction_id) if signal.bank_transaction_id else None
                    ),
                    "journal_entry_id": (
                        str(signal.journal_entry_id) if signal.journal_entry_id else None
                    ),
                    "date_difference_days": signal.date_difference_days,
                },
                calculation={
                    "amount_difference_irr": (
                        str(signal.amount_difference_irr)
                        if signal.amount_difference_irr is not None
                        else None
                    ),
                    "date_difference_days": signal.date_difference_days,
                },
                source_key=source_key,
                reconciliation_match_id=signal.id,
            )
        )
    return candidates


TREND_META = {
    FindingCode.REVENUE_DROP: (
        MetricCode.REVENUE_IRR,
        FindingKind.RISK,
        "کاهش درآمد نسبت به دوره قبل مشاهده شد",
        "decrease",
    ),
    FindingCode.PROFIT_DROP: (
        MetricCode.NET_PROFIT_IRR,
        FindingKind.RISK,
        "کاهش سود نسبت به دوره قبل مشاهده شد",
        "decrease",
    ),
    FindingCode.EXPENSE_INCREASE: (
        MetricCode.EXPENSES_IRR,
        FindingKind.RISK,
        "افزایش هزینه نسبت به دوره قبل مشاهده شد",
        "increase",
    ),
    FindingCode.RECEIVABLES_INCREASE: (
        MetricCode.SALES_OUTSTANDING_IRR,
        FindingKind.RISK,
        "افزایش مطالبات فروش نسبت به دوره قبل مشاهده شد",
        "increase",
    ),
}


def trend_findings(
    current: dict[MetricCode, Decimal],
    previous: dict[MetricCode, Decimal],
    previous_run_id: UUID,
    config: FindingConfig,
) -> list[FindingCandidate]:
    candidates: list[FindingCandidate] = []
    for code, (metric_code, kind, title, direction) in TREND_META.items():
        if metric_code not in current or metric_code not in previous:
            continue
        current_value, previous_value = current[metric_code], previous[metric_code]
        difference = (
            previous_value - current_value
            if direction == "decrease"
            else current_value - previous_value
        )
        if difference < config.minimum_amount_irr:
            continue
        ratio = difference / abs(previous_value) if previous_value != 0 else None
        if ratio is not None and ratio < config.trend_ratio:
            continue
        if ratio is None and current_value <= 0:
            continue
        candidates.append(
            FindingCandidate(
                finding_code=code,
                kind=kind,
                category=FindingCategory.FINANCIAL_ANALYSIS,
                title_fa=title,
                summary_fa="تغییر شاخص از آستانه نسخه‌دار موتور عبور کرده است.",
                assertion_status=AssertionStatus.DETERMINISTIC,
                severity=FindingSeverity.MEDIUM,
                confidence_score=Decimal("100"),
                confidence_basis={
                    "current_metric": metric_code.value,
                    "comparison_run_id": str(previous_run_id),
                },
                affected_amount_irr=difference,
                affected_ratio=(ratio.quantize(Decimal("0.000001")) if ratio is not None else None),
                reason_code=f"{code.value.upper()}_THRESHOLD",
                reason_parameters={
                    "metric_code": metric_code.value,
                    "trend_ratio_threshold": str(config.trend_ratio),
                    "minimum_amount_irr": str(config.minimum_amount_irr),
                },
                calculation={
                    "current_value_irr": str(current_value),
                    "previous_value_irr": str(previous_value),
                    "difference_irr": str(difference),
                    "change_ratio": str(ratio) if ratio is not None else None,
                    "direction": direction,
                },
                source_key=f"{previous_run_id}:{metric_code.value}",
            )
        )
    return candidates

