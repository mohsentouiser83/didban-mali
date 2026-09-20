import re
import unicodedata
from collections.abc import Sequence
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import exists, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from uuid6 import uuid7

from app.audit.service import record_audit_event
from app.core.tenant import set_request_company, set_request_user
from app.financial.models import (
    Account,
    AccountClassification,
    BankAccount,
    BankTransaction,
    Counterparty,
    JournalEntry,
    JournalLine,
    SalesInvoice,
)
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

CHUNK_SIZE = 1_000
SPACE = re.compile(r"\s+")
PUNCTUATION = re.compile(r"[^0-9a-zA-Z\u0600-\u06ff\s]+")
NON_ALNUM = re.compile(r"[^0-9a-zA-Z]+")


def normalize_text(value: object) -> str:
    text = unicodedata.normalize("NFC", str(value)).replace("ي", "ی").replace("ك", "ک")
    text = "".join(" " if unicodedata.category(char).startswith("P") else char for char in text)
    return SPACE.sub(" ", PUNCTUATION.sub(" ", text.casefold())).strip()


def _text(value: object | None) -> str:
    return "" if value is None else str(value).strip()


def _optional_text(value: object | None) -> str | None:
    cleaned = _text(value)
    return cleaned or None


def _as_date(value: object) -> date:
    return date.fromisoformat(str(value))


def _as_decimal(value: object | None) -> Decimal | None:
    if value is None or str(value).strip() in ("", "-", "–", "—", "None", "null"):
        return None
    return Decimal(str(value))


def mask_iban(value: object | None) -> tuple[str | None, str | None]:
    cleaned = NON_ALNUM.sub("", normalize_digits(_text(value))).upper()
    if len(cleaned) < 4:
        return None, None
    last4 = cleaned[-4:]
    return f"{cleaned[:2]}••••••••••••••••••••{last4}", last4


async def _accepted_rows(
    session: AsyncSession, batch_id: UUID, after_row: int
) -> Sequence[SourceRow]:
    rejected = exists(
        select(ValidationIssue.id).where(
            ValidationIssue.source_row_id == SourceRow.id,
            ValidationIssue.severity.in_([IssueSeverity.BLOCKING, IssueSeverity.ERROR]),
        )
    )
    return (
        (
            await session.scalars(
                select(SourceRow)
                .where(
                    SourceRow.import_batch_id == batch_id,
                    SourceRow.row_number > after_row,
                    ~rejected,
                )
                .order_by(SourceRow.row_number)
                .limit(CHUNK_SIZE)
            )
        )
        .unique()
        .all()
    )


def _transform(row: SourceRow, source: DataSource, version: MappingVersion) -> dict[str, object]:
    metadata = version.mapping_json
    transformed, issues = transform_and_validate_row(
        source_kind=source.kind,
        row_number=row.row_number,
        raw=row.raw_json,
        mapping=metadata["fields"],
        transforms=version.transforms_json,
        currency_unit=metadata["currency_unit"],
        calendar=metadata["calendar"],
    )
    if any(issue.severity in {IssueSeverity.BLOCKING, IssueSeverity.ERROR} for issue in issues):
        raise ValueError(f"Validated source row {row.id} no longer passes deterministic validation")
    return transformed


