"""Selected native intercompany eliminations never blend imported and primary books."""

from datetime import date

import pytest
from test_company_groups import workspace as workspace
from test_consolidation import setup

from didban.accounting_models import Draft
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.company_group_service import compare
from didban.consolidation_service import create_draft, sources
from didban.errors import DomainError
from didban.native_reporting_models import NativeStatementRun
from didban.operation_models import OperationDraft
from didban.posting_models import NativeJournal


def seed_native(db, user, company):
    left = company == "a"
    kinds = (
        [("revenue", "0", "100"), ("trade_receivable", "100", "0")]
        if left
        else [("expense", "100", "0"), ("trade_payable", "0", "100")]
    )
    db.add(CompanyAccountingSetup(company_id=company, mode="primary"))
    draft = Draft(
        id=company + "-draft",
        company_id=company,
        period_id=company + "p",
        date=date(2026, 1, 5),
        description="مصنوعی",
        original_unit="IRR",
        lines=[],
        actor_id=user.id,
        state="posted",
    )
    db.add(draft)
    db.flush()
    db.add(
        OperationDraft(
            company_id=company,
            draft_id=draft.id,
            kind="sale_service" if left else "purchase_service",
            source_reference="INV-1",
            payload={},
            actor_id=user.id,
        )
    )
    journal = NativeJournal(
        company_id=company,
        draft_id=draft.id,
        draft_version=1,
        period_id=company + "p",
        date=date(2026, 1, 5),
        sequence=1,
        digest="native-journal",
        snapshot={
            "lines": [
                {
                    "account_id": company + role,
                    "code": role,
                    "party_id": "B-PARTY" if left else "A-PARTY",
                    "debit": debit,
                    "credit": credit,
                }
                for role, debit, credit in kinds
            ]
        },
        actor_id=user.id,
        permission_provenance={},
    )
    db.add(journal)
    db.flush()
    amounts = {
        "revenue": "100" if left else "0",
        "expense": "0" if left else "100",
        "trade_receivable_balance": "100" if left else "0",
        "trade_payable_balance": "0" if left else "100",
        "profit_before_tax": "100" if left else "-100",
    }
    statement = NativeStatementRun(
        company_id=company,
        actor_id=user.id,
        digest="fixed-" + company,
        snapshot={
            "basis": "native_book",
            "period_id": company + "p",
            "period": {"start": "2026-01-01", "end": "2026-01-31"},
            "as_of": "2026-01-31",
            "journal_ids": [journal.id],
            "profit_journal_ids": [journal.id],
            "movement_journal_ids": [journal.id],
            "role_assignments": [{"account_id": company + role, "role": role} for role, _, _ in kinds],
            "opening_evidence": {"status": "available"},
            "metrics": [
                {"metric_key": key, "value": value, "status": "available", "unit": "IRR"}
                for key, value in amounts.items()
            ],
        },
    )
    db.add(statement)
    db.flush()
    return statement


def test_native_selected_service_and_balance_eliminations_pin_native_sources(workspace):
    db, user = workspace
    group, _, mapping = setup(db, user)
    a = seed_native(db, user, "a")
    b = seed_native(db, user, "b")
    comparison = compare(db, "a", user, group["id"], "ap", 1)
    available = sources(db, "a", user, comparison["id"])
    assert len(available["rows"]) == 4 and not available["unavailable"]
    pairs = []
    for kind, roles in [
        ("services", ("revenue", "operating_expense")),
        ("trade_balance", ("trade_receivable", "trade_payable")),
    ]:
        ids = [
            next(
                row["id"] for row in available["rows"] if row["company_id"] == company and row["role"] == role
            )
            for company, role in zip(("a", "b"), roles, strict=True)
        ]
        pairs.append(
            {
                "mapping_id": mapping["id"],
                "left_line_id": ids[0],
                "right_line_id": ids[1],
                "kind": kind,
                "review_reason": "بررسی صریح دو سند",
            }
        )
    result = create_draft(db, "a", user, {"comparison_id": comparison["id"], "pairs": pairs})
    snapshot = result["snapshot"]
    assert snapshot["source_basis"] == "native_statement"
    assert snapshot["native_statements"] == {"a": a.id, "b": b.id}
    assert snapshot["manifests"] == {"a": None, "b": None}
    assert next(metric for metric in snapshot["metrics"] if metric["metric_key"] == "revenue")["after"] == "0"
    assert (
        next(metric for metric in snapshot["metrics"] if metric["metric_key"] == "ar_ledger")["after"] == "0"
    )
    assert (
        next(metric for metric in snapshot["metrics"] if metric["metric_key"] == "pre_tax_profit")["after"]
        == "0"
    )
    assert (
        next(metric for metric in snapshot["metrics"] if metric["metric_key"] == "net_profit")["after"]
        is None
    )


def test_mixed_book_sources_never_become_a_consolidated_total(workspace):
    db, user = workspace
    group, _, _ = setup(db, user)
    seed_native(db, user, "a")
    comparison = compare(db, "a", user, group["id"], "ap", 1)
    with pytest.raises(DomainError) as error:
        create_draft(db, "a", user, {"comparison_id": comparison["id"], "pairs": []})
    assert error.value.code == "mixed_book_basis"
