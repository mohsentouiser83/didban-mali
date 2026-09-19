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


def test_persian_pdf_with_treasury_and_alerts() -> None:
    payload = sample_payload()
    payload["early_warning_alerts"] = [
        {
            "code": "runway_critical",
            "category": "liquidity",
            "severity": "critical",
            "title_fa": "بحران نقدینگی: تاب‌آوری نقد کمتر از ۱۵ روز",
            "summary_fa": "موجودی نقد و بانک شرکت بر مبنای نرخ سوخت تنها ۱۲ روز کفایت می‌کند.",
            "metric_key": "runway_days",
            "current_value": "12",
            "threshold_value": "15",
            "metric_unit": "روز",
            "suggested_action_fa": "پیگیری فوری وصول مطالبات و توقف خریدهای سرمایه‌ای.",
        }
    ]
    payload["receivables_intelligence"] = {
        "as_of_date": "2026-09-30",
        "total_receivables_irr": "1500000000",
        "total_overdue_irr": "450000000",
        "overdue_ratio": 0.30,
        "dso_days": 42,
        "customer_count": 8,
        "high_risk_customer_count": 1,
        "buckets": [
            {
                "bucket_key": "not_due",
                "label_fa": "جاری",
                "amount_irr": "1050000000",
                "invoice_count": 10,
                "share_percentage": 70.0,
            },
            {
                "bucket_key": "1_30",
                "label_fa": "۱ تا ۳۰ روز",
                "amount_irr": "200000000",
                "invoice_count": 2,
                "share_percentage": 13.3,
            },
            {
                "bucket_key": "31_60",
                "label_fa": "۳۱ تا ۶۰ روز",
                "amount_irr": "100000000",
                "invoice_count": 1,
                "share_percentage": 6.7,
            },
            {
                "bucket_key": "61_90",
                "label_fa": "۶۱ تا ۹۰ روز",
                "amount_irr": "50000000",
                "invoice_count": 1,
                "share_percentage": 3.3,
            },
            {
                "bucket_key": "90_plus",
                "label_fa": "بیش از ۹۰ روز",
                "amount_irr": "100000000",
                "invoice_count": 1,
                "share_percentage": 6.7,
            },
        ],
    }
    payload["payables_intelligence"] = {
        "as_of_date": "2026-09-30",
        "total_payables_irr": "900000000",
        "total_overdue_irr": "180000000",
        "overdue_ratio": 0.20,
        "dpo_days": 35,
        "dso_days": 42,
        "ccc_days": 7,
        "vendor_count": 5,
        "high_risk_vendor_count": 0,
        "buckets": [
            {
                "bucket_key": "not_due",
                "label_fa": "جاری",
                "amount_irr": "720000000",
                "vendor_count": 4,
                "share_percentage": 80.0,
            },
            {
                "bucket_key": "1_30",
                "label_fa": "۱ تا ۳۰ روز",
                "amount_irr": "100000000",
                "vendor_count": 1,
                "share_percentage": 11.1,
            },
            {
                "bucket_key": "31_60",
                "label_fa": "۳۱ تا ۶۰ روز",
                "amount_irr": "50000000",
                "vendor_count": 1,
                "share_percentage": 5.6,
            },
            {
                "bucket_key": "61_90",
                "label_fa": "۶۱ تا ۹۰ روز",
                "amount_irr": "20000000",
                "vendor_count": 1,
                "share_percentage": 2.2,
            },
            {
                "bucket_key": "90_plus",
                "label_fa": "بیش از ۹۰ روز",
                "amount_irr": "10000000",
                "vendor_count": 1,
                "share_percentage": 1.1,
            },
        ],
    }
    payload["cashflow_runway"] = {
        "summary": {
            "as_of_date": "2026-09-30",
            "current_cash_irr": "350000000",
            "monthly_burn_rate_irr": "700000000",
            "runway_days": 15,
            "runway_months": 0.5,
            "runway_status": "critical",
            "safety_buffer_irr": "700000000",
            "first_deficit_week": 3,
            "lowest_projected_cash_irr": "-120000000",
        },
        "weeks": [
            {
                "week_number": i,
                "start_date": f"2026-10-{i * 2 + 1:02d}",
                "end_date": f"2026-10-{i * 2 + 7:02d}",
                "projected_inflows_irr": "150000000",
                "projected_outflows_irr": "180000000",
                "net_movement_irr": "-30000000",
                "projected_closing_cash_irr": str(350000000 - i * 30000000),
                "is_deficit": (350000000 - i * 30000000) < 0,
            }
            for i in range(1, 14)
        ],
    }

    content = render_report_pdf(payload)
    reader = PdfReader(BytesIO(content))

    assert len(reader.pages) >= 3
    assert len(content) > 10000
    assert b"IRANYekanX" in content