async def _normalize_accounting_chunk(
    session: AsyncSession,
    batch: ImportBatch,
    source: DataSource,
    version: MappingVersion,
    rows: Sequence[SourceRow],
) -> None:
    values = [(row, _transform(row, source, version)) for row in rows]
    accounts: dict[str, tuple[str, str]] = {}
    for _, item in values:
        code = _text(item["account_code"])
        name = _text(item["account_name"])
        accounts.setdefault(code, (name, normalize_text(name)))
    if accounts:
        await session.execute(
            insert(Account)
            .values(
                [
                    {
                        "id": uuid7(),
                        "company_id": batch.company_id,
                        "source_code": code,
                        "name": name,
                        "normalized_name": normalized,
                    }
                    for code, (name, normalized) in accounts.items()
                ]
            )
            .on_conflict_do_nothing(constraint="uq_account_company_code")
        )
    account_rows = (
        await session.execute(
            select(Account.source_code, Account.id, Account.normalized_name).where(
                Account.company_id == batch.company_id,
                Account.source_code.in_(list(accounts)),
            )
        )
    ).all()
    account_ids = {code: account_id for code, account_id, _ in account_rows}
    existing_names = {code: normalized for code, _, normalized in account_rows}
    for row, item in values:
        code = _text(item["account_code"])
        incoming = normalize_text(item["account_name"])
        if existing_names[code] != incoming:
            session.add(
                ValidationIssue(
                    id=uuid7(),
                    company_id=batch.company_id,
                    import_batch_id=batch.id,
                    source_row_id=row.id,
                    field="account_name",
                    severity=IssueSeverity.WARNING,
                    code="ACCOUNT_NAME_CONFLICT",
                    message="نام این کد حساب با نام ثبت‌شده قبلی متفاوت است.",
                    raw_value=_text(item["account_name"]),
                    remedy="نام حساب و کد منبع را بررسی کنید.",
                )
            )

    parties: dict[str, str] = {}
    for _, item in values:
        party_name = _optional_text(item.get("counterparty_name"))
        if party_name:
            parties.setdefault(normalize_text(party_name), party_name)
    if parties:
        await session.execute(
            insert(Counterparty)
            .values(
                [
                    {
                        "id": uuid7(),
                        "company_id": batch.company_id,
                        "name": name,
                        "normalized_name": normalized,
                        "kind": "other",
                    }
                    for normalized, name in parties.items()
                ]
            )
            .on_conflict_do_nothing(constraint="uq_counterparty_company_name")
        )
    party_rows = (
        await session.execute(
            select(Counterparty.normalized_name, Counterparty.id).where(
                Counterparty.company_id == batch.company_id,
                Counterparty.normalized_name.in_(list(parties)),
            )
        )
    ).all()
    party_ids: dict[str, UUID] = {name: party_id for name, party_id in party_rows}

    entries: dict[str, tuple[SourceRow, dict[str, object]]] = {}
    for row, item in values:
        source_id = _optional_text(item.get("entry_id"))
        key = source_id or f"row:{row.row_number}"
        entries.setdefault(key, (row, item))
    await session.execute(
        insert(JournalEntry)
        .values(
            [
                {
                    "id": uuid7(),
                    "company_id": batch.company_id,
                    "import_batch_id": batch.id,
                    "source_row_id": row.id,
                    "source_entry_key": key,
                    "source_entry_id": _optional_text(item.get("entry_id")),
                    "entry_date": _as_date(item["entry_date"]),
                    "reference": _optional_text(item.get("reference")),
                    "description": _text(item["description"]),
                    "description_normalized": normalize_text(item["description"]),
                    "fiscal_period": _as_date(item["entry_date"]).strftime("%Y-%m"),
                }
                for key, (row, item) in entries.items()
            ]
        )
        .on_conflict_do_nothing(constraint="uq_journal_entry_batch_key")
    )
    entry_rows = (
        await session.execute(
            select(JournalEntry.source_entry_key, JournalEntry.id).where(
                JournalEntry.import_batch_id == batch.id,
                JournalEntry.source_entry_key.in_(list(entries)),
            )
        )
    ).all()
    entry_ids: dict[str, UUID] = {key: entry_id for key, entry_id in entry_rows}
    await session.execute(
        insert(JournalLine)
        .values(
            [
                {
                    "id": uuid7(),
                    "company_id": batch.company_id,
                    "entry_id": entry_ids[
                        _optional_text(item.get("entry_id")) or f"row:{row.row_number}"
                    ],
                    "account_id": account_ids[_text(item["account_code"])],
                    "source_row_id": row.id,
                    "debit_irr": Decimal(str(item["debit"])),
                    "credit_irr": Decimal(str(item["credit"])),
                    "counterparty_id": party_ids.get(normalize_text(item["counterparty_name"]))
                    if item.get("counterparty_name")
                    else None,
                    "invoice_ref": _optional_text(item.get("invoice_ref")),
                }
                for row, item in values
            ]
        )
        .on_conflict_do_nothing(constraint="uq_journal_line_source_row")
    )


