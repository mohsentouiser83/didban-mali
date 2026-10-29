"""Disposable HTTP/SQL payroll tests. Synthetic rules never attest legal readiness."""

import unittest
from test_runtime import RuntimeTests
from test_payroll_domain import rules, contract, work
from payroll_fixture import register_synthetic_legal_review


class PayrollRuntimeTests(RuntimeTests):
    def setUp(self):
        super().setUp()
        self.finance = self.client("finance")
        current = self.owner.get(self.base + "/modules").json()
        current["modules"]["payroll"] = True
        result = self.mutate(
            self.owner,
            "PUT",
            self.base + "/modules",
            {"modules": current["modules"], "reason": "آزمون حقوق"},
            version=current["version"],
        )
        self.assertEqual(result.status_code, 200, result.text)
        self.pay = self.base + "/payroll"

    def employee(self):
        result = self.mutate(
            self.finance,
            "POST",
            self.pay + "/employees",
            {
                "personnel_code": "0001",
                "profile": {
                    "name": "کارمند نمونه",
                    "national_id": "0012345678",
                    "insurance_number": "000111",
                    "hired_on": "2026-01-01",
                    "opening_leave_days": "0",
                    "opening_as_of": "2026-08-31",
                    "opening_source": "مانده مرجع مصنوعی",
                },
            },
        )
        self.assertEqual(result.status_code, 201, result.text)
        return result.json()

    def prepare(self, *, trusted=True):
        employee = self.employee()
        eid = employee["id"]
        c = self.mutate(
            self.finance,
            "POST",
            self.pay + "/contracts",
            {
                "employee_id": eid,
                "effective_from": "2026-01-01",
                "effective_to": None,
                "content": contract(),
            },
        )
        self.assertEqual(c.status_code, 201, c.text)
        w = work() | {
            "leave_opening_days": "0",
            "leave_accrued_days": "1",
            "leave_used_days": "1",
        }
        saved = self.mutate(
            self.finance,
            "POST",
            self.pay + "/work",
            {
                "employee_id": eid,
                "period_start": "2026-09-01",
                "period_end": "2026-09-30",
                "content": w,
            },
        )
        self.assertEqual(saved.status_code, 201, saved.text)
        r = self.mutate(
            self.finance,
            "POST",
            self.pay + "/rules",
            {
                "name": "قواعد صرفاً مصنوعی آزمون",
                "effective_from": "2026-01-01",
                "effective_to": "2026-12-31",
                "content": rules(),
            },
        )
        self.assertEqual(r.status_code, 201, r.text)
        body = {
            "period_start": "2026-09-01",
            "period_end": "2026-09-30",
            "kind": "monthly",
            "rule_id": r.json()["id"],
            "employee_ids": [eid],
            "supersedes_id": None,
        }
        before = self.mutate(self.finance, "POST", self.pay + "/runs", body)
        self.assertEqual(before.status_code, 422, before.text)
        self.assertEqual(before.json()["code"], "reviewed_effective_rules_required")
        check = self.mutate(
            self.finance,
            "POST",
            self.pay + "/rules/" + r.json()["id"] + "/reviews",
            {
                "reference": "نمونه مرجع مصنوعی؛ تأیید قانونی نیست",
                "fixtures": [
                    {
                        "contract": contract(),
                        "work": w,
                        "expected": {"gross": "1000", "net": "880"},
                    }
                ],
            },
        )
        self.assertEqual(check.status_code, 201, check.text)
        if trusted:
            register_synthetic_legal_review(self, r.json()["id"], rules())
        run = self.mutate(self.finance, "POST", self.pay + "/runs", body)
        self.assertEqual(run.status_code, 201, run.text)
        return employee, run.json(), body

    def test_payroll_draft_private_exports_remain_unapproved(self):
        import base64
        from io import BytesIO
        from openpyxl import load_workbook

        _, run, _ = self.prepare(trusted=False)
        path = self.pay + "/runs/" + run["id"] + "/exports"
        for kind in ("xlsx", "pdf"):
            response = self.mutate(self.finance, "POST", path, {"format": kind})
            self.assertEqual(response.status_code, 200, response.text)
            data = base64.b64decode(response.json()["data_base64"])
            if kind == "pdf":
                self.assertTrue(data.startswith(b"%PDF"))
            else:
                book = load_workbook(BytesIO(data), read_only=True)
                self.assertEqual(
                    dict(book["مشخصات"].values)["وضعیت"], "پیش‌نمایش؛ تأیید نشده"
                )
                book.close()
        self.assertEqual(
            self.mutate(self.owner, "POST", path, {"format": "xlsx"}).status_code, 403
        )
        for kind in ("insurance", "tax"):
            response = self.mutate(self.finance, "POST", path, {"format": kind})
            self.assertEqual(response.status_code, 409, response.text)
            self.assertEqual(
                response.json()["code"], "official_payroll_export_not_verified"
            )
        self.assertFalse(
            self.finance.get(self.pay + "/runs/" + run["id"]).json()["approved"]
        )

    def test_payroll_incomplete_plan_options_block_new_commitment(self):
        _, run, _ = self.prepare()
        approval = self.mutate(
            self.finance, "POST", self.pay + "/runs/" + run["id"] + "/approvals", {}
        )
        self.assertEqual(approval.status_code, 201, approval.text)
        with self.app.state.db.transaction(
            identity=False, actor=self.users["finance"], company=self.company
        ) as conn:
            conn.execute(
                """WITH added AS (
                INSERT INTO app.obligations(company_id,title)
                SELECT %s, 'برنامه مصنوعی ' || n FROM generate_series(1,1001) n RETURNING id,company_id
            ) INSERT INTO app.planned_payment_versions(company_id,obligation_id,scheduled_on,total_amount,state,actor_id,title_snapshot,row_version)
            SELECT company_id,id,'2026-10-01',880,'confirmed',%s,'برنامه مصنوعی',1 FROM added""",
                (self.company, self.users["finance"]),
            )
        path = self.pay + "/runs/" + run["id"]
        options = self.finance.get(path + "/financial-options")
        self.assertEqual(options.status_code, 200, options.text)
        self.assertTrue(options.json()["content"]["plans_truncated"])
        self.assertEqual(len(options.json()["content"]["plans"]), 1000)
        rejected = self.mutate(
            self.finance,
            "POST",
            path + "/financial-link",
            {
                "scheduled_on": "2026-10-01",
                "existing_plan_id": None,
                "existing_plan_version": None,
                "reason": "آزمون محدودیت",
                "ledger_line_ids": [],
                "source_manifest_id": None,
            },
        )
        self.assertEqual(rejected.status_code, 409, rejected.text)
        self.assertEqual(rejected.json()["code"], "payroll_plan_options_incomplete")
        selected = options.json()["content"]["plans"][0]
        accepted = self.mutate(
            self.finance,
            "POST",
            path + "/financial-link",
            {
                "scheduled_on": "2026-10-01",
                "existing_plan_id": selected["id"],
                "existing_plan_version": selected["version"],
                "reason": "انتخاب صریح برنامه موجود",
                "ledger_line_ids": [],
                "source_manifest_id": None,
            },
        )
        self.assertEqual(accepted.status_code, 201, accepted.text)

    def test_payroll_permissions_isolation_and_employee_versions(self):
        employee = self.employee()
        self.assertEqual(self.owner.get(self.pay + "/employees").status_code, 403)
        self.assertEqual(
            self.client("viewer").get(self.pay + "/employees").status_code, 403
        )
        self.assertEqual(
            self.client("outsider").get(self.pay + "/employees").status_code, 404
        )
        profile = employee["profile"] | {"name": "نام جدید"}
        updated = self.mutate(
            self.finance,
            "PATCH",
            self.pay + "/employees/" + employee["id"],
            {"personnel_code": "0001", "profile": profile},
            version=employee["version"],
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        stale = self.mutate(
            self.finance,
            "PATCH",
            self.pay + "/employees/" + employee["id"],
            {"personnel_code": "0001", "profile": profile},
            version=employee["version"],
        )
        self.assertEqual(stale.status_code, 409)

    def test_payroll_immutable_run_review_approval_duplicate_and_payments(self):
        employee, run, body = self.prepare()
        self.assertEqual(run["content"]["totals"]["net"], "880")
        approval = self.mutate(
            self.finance, "POST", self.pay + "/runs/" + run["id"] + "/approvals", {}
        )
        self.assertEqual(approval.status_code, 201, approval.text)
        duplicate = self.mutate(self.finance, "POST", self.pay + "/runs", body)
        self.assertEqual(duplicate.status_code, 201, duplicate.text)
        reject = self.mutate(
            self.finance,
            "POST",
            self.pay + "/runs/" + duplicate.json()["id"] + "/approvals",
            {},
        )
        self.assertEqual(reject.status_code, 409, reject.text)
        payment = {
            "employee_id": employee["id"],
            "amount": "500",
            "paid_on": "2026-10-01",
            "reference": "تست پرداخت",
            "bank_movement_id": None,
        }
        result = self.mutate(
            self.finance, "POST", self.pay + "/runs/" + run["id"] + "/payments", payment
        )
        self.assertEqual(result.status_code, 201, result.text)
        exceed = self.mutate(
            self.finance,
            "POST",
            self.pay + "/runs/" + run["id"] + "/payments",
            payment | {"amount": "500", "reference": "پرداخت دوم"},
        )
        self.assertEqual(exceed.status_code, 409, exceed.text)
        summary = self.finance.get(self.pay + "/summary")
        self.assertEqual(summary.status_code, 200, summary.text)
        self.assertEqual(summary.json()["unpaid"], "380")
        export = self.mutate(
            self.finance,
            "POST",
            self.pay + "/runs/" + run["id"] + "/exports",
            {"format": "xlsx"},
        )
        self.assertEqual(export.status_code, 200, export.text)
        unavailable = self.mutate(
            self.finance,
            "POST",
            self.pay + "/runs/" + run["id"] + "/exports",
            {"format": "insurance"},
        )
        self.assertEqual(unavailable.status_code, 409, unavailable.text)
        self.assertEqual(
            unavailable.json()["code"], "official_payroll_export_not_verified"
        )

    def test_payroll_overlapping_period_cannot_duplicate_approval(self):
        employee, run, body = self.prepare()
        approved = self.mutate(
            self.finance, "POST", self.pay + "/runs/" + run["id"] + "/approvals", {}
        )
        self.assertEqual(approved.status_code, 201, approved.text)
        saved = self.mutate(
            self.finance,
            "POST",
            self.pay + "/work",
            {
                "employee_id": employee["id"],
                "period_start": "2026-09-02",
                "period_end": "2026-09-30",
                "content": work()
                | {
                    "period_days": "29",
                    "leave_opening_days": "0",
                    "leave_accrued_days": "1",
                    "leave_used_days": "1",
                },
            },
        )
        self.assertEqual(saved.status_code, 201, saved.text)
        other = self.mutate(
            self.finance,
            "POST",
            self.pay + "/runs",
            body | {"period_start": "2026-09-02"},
        )
        self.assertEqual(other.status_code, 201, other.text)
        refused = self.mutate(
            self.finance,
            "POST",
            self.pay + "/runs/" + other.json()["id"] + "/approvals",
            {},
        )
        self.assertEqual(refused.status_code, 409, refused.text)
        self.assertEqual(refused.json()["code"], "payroll_scope_already_approved")

    def test_payroll_correction_delta_preserves_previous_snapshot(self):
        employee, run, body = self.prepare()
        self.assertEqual(
            self.mutate(
                self.finance, "POST", self.pay + "/runs/" + run["id"] + "/approvals", {}
            ).status_code,
            201,
        )
        changed = self.mutate(
            self.finance,
            "POST",
            self.pay + "/work",
            {
                "employee_id": employee["id"],
                "period_start": "2026-09-01",
                "period_end": "2026-09-30",
                "content": work()
                | {
                    "worked_days": "12",
                    "leave_opening_days": "0",
                    "leave_accrued_days": "1",
                    "leave_used_days": "1",
                },
            },
        )
        self.assertEqual(changed.status_code, 201, changed.text)
        correction = self.mutate(
            self.finance,
            "POST",
            self.pay + "/runs",
            body | {"supersedes_id": run["id"]},
        )
        self.assertEqual(correction.status_code, 201, correction.text)
        self.assertEqual(correction.json()["content"]["delta_totals"]["net"], "166")
        approved = self.mutate(
            self.finance,
            "POST",
            self.pay + "/runs/" + correction.json()["id"] + "/approvals",
            {},
        )
        self.assertEqual(approved.status_code, 201, approved.text)
        self.assertEqual(self.finance.get(self.pay + "/summary").json()["net"], "1046")
        self.assertEqual(
            self.finance.get(self.pay + "/runs/" + run["id"]).json()["content"][
                "totals"
            ]["net"],
            "880",
        )
        over = self.mutate(
            self.finance,
            "POST",
            self.pay + "/runs/" + correction.json()["id"] + "/payments",
            {
                "employee_id": employee["id"],
                "amount": "167",
                "paid_on": "2026-10-01",
                "reference": "بیش از مابه‌التفاوت",
                "bank_movement_id": None,
            },
        )
        self.assertEqual(over.status_code, 409, over.text)

    def test_payroll_midperiod_hire_and_contract_change_are_guarded(self):
        employee, run, body = self.prepare()
        update = self.mutate(
            self.finance,
            "PATCH",
            self.pay + "/employees/" + employee["id"],
            {
                "personnel_code": "0001",
                "profile": employee["profile"] | {"hired_on": "2026-09-25"},
            },
            version=employee["version"],
        )
        self.assertEqual(update.status_code, 200, update.text)
        invalid = self.mutate(self.finance, "POST", self.pay + "/runs", body)
        self.assertEqual(invalid.status_code, 422, invalid.text)
        self.assertEqual(invalid.json()["code"], "work_exceeds_employment_days")

    def test_payroll_aggregate_plan_link_and_payment_reduce_once(self):
        employee, run, _ = self.prepare()
        self.assertEqual(
            self.mutate(
                self.finance, "POST", self.pay + "/runs/" + run["id"] + "/approvals", {}
            ).status_code,
            201,
        )
        body = {
            "scheduled_on": "2026-10-05",
            "existing_plan_id": None,
            "existing_plan_version": None,
            "source_manifest_id": None,
            "ledger_line_ids": [],
            "reason": "حقوق دوره با برنامه قبلی هم‌پوشانی ندارد",
        }
        link = self.mutate(
            self.finance,
            "POST",
            self.pay + "/runs/" + run["id"] + "/financial-link",
            body,
        )
        self.assertEqual(link.status_code, 201, link.text)
        self.assertEqual(
            link.json()["content"]["ledger_comparison"]["status"], "unavailable"
        )
        duplicate = self.mutate(
            self.finance,
            "POST",
            self.pay + "/runs/" + run["id"] + "/financial-link",
            body,
        )
        self.assertEqual(duplicate.status_code, 409, duplicate.text)
        payment = self.mutate(
            self.finance,
            "POST",
            self.pay + "/runs/" + run["id"] + "/payments",
            {
                "employee_id": employee["id"],
                "amount": "500",
                "paid_on": "2026-10-01",
                "reference": "پرداخت حقوق",
                "bank_movement_id": None,
            },
        )
        self.assertEqual(payment.status_code, 201, payment.text)
        plans = self.owner.get(self.base + "/planned-payments")
        self.assertEqual(plans.status_code, 200, plans.text)
        plan = next(
            p
            for p in plans.json()["items"]
            if p["id"] == link.json()["content"]["plan_id"]
        )
        self.assertEqual(plan["remaining_amount"], "380")
        self.assertEqual(plan["title"], "حقوق دوره")
        self.assertNotIn(employee["profile"]["name"], plans.text)
        options = self.finance.get(
            self.pay + "/runs/" + run["id"] + "/financial-options"
        )
        self.assertEqual(options.status_code, 200, options.text)
        self.assertTrue(options.json()["content"]["plans"])

    def test_payroll_malformed_nested_data_is_validation_error(self):
        missing_date = self.mutate(
            self.finance,
            "POST",
            self.pay + "/employees",
            {"personnel_code": "0001", "profile": {"name": "نام"}},
        )
        self.assertEqual(missing_date.status_code, 422, missing_date.text)
        badrules = self.mutate(
            self.finance,
            "POST",
            self.pay + "/rules",
            {
                "name": "نام",
                "effective_from": "2026-01-01",
                "effective_to": "2026-12-31",
                "content": rules() | {"tax_bands": [{}]},
            },
        )
        self.assertEqual(badrules.status_code, 422, badrules.text)
        employee = self.employee()
        badwork = self.mutate(
            self.finance,
            "POST",
            self.pay + "/work",
            {
                "employee_id": employee["id"],
                "period_start": "2026-09-01",
                "period_end": "2026-09-30",
                "content": work() | {"tax_elapsed_months": "not-a-month"},
            },
        )
        self.assertEqual(badwork.status_code, 422, badwork.text)

    def test_payroll_work_import_resolves_company_codes_and_rejects_mixed_duplicates(
        self,
    ):
        import base64
        import csv
        from io import StringIO

        employee = self.employee()
        second = self.mutate(
            self.finance,
            "POST",
            self.pay + "/employees",
            {
                "personnel_code": "0002",
                "profile": {"name": "کارمند دوم", "hired_on": "2026-01-01"},
            },
        )
        self.assertEqual(second.status_code, 201, second.text)
        company = self.mutate(
            self.admin,
            "POST",
            "/api/v1/admin/companies",
            {
                "name": "شرکت دیگر آزمون حقوق",
                "owner_user_id": self.users["owner"],
                "timezone": "Asia/Tehran",
                "display_unit": "IRR",
            },
        ).json()["id"]
        base = "/api/v1/companies/" + company
        membership = self.mutate(
            self.owner,
            "POST",
            base + "/memberships",
            {"user_id": self.users["finance"], "role": "finance_manager"},
        )
        self.assertEqual(membership.status_code, 201, membership.text)
        modules = self.owner.get(base + "/modules").json()
        modules["modules"]["payroll"] = True
        enabled = self.mutate(
            self.owner,
            "PUT",
            base + "/modules",
            {"modules": modules["modules"], "reason": "آزمون جداسازی"},
            version=modules["version"],
        )
        self.assertEqual(enabled.status_code, 200, enabled.text)
        other = self.mutate(
            self.finance,
            "POST",
            base + "/payroll/employees",
            {
                "personnel_code": "0009",
                "profile": {"name": "فقط شرکت دیگر", "hired_on": "2026-01-01"},
            },
        )
        self.assertEqual(other.status_code, 201, other.text)
        headings = [
            "employee_id",
            "personnel_code",
            "employee_name",
            "period_start",
            "period_end",
            "period_days",
            "worked_days",
            "worked_hours",
            "loan_installment",
            "unit",
        ]

        def preview(identities):
            out = StringIO()
            writer = csv.writer(out)
            writer.writerow(headings)
            for identity in identities:
                writer.writerow(
                    [
                        *identity,
                        "نام خوانای فایل",
                        "2026-09-01",
                        "2026-09-30",
                        "30",
                        "10",
                        "80",
                        "1.23456",
                        "IRT",
                    ]
                )
            data = out.getvalue().encode()
            response = self.mutate(
                self.finance,
                "POST",
                self.pay + "/imports",
                {
                    "kind": "work",
                    "filename": "work.csv",
                    "data_base64": base64.b64encode(data).decode(),
                },
            )
            self.assertEqual(response.status_code, 201, response.text)
            return response.json(), data

        valid, data = preview([("", "0001")])
        self.assertEqual(valid["content"]["errors"], [])
        item = valid["content"]["rows"][0]
        self.assertEqual(item["employee_id"], employee["id"])
        self.assertEqual(item["personnel_code"], "0001")
        self.assertEqual(item["employee_name"], employee["profile"]["name"])
        self.assertEqual(item["content"]["loan_installment"], "12.3456")
        self.assertEqual(item["content"]["source_unit"], "IRT")
        committed = self.mutate(
            self.finance, "POST", self.pay + "/imports/" + valid["id"] + "/commit", {}
        )
        self.assertEqual(committed.status_code, 200, committed.text)
        saved = self.finance.get(self.pay + "/work").json()["items"][0]
        self.assertEqual(saved["employee_id"], employee["id"])
        self.assertEqual(saved["content"]["loan_installment"], "12.3456")
        with self.app.state.db.transaction(
            identity=False, actor=self.users["finance"], company=self.company
        ) as conn:
            original = conn.execute(
                "SELECT original_bytes FROM app.payroll_import_previews WHERE id=%s",
                (valid["id"],),
            ).fetchone()["original_bytes"]
            self.assertEqual(bytes(original), data)
        mixed, _ = preview(
            [
                ("", "0001"),
                (employee["id"], ""),
                ("", "9999"),
                ("", "0009"),
                (other.json()["id"], ""),
                (employee["id"], "0002"),
                ("", ""),
            ]
        )
        self.assertEqual(
            [e["code"] for e in mixed["content"]["errors"]],
            [
                "duplicate_or_missing_work_identity",
                "personnel_code_not_found",
                "personnel_code_not_found",
                "employee_id_not_found",
                "employee_identity_mismatch",
                "employee_identity_required",
            ],
        )
        self.assertEqual(mixed["content"]["errors"][1]["column"], "personnel_code")
        self.assertEqual(mixed["content"]["errors"][3]["column"], "employee_id")
        self.assertEqual(
            mixed["content"]["errors"][4]["column"], "employee_id / personnel_code"
        )
        rejected = self.mutate(
            self.finance, "POST", self.pay + "/imports/" + mixed["id"] + "/commit", {}
        )
        self.assertEqual(rejected.status_code, 409, rejected.text)
        compatible, _ = preview([(employee["id"], "0001")])
        self.assertEqual(compatible["content"]["errors"], [])

    def test_payroll_import_preserves_original_and_commits_once(self):
        import base64

        data = "personnel_code,name,national_id,hired_on\n0001,کارمند نمونه,0012345678,2026-01-01\n".encode()
        preview = self.mutate(
            self.finance,
            "POST",
            self.pay + "/imports",
            {
                "kind": "employees",
                "filename": "staff.csv",
                "data_base64": base64.b64encode(data).decode(),
            },
        )
        self.assertEqual(preview.status_code, 201, preview.text)
        pid = preview.json()["id"]
        self.assertEqual(preview.json()["content"]["errors"], [])
        self.assertEqual(
            preview.json()["content"]["preview_rows"][0]["original"]["national_id"],
            "0012345678",
        )
        self.assertEqual(
            preview.json()["content"]["preview_rows"][0]["normalized"]["profile"][
                "name"
            ],
            "کارمند نمونه",
        )
        with self.app.state.db.transaction(
            identity=False, actor=self.users["finance"], company=self.company
        ) as conn:
            original = conn.execute(
                "SELECT original_bytes FROM app.payroll_import_previews WHERE company_id=%s AND id=%s",
                (self.company, pid),
            ).fetchone()
            self.assertEqual(bytes(original["original_bytes"]), data)
        imported = self.mutate(
            self.finance, "POST", self.pay + "/imports/" + pid + "/commit", {}
        )
        self.assertEqual(imported.status_code, 200, imported.text)
        again = self.mutate(
            self.finance, "POST", self.pay + "/imports/" + pid + "/commit", {}
        )
        self.assertEqual(again.status_code, 409, again.text)
        employees = self.finance.get(self.pay + "/employees").json()["items"]
        self.assertEqual(len(employees), 1)
        self.assertEqual(employees[0]["personnel_code"], "0001")

    def test_payroll_list_and_employee_payments_have_bound_cursors(self):
        employee, run, _ = self.prepare()
        self.assertEqual(
            self.mutate(
                self.finance, "POST", self.pay + "/runs/" + run["id"] + "/approvals", {}
            ).status_code,
            201,
        )
        for i in range(2):
            response = self.mutate(
                self.finance,
                "POST",
                self.pay + "/runs/" + run["id"] + "/payments",
                {
                    "employee_id": employee["id"],
                    "amount": "100",
                    "paid_on": "2026-10-01",
                    "reference": "پرداخت " + str(i),
                    "bank_movement_id": None,
                },
            )
            self.assertEqual(response.status_code, 201, response.text)
        details = self.finance.get(
            self.pay + "/employees/" + employee["id"] + "/details?limit=1"
        )
        self.assertEqual(details.status_code, 200, details.text)
        content = details.json()["content"]
        self.assertEqual(len(content["payments"]), 1)
        self.assertEqual(content["paid"], "200")
        self.assertIsNotNone(content["payment_next_cursor"])
        second = self.finance.get(
            self.pay + "/employees/" + employee["id"] + "/details",
            params={"limit": 1, "cursor": content["payment_next_cursor"]},
        )
        self.assertEqual(second.status_code, 200, second.text)
        self.assertNotEqual(
            second.json()["content"]["payments"][0]["id"], content["payments"][0]["id"]
        )
        another = self.mutate(
            self.finance,
            "POST",
            self.pay + "/employees",
            {
                "personnel_code": "0002",
                "profile": {"name": "کارمند دوم", "hired_on": "2026-01-01"},
            },
        )
        self.assertEqual(another.status_code, 201, another.text)
        first = self.finance.get(self.pay + "/employees?limit=1")
        self.assertEqual(first.status_code, 200, first.text)
        self.assertIsNotNone(first.json()["next_cursor"])
        following = self.finance.get(
            self.pay + "/employees",
            params={"limit": 1, "cursor": first.json()["next_cursor"]},
        )
        self.assertEqual(following.status_code, 200, following.text)
        self.assertNotEqual(
            first.json()["items"][0]["id"], following.json()["items"][0]["id"]
        )
        for kind in ("contracts", "work", "runs"):
            scoped = self.finance.get(
                self.pay + "/employees/" + employee["id"] + "/" + kind + "?limit=1"
            )
            self.assertEqual(scoped.status_code, 200, scoped.text)
            self.assertEqual(len(scoped.json()["items"]), 1)
        empty_scope = self.finance.get(
            self.pay + "/employees/" + another.json()["id"] + "/runs"
        )
        self.assertEqual(empty_scope.status_code, 200, empty_scope.text)
        self.assertEqual(empty_scope.json()["items"], [])
        self.assertEqual(content["contract_count"], 1)
        self.assertEqual(content["work_count"], 1)

    def test_payroll_rebased_opening_does_not_subtract_old_deduction_twice(self):
        employee, _, body = self.prepare()
        profile = employee["profile"] | {"opening_loan": "1000"}
        update = self.mutate(
            self.finance,
            "PATCH",
            self.pay + "/employees/" + employee["id"],
            {"personnel_code": "0001", "profile": profile},
            version=employee["version"],
        )
        self.assertEqual(update.status_code, 200, update.text)
        sep = work() | {
            "leave_opening_days": "0",
            "leave_accrued_days": "1",
            "leave_used_days": "1",
            "loan_installment": "100",
        }
        self.assertEqual(
            self.mutate(
                self.finance,
                "POST",
                self.pay + "/work",
                {
                    "employee_id": employee["id"],
                    "period_start": "2026-09-01",
                    "period_end": "2026-09-30",
                    "content": sep,
                },
            ).status_code,
            201,
        )
        run = self.mutate(self.finance, "POST", self.pay + "/runs", body)
        self.assertEqual(run.status_code, 201, run.text)
        self.assertEqual(
            self.mutate(
                self.finance,
                "POST",
                self.pay + "/runs/" + run.json()["id"] + "/approvals",
                {},
            ).status_code,
            201,
        )
        rebased = profile | {
            "opening_loan": "900",
            "opening_as_of": "2026-09-30",
            "opening_source": "مانده پس از کسر قسط شهریور",
        }
        changed = self.mutate(
            self.finance,
            "PATCH",
            self.pay + "/employees/" + employee["id"],
            {"personnel_code": "0001", "profile": rebased},
            version=update.json()["version"],
        )
        self.assertEqual(changed.status_code, 200, changed.text)
        oct_work = work() | {
            "period_days": "20",
            "leave_opening_days": "0",
            "leave_accrued_days": "1",
            "leave_used_days": "1",
            "loan_installment": "850",
        }
        self.assertEqual(
            self.mutate(
                self.finance,
                "POST",
                self.pay + "/work",
                {
                    "employee_id": employee["id"],
                    "period_start": "2026-10-01",
                    "period_end": "2026-10-20",
                    "content": oct_work,
                },
            ).status_code,
            201,
        )
        newrun = self.mutate(
            self.finance,
            "POST",
            self.pay + "/runs",
            body | {"period_start": "2026-10-01", "period_end": "2026-10-20"},
        )
        self.assertEqual(newrun.status_code, 201, newrun.text)
        approval = self.mutate(
            self.finance,
            "POST",
            self.pay + "/runs/" + newrun.json()["id"] + "/approvals",
            {},
        )
        self.assertEqual(approval.status_code, 201, approval.text)
        details = self.finance.get(
            self.pay + "/employees/" + employee["id"] + "/details"
        )
        self.assertEqual(details.status_code, 200, details.text)
        self.assertEqual(details.json()["content"]["loan_remaining"], "50")

    def test_payroll_operator_review_cannot_self_certify_legal_pack(self):
        _, run, _ = self.prepare(trusted=False)
        self.assertFalse(run["content"]["legal_verified"])
        result = self.mutate(
            self.finance, "POST", self.pay + "/runs/" + run["id"] + "/approvals", {}
        )
        self.assertEqual(result.status_code, 409, result.text)
        self.assertEqual(result.json()["code"], "payroll_legal_pack_not_verified")

    def test_payroll_changed_work_blocks_approval(self):
        employee, run, _ = self.prepare()
        new = self.mutate(
            self.finance,
            "POST",
            self.pay + "/work",
            {
                "employee_id": employee["id"],
                "period_start": "2026-09-01",
                "period_end": "2026-09-30",
                "content": work()
                | {
                    "leave_opening_days": "0",
                    "leave_accrued_days": "1",
                    "leave_used_days": "1",
                    "worked_days": "9",
                },
            },
        )
        self.assertEqual(new.status_code, 201, new.text)
        approval = self.mutate(
            self.finance, "POST", self.pay + "/runs/" + run["id"] + "/approvals", {}
        )
        self.assertEqual(approval.status_code, 409, approval.text)
        self.assertEqual(approval.json()["code"], "payroll_work_changed")


if __name__ == "__main__":
    suite = unittest.TestSuite(
        PayrollRuntimeTests(n)
        for n in unittest.defaultTestLoader.getTestCaseNames(PayrollRuntimeTests)
        if n.startswith("test_payroll_")
    )
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(not result.wasSuccessful())
