"""API routes for counterparty statement reconciliation."""

from typing import Literal

from fastapi import APIRouter, Request

from .. import counterparty_reconciliation_service as service
from ..counterparty_reconciliation_schemas import (
    CounterpartyReconciliationDecisionInput,
    ReconcileCounterpartyInput,
)
from ..http import C, access, mutate

router = APIRouter()
P = C + "/counterparties"


@router.get(P + "/reconciliation-candidates")
def list_candidates(company_id: str, request: Request):
    with access(request, company_id) as (db, user, _):
        return service.list_candidates(db, company_id, user)


@router.get(P + "/{counterparty_id}/statement-ledger")
def get_statement_ledger(
    company_id: str,
    counterparty_id: str,
    request: Request,
    as_of_date: str | None = None,
    basis: Literal["native"] | None = None,
):
    with access(request, company_id) as (db, user, _):
        return service.get_counterparty_ledger(
            db, company_id, user, counterparty_id, as_of_date, include_imported=basis is None,
        )


@router.post(P + "/reconcile", status_code=201)
def reconcile(company_id: str, data: ReconcileCounterpartyInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.reconcile(db, company_id, user, data.model_dump()),
    )


@router.get(P + "/reconciliations")
def list_runs(
    company_id: str,
    request: Request,
    counterparty_id: str | None = None,
):
    with access(request, company_id) as (db, user, _):
        return service.list_runs(db, company_id, user, counterparty_id)


@router.get(P + "/reconciliations/{run_id}")
def get_run(company_id: str, run_id: str, request: Request):
    with access(request, company_id) as (db, user, _):
        return service.get_run(db, company_id, user, run_id)


@router.post(P + "/reconciliations/{run_id}/decide")
def decide_run(
    company_id: str,
    run_id: str,
    data: CounterpartyReconciliationDecisionInput,
    request: Request,
):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.decide_run(db, company_id, user, run_id, data.status, data.notes),
    )
