"""Native allocations pin immutable journal lines and never consume imported rows."""

import io
from datetime import date

import pytest
from openpyxl import load_workbook
from test_native_reporting import accounts, post
from test_posting import book as book

from didban import models as m
from didban.dimensions_service import assign, export_report, report, save_dimension, save_report
from didban.errors import DomainError
from didban.native_reporting_service import save_role, save_statement


def test_native_allocation_exact_frozen_roles_reclassification_and_export(book):
    db = book
    user = db.get(m.User, "finance_manager")
    post(db, "100")
    debit, credit = accounts(db)
    save_role(db, "c", user, debit.id, "trade_receivable", 1)
    save_role(db, "c", user, credit.id, "revenue", 1)
    statement = save_statement(db, "c", user, "p", date(2026, 11, 1))
    first = report(db, "c", None, "project", statement["id"])
    assert first["unassigned"]["revenue"] == "100" and first["manifest_id"] is None
    dimension = save_dimension(
        db, "c", user, {"kind": "project", "code": "P1", "name": "پروژه", "active": True}
    )
    data = {
        "native_statement_id": statement["id"],
        "line_id": first["lines"][0]["id"],
        "kind": "project",
        "method": "direct",
        "shares": [{"dimension_id": dimension["id"], "percent": "100"}],
        "review_reason": "انتساب صریح",
    }
    allocation = assign(db, "c", user, data, 1)
    assert allocation["shares"][0]["amount"] == "100" and allocation["journal_id"]
    fixed = save_report(db, "c", user, {"native_statement_id": statement["id"], "kind": "project"})
    assert fixed["snapshot"]["buckets"][0]["profit"] == "100"
    save_role(db, "c", user, credit.id, "expense", 2)
    changed = save_statement(db, "c", user, "p", date(2026, 11, 1))
    current = report(db, "c", None, "project", changed["id"])
    assert current["lines"][0]["allocation"] is None
    assert current["lines"][0]["allocation_version"] == 1
    assert current["unassigned"]["expense"] == "-100"
    # Re-approval after explicit reclassification stores a new version with its changed sign.
    second = assign(db, "c", user, data | {"native_statement_id": changed["id"]}, 1)
    assert second["version"] == 2 and second["shares"][0]["amount"] == "-100"
    assert fixed["snapshot"]["buckets"][0]["profit"] == "100"
    assert export_report(db, "c", user, fixed["id"], "pdf").startswith(b"%PDF")
    workbook = load_workbook(io.BytesIO(export_report(db, "c", user, fixed["id"], "xlsx")))
    assert any(cell.value == "100" for sheet in workbook for row in sheet for cell in row)
    with pytest.raises(DomainError):
        report(db, "other", None, "project", statement["id"])
    with pytest.raises(DomainError):
        assign(db, "c", user, data | {"line_id": "foreign"}, 1)
