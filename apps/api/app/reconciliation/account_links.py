"""Explicit bank correspondence, independent of source column names and account codes."""

from typing import Any
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid6 import uuid7

from app.audit.service import record_audit_event
from app.companies.models import Company
from app.financial.models import Account, BankAccount, BankTransaction, JournalLine
from app.reconciliation.locking import lock_reconciliation_company
from app.reconciliation.models import (
    BankLedgerLink,
    MatchStatus,
    ReconciliationAllocation,
    ReconciliationMatch,
)


class AccountLinkConflict(ValueError):
    pass


async def list_accounts(
    session: AsyncSession, company_id: UUID, *, query: str = "", limit: int = 100, offset: int = 0
) -> list[dict[str, Any]]:
    statement = (
        select(Account, BankLedgerLink.bank_account_id)
        .outerjoin(
            BankLedgerLink,
            (BankLedgerLink.account_id == Account.id) & (BankLedgerLink.company_id == company_id),
        )
        .where(Account.company_id == company_id)
        .order_by(Account.source_code, Account.id)
        .limit(limit)
        .offset(offset)
    )
    if not query.strip():
        statement = statement.where(
            or_(
                Account.role == "cash",
                BankLedgerLink.id.is_not(None),
                Account.normalized_name.startswith("بانک "),
                Account.normalized_name.startswith("صندوق "),
                Account.normalized_name.startswith("تنخواه "),
            )
        )
    if query.strip():
        pattern = (
            "%" + query.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        )
        statement = statement.where(
            or_(
                Account.name.ilike(pattern, escape="\\"),
                Account.source_code.ilike(pattern, escape="\\"),
            )
        )
    return [
        {
            "account_id": account.id,
            "code": " / ".join(
                value
                for value in (account.general_code, account.subsidiary_code, account.detail_code)
                if value
            )
            or account.source_code,
            "name": account.name,
            "bank_account_id": bank_id,
        }
        for account, bank_id in (await session.execute(statement)).all()
    ]


async def set_account_link(
    session: AsyncSession,
    *,
    company_id: UUID,
    account_id: UUID,
    bank_account_id: UUID | None,
    actor_id: UUID,
) -> None:
    await session.execute(select(Company.id).where(Company.id == company_id).with_for_update())
    await lock_reconciliation_company(session, company_id)
    account = await session.scalar(
        select(Account).where(
            Account.id == account_id,
            Account.company_id == company_id,
        )
    )
    if account is None:
        raise LookupError("حساب دفتر پیدا نشد.")
    if bank_account_id is not None:
        bank = await session.scalar(
            select(BankAccount.id).where(
                BankAccount.id == bank_account_id,
                BankAccount.company_id == company_id,
            )
        )
        if bank is None:
            raise LookupError("حساب بانکی پیدا نشد.")
    link = await session.scalar(
        select(BankLedgerLink)
        .where(
            BankLedgerLink.company_id == company_id,
            BankLedgerLink.account_id == account_id,
        )
        .with_for_update()
    )
    if (link.bank_account_id if link else None) == bank_account_id:
        return
    # Never reinterpret settled evidence through a later mapping change.
    active_match_ids = (
        select(ReconciliationAllocation.match_id)
        .join(
            JournalLine,
            JournalLine.id == ReconciliationAllocation.journal_line_id,
        )
        .where(
            ReconciliationAllocation.company_id == company_id,
            JournalLine.account_id == account_id,
        )
    )
    active_banks = set(
        (
            await session.scalars(
                select(BankTransaction.bank_account_id)
                .join(
                    ReconciliationAllocation,
                    ReconciliationAllocation.bank_transaction_id == BankTransaction.id,
                )
                .join(
                    ReconciliationMatch, ReconciliationMatch.id == ReconciliationAllocation.match_id
                )
                .where(
                    ReconciliationAllocation.company_id == company_id,
                    ReconciliationMatch.company_id == company_id,
                    ReconciliationMatch.id.in_(active_match_ids),
                    ReconciliationMatch.status.in_(
                        [MatchStatus.AUTO_MATCHED, MatchStatus.CONFIRMED]
                    ),
                )
            )
        ).all()
    )
    if active_banks and (bank_account_id is None or active_banks != {bank_account_id}):
        raise AccountLinkConflict("ابتدا تطبیق‌های قطعی این حساب را برگشت دهید.")
    before = str(link.bank_account_id) if link else None
    if bank_account_id is None:
        if link:
            await session.delete(link)
    elif link:
        link.bank_account_id = bank_account_id
        link.confirmed_by = actor_id
    else:
        session.add(
            BankLedgerLink(
                id=uuid7(),
                company_id=company_id,
                account_id=account_id,
                bank_account_id=bank_account_id,
                confirmed_by=actor_id,
            )
        )
    record_audit_event(
        session,
        action="reconciliation.account_link_changed",
        entity_type="account",
        entity_id=account_id,
        actor_id=actor_id,
        company_id=company_id,
        metadata={
            "previous_bank_account_id": before,
            "bank_account_id": str(bank_account_id) if bank_account_id else None,
        },
    )
    await session.flush()


async def validate_match_accounts(
    session: AsyncSession, company_id: UUID,
    banks: list[BankTransaction], journals: list[JournalLine],
) -> None:
    """A human confirmation cannot override an explicitly contradictory correspondence."""
    mapped_banks = set((await session.scalars(
        select(BankLedgerLink.bank_account_id).where(
            BankLedgerLink.company_id == company_id,
            BankLedgerLink.account_id.in_({line.account_id for line in journals}),
        )
    )).all())
    bank_ids = {bank.bank_account_id for bank in banks}
    if mapped_banks and (len(bank_ids) != 1 or mapped_banks != bank_ids):
        raise AccountLinkConflict("حساب بانک با ارتباط تأییدشده حساب دفتر سازگار نیست.")
