from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.companies.dependencies import CurrentCompanyAccess
from app.data.schemas import (
    RecordLineageResponse,
)
from app.financial.models import (
    BankTransaction,
    JournalEntry,
    JournalLine,
    SalesInvoice,
)
from app.identity.dependencies import DbSession
from app.imports.models import (
    ImportBatch,
    MappingVersion,
    SourceFile,
    SourceRow,
)

router = APIRouter(prefix="/companies/{company_id}/data", tags=["data-foundation"])

@router.get("/lineage/{entity_type}/{record_id}", response_model=RecordLineageResponse)
async def get_record_lineage(
    company_id: UUID,
    entity_type: str,
    record_id: UUID,
    session: DbSession,
    access: CurrentCompanyAccess,
) -> RecordLineageResponse:
    del access

    source_row_id: UUID | None = None
    normalized_fields: dict[str, object] = {}

    if entity_type == "journal_entry":
        entry = await session.scalar(
            select(JournalEntry).where(
                JournalEntry.id == record_id, JournalEntry.company_id == company_id
            )
        )
        if entry is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="سند پیدا نشد.")
        source_row_id = entry.source_row_id
        normalized_fields = {
            "source_entry_key": entry.source_entry_key,
            "entry_date": entry.entry_date.isoformat(),
            "description": entry.description,
            "fiscal_period": entry.fiscal_period,
            "reference": entry.reference,
        }
    elif entity_type == "journal_line":
        line = await session.scalar(
            select(JournalLine).where(
                JournalLine.id == record_id, JournalLine.company_id == company_id
            )
        )
        if line is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="آرتیکل سند پیدا نشد."
            )
        source_row_id = line.source_row_id
        normalized_fields = {
            "entry_id": str(line.entry_id),
            "account_id": str(line.account_id),
            "debit_irr": str(line.debit_irr),
            "credit_irr": str(line.credit_irr),
            "invoice_ref": line.invoice_ref,
        }
    elif entity_type == "bank_transaction":
        tx = await session.scalar(
            select(BankTransaction).where(
                BankTransaction.id == record_id, BankTransaction.company_id == company_id
            )
        )
        if tx is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="تراکنش بانکی پیدا نشد."
            )
        source_row_id = tx.source_row_id
        normalized_fields = {
            "booking_date": tx.booking_date.isoformat(),
            "amount_irr": str(tx.amount_irr),
            "description": tx.description,
            "reference": tx.reference,
            "running_balance_irr": str(tx.running_balance_irr)
            if tx.running_balance_irr is not None
            else None,
        }
    elif entity_type == "sales_invoice":
        inv = await session.scalar(
            select(SalesInvoice).where(
                SalesInvoice.id == record_id, SalesInvoice.company_id == company_id
            )
        )
        if inv is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="فاکتور فروش پیدا نشد."
            )
        source_row_id = inv.source_row_id
        normalized_fields = {
            "invoice_no": inv.invoice_no,
            "issue_date": inv.issue_date.isoformat(),
            "due_date": inv.due_date.isoformat() if inv.due_date else None,
            "gross_amount_irr": str(inv.gross_amount_irr),
            "tax_amount_irr": str(inv.tax_amount_irr) if inv.tax_amount_irr is not None else None,
            "paid_amount_irr": (
                str(inv.paid_amount_irr) if inv.paid_amount_irr is not None else None
            ),
            "status": inv.status,
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"نوع موجودیت نامعتبر است: {entity_type}",
        )

    if source_row_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="پیوند به ردیف منبع مفقود است."
        )

    srow_row = (
        await session.execute(
            select(SourceRow, ImportBatch, SourceFile)
            .join(ImportBatch, ImportBatch.id == SourceRow.import_batch_id)
            .join(SourceFile, SourceFile.id == ImportBatch.file_id)
            .where(SourceRow.id == source_row_id, SourceRow.company_id == company_id)
        )
    ).one_or_none()

    if srow_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="اطلاعات ردیف فایل منبع یافت نشد."
        )

    srow, batch, sfile = srow_row

    version = await session.scalar(
        select(MappingVersion)
        .where(MappingVersion.import_batch_id == batch.id, MappingVersion.company_id == company_id)
        .order_by(MappingVersion.version.desc())
        .limit(1)
    )

    mapping_summary = version.mapping_json.get("fields", {}) if version else {}
    transforms_applied = version.transforms_json if version else {}

    return RecordLineageResponse(
        company_id=company_id,
        record_id=record_id,
        entity_type=entity_type,
        import_id=batch.id,
        source_file_id=sfile.id,
        source_filename=sfile.original_name,
        source_file_sha256=sfile.sha256,
        source_row_number=srow.row_number,
        sheet_name=srow.sheet,
        raw_values=srow.raw_json,
        mapping_version=version.version if version else 1,
        mapping_summary=mapping_summary,
        transforms_applied=transforms_applied,
        normalized_fields=normalized_fields,
        imported_at=batch.created_at,
    )