async def _normalize_bank_chunk(
    session: AsyncSession,
    batch: ImportBatch,
    source: DataSource,
    version: MappingVersion,
    rows: Sequence[SourceRow],
) -> None:
    values = [(row, _transform(row, source, version)) for row in rows]
    iban_value = next((item.get("iban") for _, item in values if item.get("iban")), None)
    iban_masked, account_last4 = mask_iban(iban_value)
    await session.execute(
        insert(BankAccount)
        .values(
            id=uuid7(),
            company_id=batch.company_id,
            data_source_id=source.id,
            bank_name=source.label,
            iban_masked=iban_masked,
            account_last4=account_last4,
            label=source.label,
        )
        .on_conflict_do_nothing(constraint="uq_bank_account_data_source")
    )
    bank_account_id = await session.scalar(
        select(BankAccount.id).where(BankAccount.data_source_id == source.id)
    )
    if bank_account_id is None:
        raise ValueError("Bank account could not be resolved")
    tx_records: list[dict[str, object]] = []
    for row, item in values:
        raw_desc = _text(item["description"])
        tx_type = _optional_text(item.get("transaction_type"))
        desc = f"[{tx_type}] {raw_desc}" if tx_type and tx_type not in raw_desc else raw_desc
        tx_records.append(
            {
                "id": uuid7(),
                "company_id": batch.company_id,
                "bank_account_id": bank_account_id,
                "source_row_id": row.id,
                "source_transaction_id": _optional_text(item.get("transaction_id")),
                "booking_date": _as_date(item["booking_date"]),
                "value_date": _as_date(item["value_date"]) if item.get("value_date") else None,
                "amount_irr": Decimal(str(item["amount_signed"])),
                "description": desc,
                "description_normalized": normalize_text(desc),
                "reference": _optional_text(item.get("reference")),
                "running_balance_irr": _as_decimal(item.get("running_balance")),
            }
        )
    await session.execute(
        insert(BankTransaction)
        .values(tx_records)
        .on_conflict_do_nothing(constraint="uq_bank_transaction_source_row")
    )


async def _normalize_sales_chunk(
    session: AsyncSession,
    batch: ImportBatch,
    source: DataSource,
    version: MappingVersion,
    rows: Sequence[SourceRow],
) -> None:
    values = [(row, _transform(row, source, version)) for row in rows]
    parties: dict[str, str] = {}
    for _, item in values:
        name = _text(item["customer_name"])
        parties.setdefault(normalize_text(name), name)
    await session.execute(
        insert(Counterparty)
        .values(
            [
                {
                    "id": uuid7(),
                    "company_id": batch.company_id,
                    "name": name,
                    "normalized_name": normalized,
                    "national_id": next(
                        (
                            _optional_text(item.get("customer_national_id"))
                            for _, item in values
                            if normalize_text(item["customer_name"]) == normalized
                        ),
                        None,
                    ),
                    "kind": "customer",
                }
                for normalized, name in parties.items()
            ]
        )
        .on_conflict_do_nothing(constraint="uq_counterparty_company_name")
    )
    party_rows = (
        await session.execute(
            select(Counterparty.normalized_name, Counterparty.id).where(
                Counterparty.company_id == batch.company_id,
                Counterparty.normalized_name.in_(list(parties)),
            )
        )
    ).all()
    party_ids: dict[str, UUID] = {name: party_id for name, party_id in party_rows}
    logical_keys = {(_text(item["invoice_no"]), _as_date(item["issue_date"])) for _, item in values}
    existing = (
        await session.execute(
            select(
                SalesInvoice.invoice_no, SalesInvoice.issue_date, SalesInvoice.source_row_id
            ).where(
                SalesInvoice.company_id == batch.company_id,
                SalesInvoice.invoice_no.in_([key[0] for key in logical_keys]),
            )
        )
    ).all()
    existing_keys = {(number, issued): source_row_id for number, issued, source_row_id in existing}
    invoice_values: list[dict[str, object]] = []
    seen = set(existing_keys)
    for row, item in values:
        key = (_text(item["invoice_no"]), _as_date(item["issue_date"]))
        if key in seen and existing_keys.get(key) != row.id:
            session.add(
                ValidationIssue(
                    id=uuid7(),
                    company_id=batch.company_id,
                    import_batch_id=batch.id,
                    source_row_id=row.id,
                    field="invoice_no",
                    severity=IssueSeverity.WARNING,
                    code="DUPLICATE_SALES_INVOICE",
                    message="شماره و تاریخ این فاکتور قبلاً ثبت شده است.",
                    raw_value=key[0],
                    remedy="تکراری‌بودن فاکتور را بررسی کنید.",
                )
            )
            continue
        seen.add(key)
        customer = normalize_text(item["customer_name"])
        invoice_values.append(
            {
                "id": uuid7(),
                "company_id": batch.company_id,
                "source_row_id": row.id,
                "invoice_no": key[0],
                "counterparty_id": party_ids[customer],
                "issue_date": key[1],
                "due_date": _as_date(item["due_date"]) if item.get("due_date") else None,
                "gross_amount_irr": Decimal(str(item["gross_amount"])),
                "tax_amount_irr": _as_decimal(item.get("tax_amount")),
                "paid_amount_irr": _as_decimal(item.get("paid_amount")),
                "status": _optional_text(item.get("status")),
            }
        )
    if invoice_values:
        await session.execute(
            insert(SalesInvoice)
            .values(invoice_values)
            .on_conflict_do_nothing(constraint="uq_sales_invoice_source_row")
        )


