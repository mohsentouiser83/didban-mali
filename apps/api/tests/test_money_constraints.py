"""Finite canonical-money bounds cover imported model modules without duplicate DDL."""

from sqlalchemy import CheckConstraint
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.schema import CreateTable

from didban import models as m
from didban.cheque_models import Cheque, ChequeClearance
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
