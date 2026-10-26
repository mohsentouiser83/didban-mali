"""Read proposal evidence for a single source finding; never allocate or confirm it."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.financial.models import Account, BankAccount, BankTransaction, JournalEntry, JournalLine
from app.findings.models import Finding
from app.findings.reconciliation_scope import (
    latest_reconciliation_id,
    source_allocation_condition,
)
from app.imports.models import ImportBatch, SourceFile, SourceRow
from app.reconciliation.models import ReconciliationAllocation, ReconciliationMatch
from app.reconciliation.summary import PROPOSAL_STATUSES


async def finding_proposals(session: AsyncSession, finding: Finding) -> list[dict[str, Any]]:
    # EXISTS avoids multiplying a proposal by its allocation rows (including 1:N).
    related = (
        select(ReconciliationAllocation.id)
        .where(
            ReconciliationAllocation.match_id == ReconciliationMatch.id,
            ReconciliationAllocation.company_id == Finding.company_id,
            source_allocation_condition(),
        )
        .correlate(Finding, ReconciliationMatch)
        .exists()
    )
    matches = list(
        (
            await session.scalars(
                select(ReconciliationMatch)
                .join(
                    Finding,
                    Finding.company_id == ReconciliationMatch.company_id,
                )
                .where(
                    Finding.id == finding.id,
                    Finding.company_id == finding.company_id,
                    ReconciliationMatch.run_id == latest_reconciliation_id(),
                    ReconciliationMatch.status.in_(PROPOSAL_STATUSES),
                    related,
                )
                .order_by(ReconciliationMatch.score.desc(), ReconciliationMatch.id)
            )
        ).all()
    )
    # Look up only source rows belonging to this company, even if stored evidence is malformed.
    row_ids = {
        str(record["source_row_id"])
        for match in matches
        for key in ("bank", "accounting", "ledger_items")
        for record in (
            match.evidence_json.get(key, [])
            if key == "ledger_items"
            else [match.evidence_json.get(key, {})]
        )
        if isinstance(record, dict) and record.get("source_row_id")
    }
    sources: dict[str, dict[str, Any]] = {}
    if row_ids:
        rows = (
            await session.execute(
                select(SourceRow, SourceFile.id, SourceFile.original_name)
                .join(
                    ImportBatch,
                    ImportBatch.id == SourceRow.import_batch_id,
                )
                .join(SourceFile, SourceFile.id == ImportBatch.file_id)
                .where(
                    SourceRow.company_id == finding.company_id,
                    ImportBatch.company_id == finding.company_id,
                    SourceFile.company_id == finding.company_id,
                    SourceRow.id.in_(row_ids),
                )
            )
        ).all()
        sources = {
            str(row.id): {
                "source_file_id": str(file_id),
                "source_filename": name,
                "sheet_name": row.sheet,
                "row_number": row.row_number,
            }
            for row, file_id, name in rows
        }

    match_ids = [match.id for match in matches]
    bank_ids = select(ReconciliationAllocation.bank_transaction_id).where(
        ReconciliationAllocation.company_id == finding.company_id,
        ReconciliationAllocation.match_id.in_(match_ids),
    )
    journal_ids = select(ReconciliationAllocation.journal_line_id).where(
        ReconciliationAllocation.company_id == finding.company_id,
        ReconciliationAllocation.match_id.in_(match_ids),
    )
    bank_rows = (
        (
            await session.execute(
                select(BankTransaction.id, BankAccount.label)
                .join(
                    BankAccount,
                    BankAccount.id == BankTransaction.bank_account_id,
                )
                .where(
                    BankTransaction.company_id == finding.company_id,
                    BankAccount.company_id == finding.company_id,
                    BankTransaction.id.in_(bank_ids),
                )
            )
        ).all()
        if matches
        else []
    )
    journal_rows = (
        (
            await session.execute(
                select(JournalLine.id, Account.name, JournalEntry.source_entry_id)
                .join(
                    Account,
                    Account.id == JournalLine.account_id,
                )
                .join(JournalEntry, JournalEntry.id == JournalLine.entry_id)
                .where(
                    JournalLine.company_id == finding.company_id,
                    Account.company_id == finding.company_id,
                    JournalEntry.company_id == finding.company_id,
                    JournalLine.id.in_(journal_ids),
                )
            )
        ).all()
        if matches
        else []
    )
    bank_accounts = {str(row[0]): row[1] for row in bank_rows}
    journal_info = {
        str(row[0]): {"account_name": row[1], "document_number": row[2]} for row in journal_rows
    }

    def enrich(record: dict[str, Any]) -> dict[str, Any]:
        source = sources.get(str(record.get("source_row_id", "")))
        return {
            **record,
            **(
                {"account_name": bank_accounts[str(record.get("transaction_id"))]}
                if str(record.get("transaction_id")) in bank_accounts
                else {}
            ),
            **journal_info.get(str(record.get("journal_line_id")), {}),
            **({"source": source} if source else {}),
        }

    result = []
    for match in matches:
        payload = match.evidence_json
        result.append(
            {
                "id": match.id,
                "score": str(match.score),
                "match_type": match.match_type,
                "payload": {
                    **({"bank": enrich(payload["bank"])} if payload.get("bank") else {}),
                    **(
                        {"accounting": enrich(payload["accounting"])}
                        if payload.get("accounting")
                        else {}
                    ),
                    **(
                        {"ledger_items": [enrich(record) for record in payload["ledger_items"]]}
                        if payload.get("ledger_items")
                        else {}
                    ),
                },
            }
        )
    return result
