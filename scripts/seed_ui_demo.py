"""Populate an isolated synthetic company through the local application's real API.

Run: .venv/bin/python scripts/seed_ui_demo.py --as-of 2026-10-07
Re-running the same date resumes imports/runs without modifying other companies.
Credentials may be supplied with DIDBAN_SEED_EMAIL / DIDBAN_SEED_PASSWORD.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import httpx

VERSION = "ui-demo-v1"
COMPANY_NAME = "شرکت نمونهٔ آریانا — دادهٔ آزمایشی رابط کاربری"
CUSTOMERS = [
    f"{name} (ساختگی)"
    for name in [
        "بازرگانی سپهر",
        "فناوری هیراد",
        "صنایع پارسا",
        "تجارت آتیه",
        "پخش مهر",
        "توسعه آبان",
        "گروه آریا",
        "خدمات نیکان",
        "پردازش دانا",
        "صنایع ماهان",
        "بازرگانی کارن",
        "توسعه راد",
    ]
]
VENDORS = [
    f"تأمین‌کنندهٔ {name} (ساختگی)"
    for name in ["پارس", "سپید", "نوین", "آرمان", "تابان", "شرق", "پیشرو", "مهرگان"]
]


def csv_bytes(rows: list[dict]) -> bytes:
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode("utf-8-sig")


def generate(as_of: date) -> dict[str, list[dict]]:
    journals: list[dict] = []
    banks: list[list[dict]] = [[], []]
    sales: list[dict] = []
    start = as_of - timedelta(days=89)
    balances = [8_000_000_000, 4_000_000_000]
    serial = 0

    def journal(
        day, debit_account, credit_account, amount, description, party, reference
    ):
        nonlocal serial
        serial += 1
        common = {
            "entry_id": f"UI-JV-{serial:05}",
            "entry_date": day.isoformat(),
            "description": description,
            "counterparty_name": party,
            "reference": reference,
        }
        for account, debit, credit in [
            (debit_account, amount, 0),
            (credit_account, 0, amount),
        ]:
            journals.append(
                dict(
                    **common,
                    account_code=account[0],
                    account_name=account[1],
                    debit=debit,
                    credit=credit,
                )
            )

    cash = ("1101", "بانک‌ها")
    ar = ("1201", "حساب‌های دریافتنی تجاری")
    ap = ("2101", "حساب‌های پرداختنی تجاری")
    revenue = ("4101", "درآمد فروش")
    expense = ("5101", "هزینه‌های عملیاتی")
    equity = ("3101", "سرمایه")
    journal(
        start,
        cash,
        equity,
        sum(balances),
        "مانده افتتاحیهٔ کاملاً ساختگی",
        "شرکت نمونه (ساختگی)",
        "UI-OPENING",
    )
    for index in range(2):
        banks[index].append(
            {
                "booking_date": start.isoformat(),
                "description": "تأمین سرمایهٔ ساختگی",
                "amount_signed": balances[index],
                "transaction_id": f"UI-OPEN-{index}",
                "reference": "UI-OPENING",
                "running_balance": balances[index],
                "counterparty_name": "شرکت نمونه (ساختگی)",
            }
        )

    for i in range(240):
        issued = start + timedelta(days=(i * 7) % 90)
        amount = 72_000_000 + i * 1_370_000
        paid = amount if i % 5 == 0 else amount // 2 if i % 5 in (1, 2, 3) else 0
        party = CUSTOMERS[i % len(CUSTOMERS)]
        reference = f"UI-INV-{i + 1:05}"
        due = issued + timedelta(days=15 + (i % 13) * 7)
        sales.append(
            {
                "invoice_no": reference,
                "issue_date": issued.isoformat(),
                "due_date": due.isoformat(),
                "customer_name": party,
                "gross_amount": amount,
                "tax_amount": 0,
                "paid_amount": paid,
                "payment_date": issued.isoformat() if paid else "",
                "status": "settled" if paid == amount else "open",
                "description": "فاکتور فروش کاملاً ساختگی برای نمایش رابط کاربری",
            }
        )
        journal(issued, ar, revenue, amount, f"فروش به {party}", party, reference)
        if paid:
            journal(issued, cash, ar, paid, f"وصول از {party}", party, reference)
            account = i % 2
            actual = paid + 500_000 if i % 17 == 0 else paid
            balances[account] += actual
            # A few deliberately unmatched/shifted records make review queues useful.
            if i % 19 != 0:
                banks[account].append(
                    {
                        "booking_date": issued.isoformat(),
                        "description": f"وصول از {party}",
                        "amount_signed": actual,
                        "transaction_id": f"UI-RCPT-{i + 1:05}",
                        "reference": reference,
                        "running_balance": balances[account],
                        "counterparty_name": party,
                    }
                )

    for i in range(120):
        day = start + timedelta(days=(i * 11) % 90)
        amount = 90_000_000 + i * 910_000
        party = VENDORS[i % len(VENDORS)]
        reference = f"UI-PUR-{i + 1:05}"
        journal(
            day,
            expense,
            ap,
            amount,
            f"خرید و هزینهٔ عملیاتی از {party}",
            party,
            reference,
        )
        if i % 3 != 0:
            paid = amount if i % 2 == 0 else amount // 2
            journal(day, ap, cash, paid, f"پرداخت به {party}", party, reference)
            account = i % 2
            balances[account] -= paid
            banks[account].append(
                {
                    "booking_date": day.isoformat(),
                    "description": f"پرداخت به {party}",
                    "amount_signed": -paid,
                    "transaction_id": f"UI-PAY-{i + 1:05}",
                    "reference": reference,
                    "running_balance": balances[account],
                    "counterparty_name": party,
                }
            )
    for i in range(8):
        account = i % 2
        amount = -3_700_000 - i * 170_000
        balances[account] += amount
        banks[account].append(
            {
                "booking_date": (as_of - timedelta(days=i)).isoformat(),
                "description": "کارمزد ثبت‌نشدهٔ بانکی (ساختگی)",
                "amount_signed": amount,
                "transaction_id": f"UI-UNMATCHED-{i}",
                "reference": f"UI-FEE-{i}",
                "running_balance": balances[account],
                "counterparty_name": "بانک نمونه (ساختگی)",
            }
        )
    # Recompute running balances chronologically; source rows carry actual signed movements.
    for bank in banks:
        bank.sort(key=lambda item: (item["booking_date"], item["transaction_id"]))
        balance = 0
        for row in bank:
            balance += row["amount_signed"]
            row["running_balance"] = balance
    return {
        "accounting": journals,
        "bank-one": banks[0],
        "bank-two": banks[1],
        "sales": sales,
    }


class Seeder:
    def __init__(self, origin: str, as_of: date, output: Path):
        if urlparse(origin).hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError("This demo seeder targets the local application only.")
        self.client = httpx.Client(base_url=origin.rstrip("/") + "/api/v1", timeout=60)
        self.as_of = as_of
        self.output = output
        self.prefix = f"{VERSION}-{as_of.isoformat()}"
        self.company_id = ""

    def request(self, method: str, path: str, *, key: str = "", **kwargs):
        headers = {}
        if method != "GET":
            headers["X-CSRF-Token"] = self.client.cookies.get("didban_csrf", "")
            if key:
                headers["Idempotency-Key"] = f"{self.prefix}-{key}"
        response = self.client.request(method, path, headers=headers, **kwargs)
        if response.is_error:
            raise RuntimeError(
                f"{method} {path}: HTTP {response.status_code}: {response.text[:600]}"
            )
        return response.json()

    def wait(self, path: str, predicate, timeout: int = 240):
        deadline = time.monotonic() + timeout
        previous = None
        while time.monotonic() < deadline:
            data = self.request("GET", path)
            state = (data.get("status"), data.get("stage"), data.get("scan_status"))
            if state != previous:
                print("  processing:", state, flush=True)
                previous = state
            if data.get("status") == "failed" or data.get("scan_status") in (
                "infected",
                "error",
            ):
                raise RuntimeError(
                    f"Job failed: {data.get('failure_message') or data.get('failure_code') or state}"
                )
            if predicate(data):
                return data
            time.sleep(0.5)
        raise TimeoutError(f"Job did not finish: {path}")

    def import_rows(self, key: str, rows: list[dict]):
        source = "bank" if key.startswith("bank") else key
        filename = f"{self.prefix}-{key}.csv"
        payload = csv_bytes(rows)
        (self.output / filename).write_bytes(payload)
        print(f"Import {key}: {len(rows)} synthetic rows", flush=True)
        batch = self.request(
            "POST",
            f"/companies/{self.company_id}/imports/uploads",
            key=f"upload-{key}",
            data={
                "source_kind": source,
                "source_label": {
                    "accounting": "دفتر حسابداری ساختگی",
                    "bank-one": "بانک سپهر — حساب ساختگی",
                    "bank-two": "بانک آریا — حساب ساختگی",
                    "sales": "فروش نمونهٔ ساختگی",
                }[key],
            },
            files={"file": (filename, payload, "text/csv")},
        )
        path = f"/companies/{self.company_id}/imports/{batch['id']}"
        batch = self.wait(path, lambda b: b["scan_status"] != "pending")
        if batch["status"] in ("completed", "completed_limited"):
            return batch
        if batch["scan_status"] != "clean":
            raise RuntimeError(
                f"Upload did not pass malware scan: {batch['scan_status']}"
            )
        self.request(
            "PUT",
            path + "/mapping",
            key=f"map-v2-{key}",
            json={
                "header_row": 1,
                "mapping": {
                    column: column for column in rows[0] if column != "payment_date"
                },
                "transforms": {
                    column: ["normalize_digits", "parse_date"]
                    if column
                    in (
                        "entry_date",
                        "booking_date",
                        "issue_date",
                        "due_date",
                        "payment_date",
                    )
                    else ["normalize_digits", "strip_thousands"]
                    for column in rows[0]
                    if column
                    in (
                        "entry_date",
                        "booking_date",
                        "issue_date",
                        "due_date",
                        "debit",
                        "credit",
                        "amount_signed",
                        "running_balance",
                        "gross_amount",
                        "tax_amount",
                        "paid_amount",
                    )
                },
                "currency_unit": "rial",
                "calendar": "gregorian",
                "profile_name": f"نمونهٔ رابط کاربری — {key}",
            },
        )
        checked = self.request("POST", path + "/validate", key=f"validate-{key}")
        if checked["batch"]["rejected_count"]:
            raise RuntimeError(
                f"Seed validation rejected rows: {checked['issue_counts']}"
            )
        self.request("POST", path + "/commit", key=f"commit-{key}")
        return self.wait(
            path, lambda b: b["status"] in ("completed", "completed_limited")
        )

    def run(self):
        self.output.mkdir(parents=True, exist_ok=True)
        login = self.client.post(
            "/auth/login",
            json={
                "email": os.getenv("DIDBAN_SEED_EMAIL", "admin"),
                "password": os.getenv("DIDBAN_SEED_PASSWORD", "admin"),
            },
        )
        login.raise_for_status()
        companies = self.request("GET", "/companies")
        company = next(
            (item for item in companies if item["legal_name"] == COMPANY_NAME), None
        )
        if company is None:
            company = self.request(
                "POST",
                "/companies",
                json={"legal_name": COMPANY_NAME, "fiscal_year_start_month": 1},
            )
        self.company_id = company["id"]
        print(f"Synthetic company: {self.company_id}", flush=True)
        manifest = {
            "version": VERSION,
            "synthetic": True,
            "as_of": str(self.as_of),
            "company_id": self.company_id,
            "company_name": COMPANY_NAME,
            "imports": {},
            "analyses": [],
        }
        for key, rows in generate(self.as_of).items():
            manifest["imports"][key] = self.import_rows(key, rows)
        base = f"/companies/{self.company_id}"
        for index in range(3):
            start = self.as_of - timedelta(days=89 - index * 30)
            end = start + timedelta(days=29)
            print(f"Analysis {index + 1}: {start} .. {end}", flush=True)
            run = self.request(
                "POST",
                base + "/analysis-runs",
                key=f"analysis-{index}",
                json={
                    "period_start": str(start),
                    "period_end": str(end),
                    "rule_set_version": "financial-metrics-v1",
                },
            )
            run = self.wait(
                base + f"/analysis-runs/{run['id']}",
                lambda item: item["status"] in ("completed", "completed_limited"),
            )
            manifest["analyses"].append(run)
        for index, run in enumerate(manifest["analyses"]):
            finding_run = self.request(
                "POST",
                base + f"/analysis-runs/{run['id']}/finding-runs",
                key=f"finding-run-{index}",
                json={"trend_ratio": "0.01", "minimum_amount_irr": "1000000"},
            )
            self.wait(
                base + f"/finding-runs/{finding_run['id']}",
                lambda item: item["status"] in ("completed", "completed_limited"),
            )
        canonical_runs = self.request("GET", base + "/reconciliation/runs")
        reconcile = next(
            (
                item
                for item in canonical_runs
                if item["status"] == "completed"
                and item.get("analysis_run_id") is None
                and item.get("period_end") == str(self.as_of)
            ),
            None,
        )
        if reconcile is None:
            reconcile = self.request(
                "POST",
                base + "/reconciliation/runs",
                key="canonical-reconciliation",
                json={
                    "config_version": "reconciliation-v2",
                    "period_start": str(self.as_of - timedelta(days=89)),
                    "period_end": str(self.as_of),
                },
            )
        manifest["reconciliation"] = reconcile
        print("Calculate executive dashboard and 13-week forecast", flush=True)
        manifest["previous_calculation"] = self.request(
            "POST",
            base + "/calculations/run",
            key="previous-calculation",
            json={
                "as_of_date": str(self.as_of - timedelta(days=30)),
                "period_start": str(self.as_of - timedelta(days=89)),
                "period_end": str(self.as_of - timedelta(days=30)),
            },
        )
        manifest["calculation"] = self.request(
            "POST",
            base + "/calculations/run",
            key="calculation",
            json={
                "as_of_date": str(self.as_of),
                "period_start": str(self.as_of - timedelta(days=89)),
                "period_end": str(self.as_of),
            },
        )
        manifest["detection"] = self.request(
            "POST",
            base + "/findings/detect",
            key="detection",
            json={
                "period_start": str(self.as_of - timedelta(days=89)),
                "period_end": str(self.as_of),
                "calculation_run_id": manifest["calculation"]["id"],
                "reconciliation_run_id": reconcile["id"],
            },
        )
        saved_names = {
            item["name"]
            for item in self.request("GET", base + "/simulation/scenarios")["items"]
        }
        for index, params in enumerate(
            [
                {"dso_change_days": -10},
                {"dpo_change_days": 15},
                {"fixed_cost_monthly_change_irr": "120000000"},
            ]
        ):
            if [
                "وصول سریع‌تر — نمونه",
                "مهلت پرداخت بیشتر — نمونه",
                "افزایش هزینه — نمونه",
            ][index] in saved_names:
                continue
            self.request(
                "POST",
                base + "/simulation/scenarios",
                key=f"scenario-{index}",
                json={
                    "name": [
                        "وصول سریع‌تر — نمونه",
                        "مهلت پرداخت بیشتر — نمونه",
                        "افزایش هزینه — نمونه",
                    ][index],
                    "description": "سناریوی کاملاً ساختگی برای مشاهدهٔ رابط کاربری",
                    "is_favorite": index == 0,
                    "parameters": params,
                },
            )
        manifest["reports"] = []
        for index, run in enumerate(manifest["analyses"]):
            report = self.request(
                "POST",
                base + "/reports",
                key=f"report-{index}",
                json={
                    "analysis_run_id": run["id"],
                    "title_fa": f"گزارش نمونهٔ مالی — دورهٔ {index + 1}",
                    "advisor_note": "تمام اطلاعات این گزارش ساختگی و صرفاً برای مشاهدهٔ رابط کاربری است.",
                },
            )
            report = self.wait(
                base + f"/reports/{report['id']}",
                lambda item: item["status"] == "completed",
            )
            manifest["reports"].append(report)
        manifest["dashboard"] = self.request("GET", base + "/dashboard")
        manifest["executive_dashboard"] = self.request(
            "GET", base + "/calculations/dashboard"
        )
        (self.output / "ui-seed-manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
        )
        print(
            "Seed complete:",
            json.dumps(
                {
                    "company_id": self.company_id,
                    "rows": {
                        key: len(rows) for key, rows in generate(self.as_of).items()
                    },
                    "findings": manifest["dashboard"]["finding_summary"]["total"],
                },
                ensure_ascii=False,
            ),
            flush=True,
        )
        self.client.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", default="http://127.0.0.1:8000")
    parser.add_argument(
        "--as-of",
        type=date.fromisoformat,
        default=datetime.now(ZoneInfo("Asia/Tehran")).date(),
    )
    parser.add_argument("--output", type=Path, default=Path("demo-data/ui-preview"))
    args = parser.parse_args()
    Seeder(args.origin, args.as_of, args.output).run()


if __name__ == "__main__":
    main()
