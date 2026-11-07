from collections.abc import Iterator
from contextlib import contextmanager
from urllib.parse import urlsplit

from sqlalchemy import CheckConstraint, create_engine, event, inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session
from sqlalchemy.schema import AddConstraint

from .config import settings
from .models import Base, register_money_constraints
from .schema_readiness import require_current_schema

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False, "timeout": 30}
    if settings.database_url.startswith("sqlite")
    else {},
    pool_pre_ping=True,
)
SCHEMA_VERSION = 1
SCHEMA_LOCK = 2026110101
SCHEMA_TABLE_DDL = "CREATE TABLE IF NOT EXISTS didban_schema_version (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL)"
IMMUTABLE = (
    "personnel_records",
    "reconciliation_runs",
    "reconciliation_decisions",
    "model_tariffs",
    "installation_audit_events",
    "source_rows",
    "interpretations",
    "audit_events",
    "journal_lines",
    "bank_movements",
    "invoices",
    "settlements",
    "invoice_snapshots",
    "result_manifests",
    "reports",
    "report_approvals",
)
IMMUTABLE += (
    "native_journals",
    "native_statement_runs",
    "native_statement_approvals",
    "native_opening_evidence",
    "native_zero_opening_evidence",
    "period_accounting_drafts",
    "bot_posting_reviews",
    "native_book_report_runs",
    "journal_correction_drafts",
    "accounting_operations",
    "operation_learning_events",
    "intercompany_mappings",
    "draft_consolidation_runs",
    "consolidation_approvals",
    "cheque_events",
    "cheque_clearances",
    "cash_scenarios",
    "report_builder_runs",
    "native_report_builder_runs",
    "native_invoice_builder_runs",
    "native_document_activities",
    "native_control_runs",
    "native_invoice_terms",
    "native_invoice_source_revisions",
    "native_invoice_allocations",
    "native_invoice_allocation_reversals",
    "native_invoice_snapshots",
    "native_forecast_runs",
    "native_bank_match_previews",
    "native_automation_previews",
    "native_automation_runs",
    "native_cash_scenarios",
    "control_activities",
    "automation_runs",
    "automation_previews",
    "group_match_decisions",
    "manual_group_previews",
    "account_import_previews",
    "company_comparison_runs",
    "dimension_allocations",
    "native_dimension_allocations",
    "native_dimension_report_runs",
    "operation_learning_corrections",
    "dimension_report_runs",
    "period_lock_events",
    "bot_extraction_proposals",
    "bot_extraction_reviews",
)

