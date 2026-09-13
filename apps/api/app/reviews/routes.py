from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from uuid6 import uuid7

from app.audit.service import record_audit_event
from app.companies.dependencies import CurrentCompanyAccess
from app.companies.models import CompanyRole
from app.findings.models import Finding, FindingWorkflowStatus
from app.identity.dependencies import CsrfProtected, CurrentUser, DbSession
from app.reviews.models import FindingNote, ReviewDecision, ReviewDecisionType
from app.reviews.schemas import (
    FindingNoteRequest,
    FindingNoteResponse,
    ReviewDecisionRequest,
    ReviewDecisionResponse,
    ReviewTimelineItem,
    ReviewTimelineResponse,
)

router = APIRouter(prefix="/companies/{company_id}/findings/{finding_id}", tags=["reviews"])
REVIEW_ROLES = {CompanyRole.FINANCE_MANAGER, CompanyRole.ADVISOR}

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


def _require_review_role(role: CompanyRole) -> None:
    if role not in REVIEW_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="فقط مشاور یا مدیر مالی می‌تواند بررسی را ثبت کند.",
        )


def _target_status(decision: ReviewDecisionType) -> FindingWorkflowStatus:
    return FindingWorkflowStatus(decision.value)


def validate_transition(
    current: FindingWorkflowStatus, decision: ReviewDecisionType
) -> FindingWorkflowStatus:
    target = _target_status(decision)
    if target not in ALLOWED_TRANSITIONS[current]:
        raise ValueError(f"Transition from {current.value} to {target.value} is not allowed")
    return target


def _decision_response(item: ReviewDecision) -> ReviewDecisionResponse:
    return ReviewDecisionResponse(
        id=item.id,
        finding_id=item.finding_id,
        decision=item.decision,
        previous_status=item.previous_status,
        resulting_status=item.resulting_status,
        note=item.note,
        actor_id=item.actor_id,
        created_at=item.created_at,
    )


def _note_response(item: FindingNote) -> FindingNoteResponse:
    return FindingNoteResponse(
        id=item.id,
        finding_id=item.finding_id,
        body=item.body,
        actor_id=item.actor_id,
        supersedes_id=item.supersedes_id,
        created_at=item.created_at,
    )


async def _locked_finding(session: DbSession, company_id: UUID, finding_id: UUID) -> Finding:
    finding = await session.scalar(
        select(Finding)
        .where(Finding.id == finding_id, Finding.company_id == company_id)
        .with_for_update()
    )
    if finding is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="یافته پیدا نشد.")
    return finding


