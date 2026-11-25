"""API endpoints for employee records, contracts, and periodic payroll calculations."""

from fastapi import APIRouter, Query, Request

from .. import payroll_service as service
from ..http import C, access, expected, mutate
from ..payroll_schemas import (
    BatchTimesheetInput,
    ContractInput,
    EmployeeInput,
    PayrollPaymentDraftInput,
    PayrollPostJournalInput,
    PayrollRunCreateInput,
    PayrollSlipTimesheetInput,
    PayrollWorkshopInput,
    UpdateContractInput,
    UpdateEmployeeInput,
    UpdatePayrollWorkshopInput,
)

router = APIRouter()


# --- Workshops Endpoints ---


@router.get(C + "/payroll/workshops")
def list_workshops(company_id: str, request: Request):
    with access(request, company_id) as (db, user, _m):
        return service.list_workshops(db, company_id, user)


@router.post(C + "/payroll/workshops", status_code=201)
def add_workshop(company_id: str, data: PayrollWorkshopInput, request: Request):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.add_workshop(db, company_id, user, payload),
    )


@router.patch(C + "/payroll/workshops/{workshop_id}")
def update_workshop(
    company_id: str, workshop_id: str, data: UpdatePayrollWorkshopInput, request: Request
):
    payload = data.model_dump(exclude_unset=True)
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.update_workshop(
            db, company_id, user, workshop_id, payload, expected(request)
        ),
    )


@router.post(C + "/payroll/runs/{run_id}/payment-draft", status_code=201)
def create_payroll_payment_draft(
    company_id: str, run_id: str, data: PayrollPaymentDraftInput, request: Request
):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.create_payroll_payment_draft(db, company_id, user, run_id, payload),
    )


# --- Employees Endpoints ---


@router.post(C + "/employees", status_code=201)
def add_employee(company_id: str, data: EmployeeInput, request: Request):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.add_employee(db, company_id, user, payload),
    )


@router.get(C + "/employees")
def list_employees(
    company_id: str,
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    search: str | None = None,
    active_only: bool = False,
):
    with access(request, company_id) as (db, user, _m):
        return service.list_employees(
            db, company_id, user, limit=limit, offset=offset, search=search, active_only=active_only
        )


@router.get(C + "/employees/{employee_id}")
def get_employee(company_id: str, employee_id: str, request: Request):
    with access(request, company_id) as (db, user, _m):
        return service.get_employee(db, company_id, employee_id, user=user)


@router.patch(C + "/employees/{employee_id}")
def update_employee(company_id: str, employee_id: str, data: UpdateEmployeeInput, request: Request):
    payload = data.model_dump(exclude_unset=True)
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.update_employee(
            db, company_id, user, employee_id, payload, expected(request)
        ),
    )


@router.delete(C + "/employees/{employee_id}")
def delete_employee(company_id: str, employee_id: str, request: Request):
    version = expected(request) if "if-match" in request.headers else None
    return mutate(
        request,
        company_id,
        {},
        "read",
        lambda db, user: service.delete_employee(db, company_id, user, employee_id, version),
    )


# --- Contracts Endpoints ---


@router.post(C + "/contracts", status_code=201)
def add_contract(company_id: str, data: ContractInput, request: Request):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.add_contract(db, company_id, user, payload),
    )


@router.get(C + "/contracts")
def list_contracts(
    company_id: str,
    request: Request,
    employee_id: str | None = None,
    status: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    with access(request, company_id) as (db, user, _m):
        return service.list_contracts(
            db, company_id, user, employee_id=employee_id, status=status, limit=limit, offset=offset
        )


@router.get(C + "/contracts/{contract_id}")
def get_contract(company_id: str, contract_id: str, request: Request):
    with access(request, company_id) as (db, user, _m):
        return service.get_contract(db, company_id, contract_id, user=user)


@router.patch(C + "/contracts/{contract_id}")
def update_contract(company_id: str, contract_id: str, data: UpdateContractInput, request: Request):
    payload = data.model_dump(exclude_unset=True)
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.update_contract(
            db, company_id, user, contract_id, payload, expected(request)
        ),
    )


# --- Payroll Runs & Slips Endpoints ---


@router.post(C + "/payroll/runs", status_code=201)
def create_payroll_run(company_id: str, data: PayrollRunCreateInput, request: Request):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.create_payroll_run(db, company_id, user, payload),
    )


@router.get(C + "/payroll/runs")
def list_payroll_runs(
    company_id: str,
    request: Request,
    period_id: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    with access(request, company_id) as (db, user, _m):
        return service.list_payroll_runs(
            db, company_id, user, period_id=period_id, limit=limit, offset=offset
        )


@router.get(C + "/payroll/runs/{run_id}")
def get_payroll_run(company_id: str, run_id: str, request: Request):
    with access(request, company_id) as (db, user, _m):
        return service.get_payroll_run(db, company_id, run_id, user=user)


@router.patch(C + "/payroll/runs/{run_id}/slips/{slip_id}")
def update_slip_timesheet(
    company_id: str,
    run_id: str,
    slip_id: str,
    data: PayrollSlipTimesheetInput,
    request: Request,
):
    payload = {k: v for k, v in data.model_dump().items() if v is not None}
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.update_slip_timesheet(db, company_id, user, run_id, slip_id, payload),
    )


@router.post(C + "/payroll/runs/{run_id}/slips/batch")
def batch_update_timesheets(
    company_id: str,
    run_id: str,
    data: BatchTimesheetInput,
    request: Request,
):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.batch_update_timesheets(db, company_id, user, run_id, payload["slips"]),
    )


@router.post(C + "/payroll/runs/{run_id}/create-draft")
def create_payroll_operation_draft(
    company_id: str,
    run_id: str,
    data: PayrollPostJournalInput,
    request: Request,
):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "read",
        lambda db, user: service.create_payroll_operation_draft(
            db, company_id, user, run_id, data.accounts, expected_version=data.expected_version
        ),
    )


@router.get(C + "/employees/{employee_id}/settlement")
def get_employee_settlement(
    company_id: str,
    employee_id: str,
    request: Request,
    used_leave_days: str = Query("0"),
):
    from decimal import Decimal
    with access(request, company_id) as (db, user, _m):
        return service.get_employee_settlement(
            db, company_id, user, employee_id, used_leave_days=Decimal(used_leave_days)
        )


@router.get(C + "/payroll/runs/{run_id}/insurance-disk")
def export_insurance_disk(company_id: str, run_id: str, request: Request):
    with access(request, company_id) as (db, user, _m):
        return service.export_insurance_disk(db, company_id, user, run_id)


@router.get(C + "/payroll/runs/{run_id}/tax-disk")
def export_tax_disk(company_id: str, run_id: str, request: Request):
    with access(request, company_id) as (db, user, _m):
        return service.export_tax_disk(db, company_id, user, run_id)

