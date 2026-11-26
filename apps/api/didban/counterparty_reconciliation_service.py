"""Counterparty statement reconciliation service.

Matches internal ledger transactions and invoices against external counterparty statements,
identifies open items, discrepancies, and generates formal reconciliation statements.
"""

from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, localcontext
from uuid import uuid4

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from . import models as m
from .commercial_models import CommercialCounterparty
from .counterparty_reconciliation_models import CounterpartyReconciliationRun
from .errors import require
from .models import JournalLine
from .money_type import aggregate_money, canonical_money
from .posting_models import NativeJournal
from .security import membership
from .services import get_entity
from .workflow import audit


def _parse_date(val: str | date | datetime) -> date:
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    s = str(val).strip()[:10]
    # Replace slashes with dashes if present
    s = s.replace("/", "-")
    return date.fromisoformat(s)


def list_candidates(db: Session, company: str, user: m.User) -> dict:
    membership(db, company, user, "read")
    counterparties = db.scalars(
        select(CommercialCounterparty)
        .where(CommercialCounterparty.company_id == company, CommercialCounterparty.active.is_(True))
        .order_by(CommercialCounterparty.name)
    ).all()

    # Pre-aggregate ledger amounts by party_id
    party_balances = defaultdict(lambda: {"debit": Decimal(0), "credit": Decimal(0), "count": 0})

    # 1. Native journals
    journals = db.scalars(select(NativeJournal).where(NativeJournal.company_id == company)).all()
    for j in journals:
        for line in j.snapshot.get("lines", []):
            pid = line.get("party_id")
            if pid:
                deb = Decimal(str(line.get("debit", 0) or 0))
                cred = Decimal(str(line.get("credit", 0) or 0))
                party_balances[pid]["debit"] += deb
                party_balances[pid]["credit"] += cred
                party_balances[pid]["count"] += 1

    # 2. Imported journal lines
    jlines = db.scalars(
        select(JournalLine).where(JournalLine.company_id == company, JournalLine.party_id != "")
    ).all()
    for jl in jlines:
        deb = Decimal(str(jl.debit or 0))
        cred = Decimal(str(jl.credit or 0))
        party_balances[jl.party_id]["debit"] += deb
        party_balances[jl.party_id]["credit"] += cred
        party_balances[jl.party_id]["count"] += 1

    items = []
    for cp in counterparties:
        stats = (
            party_balances.get(cp.id)
            or party_balances.get(cp.code)
            or {"debit": Decimal(0), "credit": Decimal(0), "count": 0}
        )
        net = stats["debit"] - stats["credit"]
        direction = "debtor" if net > 0 else "creditor" if net < 0 else "settled"
        items.append(
            {
                "id": cp.id,
                "code": cp.code,
                "name": cp.name,
                "national_id": cp.national_id,
                "phone": cp.phone,
                "credit_limit_irr": cp.credit_limit_irr,
                "transaction_count": stats["count"],
                "debit_total": canonical_money(stats["debit"]),
                "credit_total": canonical_money(stats["credit"]),
                "current_balance": canonical_money(abs(net)),
                "direction": direction,
            }
        )
    return {"items": items}


