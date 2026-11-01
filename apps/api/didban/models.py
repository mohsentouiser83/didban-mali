"""Explicit domain entities, immutable facts and versioned workflow state."""

from datetime import date as CalendarDate
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from .money_type import Money


def uid() -> str:
    return str(uuid4())


def now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Entity:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Versioned:
    version: Mapped[int] = mapped_column(Integer, default=1)


class User(Entity, Base):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(Text)
    installation_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class LoginSession(Entity, Base):
    __tablename__ = "login_sessions"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    csrf: Mapped[str] = mapped_column(String(100))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class LoginAttempt(Entity, Base):
    __tablename__ = "login_attempts"
    fingerprint: Mapped[str] = mapped_column(String(64), index=True)
    succeeded: Mapped[bool] = mapped_column(Boolean)


class Company(Entity, Versioned, Base):
    __tablename__ = "companies"
    name: Mapped[str] = mapped_column(String(120))
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Tehran")


class Membership(Entity, Versioned, Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("company_id", "user_id"),)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    role: Mapped[str] = mapped_column(String(30))
    approve_financial_report: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Tenant:
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), index=True)


class Period(Entity, Tenant, Versioned, Base):
    __tablename__ = "financial_periods"
    previous_period_id: Mapped[str | None] = mapped_column(String(36))
    name: Mapped[str] = mapped_column(String(120))
    start: Mapped[CalendarDate] = mapped_column(Date)
    end: Mapped[CalendarDate] = mapped_column(Date)


class ProcessingSession(Entity, Tenant, Versioned, Base):
    __tablename__ = "processing_sessions"
    __table_args__ = (UniqueConstraint("company_id", "id"),)
    period_id: Mapped[str | None] = mapped_column(ForeignKey("financial_periods.id"))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    state: Mapped[str] = mapped_column(String(30), default="receiving")
    policy_version: Mapped[str] = mapped_column(String(50), default="fresh-1")
    completed_steps: Mapped[int] = mapped_column(Integer, default=0)
    error_code: Mapped[str | None] = mapped_column(String(60))
    error_message: Mapped[str | None] = mapped_column(Text)
    parent_id: Mapped[str | None] = mapped_column(String(36))
    result_id: Mapped[str | None] = mapped_column(String(36))


class SourceFile(Entity, Tenant, Versioned, Base):
    __tablename__ = "source_files"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        ForeignKeyConstraint(
            ["company_id", "session_id"], ["processing_sessions.company_id", "processing_sessions.id"]
        ),
    )
    session_id: Mapped[str] = mapped_column(String(36))
    name: Mapped[str] = mapped_column(String(255))
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    size: Mapped[int] = mapped_column(Integer)
    storage_key: Mapped[str] = mapped_column(String(36))
    state: Mapped[str] = mapped_column(String(40), default="ready")
    scan_status: Mapped[str] = mapped_column(String(40))
    row_count: Mapped[int] = mapped_column(Integer)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)


class Interpretation(Entity, Tenant, Base):
    __tablename__ = "interpretations"
    __table_args__ = (
        ForeignKeyConstraint(["company_id", "file_id"], ["source_files.company_id", "source_files.id"]),
    )
    file_id: Mapped[str] = mapped_column(String(36))
    sheet: Mapped[str] = mapped_column(String(100))
    family: Mapped[str] = mapped_column(String(40))
    mapping: Mapped[dict] = mapped_column(JSON)
    unit: Mapped[str | None] = mapped_column(String(20))
    calendar: Mapped[str | None] = mapped_column(String(20))
    provenance: Mapped[str] = mapped_column(String(40))
    evidence: Mapped[dict] = mapped_column(JSON)


class SourceRow(Entity, Tenant, Base):
    __tablename__ = "source_rows"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        ForeignKeyConstraint(["company_id", "file_id"], ["source_files.company_id", "source_files.id"]),
    )
    file_id: Mapped[str] = mapped_column(String(36))
    sheet: Mapped[str] = mapped_column(String(100))
    row_number: Mapped[int] = mapped_column(Integer)
    values: Mapped[dict] = mapped_column(JSON)


