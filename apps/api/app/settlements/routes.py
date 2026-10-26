from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response

from app.companies.dependencies import CurrentCompanyAccess
from app.companies.permissions import require_financial_writer as require_writer
from app.identity.dependencies import CsrfProtected, DbSession
from app.settlements import service
from app.settlements.catalog import invoice_catalog
from app.settlements.schemas import (
    AllocationInput,
    Direction,
    HistoryConfirmation,
    InvoiceDetail,
    InvoicePage,
)

router = APIRouter(prefix="/companies/{company_id}/settlements", tags=["settlements"])


@router.get("/invoices", response_model=InvoicePage)
async def list_invoices(
    company_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    direction: Direction = "sales",
    search: Annotated[str, Query(max_length=200)] = "",
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
) -> InvoicePage:
    items = [
        i
        for i in await invoice_catalog(session, company_id)
        if i.direction == direction
        and (
            not search
            or search.casefold() in f"{i.number} {i.invoice_no} {i.party_name}".casefold()
        )
    ]
    return InvoicePage(items=items[offset : offset + limit], total=len(items))


@router.get("/invoices/{row_id}", response_model=InvoiceDetail)
async def get_detail(
    company_id: UUID,
    row_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    search: Annotated[str, Query(max_length=200)] = "",
    offset: Annotated[int, Query(ge=0)] = 0,
) -> InvoiceDetail:
    return await service.detail(session, company_id, row_id, search=search, offset=offset)


@router.post("/allocations", status_code=201)
async def create_allocation(
    company_id: UUID,
    payload: AllocationInput,
    session: DbSession,
    access: CurrentCompanyAccess,
    csrf: CsrfProtected,
) -> dict[str, UUID]:
    require_writer(access)
    return {"id": await service.allocate(session, company_id, access.user_id, payload)}


@router.post("/allocations/{allocation_id}/reverse", status_code=204)
async def reverse_allocation(
    company_id: UUID,
    allocation_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    csrf: CsrfProtected,
) -> Response:
    require_writer(access)
    await service.reverse(session, company_id, access.user_id, allocation_id)
    return Response(status_code=204)


@router.post("/invoices/{row_id}/confirm-receipt-history", status_code=204)
async def confirm_receipt_history(
    company_id: UUID,
    row_id: UUID,
    payload: HistoryConfirmation,
    session: DbSession,
    access: CurrentCompanyAccess,
    csrf: CsrfProtected,
) -> Response:
    require_writer(access)
    await service.confirm_history(session, company_id, access.user_id, row_id, payload)
    return Response(status_code=204)


@router.post("/imports/{batch_id}/retry", status_code=202)
async def retry_settlement_import(
    company_id: UUID,
    batch_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
    csrf: CsrfProtected,
) -> dict[str, str]:
    from celery.exceptions import CeleryError
    from fastapi import HTTPException
    from sqlalchemy import select

    from app.financial.tasks import normalize_import_task
    from app.imports.mapping import SETTLEMENT_KINDS
    from app.imports.models import DataSource, ImportBatch, ImportStatus

    require_writer(access)
    row = (
        await session.execute(
            select(ImportBatch, DataSource.kind)
            .join(
                DataSource,
                (DataSource.id == ImportBatch.source_id) & (DataSource.company_id == company_id),
            )
            .where(ImportBatch.id == batch_id, ImportBatch.company_id == company_id)
            .with_for_update(of=ImportBatch)
        )
    ).first()
    if row is None or row[1] not in SETTLEMENT_KINDS:
        raise HTTPException(404, "فایل ریز تسویه پیدا نشد.")
    batch = row[0]
    if batch.status in {ImportStatus.QUEUED, ImportStatus.PROCESSING}:
        return {"status": batch.status.value}
    if batch.status not in {ImportStatus.COMPLETED, ImportStatus.COMPLETED_LIMITED}:
        raise HTTPException(409, "ابتدا ورود فایل را تکمیل کنید.")
    batch.status, batch.stage, batch.progress = ImportStatus.QUEUED, "ready_for_normalization", 0
    await session.commit()
    try:
        normalize_import_task.delay(str(batch.id), str(company_id), str(access.user_id))
    except CeleryError:
        batch.status, batch.retryable = ImportStatus.FAILED, True
        batch.failure_message = "صف پردازش در دسترس نیست؛ دوباره تلاش کنید."
        await session.commit()
        raise HTTPException(503, batch.failure_message) from None
    return {"status": batch.status.value}
