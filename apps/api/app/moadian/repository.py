from datetime import date
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.imports.mapping import transform_and_validate_row
from app.imports.models import (
    DataSource,
    ImportBatch,
    ImportStatus,
    IssueSeverity,
    MappingVersion,
    SourceKind,
    SourceRow,
    ValidationIssue,
)
from app.moadian.schemas import InvoiceSnapshot


async def load_snapshot(
    session: AsyncSession, company_id: UUID, batch_id: UUID, allowed: set[SourceKind]
) -> tuple[ImportBatch, list[InvoiceSnapshot]]:
    record = (
        await session.execute(
            select(ImportBatch, DataSource, MappingVersion)
            .join(
                DataSource,
                (DataSource.id == ImportBatch.source_id) & (DataSource.company_id == company_id),
            )
            .join(
                MappingVersion,
                (MappingVersion.import_batch_id == ImportBatch.id)
                & (MappingVersion.company_id == company_id),
            )
            .where(ImportBatch.company_id == company_id, ImportBatch.id == batch_id)
        )
    ).one_or_none()
    if record is None:
        raise HTTPException(404, "فایل تکمیل‌شده پیدا نشد.")
    batch, source, version = record
    if source.kind not in allowed or batch.status not in {
        ImportStatus.COMPLETED,
        ImportStatus.COMPLETED_LIMITED,
    }:
        raise HTTPException(422, "نوع فایل یا وضعیت پردازش برای تطبیق مناسب نیست.")
    rejected = exists(
        select(ValidationIssue.id).where(
            ValidationIssue.company_id == company_id,
            ValidationIssue.source_row_id == SourceRow.id,
            ValidationIssue.severity.in_([IssueSeverity.ERROR, IssueSeverity.BLOCKING]),
        )
    )
    rows = (
        await session.scalars(
            select(SourceRow)
            .where(
                SourceRow.company_id == company_id,
                SourceRow.import_batch_id == batch_id,
                ~rejected,
            )
            .order_by(SourceRow.row_number)
        )
    ).all()
    metadata = version.mapping_json
    invoices = []
    for row in rows:
        item, issues = transform_and_validate_row(
            source_kind=source.kind,
            row_number=row.row_number,
            raw=row.raw_json,
            mapping=metadata["fields"],
            transforms=version.transforms_json,
            currency_unit=metadata["currency_unit"],
            calendar=metadata["calendar"],
        )
        if any(i.severity in {IssueSeverity.ERROR, IssueSeverity.BLOCKING} for i in issues):
            continue

        def value(key: str, data: dict[str, object] = item) -> str:
            return str(data.get(key) or "").strip()

        tax_source = metadata["fields"].get("tax_amount")
        # Missing optional amounts must stay unavailable, not become zero.
        tax_raw = str(row.raw_json.get(tax_source, "") if tax_source else "").strip()
        tax_present = bool(tax_source and tax_raw not in {"", "None", "null", "-", "–", "—", "."})
        invoices.append(
            InvoiceSnapshot(
                row_id=row.id,
                batch_id=batch.id,
                row_number=row.row_number,
                sheet=row.sheet,
                invoice_no=value("invoice_no"),
                tax_id=value("tax_id"),
                issue_date=date.fromisoformat(value("issue_date")),
                party_name=value("party_name") or value("customer_name"),
                party_id=value("party_id") or value("customer_national_id"),
                gross_amount=value("gross_amount"),
                tax_amount=value("tax_amount") if tax_present else None,
                subject=value("subject"),
                reference_tax_id=value("reference_tax_id"),
                status=value("status"),
            )
        )
    return batch, invoices
