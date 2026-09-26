from decimal import Decimal
from typing import Any

from app.findings.rules.base import BaseFindingRule, FindingCandidate, FindingEvidenceSpec


class LowRunwayRule(BaseFindingRule):
    rule_code = "low_runway"
    default_severity = "high"
    category = "liquidity_and_runway"

    async def evaluate(self, context: Any) -> list[FindingCandidate]:
        candidates: list[FindingCandidate] = []
        calc_run = context.latest_calculation_run
        if not calc_run:
            return candidates

        runway_metric = context.metrics_by_key.get("runway_months")
        # STRICT GUARDRAIL: Only generate finding if metric status is AVAILABLE
        if not runway_metric or str(runway_metric.status).lower() != "available" or runway_metric.value_numeric is None:
            return candidates

        runway_months = Decimal(runway_metric.value_numeric)
        policy = context.policies.get(self.rule_code, {})
        thresholds = policy.get("thresholds", {})
        critical_threshold = Decimal(str(thresholds.get("critical_months", "1.5")))
        warning_threshold = Decimal(str(thresholds.get("warning_months", "3.0")))

        if runway_months < warning_threshold:
            severity = "critical" if runway_months < critical_threshold else "high"
            severity = policy.get("severity_override") or severity

            cash_metric = context.metrics_by_key.get("cash_position")
            burn_metric = context.metrics_by_key.get("net_cash_burn")

            cash_val = Decimal(cash_metric.value_numeric) if cash_metric and cash_metric.value_numeric else Decimal(0)
            burn_val = Decimal(burn_metric.value_numeric) if burn_metric and burn_metric.value_numeric else Decimal(0)

            fp = f"{context.company_id}:{self.rule_code}:{calc_run.id}"
            candidates.append(
                FindingCandidate(
                    fingerprint=fp,
                    rule_code=self.rule_code,
                    category=self.category,
                    severity=severity,
                    title_fa=f"دوره بقای نقدینگی بحرانی ({runway_months:.1f} ماه)",
                    summary_fa=(
                        f"بر اساس موجودی نقدینگی فعلی ({cash_val:,} ریال) و نرخ خالص سوخت ماهانه نقدینگی "
                        f"({burn_val:,} ریال)، دوره بقای نقدینگی شرکت {runway_months:.1f} ماه برآورد شده "
                        f"که پایین‌تر از آستانه امنیتی خزانه‌داری ({warning_threshold} ماه) است."
                    ),
                    financial_impact_irr=burn_val if burn_val > 0 else cash_val,
                    source_entity_type="calculation_run",
                    source_entity_id=calc_run.id,
                    calculation_run_id=calc_run.id,
                    period_start=calc_run.period_start,
                    period_end=calc_run.period_end,
                    evidence_items=[
                        FindingEvidenceSpec(
                            ordinal=1,
                            evidence_type="calculation_metric",
                            title_fa="محاسبه دوره بقا و سوخت نقدینگی (فاز ۲)",
                            description_fa="مقادیر رسمی حاصل از اجرای موتور محاسبات مالی",
                            payload={
                                "calculation_run_id": str(calc_run.id),
                                "runway_months": str(runway_months),
                                "cash_position_irr": str(cash_val),
                                "net_cash_burn_irr": str(burn_val),
                                "metric_status": runway_metric.status,
                                "coverage_score": runway_metric.coverage_score,
                            },
                        )
                    ],
                )
            )
        return candidates


class ProjectedCashDeficitRule(BaseFindingRule):
    rule_code = "projected_cash_deficit"
    default_severity = "critical"
    category = "liquidity_and_runway"

    async def evaluate(self, context: Any) -> list[FindingCandidate]:
        candidates: list[FindingCandidate] = []
        calc_run = context.latest_calculation_run
        if not calc_run:
            return candidates

        forecast_metric = context.metrics_by_key.get("cash_flow_forecast_13w")
        # STRICT GUARDRAIL: Only evaluate if AVAILABLE and evidence_json is valid
        if not forecast_metric or str(forecast_metric.status).lower() != "available":
            return candidates

        evidence = forecast_metric.evidence_json or {}
        weekly_forecasts = evidence.get("weekly_forecasts", [])
        if not weekly_forecasts:
            return candidates

        deficit_weeks = []
        min_projected_balance = Decimal(0)
        for w in weekly_forecasts:
            balance = Decimal(str(w.get("closing_balance_irr", 0)))
            if balance < 0:
                deficit_weeks.append(w)
                if balance < min_projected_balance:
                    min_projected_balance = balance

        if deficit_weeks:
            policy = context.policies.get(self.rule_code, {})
            severity = policy.get("severity_override") or self.default_severity
            first_deficit = deficit_weeks[0]

            fp = f"{context.company_id}:{self.rule_code}:{calc_run.id}"
            candidates.append(
                FindingCandidate(
                    fingerprint=fp,
                    rule_code=self.rule_code,
                    category=self.category,
                    severity=severity,
                    title_fa=f"پیش‌بینی کسری نقدینگی در افق ۱۳ هفته‌ای ({abs(min_projected_balance):,} ریال)",
                    summary_fa=(
                        f"مدل پیش‌بینی جریان نقدینگی نشان می‌دهد شرکت از هفته شماره {first_deficit.get('week_number', 'آتی')} "
                        f"با مانده منفی مواجه شده و بیشترین کسری به مبلغ {abs(min_projected_balance):,} ریال پیش‌بینی می‌شود."
                    ),
                    financial_impact_irr=abs(min_projected_balance),
                    source_entity_type="calculation_run",
                    source_entity_id=calc_run.id,
                    calculation_run_id=calc_run.id,
                    period_start=calc_run.period_start,
                    period_end=calc_run.period_end,
                    evidence_items=[
                        FindingEvidenceSpec(
                            ordinal=1,
                            evidence_type="calculation_metric",
                            title_fa="پیش‌بینی جریان نقدی ۱۳ هفته‌ای (فاز ۲)",
                            description_fa="هفته‌های دارای مانده منفی نقدینگی",
                            payload={
                                "calculation_run_id": str(calc_run.id),
                                "max_deficit_irr": str(abs(min_projected_balance)),
                                "deficit_weeks_count": len(deficit_weeks),
                                "first_deficit_week": first_deficit,
                            },
                        )
                    ],
                )
            )
        return candidates
