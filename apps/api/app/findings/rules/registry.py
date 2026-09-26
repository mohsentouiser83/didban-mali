from app.findings.rules.base import BaseFindingRule
from app.findings.rules.liquidity_rules import LowRunwayRule, ProjectedCashDeficitRule
from app.findings.rules.receivables_rules import (
    CustomerOverdueConcentrationRule,
    SignificantOverdueReceivableRule,
)
from app.findings.rules.reconciliation_rules import (
    LargeUnreconciledTransactionRule,
    PotentialDuplicateTransactionRule,
    UnmatchedAccountingEntryRule,
    UnmatchedBankTransactionRule,
)

ALL_RULES: list[BaseFindingRule] = [
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
