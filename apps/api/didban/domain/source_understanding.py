"""Bounded, evidence-carrying understanding across a sealed company file set."""

from __future__ import annotations
from collections import defaultdict
from copy import deepcopy
from dataclasses import dataclass
from decimal import Decimal, localcontext
from .ledger_layout import ledger_layout, classify_entries, numeric, POLICY
from .moadian_export import portal_export, issue_date, document_kind, check_amounts
from .normalization import InvalidValue, identifier, money, text
from .source_profiles import header_key
from .source_tables import Sheet


@dataclass(frozen=True)
class SourceContext:
    file_id: str
    sha256: str
    tables: list[Sheet]
    excluded: bool = False
    role_decisions: dict | None = None


def portal_references(contexts):
    candidates = []
    for context in contexts:
        if context.excluded:
            continue
        for table in context.tables:
            for header in table.rows[:100]:
                signature = portal_export(header.values)
                if (
                    not signature
                    or header.formulas
                    or "party_name" not in signature.mapping
                ):
                    continue

                def cell(row, key):
                    column = signature.mapping[key]
                    return row.values[column - 1] if column <= len(row.values) else None

                for row in table.rows:
                    if row.number <= header.number or row.formulas:
                        continue
                    try:
                        if (
                            document_kind(text(cell(row, "kind")))
                            not in {"original", "corrective"}
                            or text(cell(row, "document_status")) == "باطل شده"
                        ):
                            continue
                        values = {
                            "gross": money(cell(row, "gross"), signature.unit),
                            "vat": money(cell(row, "vat"), signature.unit),
                        }
                        base = row.values[signature.base_column - 1]
                        check_amounts(values, base, signature.unit)
                        candidates.append(
                            {
                                "file_id": context.file_id,
                                "sha256": context.sha256,
                                "sheet": table.name,
                                "row": row.number,
                                "tax_id": identifier(cell(row, "tax_id")),
                                "party_name": header_key(cell(row, "party_name")),
                                "date": issue_date(cell(row, "issued_on"), None),
                                "net": Decimal(money(base, signature.unit)),
                                "vat": Decimal(values["vat"]),
                                "gross": Decimal(values["gross"]),
                                "kind": signature.kind,
                            }
                        )
                    except (InvalidValue, IndexError):
                        continue
                break
    # Repeated snapshots do not provide independent witnesses.
    occurrences = defaultdict(list)
    for candidate in candidates:
        occurrences[(candidate["kind"], candidate["tax_id"])].append(candidate)
    return [
        rows[0]
        for rows in occurrences.values()
        if len(
            {(r["date"], r["party_name"], r["net"], r["vat"], r["gross"]) for r in rows}
        )
        == 1
    ]


def unit_witnesses(layout, references):
    grouped = defaultdict(list)
    for ref in references:
        if ref["party_name"]:
            grouped[(ref["kind"], ref["date"], ref["party_name"])].append(ref)
    entries = defaultdict(list)
    for row in layout.records:
        if str(row.number) in layout.derived:
            entries[text(row.values[layout.mapping["entry_id"] - 1])].append(row)
    witnesses = []
    for entry, rows in entries.items():
        dates = {layout.derived[str(row.number)]["date_iso"] for row in rows}
        if len(dates) != 1:
            continue
        names = {
            header_key(layout.derived[str(row.number)]["account_leaf_name"])
            for row in rows
        }
        debit = [numeric(row.values[layout.mapping["debit"] - 1]) for row in rows]
        credit = [numeric(row.values[layout.mapping["credit"] - 1]) for row in rows]
        if sum(debit, Decimal(0)) != sum(credit, Decimal(0)):
            continue
        for (kind, date, party), refs in grouped.items():
            if date not in dates or party not in names:
                continue
            net, vat, gross = (
                sum((r[key] for r in refs), Decimal(0))
                for key in ("net", "vat", "gross")
            )
            for factor in (1, 10):
                components, total = (
                    (credit, debit) if kind == "moadian_sales" else (debit, credit)
                )
                if (
                    gross
                    and gross in [amount * factor for amount in total]
                    and net in [amount * factor for amount in components]
                    and (not vat or vat in [amount * factor for amount in components])
                ):
                    witnesses.append(
                        {
                            "entry_id": entry,
                            "date": date,
                            "factor": factor,
                            "source_rows": [row.number for row in rows],
                            "references": [
                                {
                                    "file_id": r["file_id"],
                                    "sha256": r["sha256"],
                                    "sheet": r["sheet"],
                                    "row": r["row"],
                                    "tax_id": r["tax_id"],
                                }
                                for r in refs
                            ],
                        }
                    )
    factors = {w["factor"] for w in witnesses}
    identities = {
        ref["tax_id"] for witness in witnesses for ref in witness["references"]
    }
    independent = {(w["date"], w["entry_id"]) for w in witnesses}
    if len(factors) == 1 and len(identities) >= 2 and len(independent) >= 2:
        return ("IRR" if factors == {1} else "IRT"), witnesses
    return None, witnesses


def account_totals(layout):
    totals = defaultdict(lambda: [Decimal(0), Decimal(0)])
    for row in layout.records:
        plan = layout.derived.get(str(row.number))
        if not plan:
            continue
        key = (plan["account_source_code"], header_key(plan["account_leaf_name"]))
        for index, field in enumerate(("debit", "credit")):
            totals[key][index] += numeric(row.values[layout.mapping[field] - 1])
    return dict(totals)


