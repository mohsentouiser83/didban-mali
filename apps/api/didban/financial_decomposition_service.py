"""Deterministic analytical facts and change decomposition service (AI-03).

Provides hand-calculated-exact financial decompositions:
- Profit change attribution to revenue and expense drivers
- Account-level contributor ranking that reconciles to reported deltas
- Receivables risk & overdue concentration analysis
- Cash shortfall timing and trajectory decomposition
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, desc, select
from sqlalchemy.orm import Session

from .finance import ZERO, amount, text_amount
from .money_type import canonical_money


def decompose_profit_drivers(
    comparison_data: dict[str, Any],
    breakdown_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Attribute profit changes to observed revenue/expense components.

    Reconciles: delta_profit == delta_revenue - delta_expense
    """
    deltas = comparison_data.get("deltas", {})
    rev_delta_info = deltas.get("revenue", {})
    exp_delta_info = deltas.get("expense", {})
    pbt_delta_info = deltas.get("profit_before_tax", {})

    if (
        rev_delta_info.get("status") != "available"
        or exp_delta_info.get("status") != "available"
        or pbt_delta_info.get("status") != "available"
    ):
        return {
            "status": "unavailable",
            "reason": "اطلاعات مقایسه‌ای یکی از دوره‌ها ناقص است و تفکیک تغییرات سود امکان‌پذیر نیست.",
            "drivers": [],
            "reconciled": False,
        }

    rev_delta = amount(rev_delta_info.get("delta", "0"))
    exp_delta = amount(exp_delta_info.get("delta", "0"))
    pbt_delta = amount(pbt_delta_info.get("delta", "0"))

    # Net profit change before tax = delta_revenue - delta_expense
    expected_pbt_delta = rev_delta - exp_delta
    reconciled = pbt_delta == expected_pbt_delta

    drivers = []
    # Revenue impact on profit
    if rev_delta != ZERO:
        drivers.append(
            {
                "component": "revenue",
                "label": "تغییرات درآمد فروش و خدمات",
                "delta": text_amount(rev_delta),
                "profit_impact": text_amount(rev_delta),
                "impact_direction": "positive" if rev_delta > ZERO else "negative",
                "relative_share": round(float(abs(rev_delta) / (abs(rev_delta) + abs(exp_delta)) * 100), 1)
                if (abs(rev_delta) + abs(exp_delta)) > ZERO
                else 0.0,
            }
        )

    # Expense impact on profit (expense increase reduces profit)
    if exp_delta != ZERO:
        expense_profit_impact = -exp_delta
        drivers.append(
            {
                "component": "expense",
                "label": "تغییرات هزینه‌های عملیاتی و غیرعملیاتی",
                "delta": text_amount(exp_delta),
                "profit_impact": text_amount(expense_profit_impact),
                "impact_direction": "negative" if exp_delta > ZERO else "positive",
                "relative_share": round(float(abs(exp_delta) / (abs(rev_delta) + abs(exp_delta)) * 100), 1)
                if (abs(rev_delta) + abs(exp_delta)) > ZERO
                else 0.0,
            }
        )

    # Sort drivers by absolute magnitude of profit impact
    drivers.sort(key=lambda d: abs(amount(d["profit_impact"])), reverse=True)

    # Top expense contributors from breakdown if available
    top_expenses = []
    if breakdown_data and breakdown_data.get("status") == "available":
        for item in breakdown_data.get("expense_accounts", [])[:5]:
            top_expenses.append(
                {
                    "account_title": item["account_title"],
                    "account_code": item.get("account_code", ""),
                    "amount": item["amount"],
                    "share_percent": item["share_percent"],
                }
            )

    return {
        "status": "available",
        "reconciled": reconciled,
        "delta_profit": text_amount(pbt_delta),
        "delta_revenue": text_amount(rev_delta),
        "delta_expense": text_amount(exp_delta),
        "profit_direction": pbt_delta_info.get("direction", "unchanged"),
        "percent_change": pbt_delta_info.get("percent_change"),
        "primary_driver": drivers[0]["component"] if drivers else None,
        "drivers": drivers,
        "top_expenses": top_expenses,
    }


