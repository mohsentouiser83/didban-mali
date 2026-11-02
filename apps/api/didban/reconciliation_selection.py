"""Exact shared controls for explicitly selected imported or native bank groups."""

import json
from decimal import Decimal, localcontext
from hashlib import sha256

from .errors import require
from .finance import text_amount


def summarize_selection(
    banks: list[dict],
    ledgers: list[dict],
    bank_account: str,
    ledger_account: str,
    *,
    namespace: str = "manual",
    allow_one_to_one: bool = False,
) -> dict:
    require(
        1 <= len(banks) <= 100
        and 1 <= len(ledgers) <= 100
        and (allow_one_to_one or len(banks) > 1 or len(ledgers) > 1),
        "manual_group_size",
        "انتخاب ردیف‌های بانک و دفتر برای این گروه کافی نیست.",
    )
    bank_ids = sorted(row["id"] for row in banks)
    ledger_ids = sorted(row["id"] for row in ledgers)
    require(
        len(bank_ids) == len(set(bank_ids)) and len(ledger_ids) == len(set(ledger_ids)),
        "manual_group_duplicate",
        "ردیف تکراری انتخاب نکنید.",
    )
    require(
        bool(bank_account) and all(row["account"] == bank_account for row in banks),
        "reconciliation_account",
        "گردش‌های یک حساب بانک را انتخاب کنید.",
    )
    require(
        bool(ledger_account) and all(row["account"] == ledger_account for row in ledgers),
        "reconciliation_account",
        "حساب دفتر باید مطابق نگاشت صریح گروه باشد.",
        409,
    )
    parties = {row.get("party_id") for row in [*banks, *ledgers] if row.get("party_id")}
    require(len(parties) <= 1, "manual_group_party", "طرف‌حساب‌های معلوم گروه یکسان نیستند.", 409)
    with localcontext() as context:
        context.prec = 60
        bank_values = [Decimal(row["amount"]) for row in banks]
        ledger_values = [Decimal(row["amount"]) for row in ledgers]
        values = [*bank_values, *ledger_values]
        require(
            all(value.is_finite() and value != 0 for value in values)
            and len({value > 0 for value in values}) == 1,
            "reconciliation_direction",
            "جهت همهٔ گردش‌های انتخابی باید یکسان باشد.",
            409,
        )
        bank_total = sum(bank_values, Decimal(0))
        ledger_total = sum(ledger_values, Decimal(0))
        difference = bank_total - ledger_total
    dates = sorted({row["date"] for row in [*banks, *ledgers]})
    references = sorted({row.get("reference") or "" for row in [*banks, *ledgers]})
    warnings = ["manual_relationship_review"]
    if len(dates) > 1:
        warnings.append("date_mismatch")
    if len(references) != 1 or not references[0]:
        warnings.append("shared_reference_missing")
    if any(not row.get("party_id") for row in [*banks, *ledgers]):
        warnings.append("party_missing")
    if difference:
        warnings.append("group_amount_or_evidence_mismatch")
    identity = [namespace, bank_account, ledger_account, bank_ids, ledger_ids]
    return {
        "id": sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest(),
        "bank_ids": bank_ids,
        "ledger_ids": ledger_ids,
        "bank_account": bank_account,
        "ledger_account": ledger_account,
        "banks": banks,
        "ledgers": ledgers,
        "bank_total": text_amount(bank_total),
        "ledger_total": text_amount(ledger_total),
        "difference": text_amount(difference),
        "dates": dates,
        "references": references,
        "can_accept": difference == 0,
        "reason_codes": warnings,
        "evidence_refs": sorted({row["source_row_id"] for row in [*banks, *ledgers]}),
        "requires_human_review": True,
        "financial_effect": False,
        "match_basis": "explicit_manual_selection",
    }
