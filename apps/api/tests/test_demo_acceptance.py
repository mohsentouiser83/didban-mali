import hashlib
import json
import logging
from collections import Counter
from decimal import Decimal
from uuid import UUID

from app.analysis.calculations import calculate_ledger_metrics
from app.analysis.models import MetricCode
from app.core.logging import REDACTED, SensitiveDataFilter, redact_log_value
from app.demo.generate import generate_demo_files
from app.demo.scenario import build_demo_scenario
from app.findings.engine import FindingConfig, reconciliation_findings, trend_findings
from app.findings.models import FindingCode
from app.imports.mapping import parse_table, transform_and_validate_row
from app.imports.models import IssueSeverity, SourceKind
from app.reconciliation.engine import ReconciliationConfig, reconcile
from app.reconciliation.models import MatchStatus


def test_golden_reconciliation_meets_precision_and_review_targets() -> None:
    scenario = build_demo_scenario()
    first = reconcile(
        list(scenario.bank_records), list(scenario.ledger_records), ReconciliationConfig()
    )
    second = reconcile(
        list(scenario.bank_records), list(scenario.ledger_records), ReconciliationConfig()
    )
    automatic = [item for item in first if item.status == MatchStatus.AUTO_MATCHED]
    predicted = {(item.bank_transaction_id, item.journal_entry_id) for item in automatic}
    true_positives = predicted & scenario.exact_truth
    precision = Decimal(len(true_positives)) / Decimal(len(predicted))

    assert len(automatic) >= 20
    assert precision >= Decimal("0.95")
    assert len([item for item in first if item.status == MatchStatus.POTENTIAL_MATCH]) >= 5
    assert not [
        item
        for item in first
        if item.match_level.value in {"rule", "fuzzy"} and item.status == MatchStatus.AUTO_MATCHED
    ]
    assert first == second


def test_golden_financial_metrics_equal_manual_expected_values() -> None:
    scenario = build_demo_scenario()
    metrics, coverage = calculate_ledger_metrics(
        scenario.ledger_lines(),
        scenario.ledger_records[0].entry_date,
        scenario.ledger_records[-1].entry_date,
    )
    assert {
        MetricCode.REVENUE_IRR: metrics[MetricCode.REVENUE_IRR].value_irr,
        MetricCode.EXPENSES_IRR: metrics[MetricCode.EXPENSES_IRR].value_irr,
        MetricCode.NET_PROFIT_IRR: metrics[MetricCode.NET_PROFIT_IRR].value_irr,
        MetricCode.TOTAL_ASSETS_IRR: metrics[MetricCode.TOTAL_ASSETS_IRR].value_irr,
        MetricCode.TOTAL_LIABILITIES_IRR: metrics[MetricCode.TOTAL_LIABILITIES_IRR].value_irr,
        MetricCode.TOTAL_EQUITY_IRR: metrics[MetricCode.TOTAL_EQUITY_IRR].value_irr,
    } == {
        MetricCode.REVENUE_IRR: Decimal("327960000"),
        MetricCode.EXPENSES_IRR: Decimal(0),
        MetricCode.NET_PROFIT_IRR: Decimal("327960000"),
        MetricCode.TOTAL_ASSETS_IRR: Decimal("327960000"),
        MetricCode.TOTAL_LIABILITIES_IRR: Decimal(0),
        MetricCode.TOTAL_EQUITY_IRR: Decimal(0),
    }
    assert metrics[MetricCode.NET_MARGIN_RATIO].value_ratio == Decimal("1.000000")
    assert coverage["score"] == 100


def test_golden_scenario_covers_every_approved_finding_twice_and_is_stable() -> None:
    scenario = build_demo_scenario()
    reconciliation_candidates = reconciliation_findings(list(scenario.finding_signals))
    trend_candidates = []
    for previous_run_id in (UUID(int=8_001), UUID(int=8_002)):
        trend_candidates.extend(
            trend_findings(
                scenario.current_metrics,
                scenario.previous_metrics,
                previous_run_id,
                FindingConfig(),
            )
        )
    candidates = reconciliation_candidates + trend_candidates
    counts = Counter(item.finding_code for item in candidates)

    assert set(counts) == set(FindingCode)
    assert all(count >= 2 for count in counts.values())
    fingerprints = [
        item.fingerprint(UUID(int=9_001), "finding-rules-v1:demo") for item in candidates
    ]
    assert fingerprints == [
        item.fingerprint(UUID(int=9_001), "finding-rules-v1:demo") for item in candidates
    ]
    assert len(fingerprints) == len(set(fingerprints))


