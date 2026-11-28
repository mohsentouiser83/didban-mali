"""Finite canonical-money bounds cover imported model modules without duplicate DDL."""

from sqlalchemy import CheckConstraint
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.schema import CreateTable

from didban import models as m
from didban.cheque_models import Cheque, ChequeClearance
from didban.db import SCHEMA_VERSION
from didban.money_type import Money


def test_all_money_columns_receive_one_finite_constraint_after_repeated_registration():
    m.register_money_constraints()
    m.register_money_constraints()
    money_columns = [
        (table, column)
        for table in m.Base.metadata.tables.values()
        for column in table.c
        if isinstance(column.type, Money)
    ]
    assert any(table is Cheque.__table__ for table, _column in money_columns)
    assert any(table is ChequeClearance.__table__ for table, _column in money_columns)
    for table, column in money_columns:
        matching = [
            constraint
            for constraint in table.constraints
            if isinstance(constraint, CheckConstraint)
            and constraint.name == f"finite_{table.name}_{column.name}"
        ]
        assert len(matching) == 1, (table.name, column.name)


def test_new_money_guards_are_postgres_only_and_do_not_compare_sqlite_text_amounts():
    for model in (Cheque, ChequeClearance):
        expected = f"finite_{model.__tablename__}_amount"
        postgres_ddl = str(CreateTable(model.__table__).compile(dialect=postgresql.dialect()))
        sqlite_ddl = str(CreateTable(model.__table__).compile(dialect=sqlite.dialect()))
        assert expected in postgres_ddl and "NUMERIC(38, 6)" in postgres_ddl
        assert expected not in sqlite_ddl


def test_ensure_money_column_uses_numeric38_6_for_postgres_and_normalizes_varchar():
    from didban.db import _ensure_money_column

    class FakeInspector:
        def __init__(self, cols):
            self.cols = cols

        def get_columns(self, _table):
            return self.cols

    class FakeConn:
        def __init__(self, cols):
            self.cols = cols
            self.statements = []

        def execute(self, stmt):
            self.statements.append(str(stmt))

    import didban.db as database

    original_inspect = database.inspect
    try:
        conn = FakeConn([{"name": "id", "type": "VARCHAR(36)"}])
        database.inspect = lambda _c: FakeInspector(conn.cols)
        _ensure_money_column(conn, "postgresql", "proforma_invoices", "invoice_discount", "0", nullable=False)
        assert conn.statements == [
            "ALTER TABLE proforma_invoices ADD COLUMN invoice_discount NUMERIC(38, 6) NOT NULL DEFAULT 0"
        ]

        conn_nullable = FakeConn([{"name": "id", "type": "VARCHAR(36)"}])
        database.inspect = lambda _c: FakeInspector(conn_nullable.cols)
        _ensure_money_column(conn_nullable, "postgresql", "employee_contracts", "weekly_hours", "44", nullable=True)
        assert conn_nullable.statements == [
            "ALTER TABLE employee_contracts ADD COLUMN weekly_hours NUMERIC(38, 6) DEFAULT 44"
        ]

        conn_varchar = FakeConn([{"name": "invoice_discount", "type": "VARCHAR(80)"}])
        database.inspect = lambda _c: FakeInspector(conn_varchar.cols)
        _ensure_money_column(conn_varchar, "postgresql", "proforma_invoices", "invoice_discount", "0", nullable=False)
        assert any("TYPE NUMERIC(38, 6)" in s for s in conn_varchar.statements)
    finally:
        database.inspect = original_inspect


def test_versioned_migration_recovers_missing_money_columns_on_sqlite(tmp_path, monkeypatch):
    import pytest
    from sqlalchemy import MetaData, create_engine, inspect, text

    from didban import db as database

    engine = create_engine(f"sqlite:///{tmp_path / 'money_upgrade.db'}")
    old_metadata = MetaData()
    for table in m.Base.metadata.sorted_tables:
        table.to_metadata(old_metadata)
    old_pf = old_metadata.tables["proforma_invoices"]
    old_pf._columns.remove(old_pf.c.invoice_discount)
    old_pf.constraints = {
        c for c in old_pf.constraints if c.name != "finite_proforma_invoices_invoice_discount"
    }
    old_ec = old_metadata.tables["employee_contracts"]
    old_ec._columns.remove(old_ec.c.weekly_hours)
    old_ec.constraints = {
        c for c in old_ec.constraints if c.name != "finite_employee_contracts_weekly_hours"
    }
    old_line = old_metadata.tables["commercial_document_lines"]
    old_line._columns.remove(old_line.c.net_before_inv_disc_irr)
    old_line.constraints = {
        c for c in old_line.constraints if c.name != "finite_commercial_document_lines_net_before_inv_disc_irr"
    }
    old_metadata.create_all(engine)
    monkeypatch.setattr(database, "engine", engine)
    with engine.begin() as connection:
        connection.execute(text(database.SCHEMA_TABLE_DDL))
        connection.execute(text("INSERT INTO didban_schema_version (id, version) VALUES (1, 1)"))
    with pytest.raises(RuntimeError, match="python -m didban.migrate"):
        database.initialize()
    database.migrate_schema()
    database.initialize()
    assert "invoice_discount" in {c["name"] for c in inspect(engine).get_columns("proforma_invoices")}
    assert "weekly_hours" in {c["name"] for c in inspect(engine).get_columns("employee_contracts")}
    assert "net_before_inv_disc_irr" in {c["name"] for c in inspect(engine).get_columns("commercial_document_lines")}
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT version FROM didban_schema_version WHERE id = 1")) == SCHEMA_VERSION
    engine.dispose()
