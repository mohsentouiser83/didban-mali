"""Build a bounded Type 1 general sale from validated native invoice evidence."""

import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from .errors import DomainError, require
from .moadian_schemas import ECONOMIC_NUMBER_PATTERN, FISCAL_MEMORY_PATTERN, MoadianInvoiceInput

EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
TEHRAN = ZoneInfo("Asia/Tehran")
MAX_FISCAL_AMOUNT = 10**18 - 1

# RC_DCPS.SN uses the Verhoeff checksum over fiscal memory, date and serial.
_VERHOEFF_MULTIPLICATION = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 2, 3, 4, 0, 6, 7, 8, 9, 5),
    (2, 3, 4, 0, 1, 7, 8, 9, 5, 6),
    (3, 4, 0, 1, 2, 8, 9, 5, 6, 7),
    (4, 0, 1, 2, 3, 9, 5, 6, 7, 8),
    (5, 9, 8, 7, 6, 0, 4, 3, 2, 1),
    (6, 5, 9, 8, 7, 1, 0, 4, 3, 2),
    (7, 6, 5, 9, 8, 2, 1, 0, 4, 3),
    (8, 7, 6, 5, 9, 3, 2, 1, 0, 4),
    (9, 8, 7, 6, 5, 4, 3, 2, 1, 0),
)
_VERHOEFF_PERMUTATION = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 5, 7, 6, 2, 8, 3, 0, 9, 4),
    (5, 8, 0, 3, 7, 9, 6, 1, 4, 2),
    (8, 9, 1, 6, 0, 4, 3, 5, 2, 7),
    (9, 4, 5, 3, 1, 2, 6, 8, 7, 0),
    (4, 2, 8, 6, 5, 7, 3, 9, 0, 1),
    (2, 7, 9, 3, 8, 0, 6, 4, 1, 5),
    (7, 0, 4, 6, 9, 1, 3, 2, 5, 8),
)


def _verhoeff_valid(digits: str) -> bool:
    state = 0
    for index, digit in enumerate(reversed(digits)):
        state = _VERHOEFF_MULTIPLICATION[state][_VERHOEFF_PERMUTATION[index % 8][int(digit)]]
    return state == 0


def _fiscal_serial(tax_id: str, memory_id: str, issue_date: date) -> str:
    require(tax_id[:6] == memory_id, "moadian_tax_id_memory", "شماره مالیاتی به حافظهٔ این شرکت تعلق ندارد.")
    days = int(tax_id[6:11], 16)
    require(
        days == (issue_date - EPOCH.date()).days,
        "moadian_tax_id_date",
        "تاریخ شماره مالیاتی با تاریخ صدور فاکتور یکسان نیست.",
    )
    serial = tax_id[11:21]
    numeric_memory = "".join(
        character if character.isdigit() else str(ord(character)) for character in memory_id
    )
    check_number = f"{numeric_memory}{days:06d}{int(serial, 16):012d}{tax_id[21]}"
    require(_verhoeff_valid(check_number), "moadian_tax_id_checksum", "رقم کنترلی شماره مالیاتی معتبر نیست.")
    return serial


def _whole_rial(value: object) -> int:
    if not isinstance(value, (str, int, Decimal)) or isinstance(value, bool):
        raise DomainError("moadian_amount", "مبلغ فاکتور برای ارسال باید ریال صحیح و مثبت باشد.")
    try:
        exact = Decimal(value)
    except InvalidOperation as error:
        raise DomainError("moadian_amount", "مبلغ فاکتور معتبر نیست.") from error
    require(
        exact.is_finite() and 0 < exact <= MAX_FISCAL_AMOUNT and exact == exact.to_integral_value(),
        "moadian_amount",
        "مبلغ فاکتور برای ارسال باید ریال صحیح و مثبت با حداکثر ۱۸ رقم باشد.",
    )
    return int(exact)