class ProcessingIssue(Entity, Tenant, Versioned, Base):
    __tablename__ = "processing_issues"
    __table_args__ = (
        ForeignKeyConstraint(
            ["company_id", "session_id"], ["processing_sessions.company_id", "processing_sessions.id"]
        ),
    )
    session_id: Mapped[str] = mapped_column(String(36))
    file_id: Mapped[str | None] = mapped_column(String(36))
    code: Mapped[str] = mapped_column(String(60))
    question: Mapped[str] = mapped_column(Text)
    choices: Mapped[list] = mapped_column(JSON)
    evidence: Mapped[dict] = mapped_column(JSON)
    answer: Mapped[dict | None] = mapped_column(JSON)
    answered_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))


class AuditEvent(Entity, Tenant, Base):
    __tablename__ = "audit_events"
    actor_id: Mapped[str | None] = mapped_column(String(36))
    action: Mapped[str] = mapped_column(String(80))
    entity_id: Mapped[str] = mapped_column(String(36))
    details: Mapped[dict] = mapped_column(JSON)


class Job(Entity, Tenant, Base):
    __tablename__ = "outbox_jobs"
    __table_args__ = (UniqueConstraint("company_id", "session_id", "generation"),)
    session_id: Mapped[str] = mapped_column(String(36))
    generation: Mapped[int] = mapped_column(Integer)
    state: Mapped[str] = mapped_column(String(30), default="pending")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    fence: Mapped[int] = mapped_column(Integer, default=0)
    leased_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Idempotency(Entity, Tenant, Base):
    __tablename__ = "idempotency_keys"
    __table_args__ = (UniqueConstraint("company_id", "actor_id", "key"),)
    actor_id: Mapped[str] = mapped_column(String(36))
    key: Mapped[str] = mapped_column(String(128))
    fingerprint: Mapped[str] = mapped_column(String(64))
    response: Mapped[dict] = mapped_column(JSON)


class Fact(Entity, Tenant):
    source_row_id: Mapped[str] = mapped_column(String(36))
    session_id: Mapped[str] = mapped_column(String(36))
    original_unit: Mapped[str] = mapped_column(String(20))
    original_amount: Mapped[str] = mapped_column(String(80))


class JournalLine(Fact, Base):
    __tablename__ = "journal_lines"
    entry_id: Mapped[str] = mapped_column(String(100))
    date: Mapped[CalendarDate] = mapped_column(Date)
    account: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(60))
    party_id: Mapped[str] = mapped_column(String(100), default="")
    debit: Mapped[str] = mapped_column(Money())
    credit: Mapped[str] = mapped_column(Money())
    entry_type: Mapped[str] = mapped_column(String(30))
    reference: Mapped[str] = mapped_column(String(100), default="")


class BankMovement(Fact, Base):
    __tablename__ = "bank_movements"
    __table_args__ = (UniqueConstraint("company_id", "id"),)
    account: Mapped[str] = mapped_column(String(100))
    date: Mapped[CalendarDate] = mapped_column(Date)
    amount: Mapped[str] = mapped_column(Money())
    reference: Mapped[str] = mapped_column(String(100))
    party_id: Mapped[str] = mapped_column(String(100), default="")
    kind: Mapped[str] = mapped_column(String(30), default="movement")
    balance: Mapped[str | None] = mapped_column(Money())
    anchor_cutoff: Mapped[str | None] = mapped_column(String(30))


class Invoice(Fact, Base):
    __tablename__ = "invoices"
    __table_args__ = (UniqueConstraint("company_id", "id"),)
    reference: Mapped[str] = mapped_column(String(100))
    party_id: Mapped[str] = mapped_column(String(100))
    date: Mapped[CalendarDate] = mapped_column(Date)
    due_date: Mapped[CalendarDate | None] = mapped_column(Date, nullable=True)
    amount: Mapped[str] = mapped_column(Money())
    direction: Mapped[str] = mapped_column(String(20))
    tax_id: Mapped[str | None] = mapped_column(String(100))
    tax: Mapped[str | None] = mapped_column(Money())


