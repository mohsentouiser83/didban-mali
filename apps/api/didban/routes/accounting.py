"""Accounting workspace HTTP adapters; no final-post action before accountant review."""

from typing import Annotated, Literal

from fastapi import APIRouter, Query, Request

from .. import accounting_schemas as s
from .. import accounting_service as service
from ..account_catalogue_service import catalogue_filters, enrich_accounts
from ..accounting_models import Account, Draft
from ..http import C, access, expected, mutate, paginate

router = APIRouter()
A = C + "/accounting"


@router.get(A + "/capabilities")
def capabilities(company_id: str, request: Request):
    with access(request, company_id) as (db, user, _member):
        return service.capabilities(db, company_id, user)


@router.get(A + "/accounts")
def accounts(company_id: str, request: Request, limit: int = 50, cursor: str | None = None,
             level: str | None = None, parent_id: str | None = None):
    with access(request, company_id) as (db, _user, _member):
        page = paginate(db, Account, company_id, limit, cursor, catalogue_filters(company_id, level, parent_id))
        page["items"] = enrich_accounts(db, company_id, page["items"])
        return page


@router.post(A + "/accounts", status_code=201)
def create_account(company_id: str, data: s.AccountCreateInput, request: Request):
    payload = data.model_dump(exclude_unset=True)
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.save_account(db, company_id, user, payload),
    )


@router.patch(A + "/accounts/{account_id}")
def update_account(company_id: str, account_id: str, data: s.AccountInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(exclude_unset=True),
        "read",
        lambda db, user: service.save_account(
            db, company_id, user, data.model_dump(exclude_unset=True), account_id, expected(request)
        ),
    )


@router.get(A + "/drafts")
def drafts(
    company_id: str,
    request: Request,
    limit: int = 50,
    cursor: str | None = None,
    state: Literal["draft", "posted", "discarded"] | None = None,
    q: Annotated[str, Query(max_length=100)] = "",
):
    with access(request, company_id) as (db, _user, _member):
        page = paginate(db, Draft, company_id, limit, cursor, service.draft_list_filters(company_id, state, q.strip()))
        service.enrich_draft_list(db, company_id, page["items"])
        return page


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


@router.get(A + "/detail-links")
def list_detail_links(company_id: str, request: Request, detail_account_id: str | None = None):
    with access(request, company_id) as (db, user, _member):
        return service.list_detail_links(db, company_id, user, detail_account_id)


@router.post(A + "/detail-links", status_code=201)
def save_detail_link(company_id: str, data: s.AccountDetailLinkInput, request: Request):
    payload = data.model_dump()
    return mutate(
        request,
        company_id,
        payload,
        "read",
        lambda db, user: service.save_detail_link(db, company_id, user, payload),
    )
