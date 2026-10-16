"""Source-backed invoice catalog, independent of liability/receivable calculations."""

import hashlib
from collections import defaultdict
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.financial.models import InvoiceAllocation, SalesInvoice
from app.financial.normalization import normalize_text
from app.imports.models import DataSource, ImportBatch, ImportStatus, SourceKind
from app.moadian.repository import load_snapshot
from app.moadian.schemas import InvoiceSnapshot
from app.settlements.schemas import InvoiceItem

KINDS = {
    SourceKind.SALES,
    SourceKind.PURCHASES,
    SourceKind.MOADIAN_SALES,
    SourceKind.MOADIAN_PURCHASES,
}


async def invoice_catalog(session: AsyncSession, company_id: UUID) -> list[InvoiceItem]:
    batches = (
        await session.execute(
            select(ImportBatch.id, DataSource.kind)
            .join(
                DataSource,
                (DataSource.id == ImportBatch.source_id) & (DataSource.company_id == company_id),
            )
            .where(
                ImportBatch.company_id == company_id,
                DataSource.kind.in_(KINDS),
                ImportBatch.status.in_([ImportStatus.COMPLETED, ImportStatus.COMPLETED_LIMITED]),
            )
            .order_by(ImportBatch.created_at)
        )
    ).all()
    documents: list[tuple[str, InvoiceSnapshot]] = []
    for batch_id, kind in batches:
        _, invoices = await load_snapshot(session, company_id, batch_id, KINDS)
        direction = "sales" if kind in {SourceKind.SALES, SourceKind.MOADIAN_SALES} else "purchases"
        documents.extend((direction, item) for item in invoices)
    references = {(d, i.reference_tax_id) for d, i in documents if i.reference_tax_id}
    grouped: dict[str, list[InvoiceItem]] = defaultdict(list)
    for direction, item in documents:
        # Tax identifiers survive a re-export; anonymous documents never merge by amount/date.
        key = hashlib.sha256(f"{direction}:{item.tax_id or item.row_id}".encode()).hexdigest()
        reason = None
        state = normalize_text(item.status)
        subject = normalize_text(item.subject)
        if (
            item.reference_tax_id
            or subject not in {"", "1", "اصلی", "original"}
            or (direction, item.tax_id) in references
        ):
            reason = "زنجیره اصلاح یا ابطال نیازمند بررسی است."
        if any(word in state for word in ("باطل", "ابطال", "رد شده", "ردشده", "لغو")):
            reason = "فاکتور معتبر نیست."
        if state not in {
            "",
            "تایید شده",
            "تأیید شده",
            "تایید سیستمی",
            "تأیید سیستمی",
            "در انتظار واکنش",
            "عدم نیاز به واکنش",
            "approved",
            "systemic approved",
            "awaiting reaction",
            "no need reaction",
            "صادرشده",
        }:
            reason = f"وضعیت «{item.status}» نیازمند بررسی است."
        if not item.party_name.strip():
            reason = "نام طرف حساب ثبت نشده است."
        gross = Decimal(item.gross_amount)
        if gross <= 0:
            reason = "مبلغ فاکتور مثبت نیست."
        grouped[key].append(
            InvoiceItem(
                source_row_id=item.row_id,
                key=key,
                direction=direction,
                number=item.tax_id or item.invoice_no or str(item.row_number),
                invoice_no=item.invoice_no,
                tax_id=item.tax_id,
                party_name=item.party_name,
                party_id=item.party_id,
                tax_amount_irr=Decimal(item.tax_amount) if item.tax_amount is not None else None,
                issue_date=item.issue_date,
                gross_amount_irr=gross,
                review_reason=reason,
            )
        )
    allocations = (
        await session.scalars(
            select(InvoiceAllocation).where(
                InvoiceAllocation.company_id == company_id, InvoiceAllocation.reversed_at.is_(None)
            )
        )
    ).all()
    paid: dict[str, Decimal] = defaultdict(Decimal)
    for allocation in allocations:
        paid[allocation.invoice_key] += allocation.amount_irr
    canonical_rows = (
        await session.execute(
            select(SalesInvoice.source_row_id, SalesInvoice.id).where(
                SalesInvoice.company_id == company_id
            )
        )
    ).all()
    canonical_by_row: dict[UUID, UUID] = {
        row_id: invoice_id for row_id, invoice_id in canonical_rows
    }
    result = []
    for key, group in grouped.items():
        selected = group[-1]
        canonical_ids = {
            canonical_by_row[i.source_row_id] for i in group if i.source_row_id in canonical_by_row
        }
        selected.canonical_invoice_id = (
            next(iter(canonical_ids)) if len(canonical_ids) == 1 else None
        )
        if any(
            (i.party_name, i.issue_date, i.gross_amount_irr)
            != (selected.party_name, selected.issue_date, selected.gross_amount_irr)
            for i in group
        ):
            selected.review_reason = "نسخه‌های فاکتور مغایرت دارند."
        if any(i.review_reason for i in group):
            selected.review_reason = next(i.review_reason for i in group if i.review_reason)
        if len(canonical_ids) > 1:
            selected.review_reason = "فاکتور چند ثبت عملیاتی دارد."
        selected.allocated_amount_irr = paid[key]
        selected.unallocated_amount_irr = max(Decimal(0), selected.gross_amount_irr - paid[key])
        result.append(selected)
    return sorted(result, key=lambda i: (i.issue_date, i.number), reverse=True)
