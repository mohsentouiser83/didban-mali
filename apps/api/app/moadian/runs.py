"""Persist exact comparison evidence; reviewing a discrepancy never edits source invoices."""

import hashlib
import json
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid6 import uuid7

from app.audit.service import record_audit_event
from app.companies.models import Company
from app.imports.models import ImportBatch, MappingVersion, SourceFile
from app.moadian.models import InvoiceComparisonResult, InvoiceComparisonRun
from app.moadian.schemas import (
    ComparisonDecisionRequest,
    ComparisonItem,
    ComparisonRequest,
    ComparisonResponse,
    MatchStatus,
)
from app.moadian.service import comparison_report


async def read_run(
    session: AsyncSession,
    company_id: UUID,
    run_id: UUID,
    *,
    status: MatchStatus | None = None,
    limit: int = 25,
    offset: int = 0,
) -> ComparisonResponse:
    run = await session.scalar(
        select(InvoiceComparisonRun).where(
            InvoiceComparisonRun.id == run_id,
            InvoiceComparisonRun.company_id == company_id,
        )
    )
    if run is None:
        raise HTTPException(404, "گزارش تطبیق پیدا نشد.")
    conditions = [
        InvoiceComparisonResult.company_id == company_id,
        InvoiceComparisonResult.run_id == run_id,
    ]
    if status:
        conditions.append(InvoiceComparisonResult.status == status)
    rows = (
        await session.scalars(
            select(InvoiceComparisonResult)
            .where(*conditions)
            .order_by(InvoiceComparisonResult.ordinal)
            .offset(offset)
            .limit(limit)
        )
    ).all()
    total = int(
        await session.scalar(
            select(func.count()).select_from(InvoiceComparisonResult).where(*conditions)
        )
        or 0
    )
    items = []
    for row in rows:
        item = ComparisonItem.model_validate(row.evidence_json)
        item.key, item.decision, item.note = row.item_key, row.decision, row.note
        items.append(item)
    return ComparisonResponse.model_validate(
        {
            **run.summary_json,
            "run_id": run.id,
            "direction": run.direction,
            "items": items,
            "limit": limit,
            "offset": offset,
            "total": total,
        }
    )


async def create_run(
    session: AsyncSession,
    company_id: UUID,
    actor_id: UUID,
    request: ComparisonRequest,
    request_key: UUID,
) -> ComparisonResponse:
    await session.execute(select(Company.id).where(Company.id == company_id).with_for_update())
    existing = await session.scalar(
        select(InvoiceComparisonRun).where(
            InvoiceComparisonRun.company_id == company_id,
            InvoiceComparisonRun.request_key == request_key,
        )
    )
    selection = request.model_dump(mode="json")
    if existing:
        if existing.selection_json["request"] != selection:
            raise HTTPException(409, "کلید درخواست برای انتخاب دیگری استفاده شده است.")
        return await read_run(session, company_id, existing.id)
    selected_ids = set(request.internal_batch_ids + request.portal_batch_ids)
    # Keep source files alive until their immutable comparison references are committed.
    await session.execute(
        select(ImportBatch.id)
        .where(
            ImportBatch.company_id == company_id,
            ImportBatch.id.in_(selected_ids),
        )
        .order_by(ImportBatch.id)
        .with_for_update()
    )
    report = await comparison_report(
        session,
        company_id=company_id,
        **request.model_dump(),
        status=None,
        limit=25,
        offset=0,
        all_items=True,
    )
    manifest_rows = (
        await session.execute(
            select(ImportBatch.id, SourceFile.original_name, SourceFile.sha256, MappingVersion.id)
            .join(SourceFile, SourceFile.id == ImportBatch.file_id)
            .join(MappingVersion, MappingVersion.import_batch_id == ImportBatch.id)
            .where(ImportBatch.company_id == company_id, ImportBatch.id.in_(selected_ids))
        )
    ).all()
    run = InvoiceComparisonRun(
        id=uuid7(),
        company_id=company_id,
        created_by=actor_id,
        request_key=request_key,
        direction=request.direction,
        start_date=request.start_date,
        end_date=request.end_date,
        selection_json={
            "request": selection,
            "batch_ids": [str(value) for value in sorted(selected_ids)],
            "manifest": [
                {
                    "batch_id": str(batch),
                    "filename": name,
                    "sha256": sha,
                    "mapping_version_id": str(mapping),
                }
                for batch, name, sha, mapping in manifest_rows
            ],
        },
        summary_json=report.model_dump(mode="json", exclude={"items"}),
    )
    session.add(run)
    await session.flush()
    for ordinal, item in enumerate(report.items):
        evidence = item.model_dump(mode="json")
        key = hashlib.sha256(
            json.dumps(evidence, sort_keys=True, ensure_ascii=False).encode()
        ).hexdigest()
        session.add(
            InvoiceComparisonResult(
                id=uuid7(),
                company_id=company_id,
                run_id=run.id,
                item_key=key,
                status=item.status,
                ordinal=ordinal,
                evidence_json=evidence,
            )
        )
        if ordinal % 500 == 499:
            await session.flush()
    record_audit_event(
        session,
        action="moadian.comparison_created",
        entity_type="invoice_comparison",
        entity_id=run.id,
        actor_id=actor_id,
        company_id=company_id,
        metadata={"selection": selection, "counts": report.counts},
    )
    await session.commit()
    return await read_run(session, company_id, run.id)


async def decide_result(
    session: AsyncSession,
    company_id: UUID,
    actor_id: UUID,
    run_id: UUID,
    item_key: str,
    request: ComparisonDecisionRequest,
) -> ComparisonItem:
    item = await session.scalar(
        select(InvoiceComparisonResult)
        .where(
            InvoiceComparisonResult.company_id == company_id,
            InvoiceComparisonResult.run_id == run_id,
            InvoiceComparisonResult.item_key == item_key,
        )
        .with_for_update()
    )
    if item is None:
        raise HTTPException(404, "مورد تطبیق پیدا نشد.")
    if (item.decision, item.note) != (request.decision, request.note):
        before = item.decision
        item.decision, item.note, item.decided_by = request.decision, request.note, actor_id
        item.updated_at = datetime.now(UTC)
        record_audit_event(
            session,
            action="moadian.result_reviewed",
            entity_type="invoice_comparison_result",
            entity_id=item.id,
            actor_id=actor_id,
            company_id=company_id,
            metadata={
                "previous_decision": before,
                "decision": request.decision,
                "note": request.note,
            },
        )
        await session.commit()
    return ComparisonItem.model_validate(
        {
            **item.evidence_json,
            "key": item.item_key,
            "decision": item.decision,
            "note": item.note,
        }
    )
