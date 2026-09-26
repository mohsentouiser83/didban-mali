from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.automations.models import AutomationRule, AutomationRun
from app.automations.schemas import (
    AutomationRuleCreate,
    AutomationRuleResponse,
    AutomationRuleUpdate,
    AutomationRunResponse,
)
from app.automations.service import AutomationService
from app.companies.dependencies import CurrentCompanyAccess
from app.core.database import get_db
from app.identity.dependencies import get_current_user
from app.identity.models import User

router = APIRouter(prefix="/companies/{company_id}/automations", tags=["automations"])


def _to_rule_response(rule: AutomationRule) -> AutomationRuleResponse:
    return AutomationRuleResponse(
        id=rule.id,
        company_id=rule.company_id,
        name=rule.name,
        action_type=rule.action_type,
        is_enabled=rule.is_enabled,
        schedule_cron=rule.schedule_cron,
        config=rule.config_json,
        last_run_at=rule.last_run_at,
        next_run_at=rule.next_run_at,
        last_status=rule.last_status,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


def _to_run_response(run: AutomationRun) -> AutomationRunResponse:
    return AutomationRunResponse(
        id=run.id,
        company_id=run.company_id,
        rule_id=run.rule_id,
        trigger_type=run.trigger_type,
        status=run.status,
        started_at=run.started_at,
        completed_at=run.completed_at,
        duration_ms=run.duration_ms,
        steps_executed=run.steps_executed_json,
        error_message=run.error_message,
        created_at=run.created_at,
    )


@router.get("", response_model=list[AutomationRuleResponse])
async def list_rules(
    company_id: UUID,
    access: CurrentCompanyAccess,
    session: AsyncSession = Depends(get_db),
) -> list[AutomationRuleResponse]:
    rules = await AutomationService.list_rules(session, company_id)
    return [_to_rule_response(r) for r in rules]


@router.post("", response_model=AutomationRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_rule(
    company_id: UUID,
    payload: AutomationRuleCreate,
    access: CurrentCompanyAccess,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> AutomationRuleResponse:
    rule = await AutomationService.create_rule(
        session=session,
        company_id=company_id,
        payload=payload,
        actor_id=user.id,
    )
    return _to_rule_response(rule)


@router.get("/{rule_id}", response_model=AutomationRuleResponse)
async def get_rule(
    company_id: UUID,
    rule_id: UUID,
    access: CurrentCompanyAccess,
    session: AsyncSession = Depends(get_db),
) -> AutomationRuleResponse:
    rule = await AutomationService.get_rule(session, company_id, rule_id)
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="قانون اتوماسیون یافت نشد.")
    return _to_rule_response(rule)


@router.patch("/{rule_id}", response_model=AutomationRuleResponse)
async def update_rule(
    company_id: UUID,
    rule_id: UUID,
    payload: AutomationRuleUpdate,
    access: CurrentCompanyAccess,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> AutomationRuleResponse:
    try:
        rule = await AutomationService.update_rule(
            session=session,
            company_id=company_id,
            rule_id=rule_id,
            payload=payload,
            actor_id=user.id,
        )
        return _to_rule_response(rule)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/{rule_id}/run", response_model=AutomationRunResponse)
async def execute_rule(
    company_id: UUID,
    rule_id: UUID,
    access: CurrentCompanyAccess,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> AutomationRunResponse:
    try:
        run = await AutomationService.execute_rule(
            session=session,
            company_id=company_id,
            rule_id=rule_id,
            trigger_type="manual",
            actor_id=user.id,
        )
        return _to_run_response(run)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/{rule_id}/runs", response_model=list[AutomationRunResponse])
async def list_runs(
    company_id: UUID,
    rule_id: UUID,
    access: CurrentCompanyAccess,
    session: AsyncSession = Depends(get_db),
) -> list[AutomationRunResponse]:
    runs = await AutomationService.list_runs(session, company_id, rule_id)
    return [_to_run_response(r) for r in runs]
