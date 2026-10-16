"""Real XLSX upload, scanning, validation, worker completion and tenant-safe comparison."""

import io
import json
import os
import time
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from openpyxl import Workbook

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        os.getenv("RUN_INTEGRATION_TESTS") != "1", reason="Requires local API, storage and scanner"
    ),
]


def test_moadian_xlsx_sales_and_purchases_end_to_end() -> None:
    with httpx.Client(base_url="http://localhost:8000/api/v1", timeout=45) as client:
        email = f"moadian-{uuid4().hex}@example.com"
        password = "Moadian-Test-1234"
        response = client.post(
            "/auth/register",
            json={
                "email": email,
                "full_name": "آزمایش مؤدیان",
                "password": password,
                "workspace_name": "تطبیق کارپوشه",
            },
        )
        assert response.status_code == 201, response.text

        def request(method: str, path: str, **kwargs):
            response = client.request(
                method,
                path,
                headers={
                    "X-CSRF-Token": client.cookies.get("didban_csrf", ""),
                    "Idempotency-Key": uuid4().hex,
                },
                **kwargs,
            )
            assert response.is_success, response.text
            return response.json()

        company = request(
            "POST",
            "/companies",
            json={"legal_name": "آزمایش خرید و فروش کارپوشه", "fiscal_year_start_month": 1},
        )
        base = f"/companies/{company['id']}"

        def upload(kind: str, rows: list[dict[str, object]]):
            book = Workbook()
            sheet = book.active
            sheet.title = "صورتحساب‌ها"
            fields = list(rows[0])
            sheet.append(fields)
            for row in rows:
                sheet.append([row.get(k, "") for k in fields])
            output = io.BytesIO()
            book.save(output)
            batch = request(
                "POST",
                base + "/imports/uploads",
                data={"source_kind": kind, "source_label": "آزمایش اکسل کارپوشه"},
                files={
                    "file": (
                        f"{kind}.xlsx",
                        output.getvalue(),
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    )
                },
            )
            path = base + f"/imports/{batch['id']}"

            def wait(predicate):
                deadline = time.monotonic() + 90
                while time.monotonic() < deadline:
                    current = request("GET", path)
                    assert current["status"] != "failed", current
                    if predicate(current):
                        return current
                    time.sleep(0.3)
                pytest.fail("Import timed out")

            wait(lambda b: b["scan_status"] == "clean")
            preview = request("GET", path + "/preview")
            assert preview["selected_sheet"] == "صورتحساب‌ها"
            request(
                "PUT",
                path + "/mapping",
                json={
                    "sheet_name": "صورتحساب‌ها",
                    "mapping": {k: k for k in fields},
                    "transforms": {
                        k: ["normalize_digits", "parse_date"]
                        if k == "issue_date"
                        else ["normalize_digits", "strip_thousands"]
                        if k in {"gross_amount", "tax_amount"}
                        else ["trim"]
                        for k in fields
                    },
                    "currency_unit": "rial",
                    "calendar": "jalali",
                },
            )
            validation = request("POST", path + "/validate")
            assert validation["batch"]["accepted_count"] > 0
            request("POST", path + "/commit")
            completed = wait(lambda b: b["status"] in {"completed", "completed_limited"})
            assert completed["stage"] == "normalized"
            return batch["id"]

        def row(n: int, sales: bool = False) -> dict[str, object]:
            return {
                "invoice_no": f"INV-{n}",
                "tax_id": f"A111DW{n:016X}",
                "issue_date": "۱۴۰۵/۰۷/۰۹",
                "customer_name" if sales else "party_name": "شرکت نمونه",
                "customer_national_id" if sales else "party_id": "14000000001",
                "gross_amount": "۱۱٬۰۰۰٬۰۰۰",
                "tax_amount": "۱٬۰۰۰٬۰۰۰",
                "subject": "اصلی",
                "status": "تایید شده",
            }

        report_params = None
        for direction, internal_kind, portal_kind in [
            ("sales", "sales", "moadian_sales"),
            ("purchases", "purchases", "moadian_purchases"),
        ]:
            internal_rows = [row(n, direction == "sales") for n in range(1, 31)]
            portal_rows = [row(n) for n in range(1, 30)] + [
                row(31),
                {**row(32), "gross_amount": "-10"},
            ]
            portal_rows[0]["gross_amount"] = "12000000"
            internal_id = upload(internal_kind, internal_rows)
            portal_id = upload(portal_kind, portal_rows)
            params = {
                "internal_batch_id": internal_id,
                "portal_batch_id": portal_id,
                "direction": direction,
                "start_date": "2026-10-01",
                "end_date": "2026-10-11",
                "limit": 25,
            }
            report = request("GET", base + "/moadian/comparison", params=params)
            assert report["counts"] == {
                "difference": 1,
                "matched": 28,
                "internal_only": 1,
                "portal_only": 1,
            }
            assert report["rejected_rows"] == 1
            assert report["total"] == 31 and len(report["items"]) == 25
            assert (
                len(
                    request("GET", base + "/moadian/comparison", params={**params, "offset": 25})[
                        "items"
                    ]
                )
                == 6
            )
            differences = request(
                "GET", base + "/moadian/comparison", params={**params, "status": "difference"}
            )
            assert differences["items"][0]["differences"] == ["مبلغ کل"]
            assert differences["items"][0]["portal"]["row_number"] == 2
            assert (
                request(
                    "GET",
                    base + "/moadian/comparison",
                    params={**params, "start_date": "2026-10-02"},
                )["total"]
                == 0
            )
            assert (
                client.get(
                    base + "/moadian/comparison",
                    params={
                        **params,
                        "direction": "purchases" if direction == "sales" else "sales",
                    },
                ).status_code
                == 422
            )
            if direction == "sales":
                report_params = params

        # Portal and purchase snapshots must not duplicate operational sales balances.
        summary = request("GET", base + "/receivables/summary")
        assert Decimal(summary["total_receivables_irr"]) == Decimal("330000000")

        other = request(
            "POST", "/companies", json={"legal_name": "شرکت جداگانه", "fiscal_year_start_month": 1}
        )
        assert (
            client.get(
                f"/companies/{other['id']}/moadian/comparison", params=report_params
            ).status_code
            == 404
        )
        assert (
            client.get(
                base + "/moadian/comparison", params={**report_params, "start_date": "2027-01-01"}
            ).status_code
            == 422
        )
        # Optional browser test seed contains only disposable, locally-created test data.
        if os.getenv("MOADIAN_BROWSER_SEED"):
            Path(os.environ["MOADIAN_BROWSER_SEED"]).write_text(
                json.dumps(
                    {
                        "email": email,
                        "password": password,
                        "company_id": company["id"],
                        "params": report_params,
                    }
                )
            )