def get_counterparty_ledger(
    db: Session,
    company: str,
    user: m.User,
    counterparty_id: str,
    as_of_date: str | None = None,
    *,
    include_imported: bool = True,
) -> dict:
    membership(db, company, user, "read")
    cp = db.scalar(
        select(CommercialCounterparty).where(
            CommercialCounterparty.company_id == company,
            or_(CommercialCounterparty.id == counterparty_id, CommercialCounterparty.code == counterparty_id),
        )
    )
    require(cp is not None, "counterparty_not_found", "طرف حساب پیدا نشد.", 404)

    limit_date = _parse_date(as_of_date) if as_of_date else None

    # Retrieve matching lines from Native Journals
    entries = []
    journals = db.scalars(
        select(NativeJournal)
        .where(NativeJournal.company_id == company)
        .order_by(NativeJournal.date.asc(), NativeJournal.sequence.asc())
    ).all()

    for j in journals:
        if limit_date and j.date > limit_date:
            continue
        for idx, line in enumerate(j.snapshot.get("lines", [])):
            pid = line.get("party_id")
            if pid in (cp.id, cp.code):
                deb = Decimal(str(line.get("debit", 0) or 0))
                cred = Decimal(str(line.get("credit", 0) or 0))
                entries.append(
                    {
                        "id": f"native-{j.id}-{idx}",
                        "journal_id": j.id,
                        "journal_sequence": j.sequence,
                        "date": j.date.isoformat(),
                        "reference": str(
                            line.get("reference") or j.snapshot.get("summary", "") or ""
                        ).strip(),
                        "description": str(
                            line.get("description") or j.snapshot.get("summary", "") or ""
                        ).strip(),
                        "account_code": line.get("code") or line.get("account_id") or "",
                        "debit": canonical_money(deb),
                        "credit": canonical_money(cred),
                        "_debit_dec": deb,
                        "_credit_dec": cred,
                        "source_kind": "native_journal",
                    }
                )

    # Retrieve matching lines from Imported Facts
    jlines = (
        db.scalars(
            select(JournalLine)
            .where(
                JournalLine.company_id == company,
                or_(JournalLine.party_id == cp.id, JournalLine.party_id == cp.code),
            )
            .order_by(JournalLine.date.asc())
        ).all()
        if include_imported else []
    )

    for jl in jlines:
        jl_date = _parse_date(jl.date)
        if limit_date and jl_date > limit_date:
            continue
        deb = Decimal(str(jl.debit or 0))
        cred = Decimal(str(jl.credit or 0))
        entries.append(
            {
                "id": f"imported-{jl.id}",
                "journal_id": None,
                "journal_sequence": None,
                "date": jl_date.isoformat(),
                "reference": str(jl.reference or "").strip(),
                "description": f"حساب: {jl.account}",
                "account_code": jl.account,
                "debit": canonical_money(deb),
                "credit": canonical_money(cred),
                "_debit_dec": deb,
                "_credit_dec": cred,
                "source_kind": "imported_fact",
            }
        )

    entries.sort(key=lambda x: x["date"])

    # Calculate running balances
    running = Decimal(0)
    total_debit = Decimal(0)
    total_credit = Decimal(0)

    with localcontext() as context:
        context.prec = 60
        for entry in entries:
            debit = entry.pop("_debit_dec")
            credit = entry.pop("_credit_dec")
            total_debit += debit
            total_credit += credit
            running += debit - credit
            entry["running_balance"] = aggregate_money(running)

    direction = "debtor" if running > 0 else "creditor" if running < 0 else "settled"

    return {
        "counterparty": {
            "id": cp.id,
            "code": cp.code,
            "name": cp.name,
            "national_id": cp.national_id,
            "phone": cp.phone,
            "credit_limit_irr": cp.credit_limit_irr,
        },
        "entries": entries,
        "totals": {
            "debit_total": aggregate_money(total_debit),
            "credit_total": aggregate_money(total_credit),
            "net_balance": aggregate_money(running.copy_abs()),
            "raw_balance": aggregate_money(running),
            "direction": direction,
            "entry_count": len(entries),
        },
    }