def test_demo_generator_produces_parseable_seed_and_signed_manifest(tmp_path) -> None:
    generated = generate_demo_files(tmp_path)
    assert {path.name for path in generated} == {
        "accounting_1405.xlsx",
        "bank_mellat_1405.xlsx",
        "bank_saman_1405.csv",
        "bank_tejarat_1405.csv",
        "sales_1405.xlsx",
        "invalid_accounting_1405.csv",
        "invalid_sales_1405.xlsx",
        "scenario-manifest.json",
    }
    for path in generated[:5]:
        with path.open("rb") as stream:
            parsed = parse_table(stream, path.suffix, limit=3)
        assert parsed.columns
        assert parsed.rows

    manifest = json.loads(generated[-1].read_text(encoding="utf-8"))
    digest = manifest.pop("scenario_sha256")
    canonical = json.dumps(
        manifest, sort_keys=True, ensure_ascii=False, separators=(",", ":")
    ).encode()
    assert digest == hashlib.sha256(canonical).hexdigest()
    assert manifest["synthetic"] is True
    assert manifest["expected"]["minimum_exact"] == 20
    assert manifest["expected"]["minimum_samples_per_finding"] == 2

    with generated[5].open("rb") as stream:
        invalid_accounting = parse_table(stream, ".csv")
    _, accounting_issues = transform_and_validate_row(
        source_kind=SourceKind.ACCOUNTING,
        row_number=2,
        raw=invalid_accounting.rows[0][1],
        mapping={
            "entry_id": "شماره سند",
            "entry_date": "تاریخ سند",
            "account_code": "کد حساب",
            "account_name": "نام حساب",
            "description": "شرح",
            "debit": "بدهکار",
            "credit": "بستانکار",
        },
        transforms={
            "entry_date": ["normalize_digits", "parse_date"],
            "debit": ["normalize_digits", "strip_thousands"],
            "credit": ["normalize_digits", "strip_thousands"],
        },
        currency_unit="rial",
        calendar="jalali",
    )
    assert any(issue.severity == IssueSeverity.ERROR for issue in accounting_issues)

    with generated[6].open("rb") as stream:
        invalid_sales = parse_table(stream, ".xlsx")
    _, sales_issues = transform_and_validate_row(
        source_kind=SourceKind.SALES,
        row_number=2,
        raw=invalid_sales.rows[0][1],
        mapping={
            "invoice_no": "شماره فاکتور",
            "issue_date": "تاریخ صدور",
            "due_date": "تاریخ سررسید",
            "customer_name": "نام مشتری",
            "gross_amount": "مبلغ کل",
        },
        transforms={
            "issue_date": ["normalize_digits", "parse_date"],
            "due_date": ["normalize_digits", "parse_date"],
            "gross_amount": ["normalize_digits", "strip_thousands"],
        },
        currency_unit="rial",
        calendar="jalali",
    )
    assert any(issue.code == "FORMULA_NOT_ALLOWED" for issue in sales_issues)


def test_log_redaction_removes_secrets_and_financial_payloads() -> None:
    structured = redact_log_value(
        {
            "company_id": "safe-id",
            "password": "very-secret",
            "payload": {"amount_irr": "2500000"},
            "nested": {"refresh_token": "token-value"},
        }
    )
    assert structured == {
        "company_id": "safe-id",
        "password": REDACTED,
        "payload": REDACTED,
        "nested": {"refresh_token": REDACTED},
    }
    record = logging.LogRecord(
        "demo",
        logging.ERROR,
        __file__,
        1,
        "authorization=Bearer abc.def password=hunter2 "
        "postgresql://didban:db-secret@postgres/didban",
        (),
        None,
    )
    assert SensitiveDataFilter().filter(record)
    message = record.getMessage()
    assert "abc.def" not in message
    assert "hunter2" not in message
    assert "db-secret" not in message
    assert message.count(REDACTED) >= 3