async def _normalized_count(session: AsyncSession, batch: ImportBatch, kind: SourceKind) -> int:
    if kind == SourceKind.ACCOUNTING:
        statement = select(func.count(JournalLine.id)).join(
            SourceRow, SourceRow.id == JournalLine.source_row_id
        )
    elif kind == SourceKind.BANK:
        statement = select(func.count(BankTransaction.id)).join(
            SourceRow, SourceRow.id == BankTransaction.source_row_id
        )
    else:
        statement = select(func.count(SalesInvoice.id)).join(
            SourceRow, SourceRow.id == SalesInvoice.source_row_id
        )
    return int((await session.scalar(statement.where(SourceRow.import_batch_id == batch.id))) or 0)


async def normalize_import(
    session: AsyncSession, *, batch_id: UUID, company_id: UUID, actor_id: UUID
) -> dict[str, object]:
    batch = await session.scalar(
        select(ImportBatch)
        .where(ImportBatch.id == batch_id, ImportBatch.company_id == company_id)
        .with_for_update()
    )
    if batch is None:
        raise ValueError("Import batch is not accessible")
    source = await session.get(DataSource, batch.source_id)
    version = await session.scalar(
        select(MappingVersion).where(MappingVersion.import_batch_id == batch.id)
    )
    if source is None or version is None:
        raise ValueError("Import lineage is incomplete")
    if batch.status in {ImportStatus.COMPLETED, ImportStatus.COMPLETED_LIMITED}:
        return {"status": batch.status.value, "normalized": batch.accepted_count}
    if batch.status not in {ImportStatus.QUEUED, ImportStatus.PROCESSING}:
        raise ValueError("Import batch is not ready for normalization")
    batch.status = ImportStatus.PROCESSING
    batch.stage = "canonical_normalization"
    batch.progress = 90
    await session.commit()
    await set_request_user(session, actor_id)
    await set_request_company(session, company_id)

    after_row = 0
    while rows := await _accepted_rows(session, batch.id, after_row):
        if source.kind == SourceKind.ACCOUNTING:
            await _normalize_accounting_chunk(session, batch, source, version, rows)
        elif source.kind == SourceKind.BANK:
            await _normalize_bank_chunk(session, batch, source, version, rows)
        else:
            await _normalize_sales_chunk(session, batch, source, version, rows)
        after_row = rows[-1].row_number
        await session.commit()
        await set_request_user(session, actor_id)
        await set_request_company(session, company_id)

    normalized = await _normalized_count(session, batch, source.kind)
    coverage = dict(batch.coverage_json)
    coverage["canonical_model"] = {
        "available": normalized > 0,
        "score": round(100 * normalized / batch.accepted_count) if batch.accepted_count else 0,
        "expected_rows": batch.accepted_count,
        "normalized_rows": normalized,
        "lineage_complete": normalized == batch.accepted_count,
    }
    limited = normalized != batch.accepted_count or batch.rejected_count > 0
    if source.kind == SourceKind.ACCOUNTING:
        unclassified = int(
            (
                await session.scalar(
                    select(func.count(func.distinct(JournalLine.account_id)))
                    .join(SourceRow, SourceRow.id == JournalLine.source_row_id)
                    .where(
                        SourceRow.import_batch_id == batch.id,
                        ~exists(
                            select(AccountClassification.id).where(
                                AccountClassification.account_id == JournalLine.account_id
                            )
                        ),
                    )
                )
            )
            or 0
        )
        coverage["profit_analysis"] = {
            "available": unclassified == 0 and normalized > 0,
            "score": 100 if unclassified == 0 and normalized > 0 else 0,
            "reasons": [] if unclassified == 0 else [f"{unclassified} حساب طبقه‌بندی نشده است"],
        }
        limited = limited or unclassified > 0
        entry_id_mapped = "entry_id" in version.mapping_json["fields"]
        unbalanced = 0
        if entry_id_mapped:
            balance_rows = (
                await session.execute(
                    select(
                        JournalEntry.source_row_id,
                        func.sum(JournalLine.debit_irr),
                        func.sum(JournalLine.credit_irr),
                    )
                    .join(JournalLine, JournalLine.entry_id == JournalEntry.id)
                    .where(JournalEntry.import_batch_id == batch.id)
                    .group_by(JournalEntry.id, JournalEntry.source_row_id)
                )
            ).all()
            existing_balance_issues = set(
                await session.scalars(
                    select(ValidationIssue.source_row_id).where(
                        ValidationIssue.import_batch_id == batch.id,
                        ValidationIssue.code == "UNBALANCED_JOURNAL_ENTRY",
                    )
                )
            )
            for source_row_id, debit, credit in balance_rows:
                if Decimal(debit or 0) == Decimal(credit or 0):
                    continue
                unbalanced += 1
                if source_row_id not in existing_balance_issues:
                    session.add(
                        ValidationIssue(
                            id=uuid7(),
                            company_id=batch.company_id,
                            import_batch_id=batch.id,
                            source_row_id=source_row_id,
                            severity=IssueSeverity.WARNING,
                            code="UNBALANCED_JOURNAL_ENTRY",
                            message="جمع بدهکار و بستانکار این سند برابر نیست.",
                            remedy="کامل‌بودن آرتیکل‌های سند در فایل منبع را بررسی کنید.",
                        )
                    )
        coverage["journal_balance"] = {
            "available": entry_id_mapped,
            "score": 100 if entry_id_mapped and unbalanced == 0 else 0,
            "reasons": (
                ["شماره سند نگاشت نشده است"]
                if not entry_id_mapped
                else ([f"{unbalanced} سند نامتوازن است"] if unbalanced else [])
            ),
        }
        limited = limited or not entry_id_mapped or unbalanced > 0
    batch.coverage_json = coverage
    batch.status = ImportStatus.COMPLETED_LIMITED if limited else ImportStatus.COMPLETED
    batch.stage = "normalized"
    batch.progress = 100
    batch.failure_code = None
    batch.failure_message = None
    batch.retryable = False
    record_audit_event(
        session,
        action="import.normalization_completed",
        entity_type="import_batch",
        actor_id=actor_id,
        entity_id=batch.id,
        company_id=company_id,
        metadata={"source_kind": source.kind.value, "normalized_rows": normalized},
    )
    await session.commit()
    return {"status": batch.status.value, "normalized": normalized, "coverage": coverage}
