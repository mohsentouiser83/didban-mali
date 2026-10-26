"""Pure, fail-closed calculations over an immutable, pinned dataset revision.

Declarations are explicit assertions, never substitutes for row-level controls.
Coverage entries have state/provenance/starts_on/ends_on; all dates are ISO dates.
The adapter owns declaration collection and the session-wide question barrier.
"""

from dataclasses import replace
from decimal import Decimal, localcontext

from .bank import cash_metric
from .common import LIMIT, UnsafeFinancialData, decimal_text, period_valid, result
from .invoices import invoice_metric
from .ledger import ledger_metrics
from .types import Comparison, FinancialRow, MetricResult, PeriodSpec


def _period(
    rows: list[FinancialRow], period: PeriodSpec, declarations: dict
) -> list[MetricResult]:
    values = ledger_metrics(rows, period, declarations)
    values.append(cash_metric(rows, period, declarations))
    values.extend(
        invoice_metric(rows, period, declarations, kind)
        for kind in ("sales_invoices", "purchase_invoices")
    )
    by_key = {metric.metric_key: metric for metric in values}
    for side, ledger_key, invoice_key in (
        ("ar", "ar_ledger", "ar_invoice"),
        ("ap", "ap_trade_ledger", "ap_invoice"),
    ):
        ledger, invoice = by_key[ledger_key], by_key[invoice_key]
        errors = []
        if declarations.get("comparable_parties") is not True:
            errors.append("scope_not_comparable")
        if ledger.value is None or invoice.value is None:
            errors.append("scope_not_comparable")
        delta = None
        if not errors:
            delta = Decimal(ledger.details["commercial_value"]) - Decimal(invoice.value)
        metric = result(
            f"{side}_difference",
            "comparable_difference",
            delta,
            [],
            errors,
            ledger.coverage + invoice.coverage,
            {"ledger_metric": ledger_key, "invoice_metric": invoice_key},
        )
        values.append(
            replace(
                metric, evidence=ledger.evidence + invoice.evidence + metric.evidence
            )
        )
    return values


def calculate(
    rows: list[FinancialRow],
    period: PeriodSpec,
    previous: PeriodSpec | None,
    declarations: dict,
) -> list[MetricResult]:
    """Return exact IRR metrics; missing or unsafe data returns null with reasons.

    Money has at most 32 integer and six fractional digits. Percentages use
    Decimal precision 28 and are nullable at zero/negative/sign-changing bases.
    """
    if not period_valid(period) or (
        previous is not None and not period_valid(previous)
    ):
        raise ValueError("invalid_period")
    with localcontext() as context:
        context.prec = 96
        try:
            current = _period(rows, period, declarations)
            old = (
                {}
                if previous is None
                else {m.metric_key: m for m in _period(rows, previous, declarations)}
            )
        except UnsafeFinancialData as exc:
            # Conflicting immutable row identities invalidate the dataset rather
            # than picking an arbitrary row or failing the worker transaction.
            keys = (
                "revenue",
                "expense",
                "profit_before_tax",
                "net_profit",
                "cash",
                "ar_ledger",
                "ar_invoice",
                "ap_trade_ledger",
                "ap_invoice",
                "debt_total_ledger",
                "ar_difference",
                "ap_difference",
            )
            return [
                result(
                    key,
                    (
                        "bank"
                        if key == "cash"
                        else "invoice"
                        if key in {"ar_invoice", "ap_invoice"}
                        else "comparable_difference"
                        if key.endswith("difference")
                        else "ledger"
                    ),
                    None,
                    [],
                    [str(exc)],
                )
                for key in keys
            ]
        output = []
        for metric in current:
            if previous is None:
                output.append(metric)
                continue
            before = old.get(metric.metric_key)
            reasons = []
            delta = percent = None
            if metric.value is None or before is None or before.value is None:
                reasons.append("comparison_missing")
            else:
                now, prior = Decimal(metric.value), Decimal(before.value)
                change = now - prior
                if abs(change) >= LIMIT:
                    reasons.append("aggregate_out_of_range")
                else:
                    delta = decimal_text(change)
                if prior == 0:
                    reasons.append("zero_denominator")
                elif prior < 0 or now < 0:
                    reasons.append("sign_change")
                else:
                    with localcontext() as percent_context:
                        percent_context.prec = 28
                        percent = decimal_text(change / prior * 100)
            comparison = Comparison(
                previous.id if previous else "",
                before.value if before else None,
                delta,
                percent,
                tuple(reasons),
            )
            output.append(replace(metric, comparison=comparison))
        return output
