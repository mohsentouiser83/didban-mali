from datetime import UTC, date, datetime
from decimal import Decimal
from types import SimpleNamespace
from uuid import UUID

import pytest

from app.companies.models import CompanyRole
from app.findings import routes


@pytest.mark.asyncio
async def test_case_detail_includes_priority_evidence_and_workflow(monkeypatch):
    now = datetime.now(UTC)
    finding = SimpleNamespace(
        id=UUID(int=1), fingerprint="case", rule_code="PROFIT_DROP_THRESHOLD",
        category="financial_analysis", severity="high", status="open",
        title_fa="کاهش سود", summary_fa="بررسی تغییر سود", financial_impact_irr=Decimal("1500000"),
        analysis_run_id=UUID(int=2), generation_run_id=UUID(int=3),
        finding_code="profit_drop", kind="risk", assertion_status="deterministic",
        priority_band="high", priority_score=Decimal("75.50"),
        priority_explanation_json={"factors": {"impact": {"score": "80"}}},
        priority_model_version="priority-v1", priority_config_json={"bands": {"high": "70"}},
        confidence_score=Decimal("100"), confidence_basis_json={"source": "calculation"},
        affected_amount_irr=Decimal("1500000"), affected_ratio=Decimal("0.12"),
        reason_code="threshold", reason_parameters_json={}, calculation_json={"change": "0.12"},
        rule_version="rules-v1", workflow_status="needs_review", due_date=None,
        assigned_to_user_id=None, source_entity_type=None, source_entity_id=None,
        reconciliation_match_id=None, calculation_run_id=None, resolution_type=None,
        resolution_note=None, resolved_by_user_id=None, resolved_at=None,
        verified_by_user_id=None, verified_at=None, verification_note=None,
        is_suppressed=False, period_start=date(2026, 9, 1), period_end=date(2026, 9, 30),
        created_at=now, updated_at=now,
    )

    async def detail(*args, **kwargs):
        return {"finding": finding, "assigned_to_name": None, "resolved_by_name": None,
                "verified_by_name": None, "evidence": [], "activities": []}

    monkeypatch.setattr(routes, "get_finding_detail", detail)
    response = await routes.get_finding(UUID(int=4), finding.id, None, SimpleNamespace(role=CompanyRole.OWNER))
    result = response.model_dump(mode="json")
    assert result["priority_explanation"]["factors"]["impact"]["score"] == "80"
    assert result["priority_score"] == "75.50"
    assert result["affected_amount_irr"] == "1500000"
    assert result["confidence_score"] == "100"
    assert result["workflow_status"] == "needs_review"
    assert result["priority_config"]["bands"]["high"] == "70"
