from collections.abc import Iterator
from contextlib import contextmanager
from decimal import Decimal, localcontext
from urllib.parse import urlsplit

from sqlalchemy import CheckConstraint, create_engine, event, inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session
from sqlalchemy.schema import AddConstraint

from . import commercial_doc_models as _commercial_doc_models  # noqa: F401
from . import treasury_models as _treasury_models  # noqa: F401
from .config import settings
from .models import Base, register_money_constraints
from .money_type import canonical_money
from .schema_readiness import require_current_schema

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False, "timeout": 30}
    if settings.database_url.startswith("sqlite")
    else {},
    pool_pre_ping=True,
)
SCHEMA_VERSION = 2
SCHEMA_LOCK = 2026110101
SCHEMA_TABLE_DDL = "CREATE TABLE IF NOT EXISTS didban_schema_version (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL)"
IMMUTABLE = (
    "numbering_assignments",
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
    "inventory_movements",
    "moadian_transmissions",
    "moadian_transmission_events",
    "operation_learning_events",
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
    "dimension_allocations",
    "native_dimension_allocations",
    "native_dimension_report_runs",
    "operation_learning_corrections",
    "dimension_report_runs",
    "period_lock_events",
    "bot_extraction_proposals",
    "bot_extraction_reviews",
)


def resolve_immutable_tables() -> tuple[str, ...]:
    """Resolve all tables marked immutable either via registry mixin or canonical list."""
    names = set(IMMUTABLE)
    for mapper in Base.registry.mappers:
        cls = getattr(mapper, "class_", None)
        if cls and getattr(cls, "__immutable_fact__", False):
            if hasattr(mapper, "local_table") and mapper.local_table is not None:
                names.add(mapper.local_table.name)
    return tuple(sorted(names))


def obsolete_inventory_catalogue_guards(dialect: str) -> list[str]:
    tables = ("inventory_items", "inventory_warehouses")
    if dialect == "postgresql":
        return [f"DROP TRIGGER IF EXISTS immutable_fact ON {table}" for table in tables]
    return [
        f"DROP TRIGGER IF EXISTS immutable_{table}_{operation}"
        for table in tables
        for operation in ("UPDATE", "DELETE")
    ]


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
    for name in resolve_immutable_tables():
        statements.extend(
            [
                f"DROP TRIGGER IF EXISTS immutable_fact ON {name}",
                f"CREATE TRIGGER immutable_fact BEFORE UPDATE OR DELETE ON {name} FOR EACH ROW EXECUTE FUNCTION deny_fact_change()",
            ]
        )
    statements.extend(obsolete_inventory_catalogue_guards("postgresql"))
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


def _ensure_money_column(
    conn: Connection,
    dialect: str,
    table_name: str,
    column_name: str,
    default_value: str,
    *,
    nullable: bool,
) -> None:
    """Add or normalize a Money column to PostgreSQL NUMERIC(38, 6) or SQLite TEXT."""
    cols = {c["name"]: c for c in inspect(conn).get_columns(table_name)}
    null_sql = "" if nullable else " NOT NULL"
    if column_name not in cols:
        ddl = (
            f"NUMERIC(38, 6){null_sql} DEFAULT {default_value}"
            if dialect == "postgresql"
            else f"TEXT{null_sql} DEFAULT '{default_value}'"
        )
        conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {ddl}"))
        return
    if dialect == "postgresql" and "NUMERIC" not in str(cols[column_name]["type"]).upper():
        conn.execute(text(f"ALTER TABLE {table_name} ALTER COLUMN {column_name} DROP DEFAULT"))
        expr = (
            f"NULLIF(TRIM({column_name}), '')::numeric(38, 6)"
            if nullable
            else f"COALESCE(NULLIF(TRIM({column_name}), ''), '{default_value}')::numeric(38, 6)"
        )
        conn.execute(
            text(f"ALTER TABLE {table_name} ALTER COLUMN {column_name} TYPE NUMERIC(38, 6) USING {expr}")
        )
        conn.execute(text(f"ALTER TABLE {table_name} ALTER COLUMN {column_name} SET DEFAULT {default_value}"))


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
    """Create a fresh installation or check a versioned installation before startup."""
    _prepare_schema(upgrade=False)


def migrate_schema() -> None:
    """Apply the supported legacy-to-v2 upgrade in a single transaction."""
    _prepare_schema(upgrade=True)


