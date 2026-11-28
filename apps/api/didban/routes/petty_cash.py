"""HTTP routes for petty cash expenses and settlements."""

from fastapi import APIRouter, Request

from .. import petty_cash_service as service
from ..http import C, access, mutate
from ..petty_cash_schemas import PettyCashExpenseInput, PettyCashSettlementInput

router = APIRouter()
P = C + "/petty-cash"


@router.get(P + "/expenses")
def list_expenses(
    company_id: str,
    request: Request,
    treasury_account_id: str | None = None,
    dimension_id: str | None = None,
    status: str | None = None,
):
    with access(request, company_id) as (db, _u, _m):
        return service.list_expenses(
            db,
            company_id,
            treasury_account_id=treasury_account_id,
            dimension_id=dimension_id,
            status=status,
        )


@router.post(P + "/expenses", status_code=201)
def record_expense(company_id: str, data: PettyCashExpenseInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.record_expense(db, company_id, user, data.model_dump()),
    )


@router.post(P + "/expenses/{expense_id}/cancel")
def cancel_expense(company_id: str, expense_id: str, request: Request):
    return mutate(
        request,
        company_id,
        {},
        "write",
        lambda db, user: service.cancel_expense(db, company_id, user, expense_id),
    )


@router.get(P + "/settlements")
def list_settlements(company_id: str, request: Request, treasury_account_id: str | None = None):
    with access(request, company_id) as (db, _u, _m):
        return service.list_settlements(db, company_id, treasury_account_id=treasury_account_id)


@router.post(P + "/settlements", status_code=201)
def settle_petty_cash(company_id: str, data: PettyCashSettlementInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.settle_petty_cash(db, company_id, user, data.model_dump()),
    )