def _sale_line(invoice: dict) -> tuple[int, int, int]:
    source = invoice.get("source") or {}
    require(
        invoice.get("basis") == "native_invoice"
        and invoice.get("direction") == "sale"
        and invoice.get("status") == "available"
        and invoice.get("unit") == "IRR"
        and source.get("kind") in ("sale_goods", "sale_service")
        and source.get("unit") in ("IRR", "TOMAN")
        and not invoice.get("source_history")
        and not source.get("replacement_of")
        and source == invoice.get("original_source")
        and source.get("date") == invoice.get("date"),
        "moadian_invoice_unsupported",
        "برای ارسال، فاکتور فروش بومی با سند اصلی معتبر لازم است.",
        409,
    )
    total = _whole_rial(invoice.get("amount"))
    require(
        total == _whole_rial(source.get("amount")),
        "moadian_amount_mismatch",
        "مبلغ فاکتور با مبلغ سند فروش برابر نیست.",
        409,
    )
    if source["kind"] == "sale_service":
        return 1, total, total
    quantity = source.get("quantity")
    require(
        type(quantity) is int and quantity > 0,
        "moadian_stock_quantity",
        "تعداد کالای فاکتور معتبر نیست.",
        409,
    )
    unit_price = _whole_rial(source.get("unit_price")) * (10 if source["unit"] == "TOMAN" else 1)
    require(
        quantity * unit_price == total,
        "moadian_amount_mismatch",
        "مبلغ فاکتور با تعداد و قیمت واحد ثبت‌شده برابر نیست.",
        409,
    )
    return quantity, unit_price, total


def can_build(invoice: dict) -> bool:
    try:
        _sale_line(invoice)
    except DomainError:
        return False
    return True


def build_payload(
    invoice: dict,
    data: MoadianInvoiceInput,
    memory_id: str,
    seller_tax_number: str,
) -> dict:
    require(
        re.fullmatch(FISCAL_MEMORY_PATTERN, memory_id) is not None
        and re.fullmatch(ECONOMIC_NUMBER_PATTERN, seller_tax_number) is not None,
        "moadian_seller_profile",
        "شناسه حافظه یا شماره اقتصادی فروشنده در تنظیمات معتبر نیست.",
        409,
    )
    require(
        invoice.get("id") == data.invoice_id and invoice.get("version") == data.invoice_version,
        "moadian_invoice_version",
        "نسخه فاکتور تغییر کرده است. فاکتور را دوباره انتخاب کنید.",
        409,
    )
    quantity, unit_price, total = _sale_line(invoice)
    issued_at = data.issued_at
    issue_date = issued_at.astimezone(TEHRAN).date()
    require(
        issue_date.isoformat() == invoice["date"] and EPOCH <= issued_at <= datetime.now(timezone.utc),
        "moadian_issue_time",
        "زمان صدور باید در تاریخ فاکتور و حداکثر تا زمان حال باشد.",
    )
    serial = _fiscal_serial(data.tax_id, memory_id, issue_date)
    require(
        data.buyer_tax_number != seller_tax_number,
        "moadian_buyer_tax_number",
        "شماره اقتصادی خریدار و فروشنده باید متفاوت باشد.",
    )
    header = {
        "taxid": data.tax_id,
        "indatim": (issued_at - EPOCH) // timedelta(milliseconds=1),
        "inty": 1,
        # RC_IITP.IS v7.5 §7-5 specifies a ten-character hexadecimal serial.
        "inno": serial,
        "inp": 1,
        "ins": 1,
        "tins": seller_tax_number,
        "tob": 1 if data.buyer_type == "natural" else 2,
        "tinb": data.buyer_tax_number,
        "tprdis": total,
        "tdis": 0,
        "tadis": total,
        "tvam": 0,
        "todam": 0,
        "tbill": total,
        "setm": 2,
    }
    item = {
        "sstid": data.item_tax_id,
        "mu": data.unit_code,
        "am": quantity,
        "fee": unit_price,
        "prdis": total,
        "dis": 0,
        "adis": total,
        "vra": 0,
        "vam": 0,
        "tsstam": total,
    }
    title = invoice["source"].get("item_name")
    if title:
        item["sstt"] = title[:400]
    return {"header": header, "body": [item], "payments": []}