def _prepare_schema(*, upgrade: bool) -> None:
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
        inspector = inspect(conn)
        tracked = inspector.has_table("didban_schema_version")
        installed = tracked or inspector.has_table("companies")
        version = conn.execute(text("SELECT version FROM didban_schema_version WHERE id=1")).scalar() if tracked else None
        if version == SCHEMA_VERSION:
            require_current_schema(conn, Base.metadata)
            return
        if installed and (not upgrade or version not in (None, 1)):
            raise RuntimeError(
                f"Database schema version {version if version is not None else 'untracked'} is incompatible "
                f"with version {SCHEMA_VERSION}. Run python -m didban.migrate before starting."
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
        if inspect(conn).has_table("employee_contracts"):
            cols = {c["name"] for c in inspect(conn).get_columns("employee_contracts")}
            for col_name, col_ddl in (
                ("workshop_id", "VARCHAR(36)"),
                ("work_location", "VARCHAR(200)"),
                ("work_description", "VARCHAR(300)"),
                ("conclusion_date", "DATE"),
                ("amendment_of_contract_id", "VARCHAR(36)"),
            ):
                if col_name not in cols:
                    conn.execute(text(f"ALTER TABLE employee_contracts ADD COLUMN {col_name} {col_ddl}"))
            _ensure_money_column(conn, engine.dialect.name, "employee_contracts", "weekly_hours", "44", nullable=True)
        if inspect(conn).has_table("payroll_slips"):
            cols = {c["name"] for c in inspect(conn).get_columns("payroll_slips")}
            for col_name, col_ddl in (
                ("attendance_status", "VARCHAR(30) NOT NULL DEFAULT 'verified'"),
                ("contract_snapshot", "JSON"),
                ("calculation_meta", "JSON"),
                ("payment_journal_id", "VARCHAR(36)"),
            ):
                if col_name not in cols:
                    conn.execute(text(f"ALTER TABLE payroll_slips ADD COLUMN {col_name} {col_ddl}"))
        if inspect(conn).has_table("moadian_transmissions"):
            cols = {c["name"] for c in inspect(conn).get_columns("moadian_transmissions")}
            needs_subject_upgrade = "invoice_subject" not in cols or "commercial_document_id" not in cols
            if needs_subject_upgrade:
                if engine.dialect.name == "sqlite":
                    for op in ("UPDATE", "DELETE"):
                        conn.execute(text(f"DROP TRIGGER IF EXISTS immutable_moadian_transmissions_{op}"))
                    conn.execute(
                        text(
                            "CREATE TABLE moadian_transmissions_new ("
                            "id VARCHAR(36) NOT NULL PRIMARY KEY, "
                            "created_at DATETIME NOT NULL, "
                            "company_id VARCHAR(36) NOT NULL REFERENCES companies(id), "
                            "invoice_id VARCHAR(36) NOT NULL, "
                            "invoice_version INTEGER NOT NULL, "
                            "commercial_document_id VARCHAR(36), "
                            "document_digest VARCHAR(64), "
                            "invoice_subject INTEGER NOT NULL DEFAULT 1, "
                            "reference_tax_id VARCHAR(22), "
                            "invoice_reference VARCHAR(120) NOT NULL, "
                            "tax_id VARCHAR(22) NOT NULL, "
                            "uid VARCHAR(36) NOT NULL, "
                            "memory_id VARCHAR(6) NOT NULL, "
                            "serial VARCHAR(10) NOT NULL, "
                            "seller_tax_number VARCHAR(20) NOT NULL, "
                            "digest VARCHAR(64) NOT NULL, "
                            "payload JSON NOT NULL, "
                            "input JSON NOT NULL, "
                            "actor_id VARCHAR(36) NOT NULL, "
                            "UNIQUE (company_id, id), "
                            "UNIQUE (company_id, invoice_id, invoice_subject), "
                            "UNIQUE (company_id, tax_id), "
                            "UNIQUE (company_id, memory_id, serial), "
                            "UNIQUE (company_id, uid), "
                            "FOREIGN KEY(company_id, invoice_id) REFERENCES native_invoices (company_id, id))"
                        )
                    )
                    conn.execute(
                        text(
                            "INSERT INTO moadian_transmissions_new "
                            "(id, created_at, company_id, invoice_id, invoice_version, commercial_document_id, document_digest, invoice_subject, reference_tax_id, invoice_reference, tax_id, uid, memory_id, serial, seller_tax_number, digest, payload, input, actor_id) "
                            "SELECT id, created_at, company_id, invoice_id, invoice_version, NULL, NULL, 1, NULL, invoice_reference, tax_id, uid, memory_id, serial, seller_tax_number, digest, payload, input, actor_id FROM moadian_transmissions"
                        )
                    )
                    conn.execute(text("DROP TABLE moadian_transmissions"))
                    conn.execute(text("ALTER TABLE moadian_transmissions_new RENAME TO moadian_transmissions"))
                    conn.execute(
                        text(
                            "CREATE INDEX IF NOT EXISTS ix_moadian_transmissions_company_id "
                            "ON moadian_transmissions (company_id)"
                        )
                    )
                else:
                    for col_name, col_ddl in (
                        ("commercial_document_id", "VARCHAR(36)"),
                        ("document_digest", "VARCHAR(64)"),
                        ("invoice_subject", "INTEGER NOT NULL DEFAULT 1"),
                        ("reference_tax_id", "VARCHAR(22)"),
                    ):
                        if col_name not in cols:
                            conn.execute(text(f"ALTER TABLE moadian_transmissions ADD COLUMN {col_name} {col_ddl}"))
                    for uc in inspect(conn).get_unique_constraints("moadian_transmissions"):
                        if uc.get("column_names") == ["company_id", "invoice_id"]:
                            conn.execute(text(f"ALTER TABLE moadian_transmissions DROP CONSTRAINT {uc['name']}"))
                    conn.execute(
                        text(
                            "ALTER TABLE moadian_transmissions ADD CONSTRAINT uq_moadian_invoice_subject "
                            "UNIQUE (company_id, invoice_id, invoice_subject)"
                        )
                    )
        bool_true = "TRUE" if engine.dialect.name == "postgresql" else "1"
        if inspect(conn).has_table("inventory_items"):
            cols = {c["name"] for c in inspect(conn).get_columns("inventory_items")}
            if "active" not in cols:
                conn.execute(text(f"ALTER TABLE inventory_items ADD COLUMN active BOOLEAN NOT NULL DEFAULT {bool_true}"))
            if "version" not in cols:
                conn.execute(
                    text("ALTER TABLE inventory_items ADD COLUMN version INTEGER NOT NULL DEFAULT 1")
                )
            if "base_unit" not in cols:
                default_unit = "'عدد'"
                conn.execute(
                    text(f"ALTER TABLE inventory_items ADD COLUMN base_unit VARCHAR(40) NOT NULL DEFAULT {default_unit}")
                )
            if "item_kind" not in cols:
                conn.execute(
                    text("ALTER TABLE inventory_items ADD COLUMN item_kind VARCHAR(20) NOT NULL DEFAULT 'goods'")
                )
        if inspect(conn).has_table("proforma_invoices"):
            _ensure_money_column(
                conn, engine.dialect.name, "proforma_invoices", "invoice_discount", "0", nullable=False
            )
        if inspect(conn).has_table("inventory_movements"):
            cols = {c["name"] for c in inspect(conn).get_columns("inventory_movements")}
            needs_line_upgrade = "line_index" not in cols or "document_line_id" not in cols
            if needs_line_upgrade:
                if engine.dialect.name == "sqlite":
                    for op in ("UPDATE", "DELETE"):
                        conn.execute(text(f"DROP TRIGGER IF EXISTS immutable_inventory_movements_{op}"))
                    conn.execute(
                        text(
                            "CREATE TABLE inventory_movements_new ("
                            "id VARCHAR(36) NOT NULL PRIMARY KEY, "
                            "created_at DATETIME NOT NULL, "
                            "company_id VARCHAR(36) NOT NULL REFERENCES companies(id), "
                            "item_id VARCHAR(36) NOT NULL, "
                            "warehouse_id VARCHAR(36) NOT NULL, "
                            "journal_id VARCHAR(36) NOT NULL, "
                            "operation_id VARCHAR(36) NOT NULL, "
                            "line_index INTEGER NOT NULL DEFAULT 0, "
                            "document_line_id VARCHAR(36), "
                            "kind VARCHAR(30) NOT NULL, "
                            "date DATE NOT NULL, "
                            "sequence BIGINT NOT NULL, "
                            "quantity BIGINT NOT NULL, "
                            "value_irr VARCHAR(80) NOT NULL, "
                            "evidence JSON NOT NULL, "
                            "UNIQUE (company_id, journal_id, warehouse_id, kind, line_index), "
                            "UNIQUE (company_id, sequence), "
                            "FOREIGN KEY(company_id, item_id) REFERENCES inventory_items (company_id, id), "
                            "FOREIGN KEY(company_id, warehouse_id) REFERENCES inventory_warehouses (company_id, id), "
                            "FOREIGN KEY(company_id, journal_id) REFERENCES native_journals (company_id, id), "
                            "FOREIGN KEY(company_id, operation_id) REFERENCES accounting_operations (company_id, id), "
                            "CONSTRAINT inventory_movement_kind_quantity CHECK ("
                            "(kind = 'purchase_goods' AND quantity > 0) OR "
                            "(kind = 'sale_goods' AND quantity < 0) OR "
                            "(kind = 'sale_return' AND quantity > 0) OR "
                            "(kind = 'purchase_return' AND quantity < 0) OR "
                            "(kind = 'restock' AND quantity > 0) OR "
                            "(kind = 'opening_stock' AND quantity > 0) OR "
                            "(kind = 'transfer_in' AND quantity > 0) OR "
                            "(kind = 'transfer_out' AND quantity < 0) OR "
                            "(kind = 'adjustment' AND quantity <> 0) OR "
                            "(kind = 'reversal' AND quantity <> 0)))"
                        )
                    )
                    conn.execute(
                        text(
                            "INSERT INTO inventory_movements_new "
                            "(id, created_at, company_id, item_id, warehouse_id, journal_id, operation_id, line_index, document_line_id, kind, date, sequence, quantity, value_irr, evidence) "
                            "SELECT id, created_at, company_id, item_id, warehouse_id, journal_id, operation_id, 0, NULL, kind, date, sequence, quantity, value_irr, evidence FROM inventory_movements"
                        )
                    )
                    conn.execute(text("DROP TABLE inventory_movements"))
                    conn.execute(text("ALTER TABLE inventory_movements_new RENAME TO inventory_movements"))
                    conn.execute(
                        text(
                            "CREATE INDEX IF NOT EXISTS ix_inventory_movements_bucket_sequence "
                            "ON inventory_movements (company_id, item_id, warehouse_id, sequence)"
                        )
                    )
                    conn.execute(
                        text(
                            "CREATE INDEX IF NOT EXISTS ix_inventory_movements_company_id "
                            "ON inventory_movements (company_id)"
                        )
                    )
                else:
                    if "line_index" not in cols:
                        conn.execute(
                            text("ALTER TABLE inventory_movements ADD COLUMN line_index INTEGER NOT NULL DEFAULT 0")
                        )
                    if "document_line_id" not in cols:
                        conn.execute(text("ALTER TABLE inventory_movements ADD COLUMN document_line_id VARCHAR(36)"))
                    for uc in inspect(conn).get_unique_constraints("inventory_movements"):
                        if uc.get("column_names") == ["company_id", "journal_id", "warehouse_id", "kind"]:
                            conn.execute(text(f"ALTER TABLE inventory_movements DROP CONSTRAINT {uc['name']}"))
                    conn.execute(
                        text(
                            "ALTER TABLE inventory_movements ADD CONSTRAINT uq_inventory_movements_line "
                            "UNIQUE (company_id, journal_id, warehouse_id, kind, line_index)"
                        )
                    )
                    conn.execute(
                        text("ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movement_kind_quantity")
                    )
                    conn.execute(
                        text(
                            "ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movement_kind_quantity CHECK ("
                            "(kind = 'purchase_goods' AND quantity > 0) OR "
                            "(kind = 'sale_goods' AND quantity < 0) OR "
                            "(kind = 'sale_return' AND quantity > 0) OR "
                            "(kind = 'purchase_return' AND quantity < 0) OR "
                            "(kind = 'restock' AND quantity > 0) OR "
                            "(kind = 'opening_stock' AND quantity > 0) OR "
                            "(kind = 'transfer_in' AND quantity > 0) OR "
                            "(kind = 'transfer_out' AND quantity < 0) OR "
                            "(kind = 'adjustment' AND quantity <> 0) OR "
                            "(kind = 'reversal' AND quantity <> 0))"
                        )
                    )
        if inspect(conn).has_table("inventory_warehouses"):
            cols = {c["name"] for c in inspect(conn).get_columns("inventory_warehouses")}
            if "active" not in cols:
                conn.execute(
                    text(f"ALTER TABLE inventory_warehouses ADD COLUMN active BOOLEAN NOT NULL DEFAULT {bool_true}")
                )
            if "version" not in cols:
                conn.execute(
                    text("ALTER TABLE inventory_warehouses ADD COLUMN version INTEGER NOT NULL DEFAULT 1")
                )
        if inspect(conn).has_table("accounting_accounts"):
            cols = {c["name"] for c in inspect(conn).get_columns("accounting_accounts")}
            if "nature" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE accounting_accounts ADD COLUMN nature VARCHAR(20) NOT NULL DEFAULT 'debit'"
                    )
                )
        if inspect(conn).has_table("commercial_counterparties"):
            cols = {c["name"] for c in inspect(conn).get_columns("commercial_counterparties")}
            if "type" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE commercial_counterparties ADD COLUMN type VARCHAR(20) NOT NULL "
                        "DEFAULT 'other' CONSTRAINT counterparty_type_valid "
                        "CHECK (type IN ('supplier', 'customer', 'employee', 'other'))"
                    )
                )
        if inspect(conn).has_table("users"):
            cols = {c["name"] for c in inspect(conn).get_columns("users")}
            if "avatar" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN avatar TEXT"))
        if inspect(conn).has_table("accounting_account_hierarchy"):
            from .account_catalogue_service import is_code_pattern_valid

            cols = {c["name"] for c in inspect(conn).get_columns("accounting_account_hierarchy")}
            if engine.dialect.name == "sqlite":
                ddl = conn.execute(
                    text(
                        "SELECT sql FROM sqlite_master WHERE type='table' AND name='accounting_account_hierarchy'"
                    )
                ).scalar()
                needs_shift = bool(ddl and "'group'" not in ddl)
                needs_status = "code_status" not in cols or bool(ddl and "account_hierarchy_code_status" not in ddl)
                if needs_shift or needs_status:
                    conn.execute(
                        text(
                            "CREATE TABLE accounting_account_hierarchy_new ("
                            "company_id VARCHAR(36) NOT NULL, "
                            "account_id VARCHAR(36) NOT NULL PRIMARY KEY, "
                            "level VARCHAR(20) NOT NULL, "
                            "parent_id VARCHAR(36), "
                            "code_status VARCHAR(20) NOT NULL DEFAULT 'standard', "
                            "CONSTRAINT account_hierarchy_level CHECK (level IN ('group', 'general', 'subsidiary', 'detail')), "
                            "CONSTRAINT account_hierarchy_parent CHECK ((level = 'group' AND parent_id IS NULL) OR (level != 'group' AND parent_id IS NOT NULL)), "
                            "CONSTRAINT account_hierarchy_no_self_parent CHECK (parent_id IS NULL OR parent_id != account_id), "
                            "CONSTRAINT account_hierarchy_code_status CHECK (code_status IN ('standard', 'legacy')), "
                            "FOREIGN KEY(company_id, account_id) REFERENCES accounting_accounts (company_id, id), "
                            "FOREIGN KEY(company_id, parent_id) REFERENCES accounting_accounts (company_id, id))"
                        )
                    )
                    if needs_shift:
                        conn.execute(
                            text(
                                "INSERT INTO accounting_account_hierarchy_new (company_id, account_id, level, parent_id, code_status) "
                                "SELECT company_id, account_id, "
                                "CASE "
                                "WHEN level = 'general' AND parent_id IS NULL THEN 'group' "
                                "WHEN level = 'subsidiary' THEN 'general' "
                                "WHEN level = 'detail' THEN 'subsidiary' "
                                "ELSE level END, "
                                "parent_id, 'standard' FROM accounting_account_hierarchy"
                            )
                        )
                    else:
                        status_expr = "code_status" if "code_status" in cols else "'standard'"
                        conn.execute(
                            text(
                                "INSERT INTO accounting_account_hierarchy_new (company_id, account_id, level, parent_id, code_status) "
                                f"SELECT company_id, account_id, level, parent_id, {status_expr} FROM accounting_account_hierarchy"
                            )
                        )
                    conn.execute(text("DROP TABLE accounting_account_hierarchy"))
                    conn.execute(
                        text(
                            "ALTER TABLE accounting_account_hierarchy_new RENAME TO accounting_account_hierarchy"
                        )
                    )
                    conn.execute(
                        text(
                            "CREATE INDEX IF NOT EXISTS ix_accounting_account_hierarchy_company_id "
                            "ON accounting_account_hierarchy (company_id)"
                        )
                    )
                    conn.execute(
                        text(
                            "CREATE INDEX IF NOT EXISTS ix_accounting_account_hierarchy_parent_id "
                            "ON accounting_account_hierarchy (parent_id)"
                        )
                    )
                    rows = conn.execute(
                        text(
                            "SELECT h.company_id, h.account_id, h.level, a.code, p.code "
                            "FROM accounting_account_hierarchy h "
                            "JOIN accounting_accounts a ON a.company_id = h.company_id AND a.id = h.account_id "
                            "LEFT JOIN accounting_accounts p ON p.company_id = h.company_id AND p.id = h.parent_id"
                        )
                    ).all()
                    for cid, aid, lvl, acode, pcode in rows:
                        status = "standard" if is_code_pattern_valid(acode, lvl, pcode) else "legacy"
                        conn.execute(
                            text(
                                "UPDATE accounting_account_hierarchy SET code_status = :status "
                                "WHERE company_id = :company AND account_id = :aid"
                            ),
                            {"status": status, "company": cid, "aid": aid},
                        )
            else:
                constraints = {
                    c["name"]: c.get("sqltext", "")
                    for c in inspect(conn).get_check_constraints("accounting_account_hierarchy")
                }
                needs_shift = "'group'" not in constraints.get("account_hierarchy_level", "")
                needs_status = "code_status" not in cols or "account_hierarchy_code_status" not in constraints
                if "code_status" not in cols:
                    conn.execute(
                        text(
                            "ALTER TABLE accounting_account_hierarchy "
                            "ADD COLUMN code_status VARCHAR(20) NOT NULL DEFAULT 'standard'"
                        )
                    )
                if needs_shift:
                    conn.execute(
                        text("ALTER TABLE accounting_account_hierarchy DROP CONSTRAINT IF EXISTS account_hierarchy_level")
                    )
                    conn.execute(
                        text("ALTER TABLE accounting_account_hierarchy DROP CONSTRAINT IF EXISTS account_hierarchy_parent")
                    )
                    conn.execute(
                        text(
                            "ALTER TABLE accounting_account_hierarchy ADD CONSTRAINT account_hierarchy_level "
                            "CHECK (level IN ('group', 'general', 'subsidiary', 'detail'))"
                        )
                    )
                if needs_shift or needs_status:
                    if inspect(conn).has_table("companies"):
                        for cid in conn.execute(text("SELECT id FROM companies")).scalars().all():
                            conn.execute(
                                text("SELECT set_config('didban.company_id', :company, true)"),
                                {"company": cid},
                            )
                            if needs_shift:
                                conn.execute(
                                    text(
                                        "UPDATE accounting_account_hierarchy SET level = "
                                        "CASE "
                                        "WHEN level = 'general' AND parent_id IS NULL THEN 'group' "
                                        "WHEN level = 'subsidiary' THEN 'general' "
                                        "WHEN level = 'detail' THEN 'subsidiary' "
                                        "ELSE level END "
                                        "WHERE company_id = :company AND ("
                                        "(level = 'general' AND parent_id IS NULL) OR level IN ('subsidiary', 'detail')"
                                        ")"
                                    ),
                                    {"company": cid},
                                )
                            rows = conn.execute(
                                text(
                                    "SELECT h.account_id, h.level, a.code, p.code "
                                    "FROM accounting_account_hierarchy h "
                                    "JOIN accounting_accounts a ON a.company_id = h.company_id AND a.id = h.account_id "
                                    "LEFT JOIN accounting_accounts p ON p.company_id = h.company_id AND p.id = h.parent_id "
                                    "WHERE h.company_id = :company"
                                ),
                                {"company": cid},
                            ).all()
                            for aid, lvl, acode, pcode in rows:
                                status = "standard" if is_code_pattern_valid(acode, lvl, pcode) else "legacy"
                                conn.execute(
                                    text(
                                        "UPDATE accounting_account_hierarchy SET code_status = :status "
                                        "WHERE company_id = :company AND account_id = :aid"
                                    ),
                                    {"status": status, "company": cid, "aid": aid},
                                )
                        conn.execute(text("SELECT set_config('didban.company_id', '', true)"))
                if needs_shift:
                    conn.execute(
                        text(
                            "ALTER TABLE accounting_account_hierarchy ADD CONSTRAINT account_hierarchy_parent "
                            "CHECK ((level = 'group' AND parent_id IS NULL) OR (level != 'group' AND parent_id IS NOT NULL))"
                        )
                    )
                if "account_hierarchy_code_status" not in constraints:
                    conn.execute(
                        text(
                            "ALTER TABLE accounting_account_hierarchy ADD CONSTRAINT account_hierarchy_code_status "
                            "CHECK (code_status IN ('standard', 'legacy'))"
                        )
                    )
        for tbl, fk_name in (
            ("cheque_events", "fk_cheque_events_period"),
            ("native_control_runs", "fk_native_control_runs_period"),
            ("native_automation_previews", "fk_native_automation_previews_period"),
        ):
            if inspect(conn).has_table(tbl) and inspect(conn).has_table("financial_periods"):
                fks = inspect(conn).get_foreign_keys(tbl)
                if not any(fk.get("referred_table") == "financial_periods" for fk in fks):
                    if engine.dialect.name == "sqlite":
                        for op in ("UPDATE", "DELETE"):
                            conn.execute(text(f"DROP TRIGGER IF EXISTS immutable_{tbl}_{op}"))
                        if tbl == "cheque_events":
                            conn.execute(
                                text(
                                    "CREATE TABLE cheque_events_new ("
                                    "id VARCHAR(36) NOT NULL PRIMARY KEY, "
                                    "created_at DATETIME NOT NULL, "
                                    "company_id VARCHAR(36) NOT NULL REFERENCES companies(id), "
                                    "cheque_id VARCHAR(36) NOT NULL, "
                                    "actor_id VARCHAR(36) NOT NULL, "
                                    "action VARCHAR(20) NOT NULL, "
                                    "previous_state VARCHAR(20), "
                                    "new_state VARCHAR(20) NOT NULL, "
                                    "event_date DATE NOT NULL, "
                                    "period_id VARCHAR(36) NOT NULL, "
                                    "reason TEXT NOT NULL, "
                                    "FOREIGN KEY(company_id, cheque_id) REFERENCES cheques (company_id, id), "
                                    "FOREIGN KEY(company_id, period_id) REFERENCES financial_periods (company_id, id))"
                                )
                            )
                            conn.execute(
                                text(
                                    "INSERT INTO cheque_events_new (id, created_at, company_id, cheque_id, actor_id, action, previous_state, new_state, event_date, period_id, reason) "
                                    "SELECT id, created_at, company_id, cheque_id, actor_id, action, previous_state, new_state, event_date, period_id, reason FROM cheque_events"
                                )
                            )
                            conn.execute(text("DROP TABLE cheque_events"))
                            conn.execute(text("ALTER TABLE cheque_events_new RENAME TO cheque_events"))
                            conn.execute(
                                text("CREATE INDEX IF NOT EXISTS ix_cheque_events_company_id ON cheque_events (company_id)")
                            )
                        elif tbl == "native_control_runs":
                            conn.execute(
                                text(
                                    "CREATE TABLE native_control_runs_new ("
                                    "id VARCHAR(36) NOT NULL PRIMARY KEY, "
                                    "created_at DATETIME NOT NULL, "
                                    "company_id VARCHAR(36) NOT NULL REFERENCES companies(id), "
                                    "period_id VARCHAR(36) NOT NULL, "
                                    "digest VARCHAR(64) NOT NULL, "
                                    "actor_id VARCHAR(36) NOT NULL, "
                                    "trigger VARCHAR(40) NOT NULL, "
                                    "snapshot JSON NOT NULL, "
                                    "UNIQUE (company_id, digest), "
                                    "FOREIGN KEY(company_id, period_id) REFERENCES financial_periods (company_id, id))"
                                )
                            )
                            conn.execute(
                                text(
                                    "INSERT INTO native_control_runs_new (id, created_at, company_id, period_id, digest, actor_id, trigger, snapshot) "
                                    "SELECT id, created_at, company_id, period_id, digest, actor_id, trigger, snapshot FROM native_control_runs"
                                )
                            )
                            conn.execute(text("DROP TABLE native_control_runs"))
                            conn.execute(text("ALTER TABLE native_control_runs_new RENAME TO native_control_runs"))
                            conn.execute(
                                text("CREATE INDEX IF NOT EXISTS ix_native_control_runs_company_id ON native_control_runs (company_id)")
                            )
                        elif tbl == "native_automation_previews":
                            conn.execute(
                                text(
                                    "CREATE TABLE native_automation_previews_new ("
                                    "id VARCHAR(36) NOT NULL PRIMARY KEY, "
                                    "created_at DATETIME NOT NULL, "
                                    "company_id VARCHAR(36) NOT NULL REFERENCES companies(id), "
                                    "actor_id VARCHAR(36) NOT NULL, "
                                    "period_id VARCHAR(36) NOT NULL, "
                                    "source_digest VARCHAR(64) NOT NULL, "
                                    "definition JSON NOT NULL, "
                                    "result JSON NOT NULL, "
                                    "FOREIGN KEY(company_id, period_id) REFERENCES financial_periods (company_id, id))"
                                )
                            )
                            conn.execute(
                                text(
                                    "INSERT INTO native_automation_previews_new (id, created_at, company_id, actor_id, period_id, source_digest, definition, result) "
                                    "SELECT id, created_at, company_id, actor_id, period_id, source_digest, definition, result FROM native_automation_previews"
                                )
                            )
                            conn.execute(text("DROP TABLE native_automation_previews"))
                            conn.execute(text("ALTER TABLE native_automation_previews_new RENAME TO native_automation_previews"))
                            conn.execute(
                                text("CREATE INDEX IF NOT EXISTS ix_native_automation_previews_company_id ON native_automation_previews (company_id)")
                            )
                    else:
                        conn.execute(
                            text(
                                f"ALTER TABLE {tbl} ADD CONSTRAINT {fk_name} "
                                "FOREIGN KEY (company_id, period_id) REFERENCES financial_periods (company_id, id)"
                            )
                        )
        # Phase 2 additive upgrades on existing tables
        if inspect(conn).has_table("commercial_counterparties"):
            cols = {c["name"] for c in inspect(conn).get_columns("commercial_counterparties")}
            if "entity_kind" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE commercial_counterparties ADD COLUMN entity_kind VARCHAR(20) NOT NULL DEFAULT 'other'"
                    )
                )
            if "roles" not in cols:
                conn.execute(text("ALTER TABLE commercial_counterparties ADD COLUMN roles JSON"))
            for col_name, col_type in (
                ("registration_number", "VARCHAR(40)"),
                ("postal_code", "VARCHAR(20)"),
                ("email", "VARCHAR(150)"),
            ):
                if col_name not in cols:
                    conn.execute(text(f"ALTER TABLE commercial_counterparties ADD COLUMN {col_name} {col_type}"))
        if inspect(conn).has_table("cheques"):
            cols = {c["name"] for c in inspect(conn).get_columns("cheques")}
            for col_name, col_ddl in (
                ("sayad_id", "VARCHAR(32)"),
                ("sayad_status", "VARCHAR(30) NOT NULL DEFAULT 'not_verified'"),
                ("treasury_account_id", "VARCHAR(36)"),
                ("counterparty_id", "VARCHAR(36)"),
                ("issuer_name", "VARCHAR(150)"),
                ("holder_name", "VARCHAR(150)"),
                ("received_date", "DATE"),
                ("endorsed_to_counterparty_id", "VARCHAR(36)"),
            ):
                if col_name not in cols:
                    conn.execute(text(f"ALTER TABLE cheques ADD COLUMN {col_name} {col_ddl}"))
        if inspect(conn).has_table("cheque_events"):
            cols = {c["name"] for c in inspect(conn).get_columns("cheque_events")}
            has_cheque_event_cols = all(
                c in cols for c in ("endorsed_to", "endorsed_to_counterparty_id", "treasury_account_id")
            )
            if not has_cheque_event_cols:
                if engine.dialect.name == "sqlite":
                    for op in ("UPDATE", "DELETE"):
                        conn.execute(text(f"DROP TRIGGER IF EXISTS immutable_cheque_events_{op}"))
                if "endorsed_to" not in cols:
                    conn.execute(text("ALTER TABLE cheque_events ADD COLUMN endorsed_to VARCHAR(100)"))
                if "endorsed_to_counterparty_id" not in cols:
                    conn.execute(text("ALTER TABLE cheque_events ADD COLUMN endorsed_to_counterparty_id VARCHAR(36)"))
                if "treasury_account_id" not in cols:
                    conn.execute(text("ALTER TABLE cheque_events ADD COLUMN treasury_account_id VARCHAR(36)"))
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS cheque_event_tenant_key ON cheque_events (company_id, id)"
                )
            )
        if inspect(conn).has_table("native_dimension_allocations"):
            cols = {c["name"] for c in inspect(conn).get_columns("native_dimension_allocations")}
            if "journal_line_id" not in cols:
                if engine.dialect.name == "sqlite":
                    for op in ("UPDATE", "DELETE"):
                        conn.execute(text(f"DROP TRIGGER IF EXISTS immutable_native_dimension_allocations_{op}"))
                conn.execute(text("ALTER TABLE native_dimension_allocations ADD COLUMN journal_line_id VARCHAR(36)"))
        if inspect(conn).has_table("accounting_permissions"):
            cols = {c["name"] for c in inspect(conn).get_columns("accounting_permissions")}
            if "view_payroll" not in cols:
                bool_false = "FALSE" if engine.dialect.name == "postgresql" else "0"
                conn.execute(
                    text(
                        f"ALTER TABLE accounting_permissions ADD COLUMN view_payroll BOOLEAN NOT NULL DEFAULT {bool_false}"
                    )
                )
        _upgrade_commercial_line_net(conn)
        Base.metadata.create_all(conn)
        _backfill_phase2_data(conn, engine.dialect.name)
        require_current_schema(conn, Base.metadata)
        if engine.dialect.name == "postgresql":
            install_missing_money_constraints(conn)
            for statement in postgres_security_statements():
                conn.execute(text(statement))
        else:
            for statement in obsolete_inventory_catalogue_guards("sqlite"):
                conn.execute(text(statement))
            for name in resolve_immutable_tables():
                for operation in ("UPDATE", "DELETE"):
                    conn.execute(
                        text(
                            f"CREATE TRIGGER IF NOT EXISTS immutable_{name}_{operation} BEFORE {operation} ON {name} BEGIN SELECT RAISE(ABORT, 'immutable fact'); END"
                        )
                    )
            for statement in native_invoice_source_guards("sqlite"):
                conn.execute(text(statement))
        conn.execute(text(SCHEMA_TABLE_DDL))
        conn.execute(
            text(
                "INSERT INTO didban_schema_version (id, version) VALUES (1, :version) "
                "ON CONFLICT (id) DO UPDATE SET version = excluded.version"
            ),
            {"version": SCHEMA_VERSION},
        )


