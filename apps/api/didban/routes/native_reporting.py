"""Company-scoped role choices and immutable native financial statements."""

from datetime import date
from typing import Literal

from fastapi import APIRouter, Request, Response

from .. import native_reporting_service as service
from ..http import C, access, expected, mutate, paginate
from ..native_reporting_models import NativeOpeningEvidence, NativeStatementRun
from ..native_reporting_schemas import (
    NativeRoleInput,
    NativeStatementInput,
    OpeningEvidenceInput,
    RevokeOpeningInput,
    StatementApprovalInput,
    ZeroOpeningInput,
)
from ..native_statement_approval_service import approve_statement, statement_public, statement_summary
from ..services import get_entity
from ..workflow import audit

router = APIRouter()
A = C + "/accounting"


@router.get(A + "/account-roles")
def roles(company_id: str, request: Request, limit: int = 50, cursor: str | None = None):
    with access(request, company_id) as (db, user, _member):
        return service.list_roles(db, company_id, user, limit, cursor)


@router.patch(A + "/account-roles/{account_id}")
def role(company_id: str, account_id: str, data: NativeRoleInput, request: Request):
    version = expected(request)
    return mutate(
        request,
        company_id,
        data.model_dump() | {"expected_version": version},
        "read",
        lambda db, user: service.save_role(db, company_id, user, account_id, data.role, version),
    )


@router.get(A + "/statements/preview")
def preview(company_id: str, period_id: str, request: Request, as_of: date | None = None):
    with access(request, company_id) as (db, user, _member):
        return service.build_statement(db, company_id, user, period_id, as_of)


@router.post(A + "/statements", status_code=201)
def save(company_id: str, data: NativeStatementInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.save_statement(db, company_id, user, data.period_id, data.as_of),
    )


@router.get(A + "/statements")
def listing(company_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, user, _member):
        return paginate(
            db,
            NativeStatementRun,
            company_id,
            limit,
            cursor,
            transform=lambda row: statement_summary(db, company_id, user, row),
        )


@router.get(A + "/statements/{run_id}")
def detail(company_id: str, run_id: str, request: Request):
    with access(request, company_id) as (db, user, _member):
        return statement_public(db, company_id, user, get_entity(db, NativeStatementRun, company_id, run_id))


@router.get(A + "/statements/{run_id}/export")
def export(company_id: str, run_id: str, request: Request, format: Literal["pdf", "xlsx"] = "pdf"):
    from ..native_reporting_exports import pdf_run, xlsx_run

    with access(request, company_id) as (db, user, _member):
        run = statement_public(db, company_id, user, get_entity(db, NativeStatementRun, company_id, run_id))
        audit(
            db,
            company_id,
            user.id,
            "accounting.statement_downloaded",
            run_id,
            {"format": format, "digest": run["digest"]},
        )
    return Response(
        pdf_run(run) if format == "pdf" else xlsx_run(run),
        media_type="application/pdf"
        if format == "pdf"
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="didban-native-statement-{run_id}.{format}"'},
    )


@router.post(A + "/opening-evidence", status_code=201)
def opening(company_id: str, data: OpeningEvidenceInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "read",
        lambda db, user: service.declare_opening(
            db, company_id, user, data.journal_id, data.digest, data.reason
        ),
    )


@router.get(A + "/opening-evidence")
def openings(company_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, _user, _member):
        return paginate(db, NativeOpeningEvidence, company_id, limit, cursor)


@router.post(A + "/zero-opening-evidence", status_code=201)
def zero_opening(company_id: str, data: ZeroOpeningInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "read",
        lambda db, user: service.declare_zero_opening(db, company_id, user, data.period_id, data.reason),
    )


@router.get(A + "/zero-opening-evidence")
def zero_openings(company_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, user, _member):
        return service.zero_openings(db, company_id, user, limit, cursor)


@router.post(A + "/zero-opening-evidence/{evidence_id}/revoke")
def revoke_zero(company_id: str, evidence_id: str, data: RevokeOpeningInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "read",
        lambda db, user: service.revoke_zero_opening(db, company_id, user, evidence_id, data.reason),
    )


@router.post(A + "/statements/{run_id}/approvals", status_code=201)
def approval(company_id: str, run_id: str, data: StatementApprovalInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "read",
        lambda db, user: approve_statement(db, company_id, user, run_id, data.digest),
    )


@router.get(A + "/statements/summary/latest")
def latest_summary(company_id: str, request: Request, period_id: str | None = None):
    with access(request, company_id) as (db, _user, _member):
        return service.latest_summary(db, company_id, period_id)
