"""Project and contract profitability aggregation combining contracts, payroll allocations, and petty cash."""

from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .contract_models import ClientContract, ClientContractMilestone
from .dimensions_models import Dimension
from .money_type import canonical_money
from .payroll_models import PayrollRun, PayrollSlip
from .petty_cash_models import PettyCashExpense

ZERO = Decimal("0")
HUNDRED = Decimal("100")


def _dec(val: Any) -> Decimal:
    if val is None or val == "":
        return ZERO
    return Decimal(str(val))


def get_project_profitability(
    db: Session,
    company: str,
    *,
    period_id: str | None = None,
    dimension_id: str | None = None,
) -> dict[str, Any]:
    """Compute per-project revenue, direct payroll cost, direct petty-cash cost, and company operating summary."""
    dim_stmt = select(Dimension).where(Dimension.company_id == company, Dimension.kind == "project")
    if dimension_id:
        dim_stmt = dim_stmt.where(Dimension.id == dimension_id)
    projects = db.scalars(dim_stmt.order_by(Dimension.code)).all()
    project_map = {p.id: p for p in projects}

    # 1. Contract revenue & retentions per project
    contract_stmt = select(ClientContract).where(
        ClientContract.company_id == company,
        ClientContract.dimension_id.is_not(None),
        ClientContract.status != "cancelled",
    )
    if dimension_id:
        contract_stmt = contract_stmt.where(ClientContract.dimension_id == dimension_id)
    contracts = db.scalars(contract_stmt).all()
    contract_ids = [c.id for c in contracts]
    contract_to_project = {c.id: c.dimension_id for c in contracts if c.dimension_id}

    contracted_by_proj: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for c in contracts:
        if c.dimension_id:
            contracted_by_proj[c.dimension_id] += _dec(c.total_amount_irr)

    invoiced_by_proj: dict[str, Decimal] = defaultdict(lambda: ZERO)
    collected_by_proj: dict[str, Decimal] = defaultdict(lambda: ZERO)
    retention_by_proj: dict[str, Decimal] = defaultdict(lambda: ZERO)
    if contract_ids:
        milestones = db.scalars(
            select(ClientContractMilestone).where(
                ClientContractMilestone.company_id == company,
                ClientContractMilestone.contract_id.in_(contract_ids),
            )
        ).all()
        for ms in milestones:
            proj_id = contract_to_project.get(ms.contract_id)
            if not proj_id:
                continue
            invoiced_by_proj[proj_id] += _dec(ms.invoiced_amount_irr)
            collected_by_proj[proj_id] += _dec(ms.collected_cash_irr)
            if not ms.retention_released:
                retention_by_proj[proj_id] += _dec(ms.insurance_retained_irr) + _dec(ms.performance_retained_irr)

    # 2. Direct payroll cost per project + unallocated overhead
    run_stmt = select(PayrollRun.id).where(PayrollRun.company_id == company)
    if period_id:
        run_stmt = run_stmt.where(PayrollRun.period_id == period_id)
    run_ids = list(db.scalars(run_stmt).all())

    payroll_by_proj: dict[str, Decimal] = defaultdict(lambda: ZERO)
    unallocated_payroll = ZERO
    if run_ids:
        slips = db.scalars(
            select(PayrollSlip).where(
                PayrollSlip.company_id == company,
                PayrollSlip.payroll_run_id.in_(run_ids),
            )
        ).all()
        for slip in slips:
            total_cost = _dec(slip.gross_pay) + _dec(slip.employer_insurance)
            allocs = slip.project_allocations or []
            allocated_sum = ZERO
            for entry in allocs:
                pid = str(entry.get("dimension_id", ""))
                pct = _dec(entry.get("percentage"))
                share = (total_cost * pct / HUNDRED).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
                allocated_sum += share
                if not dimension_id or pid == dimension_id:
                    payroll_by_proj[pid] += share
            unallocated_payroll += max(ZERO, total_cost - allocated_sum)

    # 3. Direct petty cash expenses per project + unallocated overhead
    exp_stmt = select(PettyCashExpense).where(
        PettyCashExpense.company_id == company,
        PettyCashExpense.status.in_(("recorded", "settled")),
    )
    if period_id:
        exp_stmt = exp_stmt.where(PettyCashExpense.period_id == period_id)
    expenses = db.scalars(exp_stmt).all()

    petty_by_proj: dict[str, Decimal] = defaultdict(lambda: ZERO)
    unallocated_petty = ZERO
    for exp in expenses:
        amt = _dec(exp.amount_irr)
        if exp.dimension_id:
            if not dimension_id or exp.dimension_id == dimension_id:
                petty_by_proj[exp.dimension_id] += amt
        else:
            unallocated_petty += amt

    # 4. Build per-project rows
    items: list[dict[str, Any]] = []
    total_rev = ZERO
    total_payroll = ZERO
    total_petty = ZERO
    total_gross_profit = ZERO

    for pid, proj in project_map.items():
        rev = invoiced_by_proj[pid]
        p_cost = payroll_by_proj[pid]
        e_cost = petty_by_proj[pid]
        direct_cost = p_cost + e_cost
        gross_profit = rev - direct_cost
        margin = (
            str((gross_profit * HUNDRED / rev).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
            if rev > ZERO
            else None
        )
        total_rev += rev
        total_payroll += p_cost
        total_petty += e_cost
        total_gross_profit += gross_profit

        items.append(
            {
                "dimension_id": pid,
                "project_code": proj.code,
                "project_name": proj.name,
                "contracted_amount_irr": canonical_money(contracted_by_proj[pid]),
                "invoiced_revenue_irr": canonical_money(rev),
                "collected_cash_irr": canonical_money(collected_by_proj[pid]),
                "unreleased_retention_irr": canonical_money(retention_by_proj[pid]),
                "payroll_cost_irr": canonical_money(p_cost),
                "petty_cash_cost_irr": canonical_money(e_cost),
                "total_direct_cost_irr": canonical_money(direct_cost),
                "gross_profit_irr": canonical_money(gross_profit),
                "profit_margin_pct": margin,
            }
        )

    operating_profit = total_gross_profit - unallocated_payroll - unallocated_petty
    return {
        "period_id": period_id,
        "items": items,
        "summary": {
            "total_invoiced_revenue_irr": canonical_money(total_rev),
            "total_project_payroll_cost_irr": canonical_money(total_payroll),
            "total_project_petty_cash_cost_irr": canonical_money(total_petty),
            "total_project_gross_profit_irr": canonical_money(total_gross_profit),
            "unallocated_payroll_cost_irr": canonical_money(unallocated_payroll),
            "unallocated_petty_cash_cost_irr": canonical_money(unallocated_petty),
            "estimated_operating_profit_irr": canonical_money(operating_profit),
        },
    }