@router.post(
    "/decisions",
    response_model=ReviewDecisionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_review_decision(
    company_id: UUID,
    finding_id: UUID,
    payload: ReviewDecisionRequest,
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> ReviewDecisionResponse:
    _require_review_role(access.role)
    finding = await _locked_finding(session, company_id, finding_id)
    existing = await session.scalar(
        select(ReviewDecision).where(
            ReviewDecision.company_id == company_id,
            ReviewDecision.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        if (
            existing.finding_id != finding_id
            or existing.decision != payload.decision
            or existing.note != payload.note
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="این کلید تکرارپذیری قبلاً برای تصمیم دیگری استفاده شده است.",
            )
        return _decision_response(existing)
    try:
        target = validate_transition(finding.workflow_status, payload.decision)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"تغییر وضعیت از {finding.workflow_status.value} به "
                f"{payload.decision.value} مجاز نیست."
            ),
        ) from exc
    now = datetime.now(UTC)
    decision = ReviewDecision(
        id=uuid7(),
        company_id=company_id,
        finding_id=finding_id,
        decision=payload.decision,
        previous_status=finding.workflow_status,
        resulting_status=target,
        note=payload.note,
        actor_id=current_user.id,
        idempotency_key=idempotency_key,
        created_at=now,
    )
    session.add(decision)
    finding.workflow_status = target
    finding.updated_at = now
    record_audit_event(
        session,
        action="finding.review_decision_created",
        entity_type="review_decision",
        actor_id=current_user.id,
        entity_id=decision.id,
        company_id=company_id,
        request_id=request.headers.get("X-Request-ID"),
        metadata={
            "finding_id": str(finding_id),
            "decision": payload.decision.value,
            "previous_status": decision.previous_status.value,
            "resulting_status": target.value,
            "has_note": payload.note is not None,
        },
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="تصمیم هم‌زمان یا کلید تکراری ثبت شده است.",
        ) from exc
    return _decision_response(decision)


@router.post(
    "/notes",
    response_model=FindingNoteResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_finding_note(
    company_id: UUID,
    finding_id: UUID,
    payload: FindingNoteRequest,
    request: Request,
    session: DbSession,
    current_user: CurrentUser,
    access: CurrentCompanyAccess,
    _csrf: CsrfProtected,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> FindingNoteResponse:
    _require_review_role(access.role)
    await _locked_finding(session, company_id, finding_id)
    existing = await session.scalar(
        select(FindingNote).where(
            FindingNote.company_id == company_id,
            FindingNote.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        if (
            existing.finding_id != finding_id
            or existing.body != payload.body
            or existing.supersedes_id != payload.supersedes_id
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="این کلید تکرارپذیری قبلاً برای یادداشت دیگری استفاده شده است.",
            )
        return _note_response(existing)
    if payload.supersedes_id is not None:
        superseded = await session.scalar(
            select(FindingNote).where(
                FindingNote.id == payload.supersedes_id,
                FindingNote.company_id == company_id,
                FindingNote.finding_id == finding_id,
            )
        )
        if superseded is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="یادداشت قبلی برای جایگزینی پیدا نشد.",
            )
        replacement = await session.scalar(
            select(FindingNote.id).where(FindingNote.supersedes_id == superseded.id)
        )
        if replacement is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="این یادداشت قبلاً جایگزین شده است.",
            )
    now = datetime.now(UTC)
    note = FindingNote(
        id=uuid7(),
        company_id=company_id,
        finding_id=finding_id,
        body=payload.body,
        actor_id=current_user.id,
        supersedes_id=payload.supersedes_id,
        idempotency_key=idempotency_key,
        created_at=now,
    )
    session.add(note)
    record_audit_event(
        session,
        action="finding.note_created",
        entity_type="finding_note",
        actor_id=current_user.id,
        entity_id=note.id,
        company_id=company_id,
        request_id=request.headers.get("X-Request-ID"),
        metadata={
            "finding_id": str(finding_id),
            "supersedes_id": str(payload.supersedes_id) if payload.supersedes_id else None,
            "body_length": len(payload.body),
        },
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="یادداشت هم‌زمان یا کلید تکراری ثبت شده است.",
        ) from exc
    return _note_response(note)


@router.get("/reviews", response_model=ReviewTimelineResponse)
async def get_review_timeline(
    company_id: UUID,
    finding_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    cursor: UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> ReviewTimelineResponse:
    del access
    finding = await session.scalar(
        select(Finding).where(Finding.id == finding_id, Finding.company_id == company_id)
    )
    if finding is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="یافته پیدا نشد.")
    decision_query = select(ReviewDecision).where(
        ReviewDecision.company_id == company_id,
        ReviewDecision.finding_id == finding_id,
    )
    note_query = select(FindingNote).where(
        FindingNote.company_id == company_id,
        FindingNote.finding_id == finding_id,
    )
    if cursor is not None:
        decision_query = decision_query.where(ReviewDecision.id > cursor)
        note_query = note_query.where(FindingNote.id > cursor)
    decisions = list(
        await session.scalars(decision_query.order_by(ReviewDecision.id).limit(limit + 1))
    )
    notes = list(await session.scalars(note_query.order_by(FindingNote.id).limit(limit + 1)))
    timeline = [
        ReviewTimelineItem(
            kind="decision",
            id=item.id,
            actor_id=item.actor_id,
            created_at=item.created_at,
            decision=item.decision,
            previous_status=item.previous_status,
            resulting_status=item.resulting_status,
            note=item.note,
        )
        for item in decisions
    ] + [
        ReviewTimelineItem(
            kind="note",
            id=item.id,
            actor_id=item.actor_id,
            created_at=item.created_at,
            body=item.body,
            supersedes_id=item.supersedes_id,
        )
        for item in notes
    ]
    timeline.sort(key=lambda item: item.id.int)
    page = timeline[:limit]
    return ReviewTimelineResponse(
        finding_id=finding_id,
        current_status=finding.workflow_status,
        items=page,
        next_cursor=page[-1].id if len(timeline) > limit else None,
    )