def analyze_receivables_risk(receivables_data: dict[str, Any]) -> dict[str, Any]:
    """Analyze overdue ratio, concentration of top debtors, and exposure."""
    if receivables_data.get("status") != "available":
        return {
            "status": "unavailable",
            "reason": receivables_data.get("reason", "اطلاعات مطالبات در دسترس نیست."),
        }

    total = amount(receivables_data.get("total_receivables", "0"))
    overdue = amount(receivables_data.get("total_overdue", "0"))
    customers = receivables_data.get("customers", [])

    if total == ZERO:
        return {
            "status": "available",
            "total_receivables": "0",
            "overdue_receivables": "0",
            "overdue_ratio_percent": 0.0,
            "concentration_top3_percent": 0.0,
            "risk_level": "low",
            "top_debtors": [],
        }

    overdue_ratio = round(float((overdue / total) * 100), 1)

    # Top 3 concentration
    top_3_sum = sum((amount(c["outstanding_amount"]) for c in customers[:3]), ZERO)
    top_3_concentration = round(float((top_3_sum / total) * 100), 1)

    # Risk level evaluation based on objective rules
    if overdue_ratio > 40.0 or top_3_concentration > 70.0:
        risk_level = "high"
    elif overdue_ratio > 20.0 or top_3_concentration > 50.0:
        risk_level = "medium"
    else:
        risk_level = "low"

    return {
        "status": "available",
        "total_receivables": text_amount(total),
        "overdue_receivables": text_amount(overdue),
        "overdue_ratio_percent": overdue_ratio,
        "concentration_top3_percent": top_3_concentration,
        "risk_level": risk_level,
        "top_debtors": customers[:5],
    }


def analyze_cash_trajectory(cashflow_data: dict[str, Any]) -> dict[str, Any]:
    """Detect shortfall timing, minimum projected liquidity, and alert condition."""
    if cashflow_data.get("status") != "available":
        return {
            "status": "unavailable",
            "reason": cashflow_data.get("reason", "پیش‌بینی نقدینگی در دسترس نیست."),
        }

    has_deficit = cashflow_data.get("has_deficit", False)
    min_balance = cashflow_data.get("min_projected_balance")
    first_date = cashflow_data.get("first_deficit_date")

    return {
        "status": "available",
        "has_deficit": has_deficit,
        "first_deficit_date": first_date,
        "min_projected_balance": min_balance,
        "urgency": "critical" if has_deficit else "normal",
    }


