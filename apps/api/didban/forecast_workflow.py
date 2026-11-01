"""Forecast preflight and dated clarifications before canonical publication."""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from .finance import calculate, day
from .forecast_planning import LOOKBACK_DAYS, MINIMUM_EVENTS, POLICY_VERSION, plan_receipts
from .ingestion import money, parsed_date
from .models import Allocation, AuditEvent, PlannedPayment, ProcessingIssue, ProcessingSession, ResultManifest


def _selected_history(db: Session, company: str, row_ids: list[str]) -> list[dict]:
    from .workflow import latest_interpretations, source_rows_for
    rows = source_rows_for(db, company, row_ids)
    interpretations = {}
    history = []
    for row in rows.values():
        if row.file_id not in interpretations:
            interpretations[row.file_id] = {item.sheet: item for item in latest_interpretations(db, company, row.file_id)}
        interpretation = interpretations[row.file_id][row.sheet]
        if interpretation.family != "history":
            continue
        def value(field: str, current_row=row, current_interpretation=interpretation) -> str:
            return str(current_row.values.get(current_interpretation.mapping.get(field, ""), "") or "").strip()
        unit = value("currency") or interpretation.unit
        history.append({"event_id": value("event_id"), "invoice_reference": value("invoice_id"), "party_id": value("party_id"), "due_date": parsed_date(value("due_date"), interpretation.calendar).isoformat(), "paid_on": parsed_date(value("paid_on"), interpretation.calendar).isoformat(), "amount": money(value("amount"), unit), "role": "calibration_only", "source_row_id": row.id, "original_unit": unit, "original_amount": value("amount")})
    return history


def _decisions(db: Session, session: ProcessingSession, parent: ResultManifest | None) -> list[dict]:
    decisions = {item["id"]: item for item in parent.selection.get("decisions", [])} if parent else {}
    questions = list(db.scalars(select(ProcessingIssue).where(ProcessingIssue.company_id == session.company_id, ProcessingIssue.session_id == session.id, ProcessingIssue.answer.is_not(None)).order_by(ProcessingIssue.created_at, ProcessingIssue.id)))
    events = {event.entity_id: event for event in db.scalars(select(AuditEvent).where(AuditEvent.company_id == session.company_id, AuditEvent.action == "processing.answer_submitted", AuditEvent.entity_id.in_([question.id for question in questions])))} if questions else {}
    for question in questions:
        event = events.get(question.id)
        decisions[question.id] = {"id": question.id, "code": question.code, "version": question.version, "answer": question.answer, "actor_id": question.answered_by, "evidence": question.evidence, "answer_event_id": event.id if event else None, "answered_at": event.created_at.isoformat() if event else None, "provenance": "inherited" if question.evidence.get("inherited_manifest_id") else "human"}
    return list(decisions.values())


