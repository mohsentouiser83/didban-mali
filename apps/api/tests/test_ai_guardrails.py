import asyncio
from decimal import Decimal
from uuid import uuid4

import pytest

from app.ai.guardrails import (
    AiOutputViolation,
    canonical_number,
    collect_allowed_numbers,
    validate_explanation_output,
    validate_semantic_output,
)
from app.ai.providers import AiProviderError, call_with_timeout


def test_numbers_are_normalized_without_losing_financial_precision() -> None:
    assert canonical_number("۱۲٬۵۰۰٫۰۰") == "12500"
    assert canonical_number(Decimal("0.8200")) == "0.82"
    assert collect_allowed_numbers(
        {"amount": Decimal("12500"), "count": 2, "ratio": "۰٫۸۲", "date": "1405/06/22"}
    ) == {
        "12500",
        "2",
        "0.82",
    }


def test_explanation_accepts_only_known_evidence_and_numbers() -> None:
    evidence_id = uuid4()
    output = validate_explanation_output(
        {
            "summary_fa": "مبلغ ۱۲٬۵۰۰ ریال نیازمند بررسی است.",
            "why_it_matters_fa": "این مورد ممکن است بر مانده اثر بگذارد.",
            "caveats_fa": ["این توضیح تصمیم مالی نیست."],
            "referenced_evidence_ids": [str(evidence_id)],
            "referenced_numbers": ["12500"],
            "requires_human_review": True,
        },
        allowed_evidence_ids={evidence_id},
        allowed_numbers={"12500"},
    )
    assert output.referenced_evidence_ids == [evidence_id]


@pytest.mark.parametrize(
    ("field", "value", "code"),
    [
        ("summary_fa", "مبلغ ۹۹۹ ریال قطعی است.", "UNSUPPORTED_NUMBER"),
        ("referenced_evidence_ids", lambda: [str(uuid4())], "UNKNOWN_EVIDENCE"),
    ],
)
def test_explanation_rejects_invented_claims(field: str, value: str | object, code: str) -> None:
    evidence_id = uuid4()
    payload: dict[str, object] = {
        "summary_fa": "مبلغ 100 ریال نیازمند بررسی است.",
        "why_it_matters_fa": "اثر احتمالی باید توسط انسان بررسی شود.",
        "caveats_fa": [],
        "referenced_evidence_ids": [str(evidence_id)],
        "referenced_numbers": ["100"],
        "requires_human_review": True,
    }
    payload[field] = value() if callable(value) else value
    with pytest.raises(AiOutputViolation) as captured:
        validate_explanation_output(
            payload, allowed_evidence_ids={evidence_id}, allowed_numbers={"100"}
        )
    assert captured.value.code == code


def test_explanation_rejects_extra_schema_fields_and_human_review_false() -> None:
    with pytest.raises(AiOutputViolation) as captured:
        validate_explanation_output(
            {
                "summary_fa": "نیازمند بررسی است.",
                "why_it_matters_fa": "اثر احتمالی دارد.",
                "caveats_fa": [],
                "referenced_evidence_ids": [],
                "referenced_numbers": [],
                "requires_human_review": False,
                "hidden_reasoning": "not allowed",
            },
            allowed_evidence_ids=set(),
            allowed_numbers=set(),
        )
    assert captured.value.code == "SCHEMA_INVALID"


def test_semantic_ranking_cannot_add_remove_or_rewrite_candidates() -> None:
    first, second = uuid4(), uuid4()
    output = validate_semantic_output(
        {
            "ranked_candidates": [
                {
                    "candidate_id": str(second),
                    "confidence": "0.82",
                    "reason_fa": "شباهت ثبت‌شده 82% است.",
                    "referenced_numbers": ["82%"],
                },
                {
                    "candidate_id": str(first),
                    "confidence": "0.60",
                    "reason_fa": "شباهت ثبت‌شده 60% است.",
                    "referenced_numbers": ["60%"],
                },
            ],
            "requires_human_review": True,
        },
        candidate_ids={first, second},
        allowed_numbers={"0.82", "0.6", "82%", "60%"},
    )
    assert {item.candidate_id for item in output.ranked_candidates} == {first, second}

    with pytest.raises(AiOutputViolation) as captured:
        validate_semantic_output(
            {
                "ranked_candidates": [
                    {
                        "candidate_id": str(first),
                        "confidence": "0.82",
                        "reason_fa": "نامزد اول است.",
                        "referenced_numbers": [],
                    }
                ],
                "requires_human_review": True,
            },
            candidate_ids={first, second},
            allowed_numbers={"0.82"},
        )
    assert captured.value.code == "CANDIDATE_SET_CHANGED"


class _SlowProvider:
    async def generate_json(self, *, purpose: str, payload: dict[str, object]) -> object:
        del purpose, payload
        await asyncio.sleep(0.05)
        return {}


async def test_provider_timeout_becomes_safe_failure() -> None:
    with pytest.raises(AiProviderError, match="timed out"):
        await call_with_timeout(
            _SlowProvider(),
            purpose="finding_explanation",
            payload={},
            timeout_seconds=0.001,
            validator=lambda value: value,
        )
