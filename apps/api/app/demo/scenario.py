import hashlib
import json
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.analysis.calculations import LedgerLine
from app.analysis.models import MetricCode
from app.financial.models import AccountClass
from app.findings.engine import ReconciliationSignal
from app.reconciliation.engine import BankRecord, LedgerRecord
from app.reconciliation.models import MatchStatus

SCENARIO_VERSION = "demo-1405-v1"
COMPANY_NAME = "شرکت راهکار گستر آریانا (کاملاً ساختگی)"
COUNTERPARTIES = (
    "فناوری سپهر پارس (ساختگی)",
    "بازرگانی هیراد شرق (ساختگی)",
    "توسعه سازه البرز (ساختگی)",
    "داده‌پردازان نقش جهان (ساختگی)",
)


def _uid(value: int) -> UUID:
    return UUID(int=value)


@dataclass(frozen=True)
class DemoScenario:
    bank_records: tuple[BankRecord, ...]
    ledger_records: tuple[LedgerRecord, ...]
    exact_truth: frozenset[tuple[UUID, UUID]]
    finding_signals: tuple[ReconciliationSignal, ...]
    current_metrics: dict[MetricCode, Decimal]
    previous_metrics: dict[MetricCode, Decimal]

    def ledger_lines(self) -> list[LedgerLine]:
        lines: list[LedgerLine] = []
        for item in self.ledger_records:
            lines.extend(
                [
                    LedgerLine(item.entry_date, item.amount_irr, Decimal(0), AccountClass.ASSET),
                    LedgerLine(item.entry_date, Decimal(0), item.amount_irr, AccountClass.REVENUE),
                ]
            )
        return lines

    def manifest(self) -> dict[str, Any]:
        core: dict[str, Any] = {
            "schema_version": "scenario-manifest-v1",
            "scenario_version": SCENARIO_VERSION,
            "synthetic": True,
            "company": COMPANY_NAME,
            "period": {"from": "1405/01/01", "to": "1405/06/31"},
            "bank_accounts": ["ملت-ساختگی", "سامان-ساختگی", "تجارت-ساختگی"],
            "files": [
                "accounting_1405.xlsx",
                "bank_mellat_1405.xlsx",
                "bank_saman_1405.csv",
                "bank_tejarat_1405.csv",
                "sales_1405.xlsx",
                "invalid_accounting_1405.csv",
                "invalid_sales_1405.xlsx",
            ],
            "expected": {
                "minimum_exact": 20,
                "exact_truth_count": len(self.exact_truth),
                "minimum_fuzzy_candidates": 5,
                "auto_exact_precision_minimum": "0.95",
                "approved_finding_codes": 8,
                "minimum_samples_per_finding": 2,
                "ai_may_auto_confirm": False,
                "ledger_metrics_irr": {
                    "revenue_irr": "327960000",
                    "expenses_irr": "0",
                    "net_profit_irr": "327960000",
                    "total_assets_irr": "327960000",
                    "total_liabilities_irr": "0",
                    "total_equity_irr": "0",
                    "net_margin_ratio": "1.000000",
                },
            },
        }
        digest = hashlib.sha256(
            json.dumps(core, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()
        ).hexdigest()
        return {**core, "scenario_sha256": digest}


def build_demo_scenario() -> DemoScenario:
    banks: list[BankRecord] = []
    ledgers: list[LedgerRecord] = []
    exact_truth: set[tuple[UUID, UUID]] = set()
    start = date(2026, 3, 22)

    for index in range(20):
        day = start + timedelta(days=index * 7)
        amount = Decimal(10_000_000 + index * 137_000)
        bank_id, entry_id = _uid(100 + index), _uid(1_100 + index)
        description = f"وصول فاکتور ساختگی {1405001 + index}"
        banks.append(
            BankRecord(
                id=bank_id,
                source_row_id=_uid(10_100 + index),
                booking_date=day,
                amount_irr=amount,
                description=description,
                reference=f"REF-SYN-{index:03d}",
                source_transaction_id=f"TX-SYN-{index:03d}",
            )
        )
        ledgers.append(
            LedgerRecord(
                entry_id=entry_id,
                source_row_id=_uid(11_100 + index),
                line_id=_uid(12_100 + index),
                entry_date=day,
                amount_irr=amount,
                description=description,
                reference=f"REF-SYN-{index:03d}",
                source_entry_id=f"JV-SYN-{index:03d}",
            )
        )
        exact_truth.add((bank_id, entry_id))

    for index in range(5):
        day = start + timedelta(days=150 + index * 3)
        amount = Decimal(20_000_000 + index * 193_000)
        banks.append(
            BankRecord(
                id=_uid(200 + index),
                source_row_id=_uid(10_200 + index),
                booking_date=day,
                amount_irr=amount,
                description=f"وصول فناوری سپهر فاکتور {200 + index}",
                source_transaction_id=f"TX-FUZZY-{index:03d}",
            )
        )
        ledgers.append(
            LedgerRecord(
                entry_id=_uid(1_200 + index),
                source_row_id=_uid(11_200 + index),
                line_id=_uid(12_200 + index),
                entry_date=day - timedelta(days=1),
                amount_irr=amount,
                description=f"دریافت فناوری سپهر بابت فاکتور {200 + index}",
                source_entry_id=f"JV-FUZZY-{index:03d}",
            )
        )

    signals: list[ReconciliationSignal] = []
    statuses = (
        MatchStatus.UNRESOLVED,
        MatchStatus.DUPLICATE_HIGH,
        MatchStatus.AMOUNT_MISMATCH,
        MatchStatus.DATE_MISMATCH,
    )
    for group, match_status in enumerate(statuses):
        for sample in range(2):
            value = 500 + group * 10 + sample
            signals.append(
                ReconciliationSignal(
                    id=_uid(value),
                    bank_transaction_id=_uid(2_000 + value),
                    journal_entry_id=(
                        None if match_status == MatchStatus.UNRESOLVED else _uid(3_000 + value)
                    ),
                    status=match_status,
                    score=Decimal("85"),
                    amount_difference_irr=(
                        Decimal("2500000")
                        if match_status == MatchStatus.AMOUNT_MISMATCH
                        else Decimal("0")
                    ),
                    date_difference_days=(7 if match_status == MatchStatus.DATE_MISMATCH else 0),
                    rule_code=f"GOLDEN_{match_status.value.upper()}",
                    reference_amount_irr=Decimal("5000000"),
                )
            )

    return DemoScenario(
        bank_records=tuple(banks),
        ledger_records=tuple(ledgers),
        exact_truth=frozenset(exact_truth),
        finding_signals=tuple(signals),
        current_metrics={
            MetricCode.REVENUE_IRR: Decimal("800000000"),
            MetricCode.NET_PROFIT_IRR: Decimal("120000000"),
            MetricCode.EXPENSES_IRR: Decimal("440000000"),
            MetricCode.SALES_OUTSTANDING_IRR: Decimal("310000000"),
        },
        previous_metrics={
            MetricCode.REVENUE_IRR: Decimal("1000000000"),
            MetricCode.NET_PROFIT_IRR: Decimal("250000000"),
            MetricCode.EXPENSES_IRR: Decimal("300000000"),
            MetricCode.SALES_OUTSTANDING_IRR: Decimal("180000000"),
        },
    )
