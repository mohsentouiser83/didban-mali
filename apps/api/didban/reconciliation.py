"""Evidence-based bank/ledger proposals; this module never commits decisions."""
from __future__ import annotations

from collections import Counter, defaultdict
from decimal import localcontext
from hashlib import sha256

from .finance import ANCHOR_KINDS, NON_FLOW_ENTRIES, amount, day, evidence, text_amount


def propose(ledger: list[dict], bank: list[dict], coverage: dict | None = None) -> list[dict]:
    """Propose one-to-one matches under an explicit bank-to-ledger account map.

    Exact amount/date coincidence without a shared reference does not qualify.
    Reused references, competing rows and date differences remain review items.
    No proposal changes capacity, creates an allocation or moves bank money.
    """
    mapping = (coverage or {}).get("bank_to_ledger", {})
    active_ledger = [row for row in ledger if row.get("entry_type", "regular") not in NON_FLOW_ENTRIES]
    active_bank = [row for row in bank if row.get("kind", "movement") not in ANCHOR_KINDS and amount(row["amount"]) != 0]
    by_reference: dict[str, list[dict]] = defaultdict(list)
    for row in active_ledger:
        if row.get("reference"):
            by_reference[str(row["reference"])].append(row)
    proposals = []
    for bank_row in active_bank:
        bank_id = str(bank_row.get("id") or bank_row.get("source_row_id"))
        reference = str(bank_row.get("reference") or "")
        account = str(bank_row["account"])
        mapped = mapping.get(account)
        reasons = []
        if not mapped:
            reasons.append("bank_ledger_mapping_missing")
        if not reference:
            reasons.append("shared_reference_missing")
        same_reference = by_reference.get(reference, []) if reference else []
        mapped_rows = [row for row in same_reference if str(row.get("account")) == str(mapped)] if mapped else []
        equal_amount = [row for row in mapped_rows if _signed_amount(row) == amount(bank_row["amount"])]
        if mapped and reference:
            if not same_reference:
                reasons.append("ledger_reference_missing")
            elif not mapped_rows:
                reasons.append("ledger_account_mismatch")
            elif not equal_amount:
                reasons.append("amount_mismatch")
            elif len(equal_amount) != 1:
                reasons.append("multiple_ledger_candidates")
            elif day(equal_amount[0]["date"]) != day(bank_row["date"]):
                reasons.append("date_mismatch")
        candidate_ids = [str(row.get("id") or row.get("source_row_id")) for row in equal_amount]
        proposals.append({
            "id": sha256((bank_id + "|" + "|".join(sorted(candidate_ids))).encode()).hexdigest()[:32],
            "bank_id": bank_id,
            "ledger_ids": candidate_ids,
            "bank_account": account,
            "ledger_account": str(mapped) if mapped else None,
            "reference": reference or None,
            "date": day(bank_row["date"]).isoformat(),
            "amount": text_amount(amount(bank_row["amount"])),
            "status": "exact_proposal" if not reasons and len(equal_amount) == 1 else "needs_review",
            "reason_codes": reasons,
            "evidence_refs": evidence([bank_row, *equal_amount]),
            "requires_human_review": bool(reasons),
        })
    # A candidate can be unique locally and still compete for the same ledger row.
    claims = Counter(ident for proposal in proposals for ident in proposal["ledger_ids"])
    for proposal in proposals:
        if any(claims[ident] > 1 for ident in proposal["ledger_ids"]):
            proposal["status"] = "needs_review"
            proposal["requires_human_review"] = True
            if "competing_bank_candidates" not in proposal["reason_codes"]:
                proposal["reason_codes"].append("competing_bank_candidates")
    return proposals


def _signed_amount(row: dict):
    with localcontext() as context:
        context.prec = 50
        return amount(row.get("debit", "0")) - amount(row.get("credit", "0"))
