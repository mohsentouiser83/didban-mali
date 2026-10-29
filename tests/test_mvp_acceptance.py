"""MVP financial edge cases through real uploads, snapshots and report artifacts."""

from datetime import date
from dataclasses import replace
from decimal import Decimal
import json
from pathlib import Path
import unittest

from test_reports_runtime import ReportTests
from didban.application.financial_worker import FinancialWorker
from didban.domain.financial import FinancialRow, PeriodSpec, calculate
from didban.domain.settlements import invoice_aging
from didban.domain.forecast import forecast


class MvpAcceptanceTests(ReportTests):
    def publish_files(self, files):
        period = self.period(starts_on="2026-09-01", ends_on="2026-09-30")
        session = self.session(period)
        for name, content in files.items():
            uploaded = self.upload(session, content.encode(), name=name)
            self.assertEqual(uploaded.status_code, 202, uploaded.text)
        self.assertEqual(self.seal(session).status_code, 202)
        for _ in range(20):
            state = self.process(session)
            if state["interpretation_finished_at"]:
                break
            self.assertEqual(state["status"], "waiting_input", state)
            issue = self.issue(session)
            choices = issue["constraints"].get("choices", [])
            filename = next(
                (
                    file["original_name"]
                    for file in self.files(session)
                    if file["id"] == issue["constraints"].get("file_id")
                ),
                "",
            )
            selected_kind = (
                "purchase_invoices"
                if filename == "purchase.csv"
                else "moadian_sales"
                if filename == "moadian.csv"
                else "sales_invoices"
            )
            value = (
                selected_kind
                if selected_kind in choices
                else "declared_complete"
                if "declared_complete" in choices
                else None
            )
            self.assertIsNotNone(value, issue)
            answer = self.answer(session, value)
            self.assertEqual(answer.status_code, 201, answer.text)
        else:
            self.fail("Synthetic source interpretation did not finish")
        self.start_financial(session)
        worker = FinancialWorker(self.worker_settings)
        for _ in range(50):
            state = self.detail(session)
            if state.get("manifest_id"):
                return session, state["manifest_id"]
            if state["status"] == "waiting_input":
                issue = self.issue(session)
                choices = issue["constraints"]["choices"]
                value = next(
                    value
                    for value in (
                        "declared_complete",
                        "affirmed",
                        "zero_confirmed",
                        "not_required",
                        "start_of_day",
                        "A",
                        "unknown",
                    )
                    if value in choices
                )
                answered = self.answer(session, value)
                self.assertEqual(answered.status_code, 201, answered.text)
            self.assertTrue(worker.run_once())
        self.fail("Financial acceptance fixture did not publish")

    def payment_files(self):
        return {
            "bank.csv": "row_id,date,amount,balance,row_type,bank_account,reference,currency\nB0,2026-09-01,0,100,opening,A,,IRR\nB1,2026-09-20,-40,60,movement,A,R40,IRR\n",
            "purchase.csv": "invoice_id,party_id,issued_on,due_on,gross,vat,currency\nP1,V1,2026-09-01,2026-10-10,100,0,IRR\n",
            "settlements.csv": "event_id,invoice_id,date,amount,direction,bank_account,bank_reference,currency\nPAY40,P1,2026-09-20,40,payment,A,R40,IRR\n",
            "planned.csv": "plan_id,obligation_id,invoice_id,date,total_obligation,paid_as_of,confirmed,currency\nPLAN1,O1,P1,2026-10-10,100,40,true,IRR\n",
        }

    def test_F13_one_invoice_one_plan_forecasts_only_remaining_sixty(self):
        files = self.payment_files()
        session, manifest = self.publish_files(files)
        metrics_before = self.metrics(manifest)
        self.assertEqual(metrics_before["cash"]["value"], "60")
        self.assertEqual(metrics_before["ap_invoice"]["value"], "60")
        self.start_analysis(session)
        self.finish_analysis(session)
        result = self.owner.get(self.base + "/forecasts/" + manifest)
        self.assertEqual(result.status_code, 200, result.text)
        body = result.json()
        self.assertEqual(
            sum(Decimal(day["expected_out"]) for day in body["days"]), Decimal("60")
        )
        self.assertEqual(body["days"][-1]["closing"], "0")
        self.drain()
        state = self.detail(session)
        self.assertEqual(state["status"], "completed_limited")
        report = self.owner.get(self.base + "/reports/" + state["report_id"]).json()
        self.assertTrue(all(job["status"] == "ready" for job in report["exports"]))
        self.assertEqual(self.metrics(manifest), metrics_before)

    def test_invalid_settlement_direction_cannot_publish_a_certain_invoice_balance(
        self,
    ):
        files = self.payment_files()
        files["settlements.csv"] = files["settlements.csv"].replace(
            ",payment,", ",unrecognized,"
        )
        session, manifest = self.publish_files(files)
        metrics = self.metrics(manifest)
        self.assertIsNone(metrics["ap_invoice"]["value"])
        self.assertIn("settlement_invalid", metrics["ap_invoice"]["reason_codes"])
        self.assertEqual(metrics["cash"]["value"], "60")
        self.start_analysis(session)
        self.finish_analysis(session)
        result = self.owner.get(self.base + "/forecasts/" + manifest).json()
        self.assertIn("forecast_invalid_settlement_rows", result["days"][0]["reason_codes"])

    def test_invalid_planned_row_cannot_make_a_complete_forecast(self):
        files = self.payment_files()
        files["planned.csv"] += "BAD,O_BAD,,2026-10-15,invalid,0,true,IRR\n"
        session, manifest = self.publish_files(files)
        self.assertEqual(self.metrics(manifest)["ap_invoice"]["value"], "60")
        self.start_analysis(session)
        self.finish_analysis(session)
        result = self.owner.get(self.base + "/forecasts/" + manifest).json()
        self.assertIn("forecast_invalid_payment_rows", result["days"][0]["reason_codes"])
        self.assertEqual(
            sum(Decimal(day["expected_out"]) for day in result["days"]), Decimal("60")
        )
        self.assertTrue(all(day["status"] == "limited" for day in result["days"]))

    def test_F14_missing_tax_and_missing_reference_do_not_change_invoice_balance(self):
        session, manifest = self.publish_files(
            {
                "sales.csv": "invoice_id,party_id,issued_on,gross,vat,tax_id,currency\nI1,C1,2026-09-01,100,,T1,IRR\n",
                "moadian.csv": "tax_id,invoice_id,party_id,issued_on,gross,vat,kind,reference_tax_id,currency\nT1,I1,C1,2026-09-01,100,,original,,IRR\nT2,I2,C1,2026-09-02,110,10,corrective,MISSING,IRR\n",
            }
        )
        before = self.metrics(manifest)
        response = self.mutate(
            self.owner,
            "POST",
            self.base + "/results/" + manifest + "/reconciliations",
            {"kind": "moadian_sales"},
        )
        self.assertEqual(response.status_code, 201, response.text)
        run = response.json()
        candidates = self.owner.get(
            self.base + "/reconciliations/" + run["id"] + "/candidates?limit=100"
        )
        self.assertEqual(candidates.status_code, 200, candidates.text)
        items = candidates.json()["items"]
        self.assertTrue(any("tax_missing" in item["reason_codes"] for item in items))
        self.assertTrue(
            any("missing_reference" in item["reference_chain"] for item in items)
        )
        self.assertTrue(all(item["classification"] == "needs_review" for item in items))
        self.assertTrue(all(item["decision"] is None for item in items))
        self.assertEqual(self.metrics(manifest), before)
        self.assertEqual(
            self.client("outsider")
            .get(self.base + "/reconciliations/" + run["id"] + "/candidates")
            .status_code,
            404,
        )

    def test_F12_current_snapshot_does_not_invent_historical_dates_or_aging(self):
        current = PeriodSpec("current", date(2026, 9, 1), date(2026, 10, 3))
        historical = replace(current, as_of_date=date(2026, 9, 30))
        invoice = FinancialRow(
            "I1",
            "I1",
            "sales",
            "interpretation",
            "فروش",
            2,
            "sales_invoices",
            {
                "invoice_id": "I1",
                "party_id": "C1",
                "issued_on": "2026-09-01",
                "gross": "100",
                "due_on": None,
                "unit": "IRR",
            },
        )
        declared = {
            "coverage": {
                "sales_invoices": {
                    "state": "complete",
                    "provenance": "acceptance_author",
                    "starts_on": "2026-09-01",
                    "ends_on": "2026-10-03",
                }
            },
            "invoice_openings_included": True,
            "invoice_snapshots": {
                "sales_invoices:I1": {
                    "as_of": "2026-10-03",
                    "paid": "30",
                    "included_event_ids": [],
                }
            },
        }
        declared["settlements_complete"] = True
        declared["coverage"]["settlements"] = dict(
            declared["coverage"]["sales_invoices"]
        )
        now = {
            metric.metric_key: metric
            for metric in calculate([invoice], current, None, declared)
        }
        old = {
            metric.metric_key: metric
            for metric in calculate([invoice], historical, None, declared)
        }
        self.assertEqual(now["ar_invoice"].value, "70")
        self.assertEqual(
            invoice_aging("70", None, current.cutoff), (None, ["due_date_missing"])
        )
        self.assertIsNone(old["ar_invoice"].value)
        self.assertIn("payment_dates_missing", old["ar_invoice"].reason_codes)
        _, questions, _ = forecast(
            "100",
            current.cutoff,
            [
                {
                    "invoice_id": "I1",
                    "source_invoice_id": "I1",
                    "party_id": "C1",
                    "direction": "sales",
                    "remaining_as_of": "70",
                    "due_on": None,
                }
            ],
            [],
            [],
            {},
        )
        self.assertEqual(questions[0]["key"], "receipt|I1")


if __name__ == "__main__":
    names = [name for name in MvpAcceptanceTests.__dict__ if name.startswith("test_")]
    result = unittest.TextTestRunner(verbosity=2).run(
        unittest.TestSuite(MvpAcceptanceTests(name) for name in names)
    )
    report = {
        "status": "passed" if result.wasSuccessful() else "failed",
        "tests_run": result.testsRun,
        "failures": len(result.failures),
        "errors": len(result.errors),
        "scope": "F13_upload_to_forecast_and_exports_F14_moadian_HTTP_F12_domain_snapshot",
        "live_model_calls": 0,
    }
    (
        Path(__file__).resolve().parents[1] / "docs/mvp-financial-validation.json"
    ).write_text(json.dumps(report, indent=2) + "\n")
    raise SystemExit(not result.wasSuccessful())
