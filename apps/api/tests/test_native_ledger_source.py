"""Native source projections retain frozen roles, amounts and exact journal selection."""

from datetime import date

import pytest
from test_native_reporting import accounts, post
from test_posting import book as book

from didban import models as m
from didban.errors import DomainError
from didban.native_ledger_source import statement_source
from didban.native_reporting_service import save_role, save_statement


def test_projection_never_uses_later_journals_or_roles_or_invents_a_reference(book):
    db = book
    user = db.get(m.User, "finance_manager")
    first = post(db, "100")
    debit, credit = accounts(db)
    save_role(db, "c", user, debit.id, "trade_receivable", 1)
    save_role(db, "c", user, credit.id, "revenue", 1)
    run = save_statement(db, "c", user, "p", date(2026, 11, 1))
    post(db, "200", date(2026, 11, 2))
    save_role(db, "c", user, credit.id, "equity", 2)
    source = statement_source(db, "c", run["id"])
    assert len(source["rows"]) == 2
    assert {line.journal_id for line in source["rows"]} == {first["id"]}
    assert next(line for line in source["rows"] if line.role == "revenue").credit == 100
    assert all(line.reference is None for line in source["rows"])
    assert source["native_statement_id"] == run["id"] and source["manifest_id"] is None
    assert {line.id for line in statement_source(db, "c", run["id"])["rows"]} == {
        line.id for line in source["rows"]
    }
    with pytest.raises(DomainError):
        statement_source(db, "other", run["id"])
