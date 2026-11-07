"""Old development databases must fail at startup instead of individual endpoints."""

import pytest
from sqlalchemy import Column, MetaData, String, Table, UniqueConstraint, create_engine

from didban.schema_readiness import require_current_schema


@pytest.mark.parametrize("unique_index", [False, True])
def test_current_layout_accepts_constraint_or_unique_index(unique_index):
    metadata = MetaData()
    Table(
        "facts", metadata,
        Column("id", String, primary_key=True), Column("company_id", String),
        UniqueConstraint("company_id", "id"),
    )
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        if unique_index:
            conn.exec_driver_sql("CREATE TABLE facts (id TEXT PRIMARY KEY, company_id TEXT)")
            conn.exec_driver_sql("CREATE UNIQUE INDEX tenant_key ON facts(company_id,id)")
        else:
            metadata.create_all(conn)
        require_current_schema(conn, metadata)


def test_old_layout_reports_all_gaps_without_changing_data():
    metadata = MetaData()
    Table(
        "facts", metadata,
        Column("id", String, primary_key=True), Column("company_id", String),
        Column("bank_reference", String), UniqueConstraint("company_id", "id"),
    )
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.exec_driver_sql("CREATE TABLE facts (id TEXT PRIMARY KEY, company_id TEXT)")
        conn.exec_driver_sql("INSERT INTO facts VALUES ('evidence', 'company')")
        with pytest.raises(RuntimeError) as error:
            require_current_schema(conn, metadata)
        assert "facts.bank_reference" in str(error.value)
        assert "facts.UNIQUE(company_id,id)" in str(error.value)
        assert conn.exec_driver_sql("SELECT * FROM facts").all() == [("evidence", "company")]
        assert [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(facts)")] == ["id", "company_id"]
