"""Deterministic comparison of pinned rows; never edits financial source amounts."""

from __future__ import annotations
from collections import defaultdict
from dataclasses import dataclass
from decimal import localcontext
from .financial.common import amount, decimal_text


@dataclass(frozen=True)
class ComparisonRow:
    normalized_id: str
    source_row_id: str
    file_id: str
    sheet: str
    row_number: int
    kind: str
    values: dict
    record_revision_id: str = ""


@dataclass(frozen=True)
class CandidateSpec:
    classification: str
    rows: tuple[tuple[str, ComparisonRow], ...]
    reasons: tuple[str, ...] = ()
    difference: str | None = None
    chain: tuple[str, ...] = ()


def source_view(side: str, row: ComparisonRow) -> dict:
    v = row.values
    value = v.get("amount") or v.get("gross")
    if row.kind == "ledger":
        with localcontext() as ctx:
            ctx.prec = 96
            value = decimal_text(
                amount(v.get("debit", "0")) - amount(v.get("credit", "0"))
            )
    return {
        "normalized_row_id": row.normalized_id,
        "source_row_id": row.source_row_id,
        "source_file_id": row.file_id,
        "sheet_name": row.sheet,
        "row_number": row.row_number,
        "side": side,
        "reference": v.get("reference") or v.get("tax_id") or v.get("invoice_id"),
        "date": v.get("date") or v.get("issued_on"),
        "amount": value,
    }


def bank_ledger(
    rows: list[ComparisonRow], bindings: dict[str, str]
) -> list[CandidateSpec]:
    with localcontext() as ctx:
        ctx.prec = 96
        return _bank_ledger(rows, bindings)


def _bank_ledger(
    rows: list[ComparisonRow], bindings: dict[str, str]
) -> list[CandidateSpec]:
    bank = [
        r
        for r in rows
        if r.kind == "bank"
        and r.values.get("row_type") != "opening"
        and amount(r.values.get("amount", "0")) != 0
    ]
    ledger = [
        r
        for r in rows
        if r.kind == "ledger"
        and r.values.get("role") == "bank"
        and r.values.get("entry_type") not in ("opening", "closing_transfer")
    ]
    by_ref = defaultdict(list)
    by_account_ref = defaultdict(list)
    exact_index = defaultdict(list)
    bank_count = defaultdict(int)
    for r in ledger:
        v = r.values
        ref = v.get("reference")
        if not ref:
            continue
        by_ref[ref].append(r)
        signed = amount(v.get("debit", "0")) - amount(v.get("credit", "0"))
        for account in {
            v.get("source_role"),
            v.get("account"),
            v.get("bank_account"),
        } - {None, ""}:
            by_account_ref[(account, ref)].append(r)
            exact_index[(account, ref, v.get("date"), signed)].append(r)
    for r in bank:
        v = r.values
        bank_count[
            (
                bindings.get(r.file_id + ":" + r.sheet),
                v.get("reference"),
                v.get("date"),
                amount(v["amount"]),
            )
        ] += 1
    proposals = []
    referenced = set()
    group_consumed = set()
    # Grouped amounts are proposed only, never automatically accepted.
    bank_groups = defaultdict(list)
    for r in bank:
        v = r.values
        key = (
            bindings.get(r.file_id + ":" + r.sheet),
            v.get("reference"),
            v.get("date"),
        )
        if key[0] and key[1]:
            bank_groups[key].append(r)
    for key, bank_group in bank_groups.items():
        ledger_group = [
            r
            for r in by_account_ref.get((key[0], key[1]), [])
            if r.values.get("date") == key[2]
        ]
        if not ledger_group or len(bank_group) > 20 or len(ledger_group) > 20:
            continue
        if not (
            (len(bank_group) == 1 and len(ledger_group) > 1)
            or (len(bank_group) > 1 and len(ledger_group) == 1)
        ):
            continue
        bank_amounts = [amount(r.values["amount"]) for r in bank_group]
        ledger_amounts = [
            amount(r.values.get("debit", "0")) - amount(r.values.get("credit", "0"))
            for r in ledger_group
        ]
        signs = {a > 0 for a in bank_amounts + ledger_amounts}
        if len(signs) != 1 or sum(bank_amounts) != sum(ledger_amounts):
            continue
        proposals.append(
            CandidateSpec(
                "suggested",
                tuple(
                    [
                        *(("bank", r) for r in bank_group),
                        *(("ledger", r) for r in ledger_group),
                    ]
                ),
                ("group_sum_equal",),
                "0",
            )
        )
        group_consumed.update(r.normalized_id for r in bank_group)
        referenced.update(r.normalized_id for r in ledger_group)
    for left in bank:
        if left.normalized_id in group_consumed:
            continue
        v = left.values
        binding = bindings.get(left.file_id + ":" + left.sheet)
        reference = v.get("reference")
        possible = by_ref.get(reference, []) if reference else []
        constrained = by_account_ref.get((binding, reference), [])
        if not binding or (possible and not constrained):
            proposals.append(
                CandidateSpec(
                    "needs_review", (("bank", left),), ("bank_ledger_binding_unknown",)
                )
            )
            continue
        if not reference:
            proposals.append(
                CandidateSpec("needs_review", (("bank", left),), ("reference_missing",))
            )
            continue
        exact = exact_index.get(
            (binding, reference, v.get("date"), amount(v["amount"])), []
        )
        if (
            len(exact) == 1
            and bank_count[(binding, reference, v.get("date"), amount(v["amount"]))]
            == 1
        ):
            right = exact[0]
            proposals.append(
                CandidateSpec("exact_unique", (("bank", left), ("ledger", right)))
            )
            referenced.add(right.normalized_id)
            continue
        if exact:
            # Bound pathological shared references; no truncated group is eligible for acceptance.
            if len(exact) > 20:
                proposals.append(
                    CandidateSpec(
                        "ambiguous", (("bank", left),), ("candidate_group_too_large",)
                    )
                )
                continue
            for right in exact:
                proposals.append(
                    CandidateSpec(
                        "ambiguous",
                        (("bank", left), ("ledger", right)),
                        ("competing_candidates",),
                    )
                )
                referenced.add(right.normalized_id)
            continue
        if len(constrained) == 1:
            right = constrained[0]
            delta = amount(v["amount"]) - (
                amount(right.values.get("debit", "0"))
                - amount(right.values.get("credit", "0"))
            )
            reasons = ("amount_mismatch",) if delta else ("date_mismatch",)
            proposals.append(
                CandidateSpec(
                    "amount_mismatch" if delta else "suggested",
                    (("bank", left), ("ledger", right)),
                    reasons,
                    decimal_text(delta) if abs(delta) < 10**32 else None,
                )
            )
            referenced.add(right.normalized_id)
        elif constrained:
            proposals.append(
                CandidateSpec("ambiguous", (("bank", left),), ("competing_candidates",))
            )
        else:
            proposals.append(
                CandidateSpec("unmatched", (("bank", left),), ("bank_only",))
            )
    for r in ledger:
        if r.normalized_id not in referenced:
            proposals.append(
                CandidateSpec("unmatched", (("ledger", r),), ("ledger_only",))
            )
    return proposals


