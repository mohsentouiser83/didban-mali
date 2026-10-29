"""Independent six-column trial-balance controls; no journal entries are invented."""

from collections import Counter, defaultdict
from decimal import Decimal, localcontext

PAIRS = (
    ("opening_debit", "opening_credit"),
    ("period_debit", "period_credit"),
    ("closing_debit", "closing_credit"),
)


def check_trial_rows(rows):
    groups = defaultdict(list)
    for row in rows:
        if row.values.get("row_level") != "summary":
            groups[
                (row.values.get("period_start"), row.values.get("as_of_date"))
            ].append(row)
    with localcontext() as context:
        context.prec = 96
        for group in groups.values():
            counts = Counter(row.values.get("account") for row in group)
            for row in group:
                if counts[row.values.get("account")] > 1:
                    row.errors.append("duplicate_trial_balance_account")
                if not row.errors:
                    nets = [
                        Decimal(row.values[d]) - Decimal(row.values[c])
                        for d, c in PAIRS
                    ]
                    if nets[0] + nets[1] != nets[2]:
                        row.errors.append("trial_balance_rollforward_mismatch")
            if any(row.errors for row in group) or any(
                sum(
                    (
                        Decimal(row.values.get(d) or "0")
                        - Decimal(row.values.get(c) or "0")
                        for row in group
                    ),
                    Decimal(0),
                )
                for d, c in PAIRS
            ):
                for row in group:
                    row.errors.append("trial_balance_unbalanced")
    return [
        {
            "key": "trial_balance_rollforward_and_balance",
            "outcome": "failed"
            if any(row.errors for row in rows)
            else "unknown"
            if any(row.values.get("row_level") == "unknown" for row in rows)
            else "passed",
            "evidence": {
                "scope_count": len(groups),
                "summary_rows_excluded": sum(
                    row.values.get("row_level") == "summary" for row in rows
                ),
            },
        }
    ]