class Settlement(Fact, Base):
    __tablename__ = "settlements"
    bank_account: Mapped[str | None] = mapped_column(String(100))
    bank_reference: Mapped[str | None] = mapped_column(String(100))
    reference: Mapped[str] = mapped_column(String(100))
    invoice_reference: Mapped[str] = mapped_column(String(100))
    date: Mapped[CalendarDate] = mapped_column(Date)
    amount: Mapped[str] = mapped_column(Money())
    direction: Mapped[str] = mapped_column(String(20))


class InvoiceSnapshot(Fact, Base):
    __tablename__ = "invoice_snapshots"
    party_id: Mapped[str | None] = mapped_column(String(100))
    reference: Mapped[str] = mapped_column(String(100))
    tax_id: Mapped[str] = mapped_column(String(100))
    amount: Mapped[str] = mapped_column(Money())
    tax: Mapped[str | None] = mapped_column(Money())
    date: Mapped[CalendarDate] = mapped_column(Date)
    direction: Mapped[str] = mapped_column(String(20))
    state: Mapped[str] = mapped_column(String(30))
    parent_reference: Mapped[str | None] = mapped_column(String(100))


class PlannedPayment(Entity, Tenant, Versioned, Base):
    __tablename__ = "planned_payments"
    label: Mapped[str] = mapped_column(String(120))
    amount: Mapped[str] = mapped_column(Money())
    due_date: Mapped[CalendarDate] = mapped_column(Date)
    obligation_id: Mapped[str] = mapped_column(String(100))
    invoice_reference: Mapped[str | None] = mapped_column(String(100))
    state: Mapped[str] = mapped_column(String(20), default="confirmed")
    source_row_id: Mapped[str | None] = mapped_column(String(36))
    session_id: Mapped[str | None] = mapped_column(String(36))


class Allocation(Entity, Tenant, Versioned, Base):
    __tablename__ = "allocations"
    __table_args__ = (
        ForeignKeyConstraint(["company_id", "bank_id"], ["bank_movements.company_id", "bank_movements.id"]),
        ForeignKeyConstraint(["company_id", "invoice_id"], ["invoices.company_id", "invoices.id"]),
    )
    bank_id: Mapped[str] = mapped_column(String(36))
    invoice_id: Mapped[str] = mapped_column(String(36))
    amount: Mapped[str] = mapped_column(Money())
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    reversed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reversed_by: Mapped[str | None] = mapped_column(String(36))
    reversal_reason: Mapped[str | None] = mapped_column(Text)


class ResultManifest(Entity, Tenant, Base):
    __tablename__ = "result_manifests"
    __table_args__ = (UniqueConstraint("company_id", "id"), UniqueConstraint("company_id", "session_id"))
    session_id: Mapped[str] = mapped_column(String(36))
    period_id: Mapped[str] = mapped_column(String(36))
    digest: Mapped[str] = mapped_column(String(64))
    selection: Mapped[dict] = mapped_column(JSON)
    metrics: Mapped[list] = mapped_column(JSON)
    details: Mapped[dict] = mapped_column(JSON)


class Report(Entity, Tenant, Base):
    __tablename__ = "reports"
    __table_args__ = (
        ForeignKeyConstraint(
            ["company_id", "manifest_id"], ["result_manifests.company_id", "result_manifests.id"]
        ),
    )
    manifest_id: Mapped[str] = mapped_column(String(36), unique=True)
    title: Mapped[str] = mapped_column(String(150))
    version: Mapped[int] = mapped_column(Integer, default=1)


class ReportApproval(Entity, Tenant, Base):
    __tablename__ = "report_approvals"
    __table_args__ = (UniqueConstraint("report_id", "actor_id"),)
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"))
    report_version: Mapped[int] = mapped_column(Integer)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    permission_provenance: Mapped[str] = mapped_column(String(80))


class Finding(Entity, Tenant, Versioned, Base):
    __tablename__ = "findings"
    manifest_id: Mapped[str] = mapped_column(String(36))
    code: Mapped[str] = mapped_column(String(60))
    title: Mapped[str] = mapped_column(String(150))
    evidence: Mapped[list] = mapped_column(JSON)
    state: Mapped[str] = mapped_column(String(30), default="open")
    decision: Mapped[dict | None] = mapped_column(JSON)


