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


def _sale_lines(invoice: dict, commercial_lines: list[dict] | None = None) -> tuple[list[dict], int, int, int]:
    source = invoice.get("source") or {}
    require(
        invoice.get("basis") == "native_invoice"
        and invoice.get("direction") == "sale"
        and invoice.get("status") == "available"
        and invoice.get("unit") == "IRR"
        and source.get("kind") in ("sale_goods", "sale_service", "commercial_sale")
        and source.get("unit") in ("IRR", "TOMAN")
        and not invoice.get("source_history")
        and not source.get("replacement_of")
        and source == invoice.get("original_source")
        and source.get("date") == invoice.get("date"),
        "moadian_invoice_unsupported",
        "برای ارسال، فاکتور فروش بومی با سند اصلی معتبر لازم است.",
        409,
    )
    if source["kind"] == "commercial_sale" and commercial_lines:
        lines_out = []
        tprdis = 0
        tdis = 0
        tadis = 0
        for cl in commercial_lines:
            qty = cl["quantity"]
            require(type(qty) is int and qty > 0, "moadian_stock_quantity", "تعداد کالای فاکتور معتبر نیست.", 409)
            fee = _whole_rial(cl["unit_price_irr"])
            prdis = qty * fee
            disc = int(Decimal(cl["line_discount_irr"]) + Decimal(cl["allocated_invoice_discount_irr"]))
            adis = _whole_rial(cl["net_amount_irr"])
            require(prdis - disc == adis, "moadian_amount_mismatch", "جمع ردیف فاکتور تجاری تطابق ندارد.", 409)
            tprdis += prdis
            tdis += disc
            tadis += adis
            lines_out.append(
                {
                    "am": qty,
                    "fee": fee,
                    "prdis": prdis,
                    "dis": disc,
                    "adis": adis,
                    "tsstam": adis,
                    "sstt": cl.get("description", "")[:400],
                    "base_unit": cl.get("unit"),
                }
            )
        return lines_out, tprdis, tdis, tadis

    total = _whole_rial(invoice.get("amount"))
    require(
        total == _whole_rial(source.get("amount")),
        "moadian_amount_mismatch",
        "مبلغ فاکتور با مبلغ سند فروش برابر نیست.",
        409,
    )
    if source["kind"] == "sale_service":
        return [{"am": 1, "fee": total, "prdis": total, "dis": 0, "adis": total, "tsstam": total}], total, 0, total
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
    return (
        [
            {
                "am": quantity,
                "fee": unit_price,
                "prdis": total,
                "dis": 0,
                "adis": total,
                "tsstam": total,
                "sstt": source.get("item_name"),
            }
        ],
        total,
        0,
        total,
    )


def can_build(invoice: dict, commercial_lines: list[dict] | None = None) -> bool:
    try:
        _sale_lines(invoice, commercial_lines)
    except DomainError:
        return False
    return True


def build_payload(
    invoice: dict,
    data: MoadianInvoiceInput,
    memory_id: str,
    seller_tax_number: str,
    *,
    commercial_lines: list[dict] | None = None,
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
    sale_lines, tprdis, tdis, tadis = _sale_lines(invoice, commercial_lines)
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
        "ins": data.invoice_subject,
        "tins": seller_tax_number,
        "tob": 1 if data.buyer_type == "natural" else 2,
        "tinb": data.buyer_tax_number,
        "tprdis": tprdis,
        "tdis": tdis,
        "tadis": tadis,
        "tvam": 0,
        "todam": 0,
        "tbill": tadis,
        "setm": 2,
    }
    if data.invoice_subject != 1 and data.reference_tax_id:
        header["irtaxid"] = data.reference_tax_id
    body = []
    for sl in sale_lines:
        item = {
            "sstid": data.item_tax_id,
            "mu": data.unit_code,
            "am": sl["am"],
            "fee": sl["fee"],
            "prdis": sl["prdis"],
            "dis": sl["dis"],
            "adis": sl["adis"],
            "vra": 0,
            "vam": 0,
            "tsstam": sl["tsstam"],
        }
        if sl.get("sstt"):
            item["sstt"] = str(sl["sstt"])[:400]
        body.append(item)
    return {"header": header, "body": body, "payments": []}
