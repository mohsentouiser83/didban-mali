import enum
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPrimaryKeyMixin


class AccountClass(enum.StrEnum):
    ASSET = "asset"
    LIABILITY = "liability"
    EQUITY = "equity"
    REVENUE = "revenue"
    EXPENSE = "expense"
    OTHER = "other"


class Account(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "accounts"
    __table_args__ = (
        UniqueConstraint("company_id", "source_code", name="uq_account_company_code"),
        UniqueConstraint("id", "company_id", name="uq_account_company"),
        Index("ix_accounts_company_normalized_name", "company_id", "normalized_name"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    source_code: Mapped[str] = mapped_column(String(160), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_name: Mapped[str] = mapped_column(Text, nullable=False)


class AccountClassification(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "account_classifications"
    __table_args__ = (
        ForeignKeyConstraint(
            ["account_id", "company_id"],
            ["accounts.id", "accounts.company_id"],
            ondelete="CASCADE",
        ),
        UniqueConstraint(
            "account_id", "effective_from", name="uq_account_classification_effective"
        ),
        Index("ix_account_classifications_company_account", "company_id", "account_id"),
        Index("ix_account_classifications_confirmed_by", "confirmed_by"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    account_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    account_class: Mapped[AccountClass] = mapped_column(
        Enum(AccountClass, name="account_class", native_enum=False), nullable=False
    )
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    confirmed_by: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    rule_version: Mapped[str] = mapped_column(String(40), default="human-v1", nullable=False)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class JournalEntry(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "journal_entries"
    __table_args__ = (
        ForeignKeyConstraint(
            ["source_row_id", "company_id"],
            ["source_rows.id", "source_rows.company_id"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["import_batch_id", "company_id"],
            ["import_batches.id", "import_batches.company_id"],
            ondelete="RESTRICT",
        ),
        UniqueConstraint("id", "company_id", name="uq_journal_entry_company"),
        UniqueConstraint("import_batch_id", "source_entry_key", name="uq_journal_entry_batch_key"),
        Index("ix_journal_entries_company_date", "company_id", "entry_date"),
        Index("ix_journal_entries_source_row", "source_row_id"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    import_batch_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    source_row_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    source_entry_key: Mapped[str] = mapped_column(String(200), nullable=False)
    source_entry_id: Mapped[str | None] = mapped_column(String(200))
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    reference: Mapped[str | None] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, nullable=False)
    description_normalized: Mapped[str] = mapped_column(Text, nullable=False)
    fiscal_period: Mapped[str] = mapped_column(String(7), nullable=False)


class JournalLine(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "journal_lines"
    __table_args__ = (
        ForeignKeyConstraint(
            ["entry_id", "company_id"],
            ["journal_entries.id", "journal_entries.company_id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["account_id", "company_id"],
            ["accounts.id", "accounts.company_id"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["source_row_id", "company_id"],
            ["source_rows.id", "source_rows.company_id"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["counterparty_id", "company_id"],
            ["counterparties.id", "counterparties.company_id"],
            ondelete="RESTRICT",
        ),
        CheckConstraint("debit_irr >= 0", name="ck_journal_line_debit_nonnegative"),
        CheckConstraint("credit_irr >= 0", name="ck_journal_line_credit_nonnegative"),
        CheckConstraint("NOT (debit_irr > 0 AND credit_irr > 0)", name="ck_journal_line_one_side"),
        UniqueConstraint("source_row_id", name="uq_journal_line_source_row"),
        Index("ix_journal_lines_company_entry", "company_id", "entry_id"),
        Index("ix_journal_lines_account", "account_id"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    entry_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    account_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    source_row_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    debit_irr: Mapped[Decimal] = mapped_column(Numeric(20, 0), nullable=False)
    credit_irr: Mapped[Decimal] = mapped_column(Numeric(20, 0), nullable=False)
    counterparty_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    invoice_ref: Mapped[str | None] = mapped_column(String(300))


class BankAccount(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "bank_accounts"
    __table_args__ = (
        ForeignKeyConstraint(
            ["data_source_id", "company_id"],
            ["data_sources.id", "data_sources.company_id"],
            ondelete="RESTRICT",
        ),
        UniqueConstraint("data_source_id", name="uq_bank_account_data_source"),
        UniqueConstraint("id", "company_id", name="uq_bank_account_company"),
        Index("ix_bank_accounts_company_label", "company_id", "label"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    data_source_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    bank_name: Mapped[str] = mapped_column(String(160), nullable=False)
    iban_masked: Mapped[str | None] = mapped_column(String(34))
    account_last4: Mapped[str | None] = mapped_column(String(4))
    label: Mapped[str] = mapped_column(String(160), nullable=False)


class BankTransaction(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "bank_transactions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["bank_account_id", "company_id"],
            ["bank_accounts.id", "bank_accounts.company_id"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["source_row_id", "company_id"],
            ["source_rows.id", "source_rows.company_id"],
            ondelete="RESTRICT",
        ),
        UniqueConstraint("id", "company_id", name="uq_bank_transaction_company"),
        UniqueConstraint("source_row_id", name="uq_bank_transaction_source_row"),
        Index("ix_bank_transactions_company_date", "company_id", "booking_date"),
        Index("ix_bank_transactions_bank_account", "bank_account_id"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    bank_account_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    source_row_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    source_transaction_id: Mapped[str | None] = mapped_column(String(300))
    booking_date: Mapped[date] = mapped_column(Date, nullable=False)
    value_date: Mapped[date | None] = mapped_column(Date)
    amount_irr: Mapped[Decimal] = mapped_column(Numeric(20, 0), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    description_normalized: Mapped[str] = mapped_column(Text, nullable=False)
    reference: Mapped[str | None] = mapped_column(String(300))
    running_balance_irr: Mapped[Decimal | None] = mapped_column(Numeric(20, 0))


class Counterparty(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "counterparties"
    __table_args__ = (
        UniqueConstraint("company_id", "normalized_name", name="uq_counterparty_company_name"),
        UniqueConstraint("id", "company_id", name="uq_counterparty_company"),
        Index("ix_counterparties_company_national_id", "company_id", "national_id"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_name: Mapped[str] = mapped_column(Text, nullable=False)
    national_id: Mapped[str | None] = mapped_column(String(32))
    kind: Mapped[str] = mapped_column(String(40), default="customer", nullable=False)


class SalesInvoice(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "sales_invoices"
    __table_args__ = (
        ForeignKeyConstraint(
            ["source_row_id", "company_id"],
            ["source_rows.id", "source_rows.company_id"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["counterparty_id", "company_id"],
            ["counterparties.id", "counterparties.company_id"],
            ondelete="RESTRICT",
        ),
        CheckConstraint("gross_amount_irr >= 0", name="ck_sales_invoice_gross_nonnegative"),
        CheckConstraint(
            "tax_amount_irr IS NULL OR tax_amount_irr >= 0",
            name="ck_sales_invoice_tax_nonnegative",
        ),
        CheckConstraint(
            "paid_amount_irr IS NULL OR paid_amount_irr >= 0",
            name="ck_sales_invoice_paid_nonnegative",
        ),
        UniqueConstraint("source_row_id", name="uq_sales_invoice_source_row"),
        UniqueConstraint("company_id", "invoice_no", "issue_date", name="uq_sales_invoice_logical"),
        Index("ix_sales_invoices_company_issue_date", "company_id", "issue_date"),
        Index("ix_sales_invoices_counterparty", "counterparty_id"),
    )

    company_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    source_row_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    invoice_no: Mapped[str] = mapped_column(String(300), nullable=False)
    counterparty_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date)
    gross_amount_irr: Mapped[Decimal] = mapped_column(Numeric(20, 0), nullable=False)
    tax_amount_irr: Mapped[Decimal | None] = mapped_column(Numeric(20, 0))
    paid_amount_irr: Mapped[Decimal | None] = mapped_column(Numeric(20, 0))
    status: Mapped[str | None] = mapped_column(String(80))
