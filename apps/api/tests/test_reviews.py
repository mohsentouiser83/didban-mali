import pytest
from pydantic import ValidationError

from app.findings.models import FindingWorkflowStatus
from app.reviews.models import ReviewDecisionType
from app.reviews.routes import validate_transition
from app.reviews.schemas import FindingNoteRequest, ReviewDecisionRequest


@pytest.mark.parametrize(
    ("current", "decision", "expected"),
    [
        ("needs_review", "confirmed", "confirmed"),
        ("needs_review", "dismissed", "dismissed"),
        ("needs_review", "follow_up", "follow_up"),
        ("follow_up", "resolved", "resolved"),
        ("resolved", "follow_up", "follow_up"),
        ("dismissed", "confirmed", "confirmed"),
    ],
)
def test_review_state_machine_allows_auditable_transitions(
    current: str, decision: str, expected: str
) -> None:
    result = validate_transition(FindingWorkflowStatus(current), ReviewDecisionType(decision))
    assert result == FindingWorkflowStatus(expected)


@pytest.mark.parametrize(
    ("current", "decision"),
    [
        ("needs_review", "resolved"),
        ("confirmed", "confirmed"),
        ("dismissed", "dismissed"),
        ("resolved", "resolved"),
        ("resolved", "confirmed"),
    ],
)
def test_review_state_machine_rejects_invalid_or_duplicate_transitions(
    current: str, decision: str
) -> None:
    with pytest.raises(ValueError):
        validate_transition(FindingWorkflowStatus(current), ReviewDecisionType(decision))


def test_review_payloads_trim_text_and_reject_blank_content() -> None:
    decision = ReviewDecisionRequest(decision="confirmed", note="  بررسی شد  ")
    note = FindingNoteRequest(body="  پیگیری با حسابداری  ")
    assert decision.note == "بررسی شد"
    assert note.body == "پیگیری با حسابداری"

    with pytest.raises(ValidationError):
        ReviewDecisionRequest(decision="confirmed", note="   ")
    with pytest.raises(ValidationError):
        FindingNoteRequest(body="   ")