def reconcile(
    db: Session,
    company: str,
    user: m.User,
    data: dict,
) -> dict:
    membership(db, company, user, "write")
    cp_id = data["counterparty_id"]
    as_of_str = data["as_of_date"]
    as_of = _parse_date(as_of_str)
    tolerance = int(data.get("tolerance_days", 7))
    statement_rows = data.get("statement_rows", [])

    # Get ledger entries up to as_of
    ledger_data = get_counterparty_ledger(db, company, user, cp_id, as_of.isoformat())
    cp = ledger_data["counterparty"]
    book_entries = ledger_data["entries"]

    # Normalize statement rows
    normalized_statement = []
    statement_debit_sum = Decimal(0)
    statement_credit_sum = Decimal(0)

    for idx, row in enumerate(statement_rows):
        r_date = _parse_date(row["date"])
        deb = Decimal(str(row.get("debit", 0) or 0))
        cred = Decimal(str(row.get("credit", 0) or 0))
        statement_debit_sum += deb
        statement_credit_sum += cred
        normalized_statement.append(
            {
                "id": f"stmt-{idx + 1}",
                "date": r_date.isoformat(),
                "_date": r_date,
                "reference": str(row.get("reference", "") or "").strip(),
                "description": str(row.get("description", "") or "").strip(),
                "debit": canonical_money(deb),
                "credit": canonical_money(cred),
                "_debit": deb,
                "_credit": cred,
            }
        )

    # Prepare pools for matching
    # In accounting:
    # Our Debit corresponds to Counterparty's Credit
    # Our Credit corresponds to Counterparty's Debit
    unmatched_book = []
    for b in book_entries:
        unmatched_book.append(
            {
                "id": b["id"],
                "date": b["date"],
                "_date": _parse_date(b["date"]),
                "reference": b["reference"],
                "description": b["description"],
                "debit": b["debit"],
                "credit": b["credit"],
                "_debit": Decimal(b["debit"]),
                "_credit": Decimal(b["credit"]),
            }
        )

    unmatched_statement = list(normalized_statement)
    matched_items = []
    discrepancy_items = []

    # Rule 1: Exact Reference Match
    # Match where reference is non-empty and matches, and amounts align
    rem_book_1 = []
    for b in unmatched_book:
        matched_idx = -1
        b_ref = b["reference"]
        for s_idx, s in enumerate(unmatched_statement):
            s_ref = s["reference"]
            if b_ref and s_ref and b_ref == s_ref:
                # Check amount alignment: b._debit == s._credit or b._credit == s._debit
                is_align = (b["_debit"] > 0 and b["_debit"] == s["_credit"]) or (
                    b["_credit"] > 0 and b["_credit"] == s["_debit"]
                )
                if is_align:
                    matched_idx = s_idx
                    break
        if matched_idx >= 0:
            s_match = unmatched_statement.pop(matched_idx)
            matched_items.append(
                {
                    "type": "exact_reference",
                    "label": "انطباق قطعی بر اساس شماره مدرک و مبلغ",
                    "book_item": {
                        "id": b["id"],
                        "date": b["date"],
                        "reference": b["reference"],
                        "description": b["description"],
                        "debit": b["debit"],
                        "credit": b["credit"],
                    },
                    "statement_item": {
                        "id": s_match["id"],
                        "date": s_match["date"],
                        "reference": s_match["reference"],
                        "description": s_match["description"],
                        "debit": s_match["debit"],
                        "credit": s_match["credit"],
                    },
                    "matched_amount": b["debit"] if b["_debit"] > 0 else b["credit"],
                }
            )
        else:
            rem_book_1.append(b)
    unmatched_book = rem_book_1

    # Rule 2: Exact Reference with Amount Mismatch
    rem_book_2 = []
    for b in unmatched_book:
        mismatch_idx = -1
        b_ref = b["reference"]
        for s_idx, s in enumerate(unmatched_statement):
            s_ref = s["reference"]
            if b_ref and s_ref and b_ref == s_ref:
                mismatch_idx = s_idx
                break
        if mismatch_idx >= 0:
            s_mismatch = unmatched_statement.pop(mismatch_idx)
            book_amt = b["_debit"] if b["_debit"] > 0 else b["_credit"]
            stmt_amt = s_mismatch["_credit"] if b["_debit"] > 0 else s_mismatch["_debit"]
            diff = book_amt - stmt_amt
            discrepancy_items.append(
                {
                    "type": "amount_mismatch",
                    "label": "شماره مدرک یکسان اما اختلاف در مبلغ",
                    "book_item": {
                        "id": b["id"],
                        "date": b["date"],
                        "reference": b["reference"],
                        "description": b["description"],
                        "debit": b["debit"],
                        "credit": b["credit"],
                    },
                    "statement_item": {
                        "id": s_mismatch["id"],
                        "date": s_mismatch["date"],
                        "reference": s_mismatch["reference"],
                        "description": s_mismatch["description"],
                        "debit": s_mismatch["debit"],
                        "credit": s_mismatch["credit"],
                    },
                    "difference": canonical_money(abs(diff)),
                }
            )
        else:
            rem_book_2.append(b)
    unmatched_book = rem_book_2

    # Rule 3: Amount and Date Proximity Match (within tolerance days)
    rem_book_3 = []
    for b in unmatched_book:
        matched_idx = -1
        for s_idx, s in enumerate(unmatched_statement):
            is_align = (b["_debit"] > 0 and b["_debit"] == s["_credit"]) or (
                b["_credit"] > 0 and b["_credit"] == s["_debit"]
            )
            if is_align:
                day_diff = abs((b["_date"] - s["_date"]).days)
                if day_diff <= tolerance:
                    matched_idx = s_idx
                    break
        if matched_idx >= 0:
            s_match = unmatched_statement.pop(matched_idx)
            matched_items.append(
                {
                    "type": "amount_date_proximity",
                    "label": "انطباق بر اساس مبلغ و تقارن تاریخی",
                    "book_item": {
                        "id": b["id"],
                        "date": b["date"],
                        "reference": b["reference"],
                        "description": b["description"],
                        "debit": b["debit"],
                        "credit": b["credit"],
                    },
                    "statement_item": {
                        "id": s_match["id"],
                        "date": s_match["date"],
                        "reference": s_match["reference"],
                        "description": s_match["description"],
                        "debit": s_match["debit"],
                        "credit": s_match["credit"],
                    },
                    "matched_amount": b["debit"] if b["_debit"] > 0 else b["credit"],
                }
            )
        else:
            rem_book_3.append(b)
    unmatched_book = rem_book_3

    # Open items remaining
    open_in_book = []
    for b in unmatched_book:
        open_in_book.append(
            {
                "id": b["id"],
                "date": b["date"],
                "reference": b["reference"],
                "description": b["description"],
                "debit": b["debit"],
                "credit": b["credit"],
                "nature": "بدهکار در دفاتر ما (فاکتور/واریزی ثبت‌نشده توسط طرف)"
                if b["_debit"] > 0
                else "بستانکار در دفاتر ما (دریافتی/سند منظورنشده توسط طرف)",
            }
        )

    open_in_statement = []
    for s in unmatched_statement:
        open_in_statement.append(
            {
                "id": s["id"],
                "date": s["date"],
                "reference": s["reference"],
                "description": s["description"],
                "debit": s["debit"],
                "credit": s["credit"],
                "nature": "بدهکار طرف‌حساب (سند ادعایی طرف که در دفاتر ما نیست)"
                if s["_debit"] > 0
                else "بستانکار طرف‌حساب (واریزی طرف که هنوز به حساب ننشانده‌ایم)",
            }
        )

    # Calculations
    book_balance = Decimal(ledger_data["totals"]["raw_balance"])
    # Statement balance from counterparty's view:
    # If customer: their debit is payments to us, credit is purchases from us -> net = credit - debit
    # If supplier: their debit is sales to us, credit is payments from us -> net = debit - credit
    # In both views, statement net corresponding to our book balance is:
    statement_balance = statement_debit_sum - statement_credit_sum

    # Net discrepancy
    net_discrepancy = book_balance - (statement_credit_sum - statement_debit_sum)

    payload = {
        "as_of_date": as_of.isoformat(),
        "counterparty": cp,
        "tolerance_days": tolerance,
        "matched_items": matched_items,
        "discrepancy_items": discrepancy_items,
        "open_in_book": open_in_book,
        "open_in_statement": open_in_statement,
        "summary": {
            "book_debit_total": ledger_data["totals"]["debit_total"],
            "book_credit_total": ledger_data["totals"]["credit_total"],
            "book_balance": canonical_money(abs(book_balance)),
            "book_direction": ledger_data["totals"]["direction"],
            "statement_debit_total": canonical_money(statement_debit_sum),
            "statement_credit_total": canonical_money(statement_credit_sum),
            "statement_balance": canonical_money(abs(statement_balance)),
            "discrepancy": canonical_money(abs(net_discrepancy)),
            "is_fully_reconciled": len(open_in_book) == 0
            and len(open_in_statement) == 0
            and len(discrepancy_items) == 0,
            "matched_count": len(matched_items),
            "open_book_count": len(open_in_book),
            "open_statement_count": len(open_in_statement),
            "discrepancy_count": len(discrepancy_items),
        },
    }

    run_id = f"cp-rec-{uuid4().hex[:12]}"
    run = CounterpartyReconciliationRun(
        id=run_id,
        company_id=company,
        counterparty_id=cp["id"],
        party_name=cp["name"],
        as_of_date=as_of,
        book_balance=canonical_money(abs(book_balance)),
        statement_balance=canonical_money(abs(statement_balance)),
        discrepancy=canonical_money(abs(net_discrepancy)),
        matched_count=len(matched_items),
        open_book_count=len(open_in_book),
        open_statement_count=len(open_in_statement),
        payload=payload,
        status="reconciled"
        if payload["summary"]["is_fully_reconciled"]
        else "disputed"
        if len(discrepancy_items) > 0
        else "completed",
        actor_id=user.id,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    audit(
        db,
        company,
        user.id,
        "counterparty_reconciliation",
        run.id,
        {
            "counterparty_id": cp["id"],
            "party_name": cp["name"],
            "as_of_date": as_of.isoformat(),
            "discrepancy": canonical_money(abs(net_discrepancy)),
            "matched_count": len(matched_items),
        },
    )

    return {
        "id": run.id,
        "company_id": run.company_id,
        "counterparty_id": run.counterparty_id,
        "party_name": run.party_name,
        "as_of_date": run.as_of_date.isoformat(),
        "book_balance": run.book_balance,
        "statement_balance": run.statement_balance,
        "discrepancy": run.discrepancy,
        "matched_count": run.matched_count,
        "open_book_count": run.open_book_count,
        "open_statement_count": run.open_statement_count,
        "status": run.status,
        "notes": run.notes,
        "payload": run.payload,
        "created_at": run.created_at.isoformat() if run.created_at else None,
    }


def list_runs(db: Session, company: str, user: m.User, counterparty_id: str | None = None) -> dict:
    membership(db, company, user, "read")
    stmt = (
        select(CounterpartyReconciliationRun)
        .where(CounterpartyReconciliationRun.company_id == company)
        .order_by(CounterpartyReconciliationRun.created_at.desc())
    )
    if counterparty_id:
        stmt = stmt.where(CounterpartyReconciliationRun.counterparty_id == counterparty_id)

    runs = db.scalars(stmt.limit(50)).all()
    return {
        "items": [
            {
                "id": r.id,
                "counterparty_id": r.counterparty_id,
                "party_name": r.party_name,
                "as_of_date": r.as_of_date.isoformat(),
                "book_balance": r.book_balance,
                "statement_balance": r.statement_balance,
                "discrepancy": r.discrepancy,
                "matched_count": r.matched_count,
                "open_book_count": r.open_book_count,
                "open_statement_count": r.open_statement_count,
                "status": r.status,
                "notes": r.notes,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in runs
        ]
    }


def get_run(db: Session, company: str, user: m.User, run_id: str) -> dict:
    membership(db, company, user, "read")
    run = get_entity(db, CounterpartyReconciliationRun, company, run_id)
    return {
        "id": run.id,
        "company_id": run.company_id,
        "counterparty_id": run.counterparty_id,
        "party_name": run.party_name,
        "as_of_date": run.as_of_date.isoformat(),
        "book_balance": run.book_balance,
        "statement_balance": run.statement_balance,
        "discrepancy": run.discrepancy,
        "matched_count": run.matched_count,
        "open_book_count": run.open_book_count,
        "open_statement_count": run.open_statement_count,
        "status": run.status,
        "notes": run.notes,
        "payload": run.payload,
        "created_at": run.created_at.isoformat() if run.created_at else None,
    }


def decide_run(
    db: Session,
    company: str,
    user: m.User,
    run_id: str,
    status: str,
    notes: str,
) -> dict:
    membership(db, company, user, "write")
    run = get_entity(db, CounterpartyReconciliationRun, company, run_id)
    run.status = status
    if notes:
        run.notes = notes
    db.commit()
    db.refresh(run)

    audit(
        db,
        company,
        user.id,
        "counterparty_reconciliation_decide",
        run.id,
        {
            "status": status,
            "notes": notes,
        },
    )

    return {
        "id": run.id,
        "status": run.status,
        "notes": run.notes,
    }
