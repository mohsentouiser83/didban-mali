from typing import Literal

from fastapi import APIRouter, Request

from .. import native_bank_match_service as service
from ..errors import require
from ..http import C, access, expected, mutate
from ..native_bank_match_schemas import NativeBankMatchDecision, NativeBankMatchInput

router = APIRouter()
P = C + "/reconciliation-native-groups"


@router.get(P + "/sources")
def sources(company_id: str, request: Request, native_statement_id: str | None = None):
    with access(request, company_id) as (db, user, _):
        return service.sources(db, company_id, user, native_statement_id)


@router.get(P + "/options")
def options(
    company_id: str,
    request: Request,
    native_statement_id: str,
    side: Literal["bank", "ledger"],
    account: str = "",
    q: str = "",
    page: int = 0,
):
    with access(request, company_id) as (db, user, _):
        return service.selection_options(db, company_id, user, native_statement_id, side, account, q, page)


@router.get(P + "/previews")
def history(company_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    with access(request, company_id) as (db, user, _):
        return service.history(db, company_id, user, limit, cursor)


@router.get(P + "/previews/{preview_id}")
def read(company_id: str, preview_id: str, request: Request):
    with access(request, company_id) as (db, user, _):
        return service.read(db, company_id, user, preview_id)


@router.post(P + "/previews", status_code=201)
def preview(company_id: str, data: NativeBankMatchInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.create_preview(db, company_id, user, data.model_dump()),
    )


@router.post(P + "/previews/{preview_id}/decisions", status_code=201)
def decide(company_id: str, preview_id: str, data: NativeBankMatchDecision, request: Request):
    require(expected(request) == data.expected_version, "version_conflict", "نسخهٔ درخواست یکسان نیست.", 409)
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.decide(db, company_id, user, preview_id, data.model_dump()),
    )
