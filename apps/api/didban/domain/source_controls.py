"""Independent whole-document controls; a broken journal is never partly accepted."""

from __future__ import annotations
from decimal import Decimal, localcontext
from .interpretation_types import CanonicalRow


def check_groups(kind: str, rows: list[CanonicalRow], mapping: dict, header_row: int):
    controls = [
        {
            "key": "required_columns",
            "outcome": "passed",
            "evidence": {"header_row": header_row, "mapping": mapping},
        },
        {
            "key": "coverage",
            "outcome": "unknown",
            "evidence": {"reason": "dates_do_not_prove_completeness"},
        },
    ]
    if kind not in ("bank", "ledger"):
        key_field = {
            "sales_invoices": "invoice_id",
            "purchase_invoices": "invoice_id",
            "moadian_sales": "tax_id",
            "moadian_purchases": "tax_id",
            "settlements": "event_id",
            "receipt_history": "event_id",
            "planned_payments": "plan_id",
        }[kind]
        counts = {}
        for row in rows:
            key = row.values.get(key_field)
            if key:
                counts[key] = counts.get(key, 0) + 1
        for row in rows:
            if counts.get(row.values.get(key_field), 0) > 1:
                row.errors.append("duplicate_logical_key")
    if kind == "ledger":
        roles = {}
        for row in rows:
            if row.values.get("role"):
                roles.setdefault(row.values.get("account"), set()).add(
                    row.values["role"]
                )
        for row in rows:
            if len(roles.get(row.values.get("account"), set())) > 1:
                row.errors.append("account_role_conflict")
        controls.append(
            {
                "key": "account_role_consistency",
                "outcome": "failed" if any(r.errors for r in rows) else "passed",
                "evidence": {"role_origin": "explicit_source_or_recorded_answer"},
            }
        )
        groups = {}
        for row in rows:
            groups.setdefault(row.values.get("entry_id"), []).append(row)
        for group in groups.values():
            with localcontext() as ctx:
                ctx.prec = 96
                balanced = (
                    not any(r.errors for r in group)
                    and len(group) >= 2
                    and len({r.values.get("date") for r in group}) == 1
                    and sum(
                        Decimal(r.values.get("debit") or "0")
                        - Decimal(r.values.get("credit") or "0")
                        for r in group
                    )
                    == 0
                )
            if not balanced:
                for row in group:
                    row.errors.append("unbalanced_or_incomplete_entry")
        controls.append(
            {
                "key": "journal_balance",
                "outcome": "failed" if any(r.errors for r in rows) else "passed",
                "evidence": {"entry_count": len(groups)},
            }
        )
    if kind == "bank":
        groups = {}
        for row in rows:
            groups.setdefault(row.values.get("bank_account"), []).append(row)

        def check_order(group):
            if len(group) < 2 or any(
                r.errors or r.values.get("balance") is None for r in group
            ):
                return None
            previous = None
            with localcontext() as ctx:
                ctx.prec = 96
                for row in group:
                    current = Decimal(row.values["balance"])
                    if (
                        previous is not None
                        and row.values.get("row_type") != "opening"
                        and previous + Decimal(row.values["amount"]) != current
                    ):
                        return False
                    previous = current
            return True

        orders = []
        mismatch = False
        for group in groups.values():
            forward = check_order(group)
            reverse = check_order(list(reversed(group)))
            if forward is False and reverse is False:
                mismatch = True
            orders.append("source" if forward else "reversed" if reverse else "unknown")
        if mismatch:
            for row in rows:
                row.errors.append("bank_balance_mismatch")
        controls.append(
            {
                "key": "bank_balance_sequence",
                "outcome": "failed"
                if mismatch
                else "passed"
                if all(o != "unknown" for o in orders)
                else "unknown",
                "evidence": {"cutoff_verified": False, "orders": orders},
            }
        )
    return controls
