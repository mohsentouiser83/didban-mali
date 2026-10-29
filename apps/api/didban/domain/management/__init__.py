"""Deterministic statements and managerial reports over a pinned dataset."""

from datetime import timedelta
from decimal import localcontext

from ..financial import PeriodSpec, FinancialRow
from .statements import financial_statements
from .daily import daily_reports
from .analysis import variance_analysis
from .cash_analysis import cash_analysis
from .cash_statement import cash_flow_statement


def management_report(
    content: dict,
    rows: list[FinancialRow],
    period: PeriodSpec,
    previous: PeriodSpec | None,
    declared: dict,
    options: dict | None = None,
) -> dict:
    options = options or {}
    with localcontext() as context:
        context.prec = 96
        template = options.get("template")
        basis = options.get("statement_basis") or (
            "trial_balance"
            if any(r.kind == "trial_balance" for r in rows)
            and not any(r.kind == "ledger" for r in rows)
            else "ledger"
        )
        statements = financial_statements(rows, period, declared, template, basis)
        comparable = None
        if previous:
            elapsed = (period.cutoff - period.starts_on).days
            cutoff = previous.starts_on + timedelta(days=elapsed)
            if period.cutoff == period.ends_on:
                cutoff = previous.ends_on
            if cutoff <= previous.ends_on:
                comparable = financial_statements(
                    rows,
                    PeriodSpec(
                        previous.id, previous.starts_on, previous.ends_on, cutoff
                    ),
                    declared,
                    template,
                    basis,
                )
        analysis = variance_analysis(statements, comparable, content, period)
        analysis["cash"] = cash_analysis(content, period)
        return {
            "formula_version": "management-v2.1",
            "statement_basis": basis,
            "cashflow_statement": cash_flow_statement(rows, period, declared),
            "starts_on": str(period.starts_on),
            "as_of_date": str(period.cutoff),
            "unit": "IRR",
            "sources": [
                {
                    "source_file_id": str(source["id"]),
                    "file_name": source["original_name"],
                }
                for source in content.get("sources", [])
            ],
            "template": template,
            "statements": statements,
            "daily": daily_reports(content, rows, period, declared),
            "analysis": analysis,
        }
