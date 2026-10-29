"""Real authenticated API import on disposable DB; all source/rate fixtures synthetic."""

import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from uuid import uuid4

import psycopg
from starlette.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import payroll_rulepack as tool  # noqa: E402
import test_payroll_rulepack as provenance  # noqa: E402
import test_payroll_runtime as payroll  # noqa: E402


class RulepackRuntimeTests(payroll.PayrollRuntimeTests):
    def test_authenticated_draft_import_and_viewer_refusal_preserve_legal_gate(self):
        fixture = provenance.RulepackTests()
        fixture.setUp()
        self.addCleanup(fixture.tearDown)
        credentials = fixture.root / "session.json"
        options = {
            "credential_file": credentials,
            "company_id": self.company,
            "idempotency_key": str(uuid4()),
            "receipt_file": fixture.root / "import.json",
        }

        def save_session(client):
            credentials.write_text(
                json.dumps(
                    {
                        "origin": self.settings.public_origin,
                        "session_cookie": client.cookies.get("didban_session"),
                    }
                )
            )
            credentials.chmod(0o600)

        def normal_api(**kwargs):
            self.assertFalse(kwargs["follow_redirects"])
            self.assertFalse(kwargs["trust_env"])
            client = TestClient(
                self.app, base_url=kwargs["base_url"], cookies=kwargs["cookies"]
            )

            # Existing fixture's lifetime already owns the app's startup/shutdown.
            class Adapter:
                def __enter__(self):
                    return client

                def __exit__(self, *args):
                    client.close()

            return Adapter()

        save_session(self.finance)
        with patch.object(tool.httpx, "Client", side_effect=normal_api):
            imported = tool.import_draft(fixture.pack, **options)
            replayed = tool.import_draft(fixture.pack, **options)
        self.assertEqual(imported["rule_id"], replayed["rule_id"])
        rules = self.finance.get(self.pay + "/rules").json()["items"]
        row = next(rule for rule in rules if rule["id"] == imported["rule_id"])
        self.assertFalse(row["reviewed"])
        self.assertFalse(row["legal_verified"])
        self.assertEqual(row["content"], fixture.manifest["rules"])
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM app.payroll_rule_sets WHERE company_id=%s",
                    (self.company,),
                ).fetchone()[0],
                1,
            )
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM app.payroll_legal_reviews WHERE company_id=%s",
                    (self.company,),
                ).fetchone()[0],
                0,
            )
        save_session(self.client("viewer"))
        options.update(
            idempotency_key=str(uuid4()),
            receipt_file=fixture.root / "viewer-import.json",
        )
        with (
            patch.object(tool.httpx, "Client", side_effect=normal_api),
            self.assertRaisesRegex(tool.RulepackError, "import_rejected"),
        ):
            tool.import_draft(fixture.pack, **options)
        with psycopg.connect(self.dsn) as conn:
            self.assertEqual(
                conn.execute(
                    "SELECT count(*) FROM app.payroll_rule_sets WHERE company_id=%s",
                    (self.company,),
                ).fetchone()[0],
                1,
            )


if __name__ == "__main__":
    result = unittest.TextTestRunner(verbosity=2).run(
        unittest.TestSuite(
            [
                RulepackRuntimeTests(
                    "test_authenticated_draft_import_and_viewer_refusal_preserve_legal_gate"
                )
            ]
        )
    )
    raise SystemExit(not result.wasSuccessful())
