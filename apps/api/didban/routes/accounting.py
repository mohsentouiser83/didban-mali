"""Accounting workspace HTTP adapters; no final-post action before accountant review."""

from fastapi import APIRouter, Request

from .. import accounting_schemas as s
from .. import accounting_service as service
from ..accounting_models import Account, Draft
from ..http import C, access, expected, mutate, paginate

router = APIRouter()
A = C + "/accounting"


@router.get(A + "/capabilities")
def capabilities(company_id: str, request: Request):
    with access(request, company_id) as (db, user, _member):
        return service.capabilities(db, company_id, user)


@router.get(A + "/accounts")
def accounts(company_id: str, request: Request, limit: int = 50, cursor: str | None = None):
    with access(request, company_id) as (db, _user, _member):
        return paginate(db, Account, company_id, limit, cursor)


@router.post(A + "/accounts", status_code=201)
def create_account(company_id: str, data: s.AccountInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "read",
        lambda db, user: service.save_account(db, company_id, user, data.model_dump()),
    )


@router.patch(A + "/accounts/{account_id}")
def update_account(company_id: str, account_id: str, data: s.AccountInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "read",
        lambda db, user: service.save_account(
            db, company_id, user, data.model_dump(), account_id, expected(request)
        ),
    )


@router.get(A + "/drafts")
def drafts(company_id: str, request: Request, limit: int = 50, cursor: str | None = None):
    with access(request, company_id) as (db, _user, _member):
        return paginate(db, Draft, company_id, limit, cursor)


@router.post(A + "/drafts", status_code=201)
def create_draft(company_id: str, data: s.DraftInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "read",
        lambda db, user: service.save_draft(db, company_id, user, data.model_dump()),
    )


@router.patch(A + "/drafts/{draft_id}")
def update_draft(company_id: str, draft_id: str, data: s.DraftInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "read",
        lambda db, user: service.save_draft(
            db, company_id, user, data.model_dump(), draft_id, expected(request)
        ),
    )


@router.get(A + "/permissions")
def permissions(company_id: str, request: Request):
    with access(request, company_id) as (db, user, _member):
        return service.permissions(db, company_id, user)


@router.patch(A + "/permissions/{membership_id}")
def grant(company_id: str, membership_id: str, data: s.PermissionInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "owner",
        lambda db, user: service.grant(
            db, company_id, user, membership_id, data.model_dump(), expected(request)
        ),
    )
