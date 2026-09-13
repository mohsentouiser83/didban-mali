from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from app.findings.models import FindingCode, PriorityBand

HUNDRED = Decimal("100")
CENT = Decimal("0.01")


@dataclass(frozen=True)
class PriorityConfig:
    impact_weight: Decimal = Decimal("0.40")
    materiality_weight: Decimal = Decimal("0.25")
    confidence_weight: Decimal = Decimal("0.20")
    urgency_weight: Decimal = Decimal("0.15")
    critical_threshold: Decimal = Decimal("80")
    high_threshold: Decimal = Decimal("60")
    medium_threshold: Decimal = Decimal("35")
    materiality_amount_irr: Decimal = Decimal("100000000")
    revenue_ratio_full_score: Decimal = Decimal("0.20")
    critical_minimum_confidence: Decimal = Decimal("70")

    def as_dict(self) -> dict[str, object]:
        return {
            "weights": {
                "impact": str(self.impact_weight),
                "materiality": str(self.materiality_weight),
                "confidence": str(self.confidence_weight),
                "urgency": str(self.urgency_weight),
            },
            "bands": {
                "critical": str(self.critical_threshold),
                "high": str(self.high_threshold),
                "medium": str(self.medium_threshold),
            },
            "materiality_amount_irr": str(self.materiality_amount_irr),
            "revenue_ratio_full_score": str(self.revenue_ratio_full_score),
            "critical_minimum_confidence": str(self.critical_minimum_confidence),
        }


@dataclass(frozen=True)
class PriorityResult:
    band: PriorityBand
    score: Decimal
    explanation: dict[str, object]


IMPACT_SCORES = {
    FindingCode.POTENTIAL_MISSING_TRANSACTION: Decimal("80"),
    FindingCode.DUPLICATE_TRANSACTION: Decimal("65"),
    FindingCode.AMOUNT_MISMATCH: Decimal("90"),
    FindingCode.DATE_MISMATCH: Decimal("45"),
    FindingCode.REVENUE_DROP: Decimal("85"),
    FindingCode.PROFIT_DROP: Decimal("90"),
    FindingCode.EXPENSE_INCREASE: Decimal("75"),
    FindingCode.RECEIVABLES_INCREASE: Decimal("80"),
}

URGENCY_SCORES = {
    FindingCode.POTENTIAL_MISSING_TRANSACTION: Decimal("90"),
    FindingCode.DUPLICATE_TRANSACTION: Decimal("75"),
    FindingCode.AMOUNT_MISMATCH: Decimal("90"),
    FindingCode.DATE_MISMATCH: Decimal("55"),
    FindingCode.REVENUE_DROP: Decimal("70"),
    FindingCode.PROFIT_DROP: Decimal("75"),
    FindingCode.EXPENSE_INCREASE: Decimal("70"),
    FindingCode.RECEIVABLES_INCREASE: Decimal("85"),
}

IMPACT_REASONS = {
    FindingCode.POTENTIAL_MISSING_TRANSACTION: "بر کامل‌بودن ثبت جریان نقد اثر دارد",
    FindingCode.DUPLICATE_TRANSACTION: "می‌تواند ثبت و گزارش مالی را دوباره‌شماری کند",
    FindingCode.AMOUNT_MISMATCH: "بر مانده نقد و صحت ثبت حسابداری اثر مستقیم دارد",
    FindingCode.DATE_MISMATCH: "بر زمان‌بندی تطبیق و بستن دوره اثر دارد",
    FindingCode.REVENUE_DROP: "بر عملکرد درآمدی دوره اثر دارد",
    FindingCode.PROFIT_DROP: "بر سودآوری دوره اثر مستقیم دارد",
    FindingCode.EXPENSE_INCREASE: "بر سود و کنترل هزینه دوره اثر دارد",
    FindingCode.RECEIVABLES_INCREASE: "بر وصول و نقدینگی دوره اثر دارد",
}

PRIORITY_BAND_FA = {
    PriorityBand.CRITICAL: "بحرانی",
    PriorityBand.HIGH: "بالا",
    PriorityBand.MEDIUM: "متوسط",
    PriorityBand.LOW: "پایین",
}


def _bounded(value: Decimal) -> Decimal:
    return max(Decimal(0), min(HUNDRED, value))


