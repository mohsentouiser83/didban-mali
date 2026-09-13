from io import BytesIO

import pytest
from pydantic import ValidationError
from pypdf import PdfReader

from app.reports.render import render_report_pdf
from app.reports.schemas import ReportCreateRequest


def sample_payload() -> dict[str, object]:
    metric = {
        "metric_code": "revenue_irr",
        "label_fa": "درآمد",
        "available": True,
        "unit": "IRR",
        "value": "2500000",
        "previous_value": None,
        "change_value": None,
        "change_ratio": None,
        "trend": "unavailable",
        "calculation": {},
        "unavailable_reason_fa": None,
    }
    finding = {
        "id": "01995a9f-1000-7000-8000-000000000001",
        "finding_code": "missing_transaction",
        "title_fa": "تراکنش بانکی بدون ثبت متناظر",
        "summary_fa": "برای این تراکنش بانکی ثبت متناظر قطعی پیدا نشد.",
        "priority_band": "high",
        "priority_score": "70.0000",
        "priority_reasons": {},
        "confidence_score": "0.9000",
        "affected_amount_irr": "1500001",
        "affected_ratio": "0.6000",
        "workflow_status": "follow_up",
    }
    return {
        "schema_version": "report-snapshot-v1",
        "generated_at": "2026-09-13T10:00:00+00:00",
        "title_fa": "گزارش بررسی مالی",
        "company": {
            "id": "01995a9f-1000-7000-8000-000000000002",
            "legal_name": "شرکت راهکار گستر آریانا",
            "currency": "IRR",
        },
        "analysis": {
            "id": "01995a9f-1000-7000-8000-000000000003",
            "period_start": "2026-09-01",
            "period_end": "2026-09-30",
            "status": "completed_limited",
            "rule_set_version": "financial-v1",
            "completed_at": "2026-09-13T09:00:00+00:00",
        },
        "overall_status": {
            "overall_state": "attention",
            "financial_state": "attention",
            "data_quality": "limited",
            "highest_open_priority": "high",
            "summary_fa": "یک یافته با اولویت بالا نیازمند توجه است.",
            "reasons_fa": ["پوشش تحلیل مالی محدود است"],
        },
        "financial_overview": [metric] * 12,
        "top_findings": [finding],
        "main_drivers": [],
        "data_coverage": {
            "overall_score": 50,
            "scoring_method": "simple_average_of_section_scores_v1",
            "sections": {},
            "limitations_fa": ["داده فروش وجود ندارد"],
            "finding_generation_status": "completed_limited",
            "finding_generation_coverage": {},
        },
        "advisor_note": {"body": "پیگیری با واحد حسابداری ادامه دارد.", "actor_id": "user"},
        "advisor_notes": [],
        "review_status": {
            "total": 1,
            "by_priority": {"critical": 0, "high": 1, "medium": 0, "low": 0},
            "by_workflow": {
                "needs_review": 0,
                "confirmed": 0,
                "dismissed": 0,
                "follow_up": 1,
                "resolved": 0,
            },
            "top_limit": 5,
            "all_findings_path": "/findings",
        },
        "all_findings": [
            {
                **finding,
                "is_top_finding": True,
                "latest_decision": None,
                "notes": [],
            }
        ],
    }


def test_report_request_requires_one_complete_selector() -> None:
    with pytest.raises(ValidationError):
        ReportCreateRequest(period_start="2026-09-01")
    with pytest.raises(ValidationError):
        ReportCreateRequest(
            analysis_run_id="01995a9f-1000-7000-8000-000000000003",
            period_start="2026-09-01",
            period_end="2026-09-30",
        )


def test_persian_pdf_is_a4_multipage_and_embeds_font() -> None:
    content = render_report_pdf(sample_payload())
    reader = PdfReader(BytesIO(content))

    assert len(reader.pages) >= 2
    assert round(float(reader.pages[0].mediabox.width)) == 595
    assert round(float(reader.pages[0].mediabox.height)) == 842
    assert reader.metadata is not None
    assert reader.metadata.title == "گزارش بررسی مالی"
    assert b"IRANYekanX" in content