class Notification(Entity, Tenant, Versioned, Base):
    __tablename__ = "notifications"
    title: Mapped[str] = mapped_column(String(150))
    href: Mapped[str] = mapped_column(String(200))
    read: Mapped[bool] = mapped_column(Boolean, default=False)


class BudgetPolicy(Entity, Tenant, Versioned, Base):
    __tablename__ = "budget_policies"
    cap: Mapped[str] = mapped_column(String(80))
    currency: Mapped[str] = mapped_column(String(20), default="USD")
    period: Mapped[str] = mapped_column(String(20))
    actor_id: Mapped[str] = mapped_column(String(36))


# Company-qualified references protect against accidental cross-company writes.
for fact_type in [JournalLine, BankMovement, Invoice, Settlement, InvoiceSnapshot]:
    fact_type.__table__.append_constraint(
        ForeignKeyConstraint(["company_id", "source_row_id"], ["source_rows.company_id", "source_rows.id"])
    )
    fact_type.__table__.append_constraint(
        ForeignKeyConstraint(
            ["company_id", "session_id"], ["processing_sessions.company_id", "processing_sessions.id"]
        )
    )


class InstallationAudit(Entity, Base):
    """Audit installation account management independently of company membership."""

    __tablename__ = "installation_audit_events"
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    actor_label: Mapped[str] = mapped_column(String(150), default="installation_cli")
    action: Mapped[str] = mapped_column(String(80))
    entity_id: Mapped[str] = mapped_column(String(36))
    details: Mapped[dict] = mapped_column(JSON)


class InstallationIdempotency(Entity, Base):
    __tablename__ = "installation_idempotency_keys"
    __table_args__ = (UniqueConstraint("actor_id", "key"),)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    key: Mapped[str] = mapped_column(String(128))
    fingerprint: Mapped[str] = mapped_column(String(64))
    response: Mapped[dict] = mapped_column(JSON)


# Tenant-qualified referential integrity complements RLS and service checks.
Period.__table__.append_constraint(UniqueConstraint("company_id", "id"))
Report.__table__.append_constraint(UniqueConstraint("company_id", "id"))
for child in [ProcessingSession, ResultManifest]:
    child.__table__.append_constraint(
        ForeignKeyConstraint(
            ["company_id", "period_id"], ["financial_periods.company_id", "financial_periods.id"]
        )
    )
for child in [Job, ResultManifest, PlannedPayment]:
    child.__table__.append_constraint(
        ForeignKeyConstraint(
            ["company_id", "session_id"], ["processing_sessions.company_id", "processing_sessions.id"]
        )
    )
ReportApproval.__table__.append_constraint(
    ForeignKeyConstraint(["company_id", "report_id"], ["reports.company_id", "reports.id"])
)
Finding.__table__.append_constraint(
    ForeignKeyConstraint(
        ["company_id", "manifest_id"], ["result_manifests.company_id", "result_manifests.id"]
    )
)
PlannedPayment.__table__.append_constraint(
    ForeignKeyConstraint(["company_id", "source_row_id"], ["source_rows.company_id", "source_rows.id"])
)
ProcessingIssue.__table__.append_constraint(
    ForeignKeyConstraint(["company_id", "file_id"], ["source_files.company_id", "source_files.id"])
)


class InstallationModelBudget(Entity, Versioned, Base):
    """One explicitly configured USD budget for an installation billing month."""

    __tablename__ = "installation_model_budgets"
    __table_args__ = (UniqueConstraint("period"),)
    period: Mapped[str] = mapped_column(String(7))
    cap: Mapped[str] = mapped_column(String(80))
    per_session_cap: Mapped[str | None] = mapped_column(String(80))
    used: Mapped[str] = mapped_column(String(80), default="0")
    reserved: Mapped[str] = mapped_column(String(80), default="0")
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))


