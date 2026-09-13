import os
import time
from typing import Any

import httpx
import psycopg
import pytest

RUN_INTEGRATION_TESTS = os.getenv("RUN_INTEGRATION_TESTS") == "1"
API_URL = os.getenv("INTEGRATION_API_URL", "http://localhost:8000/api/v1")
APP_DATABASE_URL = os.getenv(
    "INTEGRATION_DATABASE_URL",
    "postgresql://didban_app:change-me-app-password@localhost:55432/didban_mali",
)

pytestmark = pytest.mark.skipif(
    not RUN_INTEGRATION_TESTS,
    reason="Set RUN_INTEGRATION_TESTS=1 while the local Docker stack is running.",
)


def register(label: str) -> tuple[httpx.Client, dict[str, Any], str]:
    client = httpx.Client(base_url=API_URL)
    email = f"tenant-{time.time_ns()}@example.com"
    response = client.post(
        "/auth/register",
        json={
            "email": email,
            "full_name": f"کاربر {label}",
            "password": "Secure-Pass-1234",
            "workspace_name": f"فضای {label}",
        },
    )
    assert response.status_code == 201, response.text
    return client, response.json()["user"], email


def create_company(client: httpx.Client, name: str) -> dict[str, Any]:
    response = client.post(
        "/companies",
        headers={"X-CSRF-Token": client.cookies["didban_csrf"]},
        json={
            "legal_name": name,
            "national_id": "14001234567",
            "fiscal_year_start_month": 1,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def upload_csv(
    client: httpx.Client,
    company_id: str,
    name: str,
    content: bytes,
    idempotency_key: str | None = None,
    *,
    source_kind: str = "accounting",
    source_label: str = "دفتر آزمایشی",
) -> httpx.Response:
    return client.post(
        f"/companies/{company_id}/imports/uploads",
        headers={
            "X-CSRF-Token": client.cookies["didban_csrf"],
            "Idempotency-Key": idempotency_key or f"upload-{time.time_ns()}",
        },
        data={"source_kind": source_kind, "source_label": source_label},
        files={"file": (name, content, "text/csv")},
        timeout=60,
    )


def wait_for_scan(client: httpx.Client, company_id: str, batch_id: str) -> dict[str, Any]:
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        response = client.get(f"/companies/{company_id}/imports/{batch_id}")
        assert response.status_code == 200, response.text
        batch = response.json()
        if batch["scan_status"] != "pending":
            return batch
        time.sleep(1)
    pytest.fail("Malware scan did not complete within 120 seconds")


def wait_for_normalization(client: httpx.Client, company_id: str, batch_id: str) -> dict[str, Any]:
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        response = client.get(f"/companies/{company_id}/imports/{batch_id}")
        assert response.status_code == 200, response.text
        batch = response.json()
        if batch["status"] in {"completed", "completed_limited", "failed"}:
            return batch
        time.sleep(0.25)
    pytest.fail("Canonical normalization did not complete within 60 seconds")


def wait_for_analysis(client: httpx.Client, company_id: str, run_id: str) -> dict[str, Any]:
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        response = client.get(f"/companies/{company_id}/analysis-runs/{run_id}")
        assert response.status_code == 200, response.text
        run = response.json()
        if run["status"] in {"completed", "completed_limited", "failed"}:
            return run
        time.sleep(0.25)
    pytest.fail("Financial calculation did not complete within 60 seconds")


def wait_for_reconciliation(client: httpx.Client, company_id: str, run_id: str) -> dict[str, Any]:
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        response = client.get(f"/companies/{company_id}/reconciliation-runs/{run_id}")
        assert response.status_code == 200, response.text
        run = response.json()
        if run["status"] in {"completed", "completed_limited", "failed"}:
            return run
        time.sleep(0.25)
    pytest.fail("Reconciliation did not complete within 60 seconds")


def wait_for_findings(client: httpx.Client, company_id: str, run_id: str) -> dict[str, Any]:
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        response = client.get(f"/companies/{company_id}/finding-runs/{run_id}")
        assert response.status_code == 200, response.text
        run = response.json()
        if run["status"] in {"completed", "completed_limited", "failed"}:
            return run
        time.sleep(0.25)
    pytest.fail("Finding generation did not complete within 60 seconds")


@pytest.mark.integration
def test_tenants_are_isolated_and_roles_are_enforced() -> None:
    owner_a, user_a, _ = register("الف")
    owner_b, _, _ = register("ب")
    viewer, _, viewer_email = register("مشاهده‌گر")

    without_csrf = owner_a.post("/companies", json={"legal_name": "بدون توکن"})
    assert without_csrf.status_code == 403

    company_a = create_company(owner_a, "شرکت مستقل الف")
    create_company(owner_b, "شرکت مستقل ب")

    visible_to_a = owner_a.get("/companies").json()
    assert [company["id"] for company in visible_to_a] == [company_a["id"]]
    assert owner_b.get(f"/companies/{company_a['id']}").status_code == 404

    added = owner_a.post(
        f"/companies/{company_a['id']}/members",
        headers={"X-CSRF-Token": owner_a.cookies["didban_csrf"]},
        json={"email": viewer_email, "role": "viewer"},
    )
    assert added.status_code == 201, added.text

    forbidden_update = viewer.patch(
        f"/companies/{company_a['id']}",
        headers={"X-CSRF-Token": viewer.cookies["didban_csrf"]},
        json={"legal_name": "تغییر غیرمجاز"},
    )
    assert forbidden_update.status_code == 403
    forbidden_upload = upload_csv(viewer, company_a["id"], "محدود.csv", b"id,amount\n1,10")
    assert forbidden_upload.status_code == 403

    with psycopg.connect(APP_DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config(%s, %s, true)", ("app.user_id", user_a["id"]))
            cursor.execute("SELECT id::text FROM companies ORDER BY id")
            visible_ids = [row[0] for row in cursor.fetchall()]
    assert visible_ids == [company_a["id"]]

    owner_a.close()
    owner_b.close()
    viewer.close()


@pytest.mark.integration
def test_secure_upload_scan_and_authorized_download() -> None:
    owner, owner_user, _ = register("بارگذاری")
    outsider, outsider_user, _ = register("خارج")
    reviewer, reviewer_user, reviewer_email = register("مدیر مالی")
    company = create_company(owner, "شرکت بارگذاری امن")
    reviewer_membership = owner.post(
        f"/companies/{company['id']}/members",
        headers={"X-CSRF-Token": owner.cookies["didban_csrf"]},
        json={"email": reviewer_email, "role": "finance_manager"},
    )
    assert reviewer_membership.status_code == 201, reviewer_membership.text
    clean_content = (
        "شماره سند,تاریخ سند,کد حساب,نام حساب,شرح,بدهکار,بستانکار\n"
        '۱,۱۴۰۵/۰۶/۲۱,۴۱۰۱,فروش,فروش شهریور,۰,"۲۵۰,۰۰۰"\n'
        '۱,۱۴۰۵/۰۶/۲۱,۱۱۰۱,بانک,وصول فروش,"۲۵۰,۰۰۰",۰\n'
    ).encode()

    idempotency_key = f"upload-{time.time_ns()}"
    uploaded = upload_csv(
        owner,
        company["id"],
        "دفتر شهریور.csv",
        clean_content,
        idempotency_key,
    )
    assert uploaded.status_code == 202, uploaded.text
    batch_id = uploaded.json()["id"]
    repeated = upload_csv(owner, company["id"], "تکرار.csv", clean_content, idempotency_key)
    assert repeated.status_code == 202
    assert repeated.json()["id"] == batch_id

    assert outsider.get(f"/companies/{company['id']}/imports/{batch_id}").status_code == 404
    assert (
        outsider.get(f"/companies/{company['id']}/imports/{batch_id}/download").status_code == 404
    )

    clean_batch = wait_for_scan(owner, company["id"], batch_id)
    assert clean_batch["status"] == "awaiting_mapping"
    assert clean_batch["scan_status"] == "clean"
    downloaded = owner.get(f"/companies/{company['id']}/imports/{batch_id}/download")
    assert downloaded.status_code == 200, downloaded.text
    assert downloaded.content == clean_content

    preview = owner.get(f"/companies/{company['id']}/imports/{batch_id}/preview")
    assert preview.status_code == 200, preview.text
    assert preview.json()["rows"][0]["raw"]["تاریخ سند"] == "۱۴۰۵/۰۶/۲۱"
    suggested_fields = {item["target_field"] for item in preview.json()["suggestions"]}
    assert {"entry_date", "account_code", "credit"} <= suggested_fields

    mapping_payload = {
        "header_row": 1,
        "mapping": {
            "entry_id": "شماره سند",
            "entry_date": "تاریخ سند",
            "account_code": "کد حساب",
            "account_name": "نام حساب",
            "description": "شرح",
            "debit": "بدهکار",
            "credit": "بستانکار",
        },
        "transforms": {
            "entry_id": ["trim", "normalize_digits"],
            "entry_date": ["trim", "normalize_digits", "parse_date"],
            "account_code": ["trim", "normalize_digits"],
            "account_name": ["trim"],
            "description": ["trim"],
            "debit": ["normalize_digits", "strip_thousands", "toman_to_rial"],
            "credit": ["normalize_digits", "strip_thousands", "toman_to_rial"],
        },
        "currency_unit": "toman",
        "calendar": "jalali",
        "profile_name": "دفتر استاندارد فارسی",
    }
    mutation_headers = {
        "X-CSRF-Token": owner.cookies["didban_csrf"],
        "Idempotency-Key": f"mapping-{time.time_ns()}",
    }
    confirmed = owner.put(
        f"/companies/{company['id']}/imports/{batch_id}/mapping",
        headers=mutation_headers,
        json=mapping_payload,
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["currency_unit"] == "toman"
    assert confirmed.json()["calendar"] == "jalali"

    mapped_preview = owner.get(f"/companies/{company['id']}/imports/{batch_id}/preview")
    assert mapped_preview.status_code == 200, mapped_preview.text
    transformed = mapped_preview.json()["rows"][0]["transformed"]
    assert transformed["entry_date"] == "2026-09-12"
    assert transformed["credit"] == "2500000"

    validation_headers = {
        "X-CSRF-Token": owner.cookies["didban_csrf"],
        "Idempotency-Key": f"validate-{time.time_ns()}",
    }
    validated = owner.post(
        f"/companies/{company['id']}/imports/{batch_id}/validate",
        headers=validation_headers,
    )
    assert validated.status_code == 200, validated.text
    assert validated.json()["batch"]["stage"] == "validation_ready"
    assert validated.json()["batch"]["accepted_count"] == 2
    assert validated.json()["coverage"]["overall"] == 100

    issues = owner.get(f"/companies/{company['id']}/imports/{batch_id}/issues")
    assert issues.status_code == 200, issues.text
    assert issues.json()["total"] == 0

    committed = owner.post(
        f"/companies/{company['id']}/imports/{batch_id}/commit",
        headers={
            "X-CSRF-Token": owner.cookies["didban_csrf"],
            "Idempotency-Key": f"commit-{time.time_ns()}",
        },
    )
    assert committed.status_code == 200, committed.text
    assert committed.json()["status"] == "queued"
    assert committed.json()["stage"] == "ready_for_normalization"

    normalized_batch = wait_for_normalization(owner, company["id"], batch_id)
    assert normalized_batch["status"] == "completed_limited", normalized_batch
    assert normalized_batch["stage"] == "normalized"
    assert normalized_batch["coverage"]["canonical_model"] == {
        "available": True,
        "score": 100,
        "expected_rows": 2,
        "normalized_rows": 2,
        "lineage_complete": True,
    }
    assert normalized_batch["coverage"]["profit_analysis"]["available"] is False
    assert normalized_batch["coverage"]["journal_balance"] == {
        "available": True,
        "score": 100,
        "reasons": [],
    }

    unclassified = owner.get(f"/companies/{company['id']}/accounts/unclassified")
    assert unclassified.status_code == 200, unclassified.text
    assert {account["source_code"] for account in unclassified.json()} == {"1101", "4101"}
    classes = {"1101": "asset", "4101": "revenue"}
    for account in unclassified.json():
        classified = owner.put(
            f"/companies/{company['id']}/accounts/{account['id']}/classification",
            headers={
                "X-CSRF-Token": owner.cookies["didban_csrf"],
                "Idempotency-Key": f"classification-{time.time_ns()}",
            },
            json={
                "account_class": classes[account["source_code"]],
                "effective_from": "2026-03-21",
                "rule_version": "human-v1",
            },
        )
        assert classified.status_code == 200, classified.text
    assert owner.get(f"/companies/{company['id']}/accounts/unclassified").json() == []

    analysis_key = f"analysis-{time.time_ns()}"
    analysis_payload = {
        "period_start": "2026-09-01",
        "period_end": "2026-09-30",
        "rule_set_version": "financial-metrics-v1",
    }
    analysis = owner.post(
        f"/companies/{company['id']}/analysis-runs",
        headers={
            "X-CSRF-Token": owner.cookies["didban_csrf"],
            "Idempotency-Key": analysis_key,
        },
        json=analysis_payload,
    )
    assert analysis.status_code == 202, analysis.text
    run_id = analysis.json()["id"]
    repeated_analysis = owner.post(
        f"/companies/{company['id']}/analysis-runs",
        headers={
            "X-CSRF-Token": owner.cookies["didban_csrf"],
            "Idempotency-Key": analysis_key,
        },
        json=analysis_payload,
    )
    assert repeated_analysis.status_code == 202, repeated_analysis.text
    assert repeated_analysis.json()["id"] == run_id

    completed_analysis = wait_for_analysis(owner, company["id"], run_id)
    assert completed_analysis["status"] == "completed_limited", completed_analysis
    assert completed_analysis["rule_set_version"] == "financial-metrics-v1"
    assert completed_analysis["input_manifest"]["import_batch_ids"] == [batch_id]
    assert completed_analysis["coverage"]["accounting"] == {
        "available": True,
        "score": 100,
        "total_lines": 2,
        "classified_lines": 2,
        "unclassified_lines": 0,
        "reasons": [],
    }
    assert completed_analysis["coverage"]["bank_cash_flow"]["available"] is False
    assert completed_analysis["coverage"]["sales"]["available"] is False

    metric_response = owner.get(
        f"/companies/{company['id']}/metrics", params={"analysis_run_id": run_id}
    )
    assert metric_response.status_code == 200, metric_response.text
    metric_items = {item["metric_code"]: item for item in metric_response.json()["metrics"]}
    assert {code: item["value_irr"] for code, item in metric_items.items()} == {
        "expenses_irr": "0",
        "net_profit_irr": "2500000",
        "revenue_irr": "2500000",
        "total_assets_irr": "2500000",
        "total_equity_irr": "0",
        "total_liabilities_irr": "0",
        "net_margin_ratio": None,
    }
    assert metric_items["net_margin_ratio"]["value_ratio"] == "1.000000"
    assert metric_items["revenue_irr"]["calculation"]["unit"] == "IRR"
    assert outsider.get(f"/companies/{company['id']}/analysis-runs/{run_id}").status_code == 404

    bank_content = (
        "تاریخ تراکنش,شرح,مبلغ,شناسه تراکنش\n"
        "۱۴۰۵/۰۶/۲۱,فروش شهریور,۲۵۰۰۰۰۰,TX-1405-001\n"
        "۱۴۰۵/۰۶/۲۲,کارمزد ناشناخته,-۹۹۹۹۹۹,TX-1405-002\n"
    ).encode()
    bank_upload = upload_csv(
        owner,
        company["id"],
        "گردش بانک.csv",
        bank_content,
        source_kind="bank",
        source_label="بانک آزمایشی",
    )
    assert bank_upload.status_code == 202, bank_upload.text
    bank_batch_id = bank_upload.json()["id"]
    assert wait_for_scan(owner, company["id"], bank_batch_id)["status"] == "awaiting_mapping"
    bank_mapping = owner.put(
        f"/companies/{company['id']}/imports/{bank_batch_id}/mapping",
        headers={
            "X-CSRF-Token": owner.cookies["didban_csrf"],
            "Idempotency-Key": f"bank-mapping-{time.time_ns()}",
        },
        json={
            "header_row": 1,
            "mapping": {
                "booking_date": "تاریخ تراکنش",
                "description": "شرح",
                "amount_signed": "مبلغ",
                "transaction_id": "شناسه تراکنش",
            },
            "transforms": {
                "booking_date": ["trim", "normalize_digits", "parse_date"],
                "description": ["trim"],
                "amount_signed": ["normalize_digits", "strip_thousands"],
                "transaction_id": ["trim", "normalize_digits"],
            },
            "currency_unit": "rial",
            "calendar": "jalali",
            "profile_name": "گردش استاندارد بانک",
        },
    )
    assert bank_mapping.status_code == 200, bank_mapping.text
    bank_validation = owner.post(
        f"/companies/{company['id']}/imports/{bank_batch_id}/validate",
        headers={
            "X-CSRF-Token": owner.cookies["didban_csrf"],
            "Idempotency-Key": f"bank-validation-{time.time_ns()}",
        },
    )
    assert bank_validation.status_code == 200, bank_validation.text
    assert bank_validation.json()["batch"]["accepted_count"] == 2
    bank_commit = owner.post(
        f"/companies/{company['id']}/imports/{bank_batch_id}/commit",
        headers={
            "X-CSRF-Token": owner.cookies["didban_csrf"],
            "Idempotency-Key": f"bank-commit-{time.time_ns()}",
        },
    )
    assert bank_commit.status_code == 200, bank_commit.text
    assert wait_for_normalization(owner, company["id"], bank_batch_id)["status"] == "completed"

    reconciliation_analysis = owner.post(
        f"/companies/{company['id']}/analysis-runs",
        headers={
            "X-CSRF-Token": owner.cookies["didban_csrf"],
            "Idempotency-Key": f"analysis-with-bank-{time.time_ns()}",
        },
        json=analysis_payload,
    )
    assert reconciliation_analysis.status_code == 202, reconciliation_analysis.text
    reconciliation_analysis_id = reconciliation_analysis.json()["id"]
    analysis_with_bank = wait_for_analysis(owner, company["id"], reconciliation_analysis_id)
    assert analysis_with_bank["coverage"]["bank_cash_flow"]["available"] is True
    assert set(analysis_with_bank["input_manifest"]["import_batch_ids"]) == {
        batch_id,
        bank_batch_id,
    }

    reconciliation_key = f"reconciliation-{time.time_ns()}"
    reconciliation = owner.post(
        f"/companies/{company['id']}/analysis-runs/"
        f"{reconciliation_analysis_id}/reconciliation-runs",
        headers={
            "X-CSRF-Token": owner.cookies["didban_csrf"],
            "Idempotency-Key": reconciliation_key,
        },
        json={},
    )
    assert reconciliation.status_code == 202, reconciliation.text
    reconciliation_id = reconciliation.json()["id"]
    repeated_reconciliation = owner.post(
        f"/companies/{company['id']}/analysis-runs/"
        f"{reconciliation_analysis_id}/reconciliation-runs",
        headers={
            "X-CSRF-Token": owner.cookies["didban_csrf"],
            "Idempotency-Key": reconciliation_key,
        },
        json={},
    )
    assert repeated_reconciliation.status_code == 202, repeated_reconciliation.text
    assert repeated_reconciliation.json()["id"] == reconciliation_id
    reconciled = wait_for_reconciliation(owner, company["id"], reconciliation_id)
    assert reconciled["status"] == "completed", reconciled
    assert reconciled["counts"] == {
        "bank_transactions": 2,
        "accounting_entries": 1,
        "auto_matched": 1,
        "potential_matches": 0,
        "amount_mismatches": 0,
        "date_mismatches": 0,
        "duplicates": 0,
        "unresolved": 1,
    }
    matches = owner.get(
        f"/companies/{company['id']}/reconciliation-runs/{reconciliation_id}/matches",
        params={"match_status": "auto_matched"},
    )
    assert matches.status_code == 200, matches.text
    assert len(matches.json()["items"]) == 1
    exact_match = matches.json()["items"][0]
    assert exact_match["status"] == "auto_matched"
    assert exact_match["match_level"] == "exact"
    assert exact_match["score"] == "100.00"
    assert exact_match["rule_code"] == "EXACT_AMOUNT_DATE_IDENTITY"
    assert exact_match["evidence"]["bank"]["source_row_id"]
    assert exact_match["evidence"]["accounting"]["source_row_id"]

    finding_key = f"findings-{time.time_ns()}"
    finding_request = {
        "reconciliation_run_id": reconciliation_id,
        "config_version": "finding-rules-v1",
        "trend_ratio": "0.10",
        "minimum_amount_irr": "1000000",
    }
    finding_run_response = owner.post(
        f"/companies/{company['id']}/analysis-runs/{reconciliation_analysis_id}/finding-runs",
        headers={
            "X-CSRF-Token": owner.cookies["didban_csrf"],
            "Idempotency-Key": finding_key,
        },
        json=finding_request,
    )
    assert finding_run_response.status_code == 202, finding_run_response.text
    finding_run_id = finding_run_response.json()["id"]
    repeated_finding_run = owner.post(
        f"/companies/{company['id']}/analysis-runs/{reconciliation_analysis_id}/finding-runs",
        headers={
            "X-CSRF-Token": owner.cookies["didban_csrf"],
            "Idempotency-Key": finding_key,
        },
        json=finding_request,
    )
    assert repeated_finding_run.status_code == 202, repeated_finding_run.text
    assert repeated_finding_run.json()["id"] == finding_run_id
    finding_run = wait_for_findings(owner, company["id"], finding_run_id)
    assert finding_run["status"] == "completed_limited", finding_run
    assert finding_run["counts"] == {
        "total": 1,
        "by_code": {"potential_missing_transaction": 1},
        "catalog_size": 8,
        "evidence_items": 3,
    }
    assert finding_run["coverage"]["reconciliation_findings"]["available"] is True
    assert finding_run["coverage"]["financial_trends"]["available"] is False
    finding_list = owner.get(
        f"/companies/{company['id']}/findings",
        params={"generation_run_id": finding_run_id},
    )
    assert finding_list.status_code == 200, finding_list.text
    assert len(finding_list.json()["items"]) == 1
    generated_finding = finding_list.json()["items"][0]
    assert generated_finding["finding_code"] == "potential_missing_transaction"
    assert generated_finding["assertion_status"] == "hypothesis"
    assert generated_finding["workflow_status"] == "needs_review"
    assert generated_finding["priority_band"] == "high"
    assert generated_finding["priority_score"] == "70.50"
    assert set(generated_finding["priority_explanation"]["factors"]) == {
        "impact",
        "materiality",
        "confidence",
        "urgency",
    }
    assert generated_finding["priority_model_version"].startswith("priority-v1:")
    assert generated_finding["priority_config"]["weights"]["impact"] == "0.40"
    assert generated_finding["reconciliation_match_id"]
    assert "احتمالاً" in generated_finding["title_fa"]
    finding_id = generated_finding["id"]
    assert owner.get(f"/companies/{company['id']}/findings/{finding_id}").status_code == 200
    evidence_response = owner.get(f"/companies/{company['id']}/findings/{finding_id}/evidence")
    assert evidence_response.status_code == 200, evidence_response.text
    evidence = evidence_response.json()["items"]
    assert [item["evidence_type"] for item in evidence] == [
        "rule",
        "calculation",
        "source_record",
    ]
    assert evidence[2]["source_row_id"]
    assert evidence[2]["source_file_id"]
    assert evidence[2]["field_snapshot"]["raw"]
    assert evidence[2]["field_snapshot"]["source_file"]["original_name"] == "گردش بانک.csv"
    completed_repeat = owner.post(
        f"/companies/{company['id']}/analysis-runs/{reconciliation_analysis_id}/finding-runs",
        headers={
            "X-CSRF-Token": owner.cookies["didban_csrf"],
            "Idempotency-Key": finding_key,
        },
        json=finding_request,
    )
    assert completed_repeat.status_code == 202, completed_repeat.text
    assert completed_repeat.json()["id"] == finding_run_id
    assert (
        len(owner.get(f"/companies/{company['id']}/findings/{finding_id}/evidence").json()["items"])
        == 3
    )
    dashboard_response = owner.get(
        f"/companies/{company['id']}/dashboard",
        params={"analysis_run_id": reconciliation_analysis_id},
    )
    assert dashboard_response.status_code == 200, dashboard_response.text
    dashboard = dashboard_response.json()
    assert dashboard["snapshot"]["analysis_run_id"] == reconciliation_analysis_id
    assert dashboard["snapshot"]["comparison_analysis_run_id"] is None
    assert dashboard["health"]["overall_state"] == "attention"
    assert dashboard["health"]["financial_state"] == "attention"
    assert dashboard["health"]["data_quality"] == "limited"
    assert dashboard["health"]["highest_open_priority"] == "high"
    metrics_by_code = {item["metric_code"]: item for item in dashboard["metrics"]}
    assert metrics_by_code["revenue_irr"]["value"] == "2500000"
    assert metrics_by_code["net_cash_movement_irr"]["value"] == "1500001"
    assert metrics_by_code["payables_irr"]["available"] is False
    assert "تفکیک" in metrics_by_code["payables_irr"]["unavailable_reason_fa"]
    assert dashboard["finding_summary"]["total"] == 1
    assert dashboard["finding_summary"]["by_priority"] == {
        "critical": 0,
        "high": 1,
        "medium": 0,
        "low": 0,
    }
    assert len(dashboard["top_findings"]) == 1
    assert dashboard["top_findings"][0]["id"] == finding_id
    assert dashboard["main_drivers"] == []
    assert dashboard["coverage"]["overall_score"] == 50
    assert dashboard["coverage"]["finding_generation_status"] == "completed_limited"
    period_dashboard = owner.get(
        f"/companies/{company['id']}/dashboard", params={"period": "2026-09"}
    )
    assert period_dashboard.status_code == 200, period_dashboard.text
    assert period_dashboard.json()["snapshot"]["analysis_run_id"] == reconciliation_analysis_id
    assert outsider.get(f"/companies/{company['id']}/dashboard").status_code == 404
    owner_decision = owner.post(
        f"/companies/{company['id']}/findings/{finding_id}/decisions",
        headers={
            "X-CSRF-Token": owner.cookies["didban_csrf"],
            "Idempotency-Key": f"owner-review-{time.time_ns()}",
        },
        json={"decision": "confirmed"},
    )
    assert owner_decision.status_code == 403
    follow_up_key = f"follow-up-{time.time_ns()}"
    follow_up_request = {
        "decision": "follow_up",
        "note": "پیگیری ثبت متناظر با واحد حسابداری",
    }
    follow_up = reviewer.post(
        f"/companies/{company['id']}/findings/{finding_id}/decisions",
        headers={
            "X-CSRF-Token": reviewer.cookies["didban_csrf"],
            "Idempotency-Key": follow_up_key,
        },
        json=follow_up_request,
    )
    assert follow_up.status_code == 201, follow_up.text
    assert follow_up.json()["previous_status"] == "needs_review"
    assert follow_up.json()["resulting_status"] == "follow_up"
    repeated_follow_up = reviewer.post(
        f"/companies/{company['id']}/findings/{finding_id}/decisions",
        headers={
            "X-CSRF-Token": reviewer.cookies["didban_csrf"],
            "Idempotency-Key": follow_up_key,
        },
        json=follow_up_request,
    )
    assert repeated_follow_up.status_code == 201, repeated_follow_up.text
    assert repeated_follow_up.json()["id"] == follow_up.json()["id"]
    first_note = reviewer.post(
        f"/companies/{company['id']}/findings/{finding_id}/notes",
        headers={
            "X-CSRF-Token": reviewer.cookies["didban_csrf"],
            "Idempotency-Key": f"note-{time.time_ns()}",
        },
        json={"body": "منتظر پاسخ واحد حسابداری"},
    )
    assert first_note.status_code == 201, first_note.text
    replacement_note = reviewer.post(
        f"/companies/{company['id']}/findings/{finding_id}/notes",
        headers={
            "X-CSRF-Token": reviewer.cookies["didban_csrf"],
            "Idempotency-Key": f"note-replacement-{time.time_ns()}",
        },
        json={
            "body": "واحد حسابداری ثبت در دوره بعد را تأیید کرد",
            "supersedes_id": first_note.json()["id"],
        },
    )
    assert replacement_note.status_code == 201, replacement_note.text
    resolved = reviewer.post(
        f"/companies/{company['id']}/findings/{finding_id}/decisions",
        headers={
            "X-CSRF-Token": reviewer.cookies["didban_csrf"],
            "Idempotency-Key": f"resolve-{time.time_ns()}",
        },
        json={"decision": "resolved", "note": "پیگیری تکمیل شد"},
    )
    assert resolved.status_code == 201, resolved.text
    assert resolved.json()["previous_status"] == "follow_up"
    assert resolved.json()["resulting_status"] == "resolved"
    duplicate_resolved = reviewer.post(
        f"/companies/{company['id']}/findings/{finding_id}/decisions",
        headers={
            "X-CSRF-Token": reviewer.cookies["didban_csrf"],
            "Idempotency-Key": f"resolve-again-{time.time_ns()}",
        },
        json={"decision": "resolved"},
    )
    assert duplicate_resolved.status_code == 409
    review_timeline = owner.get(f"/companies/{company['id']}/findings/{finding_id}/reviews")
    assert review_timeline.status_code == 200, review_timeline.text
    timeline = review_timeline.json()
    assert timeline["current_status"] == "resolved"
    assert [item["kind"] for item in timeline["items"]] == [
        "decision",
        "note",
        "note",
        "decision",
    ]
    assert {item["actor_id"] for item in timeline["items"]} == {reviewer_user["id"]}
    reviewed_dashboard = owner.get(
        f"/companies/{company['id']}/dashboard",
        params={"analysis_run_id": reconciliation_analysis_id},
    ).json()
    assert reviewed_dashboard["top_findings"] == []
    assert reviewed_dashboard["health"]["overall_state"] == "limited_visibility"
    assert reviewed_dashboard["finding_summary"]["by_workflow"]["resolved"] == 1
    assert outsider.get(f"/companies/{company['id']}/findings/{finding_id}").status_code == 404
    assert (
        outsider.get(f"/companies/{company['id']}/findings/{finding_id}/evidence").status_code
        == 404
    )
    assert (
        outsider.get(f"/companies/{company['id']}/findings/{finding_id}/reviews").status_code == 404
    )
    assert (
        outsider.get(
            f"/companies/{company['id']}/reconciliation-runs/{reconciliation_id}"
        ).status_code
        == 404
    )

    repeated_commit = owner.post(
        f"/companies/{company['id']}/imports/{batch_id}/commit",
        headers={
            "X-CSRF-Token": owner.cookies["didban_csrf"],
            "Idempotency-Key": f"commit-retry-{time.time_ns()}",
        },
    )
    assert repeated_commit.status_code == 200, repeated_commit.text
    assert repeated_commit.json()["status"] == "completed_limited"

    eicar = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
    infected = upload_csv(owner, company["id"], "نمونه-آلوده.csv", eicar)
    assert infected.status_code == 202, infected.text
    infected_batch = wait_for_scan(owner, company["id"], infected.json()["id"])
    assert infected_batch["status"] == "failed"
    assert infected_batch["scan_status"] == "infected"
    assert infected_batch["failure_code"] == "MALWARE_DETECTED"
    assert (
        owner.get(f"/companies/{company['id']}/imports/{infected_batch['id']}/download").status_code
        == 409
    )

    with psycopg.connect(APP_DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config(%s, %s, true)", ("app.user_id", outsider_user["id"]))
            cursor.execute(
                "SELECT id::text FROM import_batches WHERE company_id = %s", (company["id"],)
            )
            assert cursor.fetchall() == []
            cursor.execute(
                "SELECT id::text FROM source_rows WHERE company_id = %s", (company["id"],)
            )
            assert cursor.fetchall() == []
            cursor.execute(
                "SELECT id::text FROM analysis_runs WHERE company_id = %s", (company["id"],)
            )
            assert cursor.fetchall() == []
            cursor.execute(
                "SELECT id::text FROM reconciliation_runs WHERE company_id = %s",
                (company["id"],),
            )
            assert cursor.fetchall() == []
            cursor.execute("SELECT id::text FROM findings WHERE company_id = %s", (company["id"],))
            assert cursor.fetchall() == []
            cursor.execute(
                "SELECT id::text FROM evidence_items WHERE company_id = %s", (company["id"],)
            )
            assert cursor.fetchall() == []
            cursor.execute(
                "SELECT id::text FROM review_decisions WHERE company_id = %s", (company["id"],)
            )
            assert cursor.fetchall() == []
            cursor.execute(
                "SELECT id::text FROM finding_notes WHERE company_id = %s", (company["id"],)
            )
            assert cursor.fetchall() == []

    with psycopg.connect(APP_DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config(%s, %s, true)", ("app.user_id", owner_user["id"]))
            cursor.execute(
                """
                SELECT action, metadata_json
                FROM audit_events
                WHERE company_id = %s
                  AND metadata_json->>'finding_id' = %s
                  AND action IN (
                      'finding.review_decision_created',
                      'finding.note_created'
                  )
                ORDER BY occurred_at, id
                """,
                (company["id"], finding_id),
            )
            review_audit_events = cursor.fetchall()
            assert [event[0] for event in review_audit_events] == [
                "finding.review_decision_created",
                "finding.note_created",
                "finding.note_created",
                "finding.review_decision_created",
            ]
            assert all(
                "note" not in event[1] and "body" not in event[1] for event in review_audit_events
            )
            cursor.execute(
                """
                SELECT sr.raw_json->>'تاریخ سند', je.entry_date::text,
                       jl.credit_irr::text, a.source_code, je.description_normalized
                FROM journal_lines jl
                JOIN source_rows sr ON sr.id = jl.source_row_id
                JOIN journal_entries je ON je.id = jl.entry_id
                JOIN accounts a ON a.id = jl.account_id
                WHERE sr.import_batch_id = %s
                ORDER BY a.source_code
                """,
                (batch_id,),
            )
            assert cursor.fetchall() == [
                ("۱۴۰۵/۰۶/۲۱", "2026-09-12", "0", "1101", "فروش شهریور"),
                ("۱۴۰۵/۰۶/۲۱", "2026-09-12", "2500000", "4101", "فروش شهریور"),
            ]

    with psycopg.connect(APP_DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config(%s, %s, true)", ("app.user_id", owner_user["id"]))
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                cursor.execute(
                    "UPDATE source_rows SET raw_hash = repeat('0', 64) WHERE company_id = %s",
                    (company["id"],),
                )
            connection.rollback()

    with psycopg.connect(APP_DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config(%s, %s, true)", ("app.user_id", reviewer_user["id"]))
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                cursor.execute(
                    "UPDATE review_decisions SET note = 'تغییر' WHERE finding_id = %s",
                    (finding_id,),
                )
            connection.rollback()

    with psycopg.connect(APP_DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config(%s, %s, true)", ("app.user_id", reviewer_user["id"]))
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                cursor.execute(
                    "UPDATE finding_notes SET body = 'تغییر' WHERE finding_id = %s",
                    (finding_id,),
                )
            connection.rollback()

    with psycopg.connect(APP_DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config(%s, %s, true)", ("app.user_id", owner_user["id"]))
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                cursor.execute(
                    "UPDATE evidence_items SET claim_code = 'CHANGED' WHERE finding_id = %s",
                    (finding_id,),
                )
            connection.rollback()

    with psycopg.connect(APP_DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config(%s, %s, true)", ("app.user_id", owner_user["id"]))
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                cursor.execute(
                    "UPDATE metric_observations SET value_irr = 1 WHERE analysis_run_id = %s",
                    (run_id,),
                )
            connection.rollback()

    with psycopg.connect(APP_DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config(%s, %s, true)", ("app.user_id", owner_user["id"]))
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                cursor.execute(
                    "UPDATE reconciliation_matches SET score = 1 WHERE run_id = %s",
                    (reconciliation_id,),
                )
            connection.rollback()

    with psycopg.connect(APP_DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config(%s, %s, true)", ("app.user_id", owner_user["id"]))
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                cursor.execute(
                    "UPDATE findings SET title_fa = 'تغییر' WHERE id = %s", (finding_id,)
                )
            connection.rollback()

    owner.close()
    outsider.close()
    reviewer.close()
