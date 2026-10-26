import re
from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.financial.normalization import normalize_text
from app.imports.mapping import normalize_digits, transform_and_validate_row
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
from app.imports.structure import SourceLayout, effective_raw
from app.moadian.datasets import aggregate_invoice_rows
from app.moadian.schemas import InvoiceSnapshot


async def load_snapshot(
    session: AsyncSession,
    company_id: UUID,
    batch_id: UUID,
    allowed: set[SourceKind],
    *,
    direction: str | None = None,
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
    layout = SourceLayout.model_validate(metadata.get("layout", {}))
    if source.kind == SourceKind.ACCOUNTING:
        capability = batch.coverage_json.get("invoice_comparison", {})
        if not capability.get("available") or direction not in capability.get("directions", []):
            raise HTTPException(
                422, "این فایل دفتر، مشخصات فاکتور و جهت خرید/فروش کافی برای تطبیق ندارد."
            )
    invoices = []
    for row in rows:
        item, issues = transform_and_validate_row(
            source_kind=source.kind,
            row_number=row.row_number,
            raw=effective_raw(row.raw_json, row.processing_result),
            mapping=metadata["fields"],
            transforms=version.transforms_json,
            currency_unit=metadata["currency_unit"],
            calendar=metadata["calendar"],
        )
        if any(i.severity in {IssueSeverity.ERROR, IssueSeverity.BLOCKING} for i in issues):
            continue

        def value(key: str, data: dict[str, object] = item) -> str:
            return str(data.get(key) or "").strip()

        if source.kind == SourceKind.ACCOUNTING:
            raw = effective_raw(row.raw_json, row.processing_result)
            has_identity = bool(value("invoice_no") or value("invoice_ref") or value("tax_id"))
            gross_source = metadata["fields"].get("gross_amount")
            has_total = bool(
                gross_source
                and str(raw.get(gross_source) if raw.get(gross_source) is not None else "").strip()
            )
            if not has_identity and not has_total:
                continue
            row_direction: str = layout.invoice_direction
            if row_direction == "mixed":
                row_direction = {
                    "فروش": "sales",
                    "خرید": "purchases",
                    "sales": "sales",
                    "purchases": "purchases",
                }.get(
                    normalize_text(value("invoice_direction")),
                    "mixed",
                )
            if row_direction == "mixed":
                raise HTTPException(422, f"جهت خرید/فروش فاکتور ردیف {row.row_number} مشخص نیست.")
            if row_direction != direction:
                continue
            if not has_identity or not has_total:
                raise HTTPException(
                    422, f"شماره یا مبلغ کل فاکتور ردیف {row.row_number} موجود نیست."
                )
            if Decimal(value("gross_amount")) < 0:
                raise HTTPException(422, f"مبلغ کل فاکتور ردیف {row.row_number} منفی است.")
            if value("tax_amount") and Decimal(value("tax_amount")) < 0:
                raise HTTPException(422, f"مالیات فاکتور ردیف {row.row_number} منفی است.")
            if value("tax_id") and not re.fullmatch(
                r"[A-Z0-9]{22}", normalize_digits(value("tax_id")).upper()
            ):
                raise HTTPException(422, f"شماره مالیاتی ردیف {row.row_number} معتبر نیست.")
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
                invoice_no=value("invoice_no") or value("invoice_ref"),
                tax_id=normalize_digits(value("tax_id")).upper(),
                issue_date=date.fromisoformat(value("issue_date") or value("entry_date")),
                party_name=value("party_name")
                or value("customer_name")
                or value("counterparty_name"),
                party_id=value("party_id") or value("customer_national_id"),
                gross_amount=value("gross_amount"),
                tax_amount=value("tax_amount") if tax_present else None,
                subject=value("subject"),
                reference_tax_id=normalize_digits(value("reference_tax_id")).upper(),
                status=value("status"),
            )
        )
    layout = SourceLayout.model_validate(metadata.get("layout", {}))
    return batch, aggregate_invoice_rows(invoices, layout.invoice_rows)