def _upgrade_commercial_line_net(conn: Connection) -> None:
    table = "commercial_document_lines"
    inspector = inspect(conn)
    if not inspector.has_table(table):
        return
    columns = {column["name"] for column in inspector.get_columns(table)}
    if "net_before_inv_disc_irr" in columns:
        return
    if "net_before_invoice_discount_irr" in columns:
        conn.execute(text(
            "ALTER TABLE commercial_document_lines "
            "RENAME COLUMN net_before_invoice_discount_irr TO net_before_inv_disc_irr"
        ))
        return
    postgres = conn.dialect.name == "postgresql"
    _ensure_money_column(conn, conn.dialect.name, table, "net_before_inv_disc_irr", "0", nullable=False)
    companies = conn.execute(text("SELECT id FROM companies")).scalars().all()
    for company in companies:
        if postgres:
            conn.execute(text("SELECT set_config('didban.company_id', :company, true)"), {"company": company})
        rows = conn.execute(
            text("SELECT id, gross_amount_irr, line_discount_irr FROM commercial_document_lines WHERE company_id = :company"),
            {"company": company},
        ).mappings()
        with localcontext() as precision:
            precision.prec = 60
            values = [
                {"company": company, "id": row["id"], "net": canonical_money(
                    Decimal(row["gross_amount_irr"]) - Decimal(row["line_discount_irr"])
                )}
                for row in rows
            ]
        if values:
            value = "CAST(:net AS NUMERIC(38, 6))" if postgres else ":net"
            conn.execute(
                text(f"UPDATE commercial_document_lines SET net_before_inv_disc_irr = {value} WHERE company_id = :company AND id = :id"),
                values,
            )
    if postgres:
        conn.execute(text("ALTER TABLE commercial_document_lines ALTER COLUMN net_before_inv_disc_irr DROP DEFAULT"))


