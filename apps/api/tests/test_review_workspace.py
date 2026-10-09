from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from app import main  # noqa: F401 — load model registry
from app.findings.schemas import FindingResponse
from app.findings.service import get_control_overview, list_findings


async def test_findings_pagination_and_priority_order():
    session = AsyncMock()
    session.scalar.return_value = 90
    rows = MagicMock()
    rows.all.return_value = []
    session.scalars.return_value = rows
    company_id = uuid4()
    items, count = await list_findings(session, company_id=company_id, limit=25, offset=50)
    assert items == []
    assert count == 90
    query = session.scalars.call_args.args[0]
    assert query.compile().params["param_1"] == 25
    assert query.compile().params["param_2"] == 50
    assert company_id in query.compile().params.values()
    assert "DESC" in str(query).split("ORDER BY")[1]


async def test_review_counts_include_all_statuses_and_group_open_work():
    session = AsyncMock()
    session.scalar.return_value = None
    session.execute.side_effect = [
        SimpleNamespace(all=lambda: [("high", 4)]),
        SimpleNamespace(all=lambda: [("new", 3), ("triaged", 2), ("in_progress", 4), ("reopened", 1), ("resolved", 2), ("verified", 3), ("dismissed", 1)]),
        SimpleNamespace(all=lambda: []),
    ]
    overview = await get_control_overview(session, company_id=uuid4())
    assert overview["total_count"] == 16
    assert overview["review_count"] == 5
    assert overview["follow_up_count"] == 5
    assert overview["resolved_count"] + overview["verified_count"] == 5
    assert {"status", "assigned_to_name", "due_date"} <= FindingResponse.model_fields.keys()
