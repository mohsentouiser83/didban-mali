from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from app import main  # noqa: F401 — load model registry
from app.findings.schemas import FindingResponse
from app.findings.service import get_control_overview, list_findings


async def test_findings_pagination_and_priority_order():
    session = AsyncMock()
    session.execute.return_value = SimpleNamespace(one=lambda: SimpleNamespace(all=90, suggested=10, matched=0, missing_accounting=60, missing_bank=20))
    rows = MagicMock()
    rows.all.return_value = []
    session.scalars.return_value = rows
    company_id = uuid4()
    items, count, counts = await list_findings(session, company_id=company_id, limit=25, offset=50)
    assert items == []
    assert count == 90
    assert counts == {"all": 90, "matched": 0, "suggested": 10, "missing_accounting": 60, "missing_bank": 20}
    query = session.scalars.call_args.args[0]
    assert query.compile().params["param_1"] == 25
    assert query.compile().params["param_2"] == 50
    assert company_id in query.compile().params.values()
    assert "findings.id DESC" in str(query).split("ORDER BY")[1]


async def test_review_counts_include_all_statuses_and_group_open_work():
    session = AsyncMock()
    session.scalar.return_value = None
    session.execute.side_effect = [
        SimpleNamespace(all=lambda: [("high", 4)]),
        SimpleNamespace(all=lambda: [("new", 3), ("triaged", 2), ("in_progress", 4), ("reopened", 1), ("resolved", 2), ("verified", 3), ("dismissed", 1)]),
        SimpleNamespace(all=lambda: []),
        SimpleNamespace(one=lambda: SimpleNamespace(all=16, suggested=3, matched=0, missing_accounting=4, missing_bank=2)),
    ]
    overview = await get_control_overview(session, company_id=uuid4())
    assert overview["total_count"] == 16
    assert overview["review_count"] == 5
    assert overview["follow_up_count"] == 5
    assert overview["resolved_count"] + overview["verified_count"] == 5
    assert {"status", "assigned_to_name", "due_date"} <= FindingResponse.model_fields.keys()


async def test_reconciliation_filter_counts_share_search_and_status_but_ignore_page_and_direction():
    session = AsyncMock()
    session.execute.return_value = SimpleNamespace(one=lambda: SimpleNamespace(all=90, suggested=10, matched=0, missing_accounting=60, missing_bank=20))
    session.scalars.return_value = SimpleNamespace(all=lambda: [])
    company_id = uuid4()
    _, total, counts = await list_findings(
        session, company_id=company_id, search="مرجع", status_filter="new",
        reconciliation_filter="missing_bank", limit=10, offset=20,
    )
    assert total == 20
    assert counts["missing_accounting"] == 60
    count_query = session.execute.call_args.args[0]
    assert count_query._limit_clause is None and count_query._offset_clause is None
    count_params = count_query.compile().params
    assert company_id in count_params.values()
    assert "%مرجع%" in count_params.values()
    assert "new" in count_params.values()
    query = session.scalars.call_args.args[0]
    direction_clause = list(query.whereclause.get_children())[-1]
    assert len(list(query.whereclause.get_children())) == len(list(count_query.whereclause.get_children())) + 1
    direction_values = direction_clause.compile().params.values()
    assert "journal_line" in direction_values
    assert "unmatched_accounting_entry" in direction_values
    assert "large_unreconciled_transaction" in direction_values
    assert "no_candidate" in direction_values
    assert "POTENTIAL_MATCH" in str(direction_clause.compile(compile_kwargs={"literal_binds": True}))
