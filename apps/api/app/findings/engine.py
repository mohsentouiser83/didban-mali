import hashlib
from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID

from app.analysis.models import MetricCode
from app.findings.models import (
    AssertionStatus,
    FindingCategory,
    FindingCode,
    FindingKind,
    FindingSeverity,
)
from app.reconciliation.models import MatchStatus


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
