from decimal import Decimal

import pytest
from sqlalchemy import Column, MetaData, Table, create_engine, select
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.exc import StatementError

from didban.models import BankMovement, Invoice
from didban.money_type import Money, canonical_money


def test_money_storage_uses_postgres_numeric38_6_and_sqlite_text():
    pg = Money().load_dialect_impl(postgresql.dialect())
    assert (pg.precision, pg.scale, pg.asdecimal) == (38, 6, True)
    assert str(Money().load_dialect_impl(sqlite.dialect())) == "TEXT"
    assert isinstance(BankMovement.__table__.c.amount.type, Money)
    assert isinstance(Invoice.__table__.c.amount.type, Money)


@pytest.mark.parametrize("invalid", ["NaN", "Infinity", "-Infinity", "100000000000000000000000000000000", "0.0000001", 0.1, True])
def test_money_rejects_invalid_canonical_binds(invalid):
    with pytest.raises(ValueError):
        canonical_money(invalid)


def test_sqlite_exact_money_roundtrip_never_uses_float_affinity():
    engine = create_engine("sqlite:///:memory:")
    metadata = MetaData()
    table = Table("exact_money", metadata, Column("value", Money(), nullable=False))
    metadata.create_all(engine)
    exact = "99999999999999999999999999999999.123456"
    with engine.begin() as connection:
        connection.execute(table.insert().values(value=exact))
        assert connection.scalar(select(table.c.value)) == exact
        assert connection.exec_driver_sql("SELECT typeof(value) FROM exact_money").scalar_one() == "text"
    with pytest.raises(StatementError):
        with engine.begin() as connection:
            connection.execute(table.insert().values(value="0.0000001"))
    engine.dispose()
    assert Money().process_bind_param(exact, postgresql.dialect()) == Decimal(exact)