class ModelTariff(Entity, Tenant, Base):
    __tablename__ = "model_tariffs"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        UniqueConstraint("company_id", "model", "price_version"),
    )
    model: Mapped[str] = mapped_column(String(60))
    price_version: Mapped[str] = mapped_column(String(60))
    currency: Mapped[str] = mapped_column(String(10), default="USD")
    input_per_million: Mapped[str] = mapped_column(String(80))
    cached_input_per_million: Mapped[str] = mapped_column(String(80))
    cache_write_per_million: Mapped[str] = mapped_column(String(80))
    output_per_million: Mapped[str] = mapped_column(String(80))
    max_input_tokens: Mapped[int] = mapped_column(Integer)
    max_output_tokens: Mapped[int] = mapped_column(Integer)
    effective_from: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ModelRequest(Entity, Tenant, Versioned, Base):
    __tablename__ = "model_requests"
    __table_args__ = (UniqueConstraint("company_id", "id"), UniqueConstraint("company_id", "request_key"))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    session_id: Mapped[str | None] = mapped_column(String(36))
    session_version: Mapped[int | None] = mapped_column(Integer)
    job_id: Mapped[str | None] = mapped_column(String(36))
    fence: Mapped[int | None] = mapped_column(Integer)
    request_key: Mapped[str] = mapped_column(String(128))
    input_hash: Mapped[str] = mapped_column(String(64))
    purpose: Mapped[str] = mapped_column(String(50))
    model: Mapped[str] = mapped_column(String(60))
    prompt_version: Mapped[str] = mapped_column(String(40))
    state: Mapped[str] = mapped_column(String(30), default="pending")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_code: Mapped[str | None] = mapped_column(String(60))
    dispatch_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    provider_response_id: Mapped[str | None] = mapped_column(String(100))
    usage: Mapped[dict | None] = mapped_column(JSON)
    proposal: Mapped[dict | None] = mapped_column(JSON)


class BudgetReservation(Entity, Tenant, Base):
    __tablename__ = "budget_reservations"
    __table_args__ = (
        UniqueConstraint("company_id", "request_id", "attempt"),
        ForeignKeyConstraint(
            ["company_id", "request_id"], ["model_requests.company_id", "model_requests.id"]
        ),
        ForeignKeyConstraint(["company_id", "tariff_id"], ["model_tariffs.company_id", "model_tariffs.id"]),
    )
    request_id: Mapped[str] = mapped_column(String(36))
    tariff_id: Mapped[str] = mapped_column(String(36))
    installation_budget_id: Mapped[str] = mapped_column(ForeignKey("installation_model_budgets.id"))
    period: Mapped[str] = mapped_column(String(7))
    attempt: Mapped[int] = mapped_column(Integer)
    amount: Mapped[str] = mapped_column(String(80))
    actual_cost: Mapped[str | None] = mapped_column(String(80))
    state: Mapped[str] = mapped_column(String(20), default="held")


Job.__table__.append_constraint(UniqueConstraint("company_id", "id"))
ModelRequest.__table__.append_constraint(
    ForeignKeyConstraint(
        ["company_id", "session_id"], ["processing_sessions.company_id", "processing_sessions.id"]
    )
)
ModelRequest.__table__.append_constraint(
    ForeignKeyConstraint(["company_id", "job_id"], ["outbox_jobs.company_id", "outbox_jobs.id"])
)


class ReconciliationRun(Entity, Tenant, Base):
    __tablename__ = "reconciliation_runs"
    __table_args__ = (
        UniqueConstraint("company_id", "id"),
        ForeignKeyConstraint(
            ["company_id", "manifest_id"], ["result_manifests.company_id", "result_manifests.id"]
        ),
    )
    manifest_id: Mapped[str] = mapped_column(String(36))
    version: Mapped[int] = mapped_column(Integer, default=1)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    bank_to_ledger: Mapped[dict] = mapped_column(JSON)
    candidates: Mapped[list] = mapped_column(JSON)
    policy_version: Mapped[str] = mapped_column(String(50), default="reconciliation-exact-1")


