from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.findings.rules.base import BaseFindingRule, FindingCandidate, FindingEvidenceSpec


class SignificantOverdueReceivableRule(BaseFindingRule):
    rule_code = "significant_overdue_receivable"
    default_severity = "high"
    category = "revenue_and_ar"

    async def evaluate(self, context: Any) -> list[FindingCandidate]:
        candidates: list[FindingCandidate] = []
        company_id: UUID = context.company_id
        as_of_date: date = context.as_of_date
        invoices = context.overdue_invoices
        policy = context.policies.get(self.rule_code, {})
        thresholds = policy.get("thresholds", {})
        min_overdue_days = int(thresholds.get("min_overdue_days", 60))
        min_amount_irr = Decimal(str(thresholds.get("min_amount_irr", 200_000_000)))

        for inv in invoices:
            if not inv.due_date:
                continue
            overdue_days = (as_of_date - inv.due_date).days
            if hasattr(inv, "outstanding_balance_irr") and inv.outstanding_balance_irr is not None:
                balance = Decimal(inv.outstanding_balance_irr)
            else:
                gross = Decimal(getattr(inv, "gross_amount_irr", 0) or 0)
                paid = Decimal(getattr(inv, "paid_amount_irr", 0) or 0)
                balance = gross - paid

            if overdue_days >= min_overdue_days and balance >= min_amount_irr:
                severity = "critical" if overdue_days >= 90 and balance >= Decimal(500_000_000) else self.default_severity
                severity = policy.get("severity_override") or severity

                inv_num = getattr(inv, "invoice_no", None) or getattr(inv, "invoice_number", None) or str(inv.id)
                fp = f"{company_id}:{self.rule_code}:{inv.id}"
                candidates.append(
                    FindingCandidate(
                        fingerprint=fp,
                        rule_code=self.rule_code,
                        category=self.category,
                        severity=severity,
                        title_fa=f"مطالبات معوق بااهمیت به مبلغ {balance:,} ریال ({overdue_days} روز تاخیر)",
                        summary_fa=(
                            f"فاکتور فروش شماره «{inv_num}» با مانده {balance:,} ریال "
                            f"از تاریخ سررسید ({inv.due_date}) به مدت {overdue_days} روز معوق مانده است."
                        ),
                        financial_impact_irr=balance,
                        source_entity_type="sales_invoice",
                        source_entity_id=inv.id,
                        period_start=inv.issue_date,
                        period_end=as_of_date,
                        evidence_items=[
                            FindingEvidenceSpec(
                                ordinal=1,
                                evidence_type="source_record",
                                title_fa="مشخصات فاکتور فروش معوق",
                                description_fa="اطلاعات فاکتور فروش تسویه‌نشده در سیستم",
                                payload={
                                    "invoice_id": str(inv.id),
                                    "invoice_number": inv_num,
                                    "issue_date": inv.issue_date.isoformat(),
                                    "due_date": inv.due_date.isoformat(),
                                    "overdue_days": overdue_days,
                                    "amount_irr": str(getattr(inv, "gross_amount_irr", None) or getattr(inv, "amount_irr", 0)),
                                    "outstanding_balance_irr": str(balance),
                                },
                            )
                        ],
                    )
                )
        return candidates


class CustomerOverdueConcentrationRule(BaseFindingRule):
    rule_code = "customer_overdue_concentration"
    default_severity = "high"
    category = "revenue_and_ar"

    async def evaluate(self, context: Any) -> list[FindingCandidate]:
        candidates: list[FindingCandidate] = []
        company_id: UUID = context.company_id
        customer_concentrations = context.customer_overdue_concentrations
        policy = context.policies.get(self.rule_code, {})
        thresholds = policy.get("thresholds", {})
        min_share_pct = Decimal(str(thresholds.get("min_share_pct", "35.0")))
        min_amount_irr = Decimal(str(thresholds.get("min_amount_irr", 300_000_000)))
        severity = policy.get("severity_override") or self.default_severity

        for c in customer_concentrations:
            overdue_amt = Decimal(c["overdue_amount_irr"])
            share_pct = Decimal(c["share_percentage"])

            if share_pct >= min_share_pct and overdue_amt >= min_amount_irr:
                fp = f"{company_id}:{self.rule_code}:{c['counterparty_id']}"
                cust_name = c.get("counterparty_name") or "مشتری نامشخص"
                candidates.append(
                    FindingCandidate(
                        fingerprint=fp,
                        rule_code=self.rule_code,
                        category=self.category,
                        severity=severity,
                        title_fa=f"تمرکز بالای مطالبات معوق نزد «{cust_name}» ({share_pct:.1f}٪)",
                        summary_fa=(
                            f"مشتری «{cust_name}» با مبلغ معوق {overdue_amt:,} ریال، بیش از {share_pct:.1f}٪ "
                            f"از کل مطالبات معوق شرکت را به خود اختصاص داده است که ریسک اعتباری متمرکز ایجاد می‌کند."
                        ),
                        financial_impact_irr=overdue_amt,
                        source_entity_type="counterparty",
                        source_entity_id=c["counterparty_id"],
                        period_start=context.as_of_date,
                        period_end=context.as_of_date,
                        evidence_items=[
                            FindingEvidenceSpec(
                                ordinal=1,
                                evidence_type="calculation_metric",
                                title_fa="شاخص تمرکز مطالبات",
                                description_fa="تحلیل سهم طرف‌حساب از کل مطالبات معوق",
                                payload={
                                    "counterparty_id": str(c["counterparty_id"]),
                                    "counterparty_name": cust_name,
                                    "overdue_amount_irr": str(overdue_amt),
                                    "total_overdue_irr": str(c["total_overdue_irr"]),
                                    "share_percentage": str(share_pct),
                                },
                            )
                        ],
                    )
                )
        return candidates
