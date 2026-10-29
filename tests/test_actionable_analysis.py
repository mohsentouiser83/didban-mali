import unittest
from didban.domain.actionable_analysis import analyze


class ActionableTests(unittest.TestCase):
    def test_five_axes_preserve_zero_and_missing(self):
        result = analyze(
            {
                "metrics": [
                    {
                        "metric_key": "cash",
                        "value": "0",
                        "status": "available",
                        "evidence_ids": ["one"],
                    }
                ]
            }
        )
        self.assertEqual(len(result), 5)
        cash = result[0]
        self.assertEqual(cash["status"], "available")
        self.assertEqual(cash["evidence"][0]["value"], "0")
        self.assertEqual(result[-1]["status"], "unavailable")
        self.assertEqual(cash["resolution"], "not_evaluated")

    def test_relative_priority_and_no_unavailable_amount(self):
        result = analyze(
            {
                "metrics": [
                    {"metric_key": "cash", "value": "200", "status": "available"},
                    {
                        "metric_key": "net_profit",
                        "value": "100000",
                        "status": "unavailable",
                    },
                ]
            }
        )
        self.assertEqual(result[0]["priority_components"]["scale"], "200")
        self.assertEqual(result[0]["priority"], "normal")
        self.assertEqual(result[2]["evidence"], [])

    def test_due_dates_history_and_payroll_sources_are_explicit(self):
        content = {
            "manifest": {"as_of_date": "2026-09-30"},
            "metrics": [{"metric_key": "cash", "value": "1", "status": "available"}],
            "settlement": {
                "content": {
                    "invoices": [
                        {
                            "invoice_id": "invoice-1",
                            "status": "available",
                            "due_on": "2026-09-29",
                            "direction": "purchase",
                            "remaining_as_of": "20",
                        },
                        {
                            "invoice_id": "paid",
                            "status": "available",
                            "due_on": "2026-09-01",
                            "remaining_as_of": "0",
                        },
                    ]
                }
            },
            "analysis_history": [
                {
                    "condition_key": "cash:known_obligation_gap",
                    "scope": {"as_of_date": "2026-09-29", "metric_basis": "ledger"},
                }
            ],
            "payroll_analysis": {
                "status": "available",
                "periods": [
                    {
                        "employer_cost": "300",
                        "run_ids": ["run-1"],
                        "employee_scope": ["secret-person"],
                    }
                ],
            },
        }
        result = analyze(content)
        self.assertEqual(result[0]["priority_components"]["urgency"], "due_or_overdue")
        self.assertEqual(result[0]["priority_components"]["recurrence"], "2")
        self.assertEqual(len(result[0]["due_evidence"]), 1)
        self.assertEqual(result[-1]["status"], "available")
        self.assertNotIn("employee_scope", result[-1]["payroll_snapshot"]["periods"][0])

    def test_disabled_axes_are_not_fabricated(self):
        result = analyze(
            {
                "module_configuration": {
                    "modules": {
                        "cash": False,
                        "balances": False,
                        "accounting": False,
                        "payroll": False,
                    }
                }
            }
        )
        self.assertEqual([p["axis"] for p in result], ["quality"])

    def test_large_financial_scale_is_exact_and_context_restored(self):
        from decimal import getcontext

        value = "99999999999999999999999999999999.123456"
        precision = getcontext().prec
        result = analyze(
            {"metrics": [{"metric_key": "cash", "value": value, "status": "available"}]}
        )
        self.assertEqual(result[0]["priority_components"]["scale"], value)
        self.assertEqual(result[0]["evidence"][0]["value"], value)
        self.assertEqual(getcontext().prec, precision)

    def test_healthy_cash_and_revenue_never_high_on_size_alone(self):
        results = analyze(
            {
                "metrics": [
                    {"metric_key": "cash", "value": "1000000", "status": "available"},
                    {
                        "metric_key": "revenue",
                        "value": "2000000",
                        "status": "available",
                    },
                    {
                        "metric_key": "net_profit",
                        "value": "100000",
                        "status": "available",
                    },
                ]
            }
        )
        self.assertFalse(any(item["priority"] == "high" for item in results))

    def test_negative_cash_and_material_loss_are_actionable(self):
        result = analyze(
            {
                "metrics": [
                    {"metric_key": "cash", "value": "-500", "status": "available"},
                    {
                        "metric_key": "net_profit",
                        "value": "-200",
                        "status": "available",
                    },
                ]
            }
        )
        self.assertEqual(result[0]["priority"], "high")
        self.assertEqual(result[2]["priority"], "high")
        self.assertEqual(result[0]["priority_components"]["condition"], "negative_cash")

    def test_same_date_revisions_do_not_inflate_recurrence(self):
        content = {
            "manifest": {"as_of_date": "2026-09-30"},
            "metrics": [
                {"metric_key": "cash", "value": "-1", "status": "available"},
                {"metric_key": "revenue", "value": "1000", "status": "available"},
            ],
            "analysis_history": [
                {
                    "axis": "cash",
                    "condition_key": "cash:negative_cash",
                    "scope": {"as_of_date": "2026-09-30", "metric_basis": "ledger"},
                }
            ]
            * 10,
        }
        cash = analyze(content)[0]
        self.assertEqual(cash["priority"], "normal")
        self.assertEqual(cash["priority_components"]["recurrence"], "unknown")

    def test_invalid_threshold_rejected(self):
        for value in ("0", "-1", "2"):
            with self.assertRaises(ValueError):
                analyze({}, {"materiality_ratio": value})


if __name__ == "__main__":
    unittest.main()
