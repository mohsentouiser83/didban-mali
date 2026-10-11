"""Acceptance coverage of real upload -> canonical data -> review evidence."""

import csv
import io
import os
import time
from datetime import date, timedelta
from uuid import uuid4

import httpx
import pytest

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        os.getenv("RUN_INTEGRATION_TESTS") != "1", reason="Requires the local API and worker stack"
    ),
]


def test_uploaded_bank_and_ledger_publish_traceable_discrepancies():
    with httpx.Client(
        base_url=os.getenv("INTEGRATION_API_URL", "http://localhost:8000/api/v1"), timeout=30
    ) as client:
        response = client.post(
            "/auth/register",
            json={
                "email": f"reconciliation-{uuid4().hex}@example.com",
                "full_name": "آزمایش تطبیق",
                "password": "Reconciliation-Test-1234",
                "workspace_name": "آزمایش خودکار اسناد",
            },
        )
        assert response.status_code == 201, response.text

        def request(method, path, **kwargs):
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
            json={"legal_name": "شرکت آزمایشی تطبیق اسناد", "fiscal_year_start_month": 1},
        )
        base = f"/companies/{company['id']}"

        def upload(kind, rows):
            output = io.StringIO()
            writer = csv.DictWriter(output, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
            batch = request(
                "POST",
                base + "/imports/uploads",
                data={"source_kind": kind, "source_label": "منبع آزمایشی"},
                files={"file": (f"{kind}.csv", output.getvalue().encode("utf-8-sig"), "text/csv")},
            )
            path = base + f"/imports/{batch['id']}"

            def wait(predicate):
                deadline = time.monotonic() + 90
                while time.monotonic() < deadline:
                    result = request("GET", path)
                    assert result["status"] != "failed", result
                    if predicate(result):
                        return result
                    time.sleep(0.2)
                pytest.fail("Upload did not finish")

            wait(lambda row: row["scan_status"] == "clean")
            request(
                "PUT",
                path + "/mapping",
                json={
                    "mapping": {key: key for key in rows[0]},
                    "transforms": {
                        key: ["normalize_digits", "parse_date"]
                        if key.endswith("date")
                        else ["normalize_digits", "strip_thousands"]
                        for key in rows[0]
                        if key.endswith("date") or key in {"debit", "credit", "amount_signed"}
                    },
                    "currency_unit": "rial",
                    "calendar": "gregorian",
                    "header_row": 1,
                },
            )
            checked = request("POST", path + "/validate")
            assert checked["batch"]["rejected_count"] == 0, checked
            request("POST", path + "/commit")
            return wait(
                lambda row: (
                    row["status"] in {"completed", "completed_limited"}
                    and row["coverage"].get("reconciliation", {}).get("detection_run_id")
                )
            )

        today = date.today()
        day = today - timedelta(days=15)
        journal = []
        for ref, amount, booking in [
            ("exact", 100000, day),
            ("amount", 200000, day),
            ("date", 300000, day),
            ("late", 400000, day),
        ]:
            for code, debit, credit in [("1101", amount, 0), ("4101", 0, amount)]:
                journal.append(
                    {
                        "entry_id": ref,
                        "entry_date": booking.isoformat(),
                        "account_code": code,
                        "account_name": "بانک" if code == "1101" else "درآمد",
                        "debit": str(debit),
                        "credit": str(credit),
                        "description": ref,
                        "reference": ref,
                    }
                )
        ledger = upload("accounting", journal)
        assert ledger["coverage"]["reconciliation"]["available"] is False
        assert request("GET", base + "/findings")["items"] == []
        bank = upload(
            "bank",
            [
                {
                    "booking_date": booking.isoformat(),
                    "amount_signed": str(amount),
                    "description": ref,
                    "reference": ref,
                }
                for ref, amount, booking in [
                    ("exact", 100000, day),
                    ("amount", 210000, day),
                    ("date", 300000, day + timedelta(days=8)),
                    ("missing", 500000, day),
                ]
            ],
        )
        assert bank["coverage"]["reconciliation"]["available"] is True
        findings = request("GET", base + "/findings")["items"]
        codes = {f["finding_code"] for f in findings}
        assert {
            "amount_mismatch",
            "date_mismatch",
            "unmatched_bank_transaction",
            "unmatched_accounting_entry",
        } <= codes
        amount = next(f for f in findings if f["finding_code"] == "amount_mismatch")
        detail = request("GET", base + f"/findings/{amount['id']}")
        evidence = detail["evidence"][0]["payload"]
        for side, filename in [("bank", "bank.csv"), ("accounting", "accounting.csv")]:
            assert evidence[side]["source"]["source_filename"] == filename
            assert evidence[side]["source"]["row_number"] >= 2
            response = client.get(
                base
                + f"/imports/source-files/{evidence[side]['source']['source_file_id']}/download"
            )
            assert response.is_success
        late = next(
            f
            for f in findings
            if f["finding_code"] == "unmatched_accounting_entry" and "late" in f["summary_fa"]
        )
        upload(
            "bank",
            [
                {
                    "booking_date": day.isoformat(),
                    "amount_signed": "400000",
                    "description": "late",
                    "reference": "late",
                }
            ],
        )
        assert request("GET", base + f"/findings/{late['id']}")["status"] == "resolved"
        before = request("GET", base + "/findings")["total_count"]
        request("POST", base + "/findings/detect", json={"trigger_type": "manual"})
        assert request("GET", base + "/findings")["total_count"] == before


def test_import_summary_is_company_scoped_and_includes_pending_uploads():
    with httpx.Client(base_url=os.getenv("INTEGRATION_API_URL", "http://localhost:8000/api/v1"), timeout=30) as client:
        response = client.post("/auth/register", json={
            "email": f"summary-{uuid4().hex}@example.com", "full_name": "آزمایش آمار",
            "password": "Reconciliation-Test-1234", "workspace_name": "آمار اسناد",
        })
        assert response.status_code == 201
        headers = {"X-CSRF-Token": client.cookies.get("didban_csrf", ""), "Idempotency-Key": uuid4().hex}
        company = client.post("/companies", headers=headers, json={"legal_name": "آزمایش آمار اسناد", "fiscal_year_start_month": 1})
        assert company.status_code == 201
        base = f"/companies/{company.json()['id']}/imports"
        empty = {"total_count": 0, "pending_count": 0, "completed_count": 0, "failed_count": 0}
        assert client.get(base + "/summary").json() == empty
        upload = client.post(base + "/uploads", headers={**headers, "Idempotency-Key": uuid4().hex},
            data={"source_kind": "bank", "source_label": "منبع آزمایشی"},
            files={"file": ("bank.csv", b"booking_date,amount_signed\n2026-10-01,100000\n", "text/csv")})
        assert upload.status_code == 202, upload.text
        summary = client.get(base + "/summary")
        assert summary.status_code == 200
        assert summary.json() == {**empty, "total_count": 1, "pending_count": 1}
        other = client.post("/companies", headers={**headers, "Idempotency-Key": uuid4().hex},
            json={"legal_name": "شرکت دیگر", "fiscal_year_start_month": 1})
        assert other.status_code == 201
        assert client.get(f"/companies/{other.json()['id']}/imports/summary").json() == empty


def test_import_rows_are_paginated_searchable_and_keep_source_line_numbers():
    with httpx.Client(base_url=os.getenv("INTEGRATION_API_URL", "http://localhost:8000/api/v1"), timeout=30) as client:
        registered = client.post("/auth/register", json={
            "email": f"rows-{uuid4().hex}@example.com", "full_name": "آزمایش ردیف‌ها",
            "password": "Reconciliation-Test-1234", "workspace_name": "ردیف‌های اسناد",
        })
        assert registered.status_code == 201

        def request(method, path, **kwargs):
            response = client.request(method, path, headers={"X-CSRF-Token": client.cookies.get("didban_csrf", ""), "Idempotency-Key": uuid4().hex}, **kwargs)
            assert response.is_success, response.text
            return response.json()

        company = request("POST", "/companies", json={"legal_name": "آزمایش جدول ردیف‌ها", "fiscal_year_start_month": 1})
        base = f"/companies/{company['id']}/imports"
        data = io.StringIO()
        writer = csv.writer(data)
        writer.writerow(["booking_date", "description", "amount_signed"])
        for index in range(61):
            writer.writerow(["invalid" if index == 60 else "2026-10-01", "literal_%" if index == 40 else f"row-{index}", "100000"])
        batch = request("POST", base + "/uploads", data={"source_kind": "bank", "source_label": "آزمایش ردیف‌ها"}, files={"file": ("bank.csv", data.getvalue().encode(), "text/csv")})
        path = base + f"/{batch['id']}"
        deadline = time.monotonic() + 45
        while request("GET", path)["scan_status"] != "clean":
            assert time.monotonic() < deadline
            time.sleep(0.2)
        request("PUT", path + "/mapping", json={
            "mapping": {"booking_date": "booking_date", "description": "description", "amount_signed": "amount_signed"},
            "transforms": {"booking_date": ["normalize_digits", "parse_date"], "amount_signed": ["normalize_digits", "strip_thousands"]},
            "currency_unit": "rial", "calendar": "gregorian", "header_row": 1,
        })
        validated = request("POST", path + "/validate")
        assert validated["issue_counts"].get("error", 0) >= 1
        first = request("GET", path + "/rows?limit=25")
        assert first["total_count"] == 61
        assert first["columns"] == ["booking_date", "description", "amount_signed"]
        assert [row["row_number"] for row in first["items"]] == list(range(2, 27))
        last = request("GET", path + "/rows?limit=25&offset=50")
        assert len(last["items"]) == 11
        assert last["items"][-1]["row_number"] == 62
        matches = request("GET", path + "/rows", params={"search": "literal_%"})
        assert matches["total_count"] == 1
        assert matches["items"][0]["row_number"] == 42
        rejected = request("GET", path + "/rows?row_status=rejected")
        assert rejected["total_count"] == 1
        assert rejected["items"][0]["row_number"] == 62
        assert rejected["items"][0]["issues"]
        assert request("GET", path + "/rows?row_status=accepted")["total_count"] == 60
        other = request("POST", "/companies", json={"legal_name": "شرکت دیگر", "fiscal_year_start_month": 1})
        assert client.get(f"/companies/{other['id']}/imports/{batch['id']}/rows").status_code == 404
