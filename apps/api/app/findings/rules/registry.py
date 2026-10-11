from app.findings.rules.base import BaseFindingRule
from app.findings.rules.liquidity_rules import LowRunwayRule, ProjectedCashDeficitRule
from app.findings.rules.receivables_rules import (
    CustomerOverdueConcentrationRule,
    SignificantOverdueReceivableRule,
)
from app.findings.rules.reconciliation_rules import (
    LargeUnreconciledTransactionRule,
    PotentialDuplicateTransactionRule,
    ReconciliationMismatchRule,
    UnmatchedAccountingEntryRule,
    UnmatchedBankTransactionRule,
)

ALL_RULES: list[BaseFindingRule] = [
    ReconciliationMismatchRule("amount_mismatch", "amount_mismatch", "مغایرت مبلغ بانک و دفتر"),
    ReconciliationMismatchRule("date_mismatch", "date_mismatch", "مغایرت تاریخ بانک و دفتر"),
    UnmatchedBankTransactionRule(),
    UnmatchedAccountingEntryRule(),
    PotentialDuplicateTransactionRule(),
    LargeUnreconciledTransactionRule(),
    SignificantOverdueReceivableRule(),
    CustomerOverdueConcentrationRule(),
    LowRunwayRule(),
    ProjectedCashDeficitRule(),
]

RULE_REGISTRY: dict[str, BaseFindingRule] = {rule.rule_code: rule for rule in ALL_RULES}
