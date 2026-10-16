"""Supplier balances include both purchase credits and settlement debits."""

from collections import defaultdict
from decimal import Decimal
from typing import Any
from uuid import UUID


def supplier_balances(rows: list[Any]) -> list[dict[str, Any]]:
    totals: dict[UUID, Decimal] = defaultdict(Decimal)
    parties: dict[UUID, Any] = {}
    evidence: dict[UUID, list[str]] = defaultdict(list)
    for line, entry, party in rows:
        if getattr(entry, "entry_type", "normal") == "closing":
            continue
        totals[party.id] += Decimal(line.credit_irr) - Decimal(line.debit_irr)
        parties[party.id] = party
        evidence[party.id].append(str(line.id))
    return [
        {"party": parties[key], "amount": value, "line_ids": evidence[key]}
        for key, value in totals.items()
        if value > 0
    ]
