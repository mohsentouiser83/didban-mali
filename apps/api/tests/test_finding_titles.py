from decimal import Decimal

import pytest

from app.findings.models import Finding
from app.findings.titles import finding_title, finding_title_expression, unmatched_title


@pytest.mark.parametrize("rule,side,missing", [
    ("unmatched_bank_transaction", "bank_transaction", "تراکنش بانکی بدون پیشنهاد تطبیق"),
    ("unmatched_accounting_entry", "journal_line", "سطر حسابداری بدون پیشنهاد تطبیق"),
    ("large_unreconciled_transaction", "bank_transaction", "تراکنش بانکی بدون پیشنهاد تطبیق"),
    ("large_unreconciled_transaction", "journal_line", "سطر حسابداری بدون پیشنهاد تطبیق"),
])
def test_saved_unmatched_titles_identify_missing_side_without_rerunning_detection(rule, side, missing):
    finding = Finding(
        rule_code=rule, source_entity_type=side,
        title_fa="عنوان مبهم قبلی", severity="critical",
        financial_impact_irr=Decimal("2000000000"),
    )
    title = finding_title(finding, "no_candidate")
    assert title.startswith(missing)
    assert title.endswith("2,000,000,000 ریال")
    assert "بااهمیت" not in title
    assert finding.title_fa == "عنوان مبهم قبلی"


def test_unrelated_and_unknown_findings_keep_their_saved_title():
    for rule, side in [("amount_mismatch", "bank_transaction"), ("large_unreconciled_transaction", None)]:
        finding = Finding(rule_code=rule, source_entity_type=side, title_fa="اختلاف مبلغ", financial_impact_irr=Decimal(0))
        assert finding_title(finding) == "اختلاف مبلغ"


def test_amount_fallback_preserves_zero_and_large_integer_precision():
    finding = Finding(rule_code="unmatched_bank_transaction", source_entity_type="bank_transaction", title_fa="قبلی", financial_impact_irr=Decimal(0), affected_amount_irr=Decimal(100))
    assert finding_title(finding).endswith("0 ریال")
    finding.financial_impact_irr = None
    finding.affected_amount_irr = Decimal("90071992547409930")
    assert finding_title(finding).endswith("90,071,992,547,409,930 ریال")
    assert unmatched_title("bank_transaction", Decimal("-2000000000")).endswith("2,000,000,000 ریال")


def test_title_search_expression_uses_rule_and_source_instead_of_severity():
    sql = str(finding_title_expression().compile(compile_kwargs={"literal_binds": True}))
    assert "source_entity_type" in sql
    assert "severity" not in sql
    assert "بدون پیشنهاد تطبیق" in sql
    assert "دارای پیشنهاد تطبیق" in sql

@pytest.mark.parametrize("state,label", [("suggested", "دارای پیشنهاد تطبیق"), ("matched", "تطبیق تأییدشده"), ("unavailable", "در انتظار بررسی تطبیق")])
def test_titles_never_call_unconfirmed_proposals_missing_or_confirmed(state, label):
    finding = Finding(rule_code="unmatched_bank_transaction", source_entity_type="bank_transaction", title_fa="پیدا نشد", financial_impact_irr=Decimal(100))
    assert label in finding_title(finding, state)
    assert "پیدا نشد" not in finding_title(finding, state)