def detect_liquidity_cliff(
    db: Session,
    company: str,
    as_of: date,
    threshold_irr: str = "0",
) -> dict[str, Any]:
    """Inspects current cash balance, combines upcoming cheques (due within 30 days),
    payroll obligations, and collection forecasts with D09 lag.
    Computes projected 30-day daily cash path and flags cliff if projected minimum < threshold_irr.
    """
    from .cheque_models import Cheque
    from .forecast_planning import MINIMUM_EVENTS, weighted_median_delay
    from .native_invoice_models import NativeInvoice
    from .native_reporting_models import NativeAccountRole, NativeStatementRun
    from .operation_models import OperationDraft
    from .posting_models import NativeJournal

    try:
        threshold_dec = Decimal(canonical_money(threshold_irr))
    except (ValueError, TypeError):
        threshold_dec = Decimal(0)

    # 1. Determine starting cash balance
    starting_cash = Decimal(0)
    report = db.scalar(
        select(NativeStatementRun)
        .where(NativeStatementRun.company_id == company)
        .order_by(desc(NativeStatementRun.created_at), desc(NativeStatementRun.id))
        .limit(1)
    )
    if report and report.snapshot:
        raw_as_of = report.snapshot.get("as_of")
        if raw_as_of:
            report_as_of = date.fromisoformat(raw_as_of) if isinstance(raw_as_of, str) else raw_as_of
            if report_as_of <= as_of:
                cash_metric = next(
                    (m for m in report.snapshot.get("metrics", []) if m.get("metric_key") == "bank_balance"),
                    None,
                )
                if cash_metric and cash_metric.get("value") is not None:
                    try:
                        starting_cash = Decimal(cash_metric["value"])
                    except (ValueError, TypeError):
                        starting_cash = Decimal(0)

    if starting_cash == Decimal(0):
        # Fallback: sum of journals for bank accounts up to as_of
        bank_accounts = set(
            db.scalars(
                select(NativeAccountRole.account_id).where(
                    NativeAccountRole.company_id == company,
                    NativeAccountRole.role.in_(["bank", "cash_bank", "cash", "petty_cash"]),
                )
            ).all()
        )
        if bank_accounts:
            journals = db.scalars(
                select(NativeJournal).where(
                    NativeJournal.company_id == company,
                    NativeJournal.date <= as_of,
                    NativeJournal.reversal_of.is_(None),
                )
            ).all()
            for j in journals:
                for line in (j.snapshot or {}).get("lines", []):
                    if line.get("account_id") in bank_accounts:
                        try:
                            deb = Decimal(line.get("debit", "0"))
                            crd = Decimal(line.get("credit", "0"))
                            starting_cash += deb - crd
                        except (ValueError, TypeError):
                            pass

    # 2. Upcoming cheques (due within 30 days)
    end_date = as_of + timedelta(days=30)
    cheques = list(
        db.scalars(
            select(Cheque).where(
                Cheque.company_id == company,
                Cheque.state == "registered",
                Cheque.due_date > as_of,
                Cheque.due_date <= end_date,
            )
        ).all()
    )

    daily_inflows: dict[date, list[dict[str, Any]]] = defaultdict(list)
    daily_outflows: dict[date, list[dict[str, Any]]] = defaultdict(list)
    contributing_obligations: list[dict[str, Any]] = []

    for ch in cheques:
        amt = Decimal(canonical_money(ch.amount))
        if ch.direction == "issued":
            ob = {
                "type": "cheque_payable",
                "id": ch.id,
                "number": ch.number,
                "due_date": ch.due_date.isoformat(),
                "amount_irr": text_amount(amt),
                "party_id": ch.party_id,
                "description": f"چک پرداختنی شماره {ch.number} به طرف حساب {ch.party_id}",
            }
            daily_outflows[ch.due_date].append(ob)
            contributing_obligations.append(ob)
        elif ch.direction == "received":
            daily_inflows[ch.due_date].append(
                {
                    "type": "cheque_receivable",
                    "id": ch.id,
                    "number": ch.number,
                    "due_date": ch.due_date.isoformat(),
                    "amount_irr": text_amount(amt),
                    "party_id": ch.party_id,
                    "description": f"چک دریافتنی شماره {ch.number} از طرف حساب {ch.party_id}",
                }
            )

    # 3. Payroll obligations
    payroll_ops = list(
        db.scalars(
            select(OperationDraft).where(
                OperationDraft.company_id == company,
                OperationDraft.kind == "payroll",
            )
        ).all()
    )
    paid_payroll_parties = set(
        db.scalars(
            select(OperationDraft.payload["party_id"].as_string()).where(
                OperationDraft.company_id == company,
                OperationDraft.kind == "payroll_payment",
            )
        ).all()
    )

    for op in payroll_ops:
        payload = op.payload or {}
        party_id = payload.get("party_id", "")
        if party_id in paid_payroll_parties:
            continue
        amounts_data = payload.get("amounts", {})
        net_str = amounts_data.get("net_pay") or payload.get("net_pay")
        if not net_str:
            continue
        try:
            net_amt = Decimal(canonical_money(net_str))
        except (ValueError, TypeError):
            continue
        if net_amt <= Decimal(0):
            continue

        raw_date = payload.get("date")
        if isinstance(raw_date, str):
            try:
                op_date = date.fromisoformat(raw_date)
            except ValueError:
                op_date = as_of + timedelta(days=1)
        elif isinstance(raw_date, date):
            op_date = raw_date
        else:
            op_date = as_of + timedelta(days=1)

        target_date = op_date if as_of < op_date <= end_date else as_of + timedelta(days=1)
        ob = {
            "type": "payroll_payable",
            "id": op.id,
            "due_date": target_date.isoformat(),
            "amount_irr": text_amount(net_amt),
            "party_id": party_id,
            "description": f"تعهد پرداخت حقوق و دستمزد پرسنل ({party_id or 'لیست حقوق'})",
        }
        daily_outflows[target_date].append(ob)
        contributing_obligations.append(ob)

    # 4. Collection forecasts with D09 lag
    from .native_invoice_models import NativeInvoiceAllocation, NativeInvoiceTerms

    all_invoices = list(
        db.scalars(
            select(NativeInvoice).where(
                NativeInvoice.company_id == company,
                NativeInvoice.direction == "sale",
            )
        ).all()
    )

    overdue_invoices: list[dict[str, Any]] = []

    for inv in all_invoices:
        src = inv.source or {}
        party_id = src.get("party_id", "")
        number = src.get("number", inv.id[:8])
        inv_amt = Decimal(canonical_money(src.get("amount", "0")))

        terms = db.scalar(
            select(NativeInvoiceTerms)
            .where(
                NativeInvoiceTerms.company_id == company,
                NativeInvoiceTerms.invoice_id == inv.id,
            )
            .order_by(desc(NativeInvoiceTerms.version))
            .limit(1)
        )
        due_date = None
        if terms and terms.payload:
            raw_due = terms.payload.get("due_date")
            if raw_due:
                due_date = date.fromisoformat(raw_due) if isinstance(raw_due, str) else raw_due

        alloc_rows = list(
            db.scalars(
                select(NativeInvoiceAllocation).where(
                    NativeInvoiceAllocation.company_id == company,
                    NativeInvoiceAllocation.invoice_id == inv.id,
                )
            ).all()
        )
        paid_sum = sum(
            (Decimal(canonical_money(a.amount)) for a in alloc_rows),
            Decimal(0),
        )
        remaining = inv_amt - paid_sum

        if remaining <= Decimal(0):
            continue

        if due_date and due_date < as_of:
            overdue_invoices.append(
                {
                    "invoice_id": inv.id,
                    "number": number,
                    "party_id": party_id,
                    "due_date": due_date.isoformat(),
                    "overdue_days": (as_of - due_date).days,
                    "remaining_irr": text_amount(remaining),
                }
            )

        lookback_start = as_of - timedelta(days=180)
        customer_history_events = []
        for other_inv in all_invoices:
            if (other_inv.source or {}).get("party_id") != party_id:
                continue
            other_allocs = db.scalars(
                select(NativeInvoiceAllocation).where(
                    NativeInvoiceAllocation.company_id == company,
                    NativeInvoiceAllocation.invoice_id == other_inv.id,
                )
            ).all()
            for a in other_allocs:
                a_date = a.date if isinstance(a.date, date) else date.fromisoformat(str(a.date))
                if lookback_start <= a_date <= as_of:
                    o_terms = db.scalar(
                        select(NativeInvoiceTerms)
                        .where(
                            NativeInvoiceTerms.company_id == company,
                            NativeInvoiceTerms.invoice_id == other_inv.id,
                        )
                        .order_by(desc(NativeInvoiceTerms.version))
                        .limit(1)
                    )
                    if o_terms and o_terms.payload and o_terms.payload.get("due_date"):
                        o_due_raw = o_terms.payload["due_date"]
                        o_due = date.fromisoformat(o_due_raw) if isinstance(o_due_raw, str) else o_due_raw
                        customer_history_events.append(
                            {
                                "paid_on": a_date,
                                "due_date": o_due,
                                "amount": Decimal(canonical_money(a.amount)),
                            }
                        )

        expected_date = None
        if due_date:
            if len(customer_history_events) >= MINIMUM_EVENTS:
                try:
                    lag = weighted_median_delay(customer_history_events)
                    expected_date = due_date + timedelta(days=lag)
                except ValueError:
                    expected_date = due_date
            else:
                expected_date = due_date

        if expected_date and as_of < expected_date <= end_date:
            daily_inflows[expected_date].append(
                {
                    "type": "customer_collection",
                    "invoice_id": inv.id,
                    "party_id": party_id,
                    "amount_irr": text_amount(remaining),
                    "description": f"وصول پیش‌بینی‌شده فاکتور {number} از {party_id}",
                }
            )

    # 5. Computes projected 30-day daily cash path
    daily_path: list[dict[str, Any]] = []
    current_balance = starting_cash
    min_projected = starting_cash
    cliff_detected = False
    cliff_date = None

    for i in range(1, 31):
        curr_d = as_of + timedelta(days=i)
        inflow_items = daily_inflows.get(curr_d, [])
        outflow_items = daily_outflows.get(curr_d, [])

        day_in = sum((Decimal(canonical_money(x["amount_irr"])) for x in inflow_items), Decimal(0))
        day_out = sum((Decimal(canonical_money(x["amount_irr"])) for x in outflow_items), Decimal(0))

        current_balance += day_in - day_out
        if current_balance < min_projected:
            min_projected = current_balance

        if current_balance < threshold_dec and not cliff_detected:
            cliff_detected = True
            cliff_date = curr_d

        daily_path.append(
            {
                "day": i,
                "date": curr_d.isoformat(),
                "starting_balance": text_amount(current_balance - day_in + day_out),
                "inflows": text_amount(day_in),
                "outflows": text_amount(day_out),
                "projected_balance": text_amount(current_balance),
                "inflow_count": len(inflow_items),
                "outflow_count": len(outflow_items),
            }
        )

    shortfall = max(Decimal(0), threshold_dec - min_projected) if cliff_detected else Decimal(0)

    # 6. Actionable recovery recommendations
    recovery_recommendations: list[dict[str, Any]] = []
    if overdue_invoices:
        overdue_invoices.sort(key=lambda x: Decimal(canonical_money(x["remaining_irr"])), reverse=True)
        top_od = overdue_invoices[0]
        recovery_recommendations.append(
            {
                "action_type": "accelerate_collections",
                "priority": "high",
                "title": f"پیگیری وصول مطالبات معوق از {top_od['party_id']}",
                "amount_irr": top_od["remaining_irr"],
                "details": f"فاکتور {top_od['number']} با مبلغ {top_od['remaining_irr']} ریال به مدت {top_od['overdue_days']} روز سررسیدگذشته است.",
                "target_invoice_id": top_od["invoice_id"],
            }
        )
    if cliff_detected and contributing_obligations:
        contributing_obligations.sort(key=lambda x: Decimal(canonical_money(x["amount_irr"])), reverse=True)
        top_ob = contributing_obligations[0]
        recovery_recommendations.append(
            {
                "action_type": "defer_obligation",
                "priority": "high",
                "title": f"مذاکره جهت تمدید سررسید {top_ob.get('description', '')}",
                "amount_irr": top_ob["amount_irr"],
                "details": f"انتقال زمان پرداخت این تعهد به پس از تاریخ {cliff_date.isoformat() if cliff_date else ''} می‌تواند از کسری نقدینگی جلوگیری کند.",
                "target_id": top_ob.get("id"),
            }
        )

    return {
        "cliff_detected": cliff_detected,
        "as_of": as_of.isoformat(),
        "threshold_irr": text_amount(threshold_dec),
        "starting_cash_irr": text_amount(starting_cash),
        "min_projected_cash_irr": text_amount(min_projected),
        "cliff_date": cliff_date.isoformat() if cliff_date else None,
        "shortfall_irr": text_amount(shortfall),
        "daily_path": daily_path,
        "contributing_obligations": contributing_obligations,
        "recovery_recommendations": recovery_recommendations,
    }


