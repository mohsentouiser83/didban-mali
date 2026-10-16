"""Apply document-level semantics after all articles have been normalized."""

from collections import OrderedDict
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.companies.models import Company
from app.financial.accounting import (
    EntryDocument,
    EntryLine,
    identify_entry_types,
)
from app.financial.models import Account, AccountClass, JournalEntry, JournalLine
from app.financial.queries import effective_account_class
from app.imports.models import MappingVersion, SourceRow


async def update_import_entry_types(
    session: AsyncSession, company_id: UUID, batch_id: UUID
) -> None:
    rows = (
        await session.execute(
            select(JournalEntry, JournalLine, Account, effective_account_class())
            .join(JournalLine, JournalLine.entry_id == JournalEntry.id)
            .join(Account, Account.id == JournalLine.account_id)
            .join(SourceRow, SourceRow.id == JournalLine.source_row_id)
            .where(
                JournalEntry.company_id == company_id,
                JournalEntry.import_batch_id == batch_id,
                JournalLine.company_id == company_id,
                Account.company_id == company_id,
            )
            .order_by(JournalEntry.entry_date, SourceRow.row_number)
        )
    ).all()
    documents: OrderedDict[str, EntryDocument] = OrderedDict()
    entries: dict[str, JournalEntry] = {}
    for entry, line, account, classification in rows:
        key = str(entry.id)
        entries[key] = entry
        if key not in documents:
            documents[key] = EntryDocument(
                key,
                entry.entry_date,
                [],
                entry.entry_type if entry.entry_type_source == "source" else None,
            )
        documents[key].lines.append(
            EntryLine(
                account.source_code,
                account.general_name or account.name,
                classification or AccountClass.OTHER,
                account.role,
                line.debit_irr,
                line.credit_irr,
            )
        )
    mapping = await session.scalar(
        select(MappingVersion).where(
            MappingVersion.import_batch_id == batch_id, MappingVersion.company_id == company_id
        )
    )
    company = await session.get(Company, company_id)
    kinds = identify_entry_types(
        list(documents.values()),
        calendar=str(mapping.mapping_json.get("calendar", "jalali")) if mapping else "jalali",
        fiscal_start_month=company.fiscal_year_start_month if company else 1,
    )
    for key, kind in kinds.items():
        await session.execute(
            update(JournalEntry)
            .where(
                JournalEntry.id == entries[key].id,
                JournalEntry.company_id == company_id,
            )
            .values(entry_type=kind)
        )