class ReconciliationDecision(Entity, Tenant, Base):
    __tablename__ = "reconciliation_decisions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["company_id", "run_id"], ["reconciliation_runs.company_id", "reconciliation_runs.id"]
        ),
    )
    run_id: Mapped[str] = mapped_column(String(36))
    proposal_id: Mapped[str] = mapped_column(String(36), index=True)
    bank_id: Mapped[str] = mapped_column(String(36))
    ledger_ids: Mapped[list] = mapped_column(JSON)
    decision: Mapped[str] = mapped_column(String(30))
    version: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(Text)
    actor_id: Mapped[str | None] = mapped_column(String(36))
    provenance: Mapped[str] = mapped_column(String(40))
    controls: Mapped[dict] = mapped_column(JSON)


ReconciliationDecision.__table__.append_constraint(
    ForeignKeyConstraint(["company_id", "bank_id"], ["bank_movements.company_id", "bank_movements.id"])
)


# PostgreSQL NUMERIC permits NaN; finite bounds remain a database invariant too.
for financial_type, money_fields in [
    (JournalLine, ("debit", "credit")),
    (BankMovement, ("amount", "balance")),
    (Invoice, ("amount", "tax")),
    (Settlement, ("amount",)),
    (InvoiceSnapshot, ("amount", "tax")),
    (PlannedPayment, ("amount",)),
    (Allocation, ("amount",)),
]:
    for money_field in money_fields:
        financial_type.__table__.append_constraint(
            CheckConstraint(
                f"{money_field} > -100000000000000000000000000000000 AND {money_field} < 100000000000000000000000000000000",
                name=f"finite_{financial_type.__tablename__}_{money_field}",
            ).ddl_if(dialect="postgresql")
        )


Period.__table__.append_constraint(
    ForeignKeyConstraint(
        ["company_id", "previous_period_id"], ["financial_periods.company_id", "financial_periods.id"]
    )
)

ReconciliationDecision.__table__.append_constraint(UniqueConstraint("company_id", "bank_id", "version"))


class CompanyModule(Entity, Tenant, Versioned, Base):
    """Mutable company preferences; financial evidence is retained independently."""
    __tablename__ = "company_modules"
    __table_args__ = (UniqueConstraint("company_id", "key"),)
    key: Mapped[str] = mapped_column(String(40))
    enabled: Mapped[bool] = mapped_column(Boolean)


class PersonnelRecord(Fact, Base):
    """Immutable source-backed personnel/payroll row; never a bank settlement."""
    __tablename__ = "personnel_records"
    __table_args__ = (
        ForeignKeyConstraint(["company_id", "source_row_id"], ["source_rows.company_id", "source_rows.id"]),
        ForeignKeyConstraint(["company_id", "session_id"], ["processing_sessions.company_id", "processing_sessions.id"]),
        UniqueConstraint("company_id", "source_row_id"),
    )
    kind: Mapped[str] = mapped_column(String(20))
    employee_id: Mapped[str] = mapped_column(String(100))
    employee_name: Mapped[str] = mapped_column(String(150))
    date: Mapped[CalendarDate] = mapped_column(Date)
    values: Mapped[dict] = mapped_column(JSON)


class BotConnection(Entity, Versioned, Base):
    """Global identity router, never a store of financial content.

    company_ref deliberately differs from Tenant.company_id: unauthenticated
    provider ingress must resolve the company before entering its RLS transaction.
    Only the binding service accesses this table; every operation checks ownership
    and current membership before accessing any company-scoped financial data.
    """
    __tablename__ = "bot_connections"
    provider: Mapped[str] = mapped_column(String(12), index=True)
    company_ref: Mapped[str] = mapped_column(ForeignKey("companies.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    state: Mapped[str] = mapped_column(String(30), default="pending")
    sender_id: Mapped[str | None] = mapped_column(String(30))
    chat_id: Mapped[str | None] = mapped_column(String(30))


class BotUpdate(Entity, Base):
    """Global replay journal without message text or financial responses."""
    __tablename__ = "bot_updates"
    __table_args__ = (UniqueConstraint("provider", "update_id"),)
    provider: Mapped[str] = mapped_column(String(12))
    update_id: Mapped[str] = mapped_column(String(30))
    connection_id: Mapped[str | None] = mapped_column(ForeignKey("bot_connections.id"), index=True)
    state: Mapped[str] = mapped_column(String(30), default="claimed")
