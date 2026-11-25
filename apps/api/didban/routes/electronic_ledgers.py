from datetime import date
from typing import Literal

from fastapi import APIRouter, Query, Request

from .. import electronic_ledgers_service as service
from ..http import C, access

router = APIRouter()
P = C + "/accounting/electronic-ledgers"


@router.get(P)
def electronic_ledgers(
    company_id: str,
    request: Request,
    level: Literal["general", "subsidiary"] = Query("general"),
    from_date: date | None = None,
    to_date: date | None = None,
    include_turnover: bool = True,
    auto_daily_numbering: bool = True,
):
    with access(request, company_id) as (db, _user, _member):
        return service.get_electronic_ledger(
            db,
            company_id,
            level=level,
            from_date=from_date,
            to_date=to_date,
            include_turnover=include_turnover,
            auto_daily_numbering=auto_daily_numbering,
        )
