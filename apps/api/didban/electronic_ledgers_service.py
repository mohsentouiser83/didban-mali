"""Electronic Legal Ledgers (دفاتر قانونی الکترونیک - روزنامه، کل و معین)

Implements sequential daily automatic document numbering per date:
- For each unique date with accounting entries, assign a sequential integer (e.g. Day 1 = 1, Day 3 = 2).
- All journal entries on that calendar date share or sequence by that daily number.
- Exports general ledger (دفتر کل) and subsidiary ledger (دفتر معین).
- Supports date range and subsidiary turnover toggle (گردش معین).
"""

from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .accounting_models import Account, AccountHierarchy
from .money_type import canonical_money
from .posting_models import NativeJournal


def get_electronic_ledger(
    db: Session,
    company: str,
    level: str = "general",  # "general" (کل) or "subsidiary" (معین)
    from_date: date | None = None,
    to_date: date | None = None,
    include_turnover: bool = True,
    auto_daily_numbering: bool = True,
) -> dict[str, Any]:
    # 1. Load accounts and hierarchies
    accounts = {
        acc.id: acc
        for acc in db.scalars(
            select(Account).where(Account.company_id == company)
        )
    }
    hierarchies = {
        h.account_id: h
        for h in db.scalars(
            select(AccountHierarchy).where(AccountHierarchy.company_id == company)
        )
    }

    # 2. Identify reversed journals to exclude them
    reversed_ids = set(
        db.scalars(
            select(NativeJournal.reversal_of).where(
                NativeJournal.company_id == company,
                NativeJournal.reversal_of.isnot(None),
            )
        )
    )

    # 3. Query posted journals
    stmt = (
        select(NativeJournal)
        .where(
            NativeJournal.company_id == company,
            NativeJournal.id.notin_(reversed_ids) if reversed_ids else True,
        )
        .order_by(NativeJournal.date.asc(), NativeJournal.sequence.asc())
    )
    if from_date:
        stmt = stmt.where(NativeJournal.date >= from_date)
    if to_date:
        stmt = stmt.where(NativeJournal.date <= to_date)

    journals = list(db.scalars(stmt))

    # 4. Sequential daily numbering mapping
    unique_dates = sorted({j.date for j in journals})
    date_to_daily_no = {d: i + 1 for i, d in enumerate(unique_dates)}

    # 5. Extract and normalize ledger lines
    lines_by_group: dict[str, list[dict[str, Any]]] = {}
    group_meta: dict[str, dict[str, Any]] = {}

    for j in journals:
        daily_no = date_to_daily_no[j.date] if auto_daily_numbering else j.sequence
        snapshot = j.snapshot or {}
        journal_desc = snapshot.get("description") or f"سند حسابداری {j.sequence}"

        for line in snapshot.get("lines", []):
            acc_id = line.get("account_id")
            acc = accounts.get(acc_id)
            if not acc:
                continue

            debit = Decimal(str(line.get("debit", 0)))
            credit = Decimal(str(line.get("credit", 0)))
            line_desc = line.get("description") or journal_desc

            # Determine grouping based on level
            h = hierarchies.get(acc_id)
            if level == "general":
                # Walk up from detail -> subsidiary -> general (never climbing to group)
                target_acc = acc
                cursor_h = h
                seen_ids = {acc.id}
                while cursor_h and cursor_h.level in ("detail", "subsidiary") and cursor_h.parent_id:
                    parent = accounts.get(cursor_h.parent_id)
                    if not parent or parent.id in seen_ids:
                        break
                    seen_ids.add(parent.id)
                    target_acc = parent
                    cursor_h = hierarchies.get(parent.id)
                group_key = target_acc.id
                if group_key not in group_meta:
                    group_meta[group_key] = {
                        "account_id": target_acc.id,
                        "code": target_acc.code,
                        "name": target_acc.name,
                        "nature": target_acc.nature,
                        "level": "general",
                    }
            else:
                # Subsidiary level: roll detail up to its subsidiary parent if present
                target_acc = acc
                target_h = h
                if h and h.level == "detail" and h.parent_id and h.parent_id in accounts:
                    target_acc = accounts[h.parent_id]
                    target_h = hierarchies.get(target_acc.id)
                group_key = target_acc.id
                parent_acc = accounts.get(target_h.parent_id) if target_h and target_h.parent_id else None
                if group_key not in group_meta:
                    group_meta[group_key] = {
                        "account_id": target_acc.id,
                        "code": target_acc.code,
                        "name": target_acc.name,
                        "nature": target_acc.nature,
                        "level": "subsidiary",
                        "parent_code": parent_acc.code if parent_acc else None,
                        "parent_name": parent_acc.name if parent_acc else None,
                    }

            if group_key not in lines_by_group:
                lines_by_group[group_key] = []

            lines_by_group[group_key].append(
                {
                    "journal_id": j.id,
                    "date": j.date.isoformat(),
                    "daily_doc_no": daily_no,
                    "journal_sequence": j.sequence,
                    "description": line_desc,
                    "party_id": line.get("party_id") or "",
                    "debit": str(debit),
                    "credit": str(credit),
                    "raw_debit": debit,
                    "raw_credit": credit,
                }
            )

    # 6. Build structured groups with running balances
    ledger_items = []
    total_debit = Decimal(0)
    total_credit = Decimal(0)

    for group_key, meta in sorted(group_meta.items(), key=lambda x: x[1]["code"]):
        entries = lines_by_group.get(group_key, [])
        running_balance = Decimal(0)
        group_debit = Decimal(0)
        group_credit = Decimal(0)

        processed_entries = []
        for entry in entries:
            d = entry["raw_debit"]
            c = entry["raw_credit"]
            group_debit += d
            group_credit += c
            # Normal balance: debit increases asset/expense, credit increases liability/equity
            running_balance += (d - c)

            processed_entries.append(
                {
                    "journal_id": entry["journal_id"],
                    "date": entry["date"],
                    "daily_doc_no": entry["daily_doc_no"],
                    "journal_sequence": entry["journal_sequence"],
                    "description": entry["description"],
                    "party_id": entry["party_id"],
                    "debit": canonical_money(d) if d else "0",
                    "credit": canonical_money(c) if c else "0",
                    "balance": canonical_money(abs(running_balance)),
                    "balance_nature": "بدهکار" if running_balance > 0 else "بستانکار" if running_balance < 0 else "بی‌حساب",
                }
            )

        total_debit += group_debit
        total_credit += group_credit

        item = {
            "account": meta,
            "total_debit": canonical_money(group_debit) if group_debit else "0",
            "total_credit": canonical_money(group_credit) if group_credit else "0",
            "final_balance": canonical_money(abs(running_balance)),
            "final_nature": "بدهکار" if running_balance > 0 else "بستانکار" if running_balance < 0 else "بی‌حساب",
        }
        if include_turnover:
            item["entries"] = processed_entries

        ledger_items.append(item)

    return {
        "level": level,
        "from_date": from_date.isoformat() if from_date else None,
        "to_date": to_date.isoformat() if to_date else None,
        "include_turnover": include_turnover,
        "auto_daily_numbering": auto_daily_numbering,
        "dates_count": len(unique_dates),
        "total_journals": len(journals),
        "total_debit": canonical_money(total_debit) if total_debit else "0",
        "total_credit": canonical_money(total_credit) if total_credit else "0",
        "items": ledger_items,
    }