def understand(
    file_id: str, tables: list[Sheet], settings: dict, contexts: list[SourceContext]
):
    with localcontext() as context:
        context.prec = 96
        return _understand(file_id, tables, settings, contexts)


def _understand(file_id, tables, settings, contexts):
    """Fill interpretation gaps. Stored human settings always win."""
    candidate = deepcopy(settings)
    siblings = []
    for context in contexts:
        for table in context.tables:
            layout = ledger_layout(table)
            if layout:
                siblings.append((context, layout))
    references = portal_references(contexts)
    findings = []
    for table in tables:
        layout = ledger_layout(table)
        if not layout:
            continue
        saved = candidate.setdefault("sheets", {}).setdefault(table.name, {})
        if saved.get("actor_id") or saved.get("model_proposal"):
            continue
        if (
            saved.get("human_decisions", {}).get("source_kind")
            and saved.get("source_kind") != "ledger"
        ):
            continue
        previous = saved.get("understanding_evidence", {})
        if previous.get("unit_witnesses") and not saved.get("human_decisions", {}).get(
            "unit"
        ):
            saved.pop("unit", None)
        saved.pop("linked_account_roles", None)
        evidence = {
            "policy": POLICY,
            "header_row": layout.header.number,
            "context_files": [
                {"file_id": c.file_id, "sha256": c.sha256} for c in contexts
            ],
        }
        totals = account_totals(layout)
        for context, sibling in siblings:
            if context.file_id == file_id:
                continue
            other_totals = account_totals(sibling)
            role_index = {
                (
                    plan["account_source_code"],
                    header_key(plan["account_leaf_name"]),
                ): plan["account_role"]
                for plan in sibling.derived.values()
                if plan["account_role"]
            }
            decision_index = {
                (plan["account_source_code"], header_key(plan["account_leaf_name"])): (
                    context.role_decisions or {}
                )[plan["account"]]
                for plan in sibling.derived.values()
                if plan["account"] in (context.role_decisions or {})
            }
            for plan in layout.derived.values():
                key = (
                    plan["account_source_code"],
                    header_key(plan["account_leaf_name"]),
                )
                if (
                    not plan["account_role"]
                    and key in role_index
                    and totals.get(key) == other_totals.get(key)
                ):
                    plan["account_role"] = role_index[key]
                    plan["role_related_file"] = context.file_id
                decision = decision_index.get(key)
                if decision and totals.get(key) == other_totals.get(key):
                    saved.setdefault("linked_account_roles", {})[plan["account"]] = (
                        decision | {"source_file_id": context.file_id}
                    )
            if (
                not context.excluded
                and totals
                and totals == other_totals
                and len(sibling.mapping) >= len(layout.mapping)
            ):
                # A richer hierarchical export is a suggested selection, not a silent merge.
                def richness(value):
                    return sum(
                        "/" in plan["account"] for plan in value.derived.values()
                    )

                if richness(sibling) > richness(layout):
                    first, second = day_totals(layout), day_totals(sibling)
                    changed = sorted(
                        str(key)
                        for key in first.keys() | second.keys()
                        if first.get(key) != second.get(key)
                    )
                    findings.append(
                        {
                            "kind": "ledger_export_overlap",
                            "related_file_id": context.file_id,
                            "related_sha256": context.sha256,
                            "related_sheet": sibling.table.name,
                            "same_account_totals": True,
                            "date_differences": changed[:40],
                            "date_difference_count": len(changed),
                            "suggested_action": "keep_excluded",
                        }
                    )
        sales = {
            ref["party_name"] for ref in references if ref["kind"] == "moadian_sales"
        }
        purchases = {
            ref["party_name"]
            for ref in references
            if ref["kind"] == "moadian_purchases"
        }
        for plan in layout.derived.values():
            name = header_key(plan["account_leaf_name"])
            if plan["account_role"] == "other_ar" and name in sales:
                plan["account_role"] = "trade_ar"
                plan["role_reference"] = "portal_customer_identity_label"
            elif (
                plan["account_role"] == "other_liability"
                and name in purchases
                and any(
                    header_key(label) == header_key("بستانکاران")
                    for label in plan["labels"]
                )
            ):
                plan["account_role"] = "trade_ap"
                plan["role_reference"] = "portal_supplier_identity_label"
        classify_entries(layout.records, layout.mapping, layout.derived)
        unit, witnesses = unit_witnesses(layout, references)
        if unit:
            saved.setdefault("unit", unit)
            evidence["unit_witnesses"] = witnesses[:40]
        saved.update(
            {
                "header_row": layout.header.number,
                "mapping": layout.mapping,
                "source_kind": "ledger",
                "understanding_evidence": evidence,
                "derived_rows": layout.derived,
                "structural_rows": {
                    str(row.number): reason for row, reason in layout.structural
                },
                "understanding_controls": layout.controls,
            }
        )
        # Account IDs are paths from actual source codes, never model-generated IDs.
        saved["automatic_account_roles"] = {
            plan["account"]: plan["account_role"]
            for plan in layout.derived.values()
            if plan["account_role"]
        }
    return candidate, findings


def day_totals(layout):
    result = defaultdict(lambda: [Decimal(0), Decimal(0)])
    for row in layout.records:
        plan = layout.derived.get(str(row.number))
        if plan:
            key = (
                plan["date_iso"],
                plan["account_source_code"],
                header_key(plan["account_leaf_name"]),
            )
            for index, field in enumerate(("debit", "credit")):
                result[key][index] += numeric(row.values[layout.mapping[field] - 1])
    return dict(result)