def prepare_forecast(db: Session, session: ProcessingSession, period: dict, coverage: dict, row_ids: list[str], candidates: list, parent: ResultManifest | None) -> dict:
    """Return forecast-only copies, opening one necessary question at a time."""
    from .workflow import FACTS, issue, question_code, records_for, serialize_fact
    records = records_for(db, session.company_id, row_ids)
    for candidate in candidates:
        for family, cls in FACTS.items():
            if isinstance(candidate, cls):
                records[family].append(serialize_fact(candidate))
                break
    records["history"] = _selected_history(db, session.company_id, row_ids)
    banks_by_id = {row["id"]: row for row in records["bank"] if row.get("id")}
    invoice_ids = {row["id"] for row in records["invoices"] if row.get("id")}
    allocations = [{**serialize_fact(item), "date": banks_by_id[item.bank_id]["date"]} for item in db.scalars(select(Allocation).where(Allocation.company_id == session.company_id, Allocation.reversed_at.is_(None))) if item.bank_id in banks_by_id and item.invoice_id in invoice_ids]
    records["allocations"] = allocations
    plans = [serialize_fact(item) for item in db.scalars(select(PlannedPayment).where(PlannedPayment.company_id == session.company_id, PlannedPayment.state == "confirmed")) if not item.source_row_id or item.source_row_id in row_ids]
    plans.extend(serialize_fact(item) for item in candidates if isinstance(item, PlannedPayment) and item.state == "confirmed")
    effective = dict(coverage)
    same_period = parent is not None and parent.period_id == period["id"]
    parent_coverage = parent.selection.get("coverage", {}) if same_period else {}
    # Answers survive ordinary revisions of the same period. Source changes to an
    # invoice's party, due date or amount invalidate that invoice's inherited date.
    old_invoices = {str(row["reference"]): row for row in parent.details.get("invoices", [])} if same_period else {}
    inherited_receipts = {}
    human_receipts = {}
    if same_period:
        for decision in parent.selection.get("decisions", []):
            if decision["code"].split(":")[0] == "receipt_date":
                for reference in decision["evidence"].get("invoice_refs", []):
                    human_receipts[reference] = None if decision["answer"]["value"] == "unknown" else decision["answer"]["value"]
    for invoice in records["invoices"]:
        reference = str(invoice["reference"])
        old = old_invoices.get(reference)
        if old and old.get("party_id") == invoice.get("party_id") and old.get("due_date") == (day(invoice["due_date"]).isoformat() if invoice.get("due_date") else None) and Decimal(old["amount"]) == Decimal(invoice["amount"]) and reference in human_receipts and parent_coverage.get("receipt_dates", {}).get(reference) == human_receipts[reference]:
            inherited_receipts[reference] = human_receipts[reference]
    effective["receipt_dates"] = inherited_receipts
    old_plans = {str(plan["obligation_id"]): plan for plan in parent.selection.get("plans", [])} if same_period else {}
    inherited_payments = {}
    for plan in plans:
        obligation = str(plan["obligation_id"])
        previous = old_plans.get(obligation)
        if previous and _same_plan(previous, plan) and obligation in parent_coverage.get("payment_dates", {}):
            inherited_payments[obligation] = parent_coverage["payment_dates"][obligation]
    effective["payment_dates"] = inherited_payments
    effective["forecast_policy"] = {"version": POLICY_VERSION, "production_approved": True, "minimum_events": MINIMUM_EVENTS, "lookback_days": LOOKBACK_DAYS, "delay_method": "amount_weighted_median"}
    effective["bank_accounts"] = sorted({row["account"] for row in records["bank"]})
    decisions = _decisions(db, session, parent)
    current_question_ids = set(db.scalars(select(ProcessingIssue.id).where(ProcessingIssue.company_id == session.company_id, ProcessingIssue.session_id == session.id)))
    for decision in decisions:
        if decision["id"] not in current_question_ids:
            continue
        code = decision["code"].split(":")[0]
        expected = decision["answer"]["value"]
        if code == "receipt_date":
            for reference in decision["evidence"]["invoice_refs"]:
                effective["receipt_dates"][reference] = None if expected == "unknown" else expected
        elif code == "payment_date":
            effective["payment_dates"][decision["evidence"]["obligation_id"]] = None if expected == "unknown" else expected
    baseline = calculate(records, period, effective, allocations=allocations, plans=plans)
    cash = next(item for item in baseline["metrics"] if item["metric_key"] == "cash")
    result = {"blocked": False, "coverage": effective, "plans": [dict(plan) for plan in plans], "assumptions": [], "decisions": decisions, "history": records["history"]}
    receivables = next(item for item in baseline["metrics"] if item["metric_key"] == "ar_invoice")
    if cash["value"] is None or receivables["status"] != "available" or effective.get("future_payments_complete") is not True:
        return result
    # An earlier unknown timing answer is not a permanent veto on newly supplied,
    # independently sufficient dated payment evidence. Explicit future dates remain.
    parent_row_ids = set(parent.selection.get("row_ids", [])) if parent else set()
    new_history = any(row.get("source_row_id") not in parent_row_ids for row in [*records["history"], *records["settlements"]])
    if same_period and new_history:
        trial_dates = {reference: expected for reference, expected in effective["receipt_dates"].items() if expected is not None}
        trial = plan_receipts(records, period, effective | {"receipt_dates": trial_dates})
        strong_refs = set(trial["receipt_dates"])
        for pending in trial["issues"]:
            if "receipt_estimate_in_past" in pending["reason_codes"]:
                strong_refs.update(pending["invoice_refs"])
        for invoice in records["invoices"]:
            reference = str(invoice["reference"])
            if invoice.get("due_date") and reference in strong_refs and effective["receipt_dates"].get(reference, "absent") is None:
                effective["receipt_dates"].pop(reference)
    receipt_plan = plan_receipts(records, period, effective)
    effective["receipt_dates"] = {**effective["receipt_dates"], **receipt_plan["receipt_dates"]}
    result["assumptions"].extend(receipt_plan["assumptions"])
    for pending in receipt_plan["issues"]:
        issue(db, session, question_code("receipt_date", pending["party_id"]), pending["title"], [{"value": "unknown", "label": "زمان نامعلوم"}], {**pending, "kind": "date", "label": "تاریخ مورد انتظار وصول", "as_of_date": period["end"], "policy_version": POLICY_VERSION})
        result["blocked"] = True
        return result
    invoice_balances = {str(row["reference"]): row for row in baseline["details"]["invoices"]}
    as_of = day(period["end"])
    for plan in result["plans"]:
        remaining = Decimal(plan["amount"])
        invoice = invoice_balances.get(str(plan.get("invoice_reference"))) if plan.get("invoice_reference") else None
        if invoice:
            if invoice["remaining"] is None:
                continue
            remaining = min(remaining, max(Decimal(invoice["remaining"]), Decimal(0)))
        if remaining <= 0 or day(plan["due_date"]) > as_of:
            continue
        obligation = str(plan["obligation_id"])
        if obligation in effective["payment_dates"]:
            expected = effective["payment_dates"][obligation]
            if expected is not None:
                plan["due_date"] = expected
                result["assumptions"].append({"obligation_id": obligation, "basis": "human_expected_payment_date", "expected_date": expected, "source_row_id": plan.get("source_row_id")})
            continue
        issue(db, session, question_code("payment_date", obligation), "این تعهد چه تاریخی پرداخت می‌شود؟", [{"value": "unknown", "label": "زمان نامعلوم"}], {"kind": "date", "label": "تاریخ مورد انتظار پرداخت", "as_of_date": period["end"], "obligation_id": obligation, "amount": str(remaining), "invoice_reference": plan.get("invoice_reference"), "evidence_refs": [plan["source_row_id"]] if plan.get("source_row_id") else [], "policy_version": POLICY_VERSION})
        result["blocked"] = True
        return result
    return result


def _same_plan(previous: dict, current: dict) -> bool:
    return (
        all(previous.get(field) == current.get(field) for field in ("id", "source_row_id", "version", "invoice_reference", "obligation_id"))
        and day(previous["due_date"]) == day(current["due_date"])
        and Decimal(previous["amount"]) == Decimal(current["amount"])
    )
