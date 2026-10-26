from collections import Counter
from datetime import date
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.imports.completeness import assess_coverage
from app.imports.models import ImportBatch, SourceKind
from app.moadian.chains import attach_related_documents
from app.moadian.datasets import merge_overlapping_snapshots
from app.moadian.engine import compare_invoices
from app.moadian.repository import load_snapshot
from app.moadian.schemas import ComparisonResponse, InvoiceSnapshot, MatchStatus


async def comparison_report(
    session: AsyncSession,
    *,
    company_id: UUID,
    internal_batch_id: UUID | None = None,
    portal_batch_id: UUID | None = None,
    internal_batch_ids: list[UUID] | None = None,
    portal_batch_ids: list[UUID] | None = None,
    direction: str,
    start_date: date,
    end_date: date,
    status: MatchStatus | None,
    limit: int,
    offset: int,
    internal_complete: bool = False,
    portal_complete: bool = False,
    all_items: bool = False,
) -> ComparisonResponse:
    if start_date > end_date:
        raise HTTPException(422, "تاریخ شروع باید قبل از پایان باشد.")
    internal_ids = list(
        dict.fromkeys(internal_batch_ids or ([internal_batch_id] if internal_batch_id else []))
    )
    portal_ids = list(
        dict.fromkeys(portal_batch_ids or ([portal_batch_id] if portal_batch_id else []))
    )
    if not internal_ids or not portal_ids or len(internal_ids) + len(portal_ids) > 100:
        raise HTTPException(422, "حداقل یک فایل از هر طرف و حداکثر ۱۰۰ فایل انتخاب کنید.")
    if set(internal_ids) & set(portal_ids):
        raise HTTPException(422, "فایل دو طرف تطبیق باید متفاوت باشد.")
    internal_kind, portal_kind = (
        (SourceKind.SALES, SourceKind.MOADIAN_SALES)
        if direction == "sales"
        else (SourceKind.PURCHASES, SourceKind.MOADIAN_PURCHASES)
    )
    internal_batches: list[ImportBatch] = []
    portal_batches: list[ImportBatch] = []
    internal: list[InvoiceSnapshot] = []
    portal: list[InvoiceSnapshot] = []
    for ids, kinds, batches, invoices in (
        (internal_ids, {internal_kind, SourceKind.ACCOUNTING}, internal_batches, internal),
        (portal_ids, {portal_kind}, portal_batches, portal),
    ):
        for batch_id in ids:
            batch, items = await load_snapshot(
                session, company_id, batch_id, kinds, direction=direction
            )
            batches.append(batch)
            invoices.extend(items)
            if sum(b.row_count for b in [*internal_batches, *portal_batches]) > 250_000:
                raise HTTPException(
                    422, "حجم انتخاب بیش از ۲۵۰ هزار ردیف است؛ فایل‌های کمتری انتخاب کنید."
                )
    internal, internal_copies = merge_overlapping_snapshots(internal)
    portal, portal_copies = merge_overlapping_snapshots(portal)
    coverage = {
        "internal": assess_coverage(
            internal_batches, start_date, end_date, confirmed=internal_complete
        ),
        "portal": assess_coverage(portal_batches, start_date, end_date, confirmed=portal_complete),
    }
    for side, invoices in (("internal", internal), ("portal", portal)):
        if any(item.import_limitations for item in invoices):
            coverage[side]["complete"] = False
            coverage[side]["reasons"].append("بعضی فاکتورها مشخصات یا نسخه‌های ناسازگار دارند.")
    results = await run_in_threadpool(compare_invoices, internal, portal)
    attach_related_documents(results, internal + portal)
    results = [
        r
        for r in results
        if any(i and start_date <= i.issue_date <= end_date for i in (r.internal, r.portal))
    ]
    for item in results:
        if item.status in {"internal_only", "portal_only"}:
            opposite = coverage["portal" if item.status == "internal_only" else "internal"]
            opposite_invoices = portal if item.status == "internal_only" else internal
            source_invoice = item.internal or item.portal
            item.absence_confirmed = bool(
                opposite["complete"]
                and source_invoice
                and source_invoice.tax_id
                and all(invoice.tax_id for invoice in opposite_invoices)
            )
            if not item.absence_confirmed:
                item.limitations.append(
                    "نبود فاکتور قطعی نیست؛ پوشش بازه، ردیف‌های معتبر یا شماره‌های مالیاتی کامل نیستند."
                )
    counts = {str(key): value for key, value in Counter(r.status for r in results).items()}
    filtered = [r for r in results if status is None or r.status == status]
    return ComparisonResponse(
        direction=direction,
        internal_batch_id=internal_ids[0],
        portal_batch_id=portal_ids[0],
        internal_batch_ids=internal_ids,
        portal_batch_ids=portal_ids,
        start_date=start_date,
        end_date=end_date,
        counts=counts,
        total=len(filtered),
        items=filtered if all_items else filtered[offset : offset + limit],
        limit=limit,
        offset=offset,
        rejected_rows=sum(b.rejected_count for b in [*internal_batches, *portal_batches]),
        coverage=coverage,
        overlapping_copies=internal_copies + portal_copies,
    )
