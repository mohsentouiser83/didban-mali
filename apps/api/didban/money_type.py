"""Exact canonical IRR storage: PostgreSQL numeric(38,6), SQLite text."""
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import Numeric, Text
from sqlalchemy.types import TypeDecorator


def canonical_money(value: Any) -> str:
    if isinstance(value, (float, bool)) or not isinstance(value, (str, Decimal, int)):
        raise ValueError("Canonical money requires an exact decimal string")
    try:
        exact = Decimal(str(value))
    except InvalidOperation as error:
        raise ValueError("Canonical money is invalid") from error
    if not exact.is_finite() or exact.copy_abs() >= Decimal("1e32") or exact.as_tuple().exponent < -6:
        raise ValueError("Canonical money exceeds numeric(38,6)")
    text = format(exact, "f")
    return "0" if exact == 0 else text.rstrip("0").rstrip(".") if "." in text else text


class Money(TypeDecorator[str]):
    impl = Text
    cache_ok = True

    def load_dialect_impl(self, dialect):
        return dialect.type_descriptor(Numeric(38, 6, asdecimal=True) if dialect.name == "postgresql" else Text())

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        exact = canonical_money(value)
        return Decimal(exact) if dialect.name == "postgresql" else exact

    def process_result_value(self, value, _dialect):
        return None if value is None else canonical_money(value)