if engine.dialect.name == "sqlite":

    @event.listens_for(engine, "connect")
    def pragmas(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA journal_mode=WAL")


def postgres_security_statements() -> list[str]:
    statements = []
    for table in Base.metadata.sorted_tables:
        if "company_id" in table.c:
            name = table.name
            statements.extend(
                [
                    f"ALTER TABLE {name} ENABLE ROW LEVEL SECURITY",
                    f"ALTER TABLE {name} FORCE ROW LEVEL SECURITY",
                    f"DROP POLICY IF EXISTS tenant_isolation ON {name}",
                    f"CREATE POLICY tenant_isolation ON {name} USING (company_id = current_setting('didban.company_id',true)) WITH CHECK (company_id = current_setting('didban.company_id',true))",
                ]
            )
    statements.extend(
        [
            "DROP POLICY IF EXISTS own_membership ON memberships",
            "CREATE POLICY own_membership ON memberships FOR SELECT USING (user_id = current_setting('didban.user_id',true))",
        ]
    )
    statements.append(
        "CREATE OR REPLACE FUNCTION deny_fact_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable fact'; END $$"
    )
    for name in IMMUTABLE:
        statements.extend(
            [
                f"DROP TRIGGER IF EXISTS immutable_fact ON {name}",
                f"CREATE TRIGGER immutable_fact BEFORE UPDATE OR DELETE ON {name} FOR EACH ROW EXECUTE FUNCTION deny_fact_change()",
            ]
        )
    statements.extend(native_invoice_source_guards("postgresql"))
    return statements


def native_invoice_source_guards(dialect: str) -> list[str]:
    columns = ("id", "company_id", "operation_id", "direction", "source", "actor_id", "created_at")
    if dialect == "postgresql":
        changes = " OR ".join(
            f"NEW.{column}::jsonb IS DISTINCT FROM OLD.{column}::jsonb"
            if column == "source"
            else f"NEW.{column} IS DISTINCT FROM OLD.{column}"
            for column in columns
        )
        return [
            "CREATE OR REPLACE FUNCTION deny_native_invoice_source_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN "
            "IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'immutable native invoice source'; END IF; "
            f"IF {changes} THEN RAISE EXCEPTION 'immutable native invoice source'; END IF; RETURN NEW; END $$",
            "DROP TRIGGER IF EXISTS immutable_native_invoice_source ON native_invoices",
            "CREATE TRIGGER immutable_native_invoice_source BEFORE UPDATE OR DELETE ON native_invoices FOR EACH ROW EXECUTE FUNCTION deny_native_invoice_source_change()",
        ]
    changes = " OR ".join(f"NEW.{column} IS NOT OLD.{column}" for column in columns)
    return [
        f"CREATE TRIGGER IF NOT EXISTS immutable_native_invoice_source_update BEFORE UPDATE ON native_invoices WHEN {changes} BEGIN SELECT RAISE(ABORT, 'immutable native invoice source'); END",
        "CREATE TRIGGER IF NOT EXISTS immutable_native_invoice_source_delete BEFORE DELETE ON native_invoices BEGIN SELECT RAISE(ABORT, 'immutable native invoice source'); END",
    ]


def install_missing_money_constraints(connection: Connection) -> None:
    """Add and validate bounds on existing tables without rewriting financial data."""
    inspector = inspect(connection)
    for table in Base.metadata.sorted_tables:
        expected = [
            constraint
            for constraint in table.constraints
            if isinstance(constraint, CheckConstraint)
            and constraint.name
            and constraint.name.startswith("finite_")
        ]
        if not expected:
            continue
        installed = {item["name"] for item in inspector.get_check_constraints(table.name)}
        for constraint in sorted(expected, key=lambda item: item.name):
            if constraint.name not in installed:
                connection.execute(AddConstraint(constraint))


def initialize() -> None:
    register_money_constraints()
    if settings.production and engine.dialect.name != "postgresql":
        raise RuntimeError("Production requires PostgreSQL")
    if settings.production:
        origin = urlsplit(settings.web_origin)
        if (
            origin.scheme != "https"
            or not origin.hostname
            or origin.path not in ("", "/")
            or origin.query
            or origin.fragment
        ):
            raise RuntimeError("Production requires an HTTPS web origin and a TLS reverse proxy")
    # API and worker may start together. One transaction holds the DDL lease through
    # table creation and security policy installation; rollback releases it on failure.
    with engine.begin() as conn:
        if engine.dialect.name == "postgresql":
            conn.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": SCHEMA_LOCK})
            if settings.production:
                privileged = conn.execute(
                    text("SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user")
                ).scalar()
                if privileged:
                    raise RuntimeError("Application role must not be superuser or bypass RLS")
        else:
            conn.exec_driver_sql("BEGIN IMMEDIATE")
        conn.execute(text(SCHEMA_TABLE_DDL))
        conn.execute(
            text(
                "INSERT INTO didban_schema_version (id, version) VALUES (1, :version) ON CONFLICT (id) DO NOTHING"
            ),
            {"version": SCHEMA_VERSION},
        )
        version = conn.execute(text("SELECT version FROM didban_schema_version WHERE id=1")).scalar()
        if version != SCHEMA_VERSION:
            raise RuntimeError(
                "Unsupported schema version; run the explicit versioned migration before starting"
            )
        # Additive company-qualified key required by accounting permission references.
        if inspect(conn).has_table("memberships"):
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS accounting_membership_tenant_key ON memberships (company_id, id)"
                )
            )
        if inspect(conn).has_table("accounting_operations"):
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS operation_tenant_key ON accounting_operations (company_id, id)"
                )
            )
        if inspect(conn).has_table("accounting_drafts"):
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS accounting_draft_tenant_key ON accounting_drafts (company_id, id)"
                )
            )
        if inspect(conn).has_table("findings"):
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS control_finding_tenant_key ON findings (company_id, id)"
                )
            )
        if inspect(conn).has_table("native_statement_runs"):
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS native_statement_tenant_key ON native_statement_runs (company_id, id)"
                )
            )
        if inspect(conn).has_table("native_invoice_snapshots"):
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS native_invoice_snapshot_tenant_key ON native_invoice_snapshots (company_id, id)"
                )
            )
        Base.metadata.create_all(conn)
        require_current_schema(conn, Base.metadata)
        if engine.dialect.name == "postgresql":
            install_missing_money_constraints(conn)
            for statement in postgres_security_statements():
                conn.execute(text(statement))
        else:
            for name in IMMUTABLE:
                for operation in ("UPDATE", "DELETE"):
                    conn.execute(
                        text(
                            f"CREATE TRIGGER IF NOT EXISTS immutable_{name}_{operation} BEFORE {operation} ON {name} BEGIN SELECT RAISE(ABORT, 'immutable fact'); END"
                        )
                    )
            for statement in native_invoice_source_guards("sqlite"):
                conn.execute(text(statement))


@contextmanager
def transaction(company_id: str | None = None) -> Iterator[Session]:
    with Session(engine, expire_on_commit=False) as db:
        with db.begin():
            # A short transaction serializes capacity/versions. No external calls inside.
            if engine.dialect.name == "sqlite":
                db.execute(text("BEGIN IMMEDIATE"))
            elif company_id:
                db.execute(
                    text("SELECT pg_advisory_xact_lock(hashtextextended(:company,0))"),
                    {"company": company_id},
                )
                db.execute(
                    text("SELECT set_config('didban.company_id', :company, true)"), {"company": company_id}
                )
            yield db
