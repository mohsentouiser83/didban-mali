from app.findings.models import FindingWorkflowStatus
from app.reviews.models import ReviewDecisionType

ALLOWED_TRANSITIONS = {
    FindingWorkflowStatus.NEEDS_REVIEW: {
        FindingWorkflowStatus.CONFIRMED,
        FindingWorkflowStatus.DISMISSED,
        FindingWorkflowStatus.FOLLOW_UP,
    },
    FindingWorkflowStatus.CONFIRMED: {
        FindingWorkflowStatus.DISMISSED,
        FindingWorkflowStatus.FOLLOW_UP,
    },
    FindingWorkflowStatus.DISMISSED: {
        FindingWorkflowStatus.CONFIRMED,
        FindingWorkflowStatus.FOLLOW_UP,
    },
    FindingWorkflowStatus.FOLLOW_UP: {
        FindingWorkflowStatus.CONFIRMED,
        FindingWorkflowStatus.DISMISSED,
        FindingWorkflowStatus.RESOLVED,
    },
    FindingWorkflowStatus.RESOLVED: {FindingWorkflowStatus.FOLLOW_UP},
}


def _target_status(decision: ReviewDecisionType) -> FindingWorkflowStatus:
    return FindingWorkflowStatus(decision.value)


def validate_transition(
    current: FindingWorkflowStatus, decision: ReviewDecisionType
) -> FindingWorkflowStatus:
    target = _target_status(decision)
    if target not in ALLOWED_TRANSITIONS[current]:
        raise ValueError(f"Transition from {current.value} to {target.value} is not allowed")
    return target
