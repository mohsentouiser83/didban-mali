"""Exact scalar parsing. Import never evaluates spreadsheet expressions."""

from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, localcontext
import re
import unicodedata

import jdatetime

DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


class InvalidValue(ValueError):
    pass


def text(value: object) -> str:
    return (
        unicodedata.normalize("NFKC", str(value if value is not None else ""))
        .translate(DIGITS)
        .strip()
    )


def money(value: object, unit: str) -> str:
    if isinstance(value, bool) or value is None:
        raise InvalidValue("invalid_money")
    raw = text(value).replace("−", "-").replace("٫", ".").replace("٬", ",")
    if raw.startswith("(") and raw.endswith(")"):
        raw = "-" + raw[1:-1]
    if not re.fullmatch(r"-?(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]{1,6})?", raw):
        raise InvalidValue("invalid_money")
    try:
        with localcontext() as ctx:
            ctx.prec = 96
            number = Decimal(raw.replace(",", ""))
            if unit not in ("IRR", "IRT"):
                raise InvalidValue("unsupported_unit")
            number *= 10 if unit == "IRT" else 1
            if abs(number) >= Decimal("1e32"):
                raise InvalidValue("money_range")
            return format(number, "f")
    except InvalidOperation:
        raise InvalidValue("invalid_money") from None


def financial_date(value: object, calendar: str | None = None) -> str:
    if isinstance(value, datetime):
        if value.time().isoformat() != "00:00:00":
            raise InvalidValue("date_has_time")
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    raw = text(value)
    if not re.fullmatch(r"\d{4}[-/]\d{1,2}[-/]\d{1,2}", raw):
        raise InvalidValue("invalid_date")
    y, m, d = map(int, re.split("[-/]", raw))
    inferred = (
        "jalali" if 1200 <= y <= 1600 else "gregorian" if 1900 <= y <= 2200 else None
    )
    if inferred is None or calendar and calendar != inferred:
        raise InvalidValue("invalid_date")
    try:
        result = (
            jdatetime.date(y, m, d).togregorian()
            if inferred == "jalali"
            else date(y, m, d)
        )
        return result.isoformat()
    except ValueError:
        raise InvalidValue("invalid_date") from None


def identifier(value: object) -> str:
    if value is None or isinstance(value, bool):
        raise InvalidValue("missing_identifier")
    if isinstance(value, float):
        if not value.is_integer() or abs(value) >= 2**53:
            raise InvalidValue("unsafe_numeric_identifier")
        return str(int(value))
    result = text(value)
    if not result:
        raise InvalidValue("missing_identifier")
    if result.startswith("="):
        raise InvalidValue("formula_not_evaluated")
    return result


def currency(value: object) -> str | None:
    return {
        "IRR": "IRR",
        "ریال": "IRR",
        "ريال": "IRR",
        "IRT": "IRT",
        "تومان": "IRT",
    }.get(text(value))