def _materiality_score(
    amount_irr: Decimal | None, revenue_irr: Decimal | None, config: PriorityConfig
) -> tuple[Decimal, Decimal | None, list[str]]:
    if amount_irr is None:
        return Decimal("20"), None, ["مبلغ اثر برای سنجش اهمیت در دسترس نیست"]
    amount = abs(amount_irr)
    amount_score = (
        _bounded(amount / config.materiality_amount_irr * Decimal("50"))
        if config.materiality_amount_irr > 0
        else Decimal(0)
    )
    revenue_ratio = (
        amount / abs(revenue_irr) if revenue_irr is not None and revenue_irr != 0 else None
    )
    ratio_score = (
        _bounded(revenue_ratio / config.revenue_ratio_full_score * HUNDRED)
        if revenue_ratio is not None and config.revenue_ratio_full_score > 0
        else Decimal(0)
    )
    reasons = [f"مبلغ اثر {amount:.0f} ریال است"]
    if revenue_ratio is not None:
        reasons.append(f"مبلغ معادل {(revenue_ratio * HUNDRED):.2f}٪ درآمد دوره است")
    else:
        reasons.append("درآمد قابل اتکا برای محاسبه نسبت اهمیت در دسترس نیست")
    return max(amount_score, ratio_score), revenue_ratio, reasons


def calculate_priority(
    *,
    finding_code: FindingCode,
    confidence_score: Decimal,
    affected_amount_irr: Decimal | None,
    revenue_irr: Decimal | None,
    config: PriorityConfig,
) -> PriorityResult:
    impact = IMPACT_SCORES[finding_code]
    materiality, revenue_ratio, materiality_reasons = _materiality_score(
        affected_amount_irr, revenue_irr, config
    )
    confidence = _bounded(confidence_score)
    urgency = URGENCY_SCORES[finding_code]
    raw_factors = {
        "impact": (impact, config.impact_weight, [IMPACT_REASONS[finding_code]]),
        "materiality": (materiality, config.materiality_weight, materiality_reasons),
        "confidence": (
            confidence,
            config.confidence_weight,
            ["امتیاز اطمینان از قوت شواهد و نوع قاعده گرفته شده است"],
        ),
        "urgency": (
            urgency,
            config.urgency_weight,
            ["فوریت بر پایه اثر یافته بر دوره جاری و بستن حساب‌ها تعیین شده است"],
        ),
    }
    factors: dict[str, object] = {}
    total = Decimal(0)
    for name, (raw_score, weight, reasons) in raw_factors.items():
        contribution = (raw_score * weight).quantize(CENT, rounding=ROUND_HALF_UP)
        total += contribution
        factors[name] = {
            "score": str(raw_score.quantize(CENT)),
            "weight": str(weight),
            "weighted_score": str(contribution),
            "reasons_fa": reasons,
        }
    score = _bounded(total).quantize(CENT, rounding=ROUND_HALF_UP)
    critical_capped = score >= config.critical_threshold and confidence < (
        config.critical_minimum_confidence
    )
    if score >= config.critical_threshold and not critical_capped:
        band = PriorityBand.CRITICAL
    elif score >= config.high_threshold:
        band = PriorityBand.HIGH
    elif score >= config.medium_threshold:
        band = PriorityBand.MEDIUM
    else:
        band = PriorityBand.LOW
    explanation: dict[str, object] = {
        "formula": (
            f"{config.impact_weight}×impact + {config.materiality_weight}×materiality + "
            f"{config.confidence_weight}×confidence + {config.urgency_weight}×urgency"
        ),
        "factors": factors,
        "score": str(score),
        "band": band.value,
        "revenue_ratio": str(revenue_ratio) if revenue_ratio is not None else None,
        "critical_capped_for_low_confidence": critical_capped,
        "summary_fa": (
            f"اولویت {PRIORITY_BAND_FA[band]} با امتیاز {score} از ترکیب اثر، اهمیت، "
            "اطمینان و فوریت محاسبه شد."
        ),
    }
    if critical_capped:
        explanation["uncertainty_fa"] = (
            "به‌دلیل اطمینان پایین، یافته با وجود امتیاز خام بالا در باند بحرانی قرار نگرفت."
        )
    return PriorityResult(band=band, score=score, explanation=explanation)
