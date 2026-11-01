from collections.abc import Iterator
from contextlib import contextmanager
from urllib.parse import urlsplit

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session

from .config import settings
from .models import Base

engine = create_engine(settings.database_url, connect_args={"check_same_thread": False, "timeout": 30} if settings.database_url.startswith("sqlite") else {}, pool_pre_ping=True)
SCHEMA_VERSION = 1
SCHEMA_LOCK = 2026110101
SCHEMA_TABLE_DDL = "CREATE TABLE IF NOT EXISTS didban_schema_version (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL)"
IMMUTABLE = ("personnel_records", "reconciliation_runs", "reconciliation_decisions","model_tariffs", "installation_audit_events", "source_rows", "interpretations", "audit_events", "journal_lines", "bank_movements", "invoices", "settlements", "invoice_snapshots", "result_manifests", "reports", "report_approvals")

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
            statements.extend([
                f"ALTER TABLE {name} ENABLE ROW LEVEL SECURITY",
                f"ALTER TABLE {name} FORCE ROW LEVEL SECURITY",
                f"DROP POLICY IF EXISTS tenant_isolation ON {name}",
                f"CREATE POLICY tenant_isolation ON {name} USING (company_id = current_setting('didban.company_id',true)) WITH CHECK (company_id = current_setting('didban.company_id',true))",
            ])
    statements.extend([
        "DROP POLICY IF EXISTS own_membership ON memberships",
        "CREATE POLICY own_membership ON memberships FOR SELECT USING (user_id = current_setting('didban.user_id',true))",
    ])
    statements.append("CREATE OR REPLACE FUNCTION deny_fact_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable fact'; END $$")
    for name in IMMUTABLE:
        statements.extend([
            f"DROP TRIGGER IF EXISTS immutable_fact ON {name}",
            f"CREATE TRIGGER immutable_fact BEFORE UPDATE OR DELETE ON {name} FOR EACH ROW EXECUTE FUNCTION deny_fact_change()",
        ])
    return statements


def initialize() -> None:
    if settings.production and engine.dialect.name != "postgresql":
        raise RuntimeError("Production requires PostgreSQL")
    if settings.production:
        origin = urlsplit(settings.web_origin)
        if origin.scheme != "https" or not origin.hostname or origin.path not in ("", "/") or origin.query or origin.fragment:
            raise RuntimeError("Production requires an HTTPS web origin and a TLS reverse proxy")
    # API and worker may start together. One transaction holds the DDL lease through
    # table creation and security policy installation; rollback releases it on failure.
    with engine.begin() as conn:
        if engine.dialect.name == "postgresql":
            conn.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": SCHEMA_LOCK})
            if settings.production:
                privileged = conn.execute(text("SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user")).scalar()
                if privileged:
                    raise RuntimeError("Application role must not be superuser or bypass RLS")
        else:
            conn.exec_driver_sql("BEGIN IMMEDIATE")
        conn.execute(text(SCHEMA_TABLE_DDL))
        conn.execute(text("INSERT INTO didban_schema_version (id, version) VALUES (1, :version) ON CONFLICT (id) DO NOTHING"), {"version": SCHEMA_VERSION})
        version = conn.execute(text("SELECT version FROM didban_schema_version WHERE id=1")).scalar()
        if version != SCHEMA_VERSION:
            raise RuntimeError("Unsupported schema version; run the explicit versioned migration before starting")
        Base.metadata.create_all(conn)
        if engine.dialect.name == "postgresql":
            for statement in postgres_security_statements():
                conn.execute(text(statement))
        else:
            for name in IMMUTABLE:
                for operation in ("UPDATE", "DELETE"):
                    conn.execute(text(f"CREATE TRIGGER IF NOT EXISTS immutable_{name}_{operation} BEFORE {operation} ON {name} BEGIN SELECT RAISE(ABORT, 'immutable fact'); END"))


@contextmanager
def transaction(company_id: str | None = None) -> Iterator[Session]:
    with Session(engine, expire_on_commit=False) as db:
        with db.begin():
            # A short transaction serializes capacity/versions. No external calls inside.
            if engine.dialect.name == "sqlite":
                db.execute(text("BEGIN IMMEDIATE"))
            elif company_id:
                db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:company,0))"), {"company": company_id})
                db.execute(text("SELECT set_config('didban.company_id', :company, true)"), {"company": company_id})
            yield db
