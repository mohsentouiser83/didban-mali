import re
from collections.abc import Iterable
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from pydantic import ValidationError

from app.ai.schemas import FindingExplanationOutput, SemanticMatchingOutput

_DIGIT_TRANSLATION = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
_NUMBER_RE = re.compile(r"(?<![\w-])[-+]?\d[\d۰-۹٠-٩,٬]*(?:[.٫]\d+)?%?")


class AiOutputViolation(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def canonical_number(value: Any) -> str:
    raw = str(value).translate(_DIGIT_TRANSLATION).replace(",", "").replace("٬", "")
    raw = raw.replace("٫", ".").strip()
    percent = raw.endswith("%")
    if percent:
        raw = raw[:-1]
    try:
        number = Decimal(raw)
    except InvalidOperation as exc:
        raise AiOutputViolation("INVALID_NUMBER", "عدد خروجی قابل اعتبارسنجی نیست.") from exc
    normalized = format(number.normalize(), "f")
    if "." in normalized:
        normalized = normalized.rstrip("0").rstrip(".")
    if normalized in {"-0", "+0", ""}:
        normalized = "0"
    return f"{normalized}%" if percent else normalized


def collect_allowed_numbers(*values: Any) -> set[str]:
    result: set[str] = set()

    def visit(value: Any) -> None:
        if isinstance(value, bool) or value is None:
            return
        if isinstance(value, int | float | Decimal):
            result.add(canonical_number(value))
        elif isinstance(value, str):
            normalized = value.translate(_DIGIT_TRANSLATION).strip()
            if _NUMBER_RE.fullmatch(normalized):
                result.add(canonical_number(normalized))
        elif isinstance(value, dict):
            for nested in value.values():
                visit(nested)
        elif isinstance(value, list | tuple):
            for nested in value:
                visit(nested)

    for item in values:
        visit(item)
    return result


def _numbers_in_text(values: Iterable[str]) -> set[str]:
    found: set[str] = set()
    for value in values:
        latin = value.translate(_DIGIT_TRANSLATION)
        found.update(canonical_number(match.group(0)) for match in _NUMBER_RE.finditer(latin))
    return found


def _validate_numbers(prose: Iterable[str], referenced: Iterable[str], allowed: set[str]) -> None:
    try:
        cited = {canonical_number(value) for value in referenced}
    except AiOutputViolation:
        raise
    if not cited.issubset(allowed) or not _numbers_in_text(prose).issubset(allowed):
        raise AiOutputViolation(
            "UNSUPPORTED_NUMBER", "خروجی هوش مصنوعی شامل عددی خارج از داده‌های تأییدشده است."
        )


def validate_explanation_output(
    raw: Any, *, allowed_evidence_ids: set[UUID], allowed_numbers: set[str]
) -> FindingExplanationOutput:
    try:
        output = FindingExplanationOutput.model_validate(raw)
    except ValidationError as exc:
        raise AiOutputViolation("SCHEMA_INVALID", "ساختار توضیح هوش مصنوعی معتبر نیست.") from exc
    if not set(output.referenced_evidence_ids).issubset(allowed_evidence_ids):
        raise AiOutputViolation("UNKNOWN_EVIDENCE", "خروجی به مدرک ناشناخته ارجاع داده است.")
    _validate_numbers(
        [output.summary_fa, output.why_it_matters_fa, *output.caveats_fa],
        output.referenced_numbers,
        allowed_numbers,
    )
    return output


def validate_semantic_output(
    raw: Any, *, candidate_ids: set[UUID], allowed_numbers: set[str]
) -> SemanticMatchingOutput:
    try:
        output = SemanticMatchingOutput.model_validate(raw)
    except ValidationError as exc:
        raise AiOutputViolation("SCHEMA_INVALID", "ساختار رتبه‌بندی هوش مصنوعی معتبر نیست.") from exc
    returned = [item.candidate_id for item in output.ranked_candidates]
    if len(returned) != len(set(returned)) or set(returned) != candidate_ids:
        raise AiOutputViolation(
            "CANDIDATE_SET_CHANGED", "هوش مصنوعی مجموعه نامزدها را تغییر داده است."
        )
    for item in output.ranked_candidates:
        if canonical_number(item.confidence) not in allowed_numbers:
            raise AiOutputViolation(
                "UNSUPPORTED_NUMBER",
                "امتیاز اطمینان باید از اعداد تأییدشده ورودی باشد.",
            )
        _validate_numbers([item.reason_fa], item.referenced_numbers, allowed_numbers)
    return output