def moadian(
    rows: list[ComparisonRow],
    direction: str,
    reference_rows: list[ComparisonRow] | None = None,
) -> list[CandidateSpec]:
    internal_kind = "sales_invoices" if direction == "sales" else "purchase_invoices"
    portal_kind = "moadian_sales" if direction == "sales" else "moadian_purchases"
    internal = [r for r in rows if r.kind == internal_kind]
    portal = [r for r in rows if r.kind == portal_kind]
    indexes = {}
    for side, items in [("internal", internal), ("portal", portal)]:
        index = defaultdict(list)
        for r in items:
            if r.values.get("tax_id"):
                index[r.values["tax_id"]].append(r)
        indexes[side] = index
    reference_index = defaultdict(list)
    for row in reference_rows if reference_rows is not None else portal:
        if row.kind == portal_kind and row.values.get("tax_id"):
            reference_index[row.values["tax_id"]].append(row)
    all_ids = sorted(set(indexes["internal"]) | set(indexes["portal"]))
    result = []
    for tax_id in all_ids:
        left = indexes["internal"].get(tax_id, [])
        right = indexes["portal"].get(tax_id, [])
        refs = tuple(
            [*(("internal", r) for r in left), *(("portal", r) for r in right)]
        )
        if len(left) > 1 or len(right) > 1:
            result.append(CandidateSpec("ambiguous", refs, ("duplicate_tax_identity",)))
            continue
        if not left or not right:
            row = (left or right)[0]
            chain = reference_chain(row, reference_index) if right else ()
            result.append(
                CandidateSpec(
                    "needs_review"
                    if row.values.get("kind", "original") != "original"
                    else "unmatched",
                    refs,
                    ("reference_chain_requires_review",)
                    if row.values.get("kind", "original") != "original"
                    else ("internal_only" if left else "portal_only",),
                    chain=chain,
                )
            )
            continue
        a, b = left[0].values, right[0].values
        chain = reference_chain(right[0], reference_index)
        if b.get("kind", "original") != "original" or b.get("reference_tax_id"):
            result.append(
                CandidateSpec(
                    "needs_review",
                    refs,
                    ("reference_chain_requires_review",),
                    chain=chain,
                )
            )
            continue
        reasons = []
        if a.get("vat") is None or b.get("vat") is None:
            reasons.append("tax_missing")
        if not a.get("party_id") or not b.get("party_id"):
            reasons.append("party_identity_missing")
        elif a["party_id"] != b["party_id"]:
            reasons.append("party_mismatch")
        if a.get("issued_on") != b.get("issued_on"):
            reasons.append("date_mismatch")
        with localcontext() as ctx:
            ctx.prec = 96
            diff = amount(b["gross"]) - amount(a["gross"])
        if diff:
            reasons.append("amount_mismatch")
        if (
            a.get("vat") is not None
            and b.get("vat") is not None
            and amount(a["vat"]) != amount(b["vat"])
        ):
            reasons.append("vat_mismatch")
        result.append(
            CandidateSpec(
                "exact_unique"
                if not reasons
                else "amount_mismatch"
                if diff
                else "needs_review",
                refs,
                tuple(reasons),
                decimal_text(diff) if abs(diff) < 10**32 else None,
                chain,
            )
        )
    for side, items in [("internal", internal), ("portal", portal)]:
        for row in items:
            if not row.values.get("tax_id"):
                result.append(
                    CandidateSpec(
                        "needs_review", ((side, row),), ("tax_identity_missing",)
                    )
                )
    return result


def reference_chain(
    row: ComparisonRow, index: dict[str, list[ComparisonRow]]
) -> tuple[str, ...]:
    chain = []
    seen = set()
    current = row
    while current.values.get("reference_tax_id"):
        key = current.values["reference_tax_id"]
        chain.append(key)
        if key in seen:
            chain.append("cycle")
            break
        seen.add(key)
        targets = index.get(key, [])
        if len(targets) != 1:
            chain.append("missing_reference" if not targets else "ambiguous_reference")
            break
        if targets[0].values.get("issued_on", "") > current.values.get("issued_on", ""):
            chain.append("future_reference")
            break
        current = targets[0]
    return tuple(chain)