def detect_cogs_and_margin_anomalies(
    db: Session,
    company: str,
    period_id: str | None = None,
) -> list[dict[str, Any]]:
    """Inspects inventory movements for COGS anomalies:
    a) Purchase price spike: purchase unit price > 1.20x historical average cost.
    b) Negative gross margin: sale unit price < FIFO unit cost consumed.
    Returns structured anomaly findings with exact amounts, item_id, movement_id, severity, and explanation.
    """
    from .inventory_models import InventoryMovement
    from .operation_models import OperationDraft
    from .posting_models import NativeJournal

    stmt = (
        select(InventoryMovement)
        .where(InventoryMovement.company_id == company)
        .order_by(InventoryMovement.sequence.asc(), InventoryMovement.date.asc(), InventoryMovement.id.asc())
    )
    if period_id:
        stmt = stmt.join(
            NativeJournal,
            and_(
                NativeJournal.company_id == company,
                NativeJournal.id == InventoryMovement.journal_id,
            ),
        ).where(NativeJournal.period_id == period_id)

    movements = list(db.scalars(stmt).all())
    anomalies: list[dict[str, Any]] = []

    # Historical purchase accumulators per item: total_value, total_qty
    item_history: dict[str, dict[str, Decimal]] = defaultdict(lambda: {"cost": Decimal(0), "qty": Decimal(0)})

    for mv in movements:
        item_id = mv.item_id
        qty_int = mv.quantity
        val_irr = Decimal(canonical_money(mv.value_irr))
        evidence = mv.evidence or {}

        # a) Purchase price spike: purchase unit price > 1.20x historical average cost
        if qty_int > 0:
            qty_dec = Decimal(qty_int)
            unit_price = val_irr / qty_dec
            history = item_history[item_id]

            if history["qty"] > Decimal(0):
                hist_avg = history["cost"] / history["qty"]
                threshold = Decimal("1.20") * hist_avg
                if unit_price > threshold:
                    spike_pct = round(float((unit_price - hist_avg) / hist_avg * 100), 1)
                    diff_unit = unit_price - hist_avg
                    total_excess = diff_unit * qty_dec
                    severity = "critical" if unit_price > Decimal("1.50") * hist_avg else "high"
                    anomalies.append(
                        {
                            "anomaly_type": "purchase_price_spike",
                            "item_id": item_id,
                            "movement_id": mv.id,
                            "journal_id": mv.journal_id,
                            "date": mv.date.isoformat(),
                            "severity": severity,
                            "exact_amounts": {
                                "unit_price_irr": text_amount(unit_price),
                                "historical_average_irr": text_amount(hist_avg),
                                "difference_irr": text_amount(diff_unit),
                                "total_excess_irr": text_amount(total_excess),
                                "spike_percentage": spike_pct,
                                "quantity": qty_int,
                            },
                            "explanation": (
                                f"جهش قیمت خرید: نرخ خرید هر واحد کالا ({text_amount(unit_price)} ریال) "
                                f"به میزان {spike_pct}٪ بالاتر از میانگین خرید قبلی ({text_amount(hist_avg)} ریال) است "
                                f"که منجر به افزایش مازاد {text_amount(total_excess)} ریال در بهای موجودی شده است."
                            ),
                        }
                    )

            history["cost"] += val_irr
            history["qty"] += qty_dec

        # b) Negative gross margin: sale unit price < FIFO unit cost consumed
        elif qty_int < 0:
            qty_abs = Decimal(abs(qty_int))
            cogs_consumed = abs(val_irr)
            fifo_unit_cost = cogs_consumed / qty_abs if qty_abs > Decimal(0) else Decimal(0)

            sale_unit_price = Decimal(0)
            if evidence.get("unit_price_irr"):
                try:
                    sale_unit_price = Decimal(canonical_money(evidence["unit_price_irr"]))
                except (ValueError, TypeError):
                    pass
            elif evidence.get("unit_price"):
                try:
                    sale_unit_price = Decimal(canonical_money(evidence["unit_price"]))
                except (ValueError, TypeError):
                    pass

            if sale_unit_price == Decimal(0) and mv.operation_id:
                op = db.get(OperationDraft, mv.operation_id)
                if op and op.payload:
                    p = op.payload
                    raw_sale_price = p.get("unit_price_irr") or p.get("unit_price")
                    if raw_sale_price:
                        try:
                            sale_unit_price = Decimal(canonical_money(raw_sale_price))
                        except (ValueError, TypeError):
                            pass

            if sale_unit_price > Decimal(0) and sale_unit_price < fifo_unit_cost:
                loss_per_unit = fifo_unit_cost - sale_unit_price
                total_loss = loss_per_unit * qty_abs
                anomalies.append(
                    {
                        "anomaly_type": "negative_gross_margin",
                        "item_id": item_id,
                        "movement_id": mv.id,
                        "journal_id": mv.journal_id,
                        "date": mv.date.isoformat(),
                        "severity": "critical",
                        "exact_amounts": {
                            "sale_unit_price_irr": text_amount(sale_unit_price),
                            "fifo_unit_cost_irr": text_amount(fifo_unit_cost),
                            "loss_per_unit_irr": text_amount(loss_per_unit),
                            "total_loss_irr": text_amount(total_loss),
                            "quantity": int(qty_abs),
                        },
                        "explanation": (
                            f"حاشیه سود ناخالص منفی: نرخ فروش هر واحد کالا ({text_amount(sale_unit_price)} ریال) "
                            f"کمتر از بهای تمام‌شده فایفو ({text_amount(fifo_unit_cost)} ریال) است "
                            f"و این معامله منجر به {text_amount(total_loss)} ریال زیان ناخالص شده است."
                        ),
                    }
                )

    return anomalies