def _backfill_phase2_data(conn: Connection, dialect: str) -> None:
    """Idempotent deterministic backfill for counterparty roles, native journal lines, and treasury accounts."""
    import json
    import re
    from uuid import NAMESPACE_URL, uuid5

    inspector = inspect(conn)
    if not inspector.has_table("companies"):
        return
    company_ids = conn.execute(text("SELECT id FROM companies")).scalars().all()
    for cid in company_ids:
        if dialect == "postgresql":
            conn.execute(text("SELECT set_config('didban.company_id', :company, true)"), {"company": cid})

        # 1. Backfill CommercialCounterparty roles and CommercialCounterpartyRole
        if inspector.has_table("commercial_counterparties") and inspector.has_table("commercial_counterparty_roles"):
            cps = conn.execute(
                text("SELECT id, type, roles FROM commercial_counterparties WHERE company_id = :c"),
                {"c": cid},
            ).all()
            for cp_id, cp_type, cp_roles in cps:
                parsed_roles = cp_roles
                if isinstance(parsed_roles, str):
                    try:
                        parsed_roles = json.loads(parsed_roles)
                    except Exception:
                        parsed_roles = None
                if not parsed_roles:
                    parsed_roles = [cp_type or "other"]
                    conn.execute(
                        text("UPDATE commercial_counterparties SET roles = :r WHERE company_id = :c AND id = :id"),
                        {"r": json.dumps(parsed_roles), "c": cid, "id": cp_id},
                    )
                for r in parsed_roles:
                    exists = conn.execute(
                        text(
                            "SELECT id FROM commercial_counterparty_roles "
                            "WHERE company_id = :c AND counterparty_id = :cp AND role = :r"
                        ),
                        {"c": cid, "cp": cp_id, "r": r},
                    ).scalar()
                    if not exists:
                        conn.execute(
                            text(
                                "INSERT INTO commercial_counterparty_roles (id, created_at, company_id, counterparty_id, role) "
                                "VALUES (:id, CURRENT_TIMESTAMP, :c, :cp, :r)"
                            ),
                            {"id": str(uuid5(NAMESPACE_URL, f"didban:cp-role:{cid}:{cp_id}:{r}")), "c": cid, "cp": cp_id, "r": r},
                        )

        # 2. Deterministic backfill of NativeJournalLine from NativeJournal.snapshot
        if inspector.has_table("native_journals") and inspector.has_table("native_journal_lines"):
            valid_accounts = set(
                conn.execute(
                    text("SELECT id FROM accounting_accounts WHERE company_id = :c"), {"c": cid}
                ).scalars().all()
            )
            valid_cps = set(
                conn.execute(
                    text("SELECT id FROM commercial_counterparties WHERE company_id = :c"), {"c": cid}
                ).scalars().all()
            )
            journals = conn.execute(
                text("SELECT id, created_at, snapshot FROM native_journals WHERE company_id = :c"),
                {"c": cid},
            ).all()
            for j_id, j_created, raw_snap in journals:
                snap = json.loads(raw_snap) if isinstance(raw_snap, str) else (raw_snap or {})
                lines = snap.get("lines") or []
                existing_idx = set(
                    conn.execute(
                        text("SELECT line_index FROM native_journal_lines WHERE company_id = :c AND journal_id = :j"),
                        {"c": cid, "j": j_id},
                    ).scalars().all()
                )
                for idx, line in enumerate(lines):
                    if idx in existing_idx:
                        continue
                    acc_id = line.get("account_id")
                    if acc_id not in valid_accounts:
                        continue
                    line_id = str(uuid5(NAMESPACE_URL, f"didban:njl:{cid}:{j_id}:{idx}"))
                    cp_id = line.get("counterparty_id")
                    if cp_id not in valid_cps:
                        cp_id = None
                    conn.execute(
                        text(
                            "INSERT INTO native_journal_lines "
                            "(id, created_at, company_id, journal_id, line_index, account_id, debit, credit, "
                            "original_debit, original_credit, description, party_id, counterparty_id, "
                            "reference_kind, reference_id, dimension_ids) "
                            "VALUES (:id, :created, :c, :j, :idx, :acc, :debit, :credit, :od, :oc, :desc, :party, :cp, :rk, :ri, :dims)"
                        ),
                        {
                            "id": line_id,
                            "created": j_created,
                            "c": cid,
                            "j": j_id,
                            "idx": idx,
                            "acc": acc_id,
                            "debit": str(line.get("debit", "0")),
                            "credit": str(line.get("credit", "0")),
                            "od": str(line.get("original_debit") or line.get("debit", "0")),
                            "oc": str(line.get("original_credit") or line.get("credit", "0")),
                            "desc": str(line.get("description") or snap.get("description") or "")[:500],
                            "party": str(line.get("party_id") or "")[:100],
                            "cp": cp_id,
                            "rk": line.get("reference_kind"),
                            "ri": line.get("reference_id"),
                            "dims": json.dumps(list(line.get("dimension_ids") or [])),
                        },
                    )
                    if inspector.has_table("native_dimension_allocations"):
                        conn.execute(
                            text(
                                "UPDATE native_dimension_allocations SET journal_line_id = :lid "
                                "WHERE company_id = :c AND journal_id = :j AND line_index = :idx AND journal_line_id IS NULL"
                            ),
                            {"lid": line_id, "c": cid, "j": j_id, "idx": idx},
                        )

        # 3. Safe migration of existing treasury accounts from concatenated Account names
        if inspector.has_table("treasury_accounts") and inspector.has_table("native_account_roles"):
            existing_ta_accs = set(
                conn.execute(
                    text("SELECT account_id FROM treasury_accounts WHERE company_id = :c"), {"c": cid}
                ).scalars().all()
            )
            role_rows = conn.execute(
                text(
                    "SELECT r.account_id, r.role, a.name, a.active "
                    "FROM native_account_roles r "
                    "JOIN accounting_accounts a ON a.company_id = r.company_id AND a.id = r.account_id "
                    "WHERE r.company_id = :c AND r.role IN ('bank', 'cash', 'petty_cash')"
                ),
                {"c": cid},
            ).all()
            for acc_id, role, acc_name, active in role_rows:
                if acc_id in existing_ta_accs:
                    continue
                clean_name = acc_name
                account_number = None
                custodian_name = None
                needs_completion = True
                if role == "bank":
                    m_bank = re.match(r"^(.*?)\s*\(([0-9A-Za-z\-/]{3,60})\)\s*$", acc_name)
                    if m_bank:
                        clean_name = m_bank.group(1).strip() or acc_name
                        account_number = m_bank.group(2).strip()
                        needs_completion = False
                elif role in ("cash", "petty_cash"):
                    m_cust = re.match(r"^(.*?)\s*—\s*(.+?)\s*$", acc_name)
                    if m_cust and len(m_cust.group(2).strip()) >= 2:
                        clean_name = m_cust.group(1).strip() or acc_name
                        custodian_name = m_cust.group(2).strip()
                        needs_completion = False
                ta_id = str(uuid5(NAMESPACE_URL, f"didban:ta:{cid}:{acc_id}"))
                conn.execute(
                    text(
                        "INSERT INTO treasury_accounts "
                        "(id, created_at, company_id, kind, name, account_id, active, account_number, custodian_name, needs_completion, version) "
                        "VALUES (:id, CURRENT_TIMESTAMP, :c, :kind, :name, :acc_id, :active, :acc_no, :cust, :nc, 1)"
                    ),
                    {
                        "id": ta_id,
                        "c": cid,
                        "kind": role,
                        "name": clean_name[:150],
                        "acc_id": acc_id,
                        "active": bool(active),
                        "acc_no": account_number,
                        "cust": custodian_name,
                        "nc": bool(needs_completion),
                    },
                )
    if dialect == "postgresql":
        conn.execute(text("SELECT set_config('didban.company_id', '', true)"))


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
