import argparse
import csv
import json
from collections.abc import Iterable
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import jdatetime
from openpyxl import Workbook

from app.demo.scenario import COUNTERPARTIES, DemoScenario, build_demo_scenario

PERSIAN_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def _fa(value: object) -> str:
    return str(value).translate(PERSIAN_DIGITS)


def _jalali(value: date) -> str:
    converted = jdatetime.date.fromgregorian(date=value)
    return _fa(f"{converted.year:04d}/{converted.month:02d}/{converted.day:02d}")


def _write_csv(path: Path, headers: list[str], rows: Iterable[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)


def _write_xlsx(
    path: Path, sheet_name: str, headers: list[str], rows: Iterable[dict[str, Any]]
) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = sheet_name
    sheet.sheet_view.rightToLeft = True
    sheet.append(headers)
    for row in rows:
        sheet.append([row.get(header, "") for header in headers])
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    workbook.save(path)


def _accounting_rows(scenario: DemoScenario) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for index, ledger in enumerate(scenario.ledger_records):
        entry = _fa(f"JV-{index + 1:04d}")
        party = COUNTERPARTIES[index % len(COUNTERPARTIES)]
        common = {
            "شماره سند": entry,
            "تاریخ سند": _jalali(ledger.entry_date),
            "شرح": ledger.description,
            "طرف حساب": party,
            "مرجع": ledger.reference or "",
        }
        rows.extend(
            [
                {
                    **common,
                    "کد حساب": "۱۱۰۱",
                    "نام حساب": "بانک‌ها",
                    "بدهکار": _fa(ledger.amount_irr),
                    "بستانکار": "۰",
                },
                {
                    **common,
                    "کد حساب": "۴۱۰۱",
                    "نام حساب": "درآمد خدمات",
                    "بدهکار": "۰",
                    "بستانکار": _fa(ledger.amount_irr),
                },
            ]
        )
    return rows


def _bank_rows(scenario: DemoScenario) -> dict[str, list[dict[str, Any]]]:
    buckets: dict[str, list[dict[str, Any]]] = {
        "mellat": [],
        "saman": [],
        "tejarat": [],
    }
    keys = tuple(buckets)
    running = {key: 500_000_000 for key in keys}
    for index, bank in enumerate(scenario.bank_records):
        key = keys[index % len(keys)]
        running[key] += int(bank.amount_irr)
        buckets[key].append(
            {
                "تاریخ تراکنش": _jalali(bank.booking_date),
                "شرح": bank.description,
                "مبلغ": _fa(bank.amount_irr),
                "شناسه تراکنش": bank.source_transaction_id or "",
                "مرجع": bank.reference or "",
                "مانده": _fa(running[key]),
            }
        )
    return buckets


def _sales_rows() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    start = date(2026, 3, 22)
    for index in range(36):
        issued = start + timedelta(days=index * 5)
        gross = 18_000_000 + index * 410_000
        paid = gross if index < 24 else gross // 3
        rows.append(
            {
                "شماره فاکتور": _fa(f"INV-{1405001 + index}"),
                "تاریخ صدور": _jalali(issued),
                "تاریخ سررسید": _jalali(issued + timedelta(days=30)),
                "نام مشتری": COUNTERPARTIES[index % len(COUNTERPARTIES)],
                "مبلغ کل": _fa(gross),
                "مالیات": "۰",
                "مبلغ وصول شده": _fa(paid),
                "وضعیت": "تسویه" if paid == gross else "باز",
            }
        )
    return rows


def generate_demo_files(output: Path) -> list[Path]:
    output.mkdir(parents=True, exist_ok=True)
    scenario = build_demo_scenario()
    accounting_headers = [
        "شماره سند",
        "تاریخ سند",
        "کد حساب",
        "نام حساب",
        "شرح",
        "بدهکار",
        "بستانکار",
        "مرجع",
        "طرف حساب",
    ]
    bank_headers = ["تاریخ تراکنش", "شرح", "مبلغ", "شناسه تراکنش", "مرجع", "مانده"]
    sales_headers = [
        "شماره فاکتور",
        "تاریخ صدور",
        "تاریخ سررسید",
        "نام مشتری",
        "مبلغ کل",
        "مالیات",
        "مبلغ وصول شده",
        "وضعیت",
    ]
    paths = [
        output / "accounting_1405.xlsx",
        output / "bank_mellat_1405.xlsx",
        output / "bank_saman_1405.csv",
        output / "bank_tejarat_1405.csv",
        output / "sales_1405.xlsx",
        output / "invalid_accounting_1405.csv",
        output / "invalid_sales_1405.xlsx",
        output / "scenario-manifest.json",
    ]
    _write_xlsx(paths[0], "دفتر کل", accounting_headers, _accounting_rows(scenario))
    banks = _bank_rows(scenario)
    _write_xlsx(paths[1], "بانک ملت ساختگی", bank_headers, banks["mellat"])
    _write_csv(paths[2], bank_headers, banks["saman"])
    _write_csv(paths[3], bank_headers, banks["tejarat"])
    _write_xlsx(paths[4], "فروش", sales_headers, _sales_rows())
    _write_csv(
        paths[5],
        accounting_headers,
        [
            {
                "شماره سند": "خطا-۱",
                "تاریخ سند": "۱۴۰۵/۱۳/۴۵",
                "کد حساب": "",
                "نام حساب": "نامشخص",
                "شرح": "ردیف خطادار کاملاً ساختگی",
                "بدهکار": "نامعتبر",
                "بستانکار": "۰",
                "مرجع": "",
                "طرف حساب": "",
            }
        ],
    )
    invalid_sales = _sales_rows()[:1]
    invalid_sales[0]["مبلغ کل"] = "=1+1"
    _write_xlsx(paths[6], "فروش خطادار", sales_headers, invalid_sales)
    paths[7].write_text(
        json.dumps(scenario.manifest(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return paths


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate deterministic synthetic demo data")
    parser.add_argument("--output", type=Path, default=Path("demo-data"))
    args = parser.parse_args()
    for path in generate_demo_files(args.output):
        print(path)


if __name__ == "__main__":
    main()
