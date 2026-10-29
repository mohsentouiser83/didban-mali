"""Report scope remains explicit and independent of disabled capabilities."""

import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps/api"))
from didban.domain.reports import is_limited


class ModuleScopeTests(unittest.TestCase):
    def content(self):
        return {
            "module_configuration": {
                "modules": dict.fromkeys(
                    [
                        "accounting",
                        "cash",
                        "balances",
                        "invoices",
                        "settlements",
                        "moadian",
                        "forecast",
                    ],
                    False,
                )
            },
            "metrics": [{"metric_key": "cash", "value": None, "status": "unavailable"}],
            "reconciliation_runs": [],
            "cashflow": None,
            "settlement": None,
            "forecast": None,
        }

    def test_disabled_regions_do_not_claim_missing_data(self):
        self.assertFalse(is_limited(self.content()))

    def test_missing_active_cash_remains_limited(self):
        content = self.content()
        content["module_configuration"]["modules"]["cash"] = True
        self.assertTrue(is_limited(content))

    def test_legacy_report_scope_unchanged(self):
        content = self.content()
        content.pop("module_configuration")
        self.assertTrue(is_limited(content))


if __name__ == "__main__":
    unittest.main()
