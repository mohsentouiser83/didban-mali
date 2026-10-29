"""Reviewed portal-export signature and source-local issue-date conversion."""

from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, localcontext
import re

from .normalization import InvalidValue, financial_date, money, text, currency
from .source_profiles import header_key, header_mapping

POLICY = "moadian-portal-export-v1"


@dataclass(frozen=True)
class PortalExport:
    kind: str
    mapping: dict[str, int]
    base_column: int
    unit: str


def portal_export(headers: list) -> PortalExport | None:
    keys = [header_key(value) for value in headers]

    def column(label: str) -> int | None:
        matches = [i + 1 for i, key in enumerate(keys) if key == header_key(label)]
        return matches[0] if len(matches) == 1 else None

    required = {
        "tax_id": column("شماره مالیاتی صورت‌حساب"),
        "issued_on": column("تاریخ صدور صورت‌حساب"),
        "gross": column("مجموع صورت‌حساب"),
        "kind": column("موضوع صورت‌حساب"),
        "vat": column("مالیات بر ارزش افزوده"),
        "document_status": column("وضعیت صورت‌حساب"),
    }
    # The general invoice pattern "فروش" does not identify the company's direction.
    seller = column("نقش مودی (نقش فروشنده)")
    buyer = column("نقش مودی (نقش خریدار)")
    base = column("مجموع بهای کالا و خدمات صورت‌حساب بدون مالیات‌ها و عوارض (ریال)")
    if not all(required.values()) or not base or bool(seller) == bool(buyer):
        return None
    units = re.findall(r"[（(](ریال|ريال|تومان|IRR|IRT)[)）]", text(headers[base - 1]))
    if len(units) != 1 or not (unit := currency(units[0])):
        return None
    direction = "خریدار" if seller else "فروشنده"
    parties = [
        i + 1
        for i, key in enumerate(keys)
        if key.startswith(header_key("شناسه هویتی " + direction + "/"))
    ]
    if len(parties) != 1:
        return None
    mapping = {key: value for key, value in required.items() if value is not None}
    mapping["party_id"] = parties[0]
    names = [
        i + 1
        for i, key in enumerate(keys)
        if key.startswith(header_key("نام " + direction + "/"))
    ]
    if len(names) == 1:
        mapping["party_name"] = names[0]
    explicit_currency = [
        i + 1
        for i, key in enumerate(keys)
        if key
        in {header_key(label) for label in ("currency", "واحد", "واحد پول", "ارز")}
    ]
    if len(explicit_currency) > 1:
        return None
    if explicit_currency:
        mapping["currency"] = explicit_currency[0]
    invoice_number = header_mapping(headers).get("invoice_id")
    if invoice_number:
        mapping["invoice_id"] = invoice_number
    reference = column("شماره مالیاتی صورت‌حساب مرجع")
    if reference:
        mapping["reference_tax_id"] = reference
    return PortalExport(
        "moadian_sales" if seller else "moadian_purchases", mapping, base, unit
    )


def issue_date(value: object, calendar: str | None) -> str:
    """Keep the date printed by the source; never shift it through a timezone."""
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            raise InvalidValue("invalid_date")
        return financial_date(value.date())
    raw = text(value)
    matched = re.fullmatch(
        r"(\d{4}[-/]\d{1,2}[-/]\d{1,2})[ T](\d{2}):(\d{2}):(\d{2})", raw
    )
    if not matched:
        return financial_date(value, calendar)
    if not (int(matched[2]) <= 23 and int(matched[3]) <= 59 and int(matched[4]) <= 59):
        raise InvalidValue("invalid_date")
    return financial_date(matched[1], calendar)


def document_kind(value: str | None) -> str | None:
    return {
        "اصلی": "original",
        "اصلاحی": "corrective",
        "ابطالی": "cancellation",
        "برگشت از فروش": "return",
        "برگشت": "return",
    }.get(text(value), value)


def check_amounts(values: dict, base: object, unit: str | None) -> None:
    # A missing VAT is unknown, never zero; keep that limitation in staging.
    if values.get("gross") is None or values.get("vat") is None:
        return
    with localcontext() as ctx:
        ctx.prec = 96
        if Decimal(money(base, unit or "")) + Decimal(values["vat"]) != Decimal(
            values["gross"]
        ):
            raise InvalidValue("moadian_total_mismatch")
