"""Attach the original upload location to deterministic rule evidence."""

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.findings.rules.base import FindingCandidate
from app.imports.models import ImportBatch, SourceFile, SourceRow


def evidence_records(payload: dict[str, Any]) -> list[dict[str, Any]]:
    records = [payload]
    for key in ("bank", "accounting"):
        if isinstance(payload.get(key), dict):
            records.append(payload[key])
    return records


async def attach_source_locations(
    session: AsyncSession, company_id: UUID, candidates: list[FindingCandidate]
) -> None:
    records = [
        record
        for candidate in candidates
        for ev in candidate.evidence_items
        for record in evidence_records(ev.payload)
    ]
    ids = {UUID(str(record["source_row_id"])) for record in records if record.get("source_row_id")}
    if not ids:
        return
    rows = (
        await session.execute(
            select(SourceRow, SourceFile)
            .join(ImportBatch, ImportBatch.id == SourceRow.import_batch_id)
            .join(SourceFile, SourceFile.id == ImportBatch.file_id)
            .where(
                SourceRow.company_id == company_id,
                ImportBatch.company_id == company_id,
                SourceFile.company_id == company_id,
                SourceRow.id.in_(ids),
            )
        )
    ).all()
    locations = {
        str(row.id): {
            "source_file_id": str(file.id),
            "source_filename": file.original_name,
            "sheet_name": row.sheet,
            "row_number": row.row_number,
            "raw_values": row.raw_json,
        }
        for row, file in rows
    }
    for record in records:
        location = locations.get(str(record.get("source_row_id")))
        if location:
            record["source"] = location
