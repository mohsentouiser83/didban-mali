"""Synthetic provenance/signature fixtures; never statutory acceptance or live activation."""

import base64
import copy
from datetime import datetime, timezone
import json
from uuid import uuid4
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "tests"))
import payroll_rulepack as tool  # noqa: E402
from test_payroll_domain import rules, contract, work  # noqa: E402
from didban.domain.payroll.validation import primary_sources  # noqa: E402


class RulepackTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.pack = self.root / "pack"
        self.pack.mkdir()
        source_rules = rules()
        sources = []
        for scope, url in (
            ("labour", "https://mcls.gov.ir/circular/fixture"),
            ("insurance", "https://tamin.ir/file/fixture"),
            ("tax", "https://regulation.tax.gov.ir/fixture"),
        ):
            path = self.pack / (scope + ".html")
            path.write_text(
                "<!DOCTYPE html><html><body>SYNTHETIC ONLY — not a legal source</body></html>"
            )
            receipt = {
                "format": "didban-source-fetch-1",
                "url": url,
                "final_url": url,
                "fetched_at": "2026-01-01T00:00:00+00:00",
                "sha256": tool.file_hash(path),
                "size": path.stat().st_size,
                "media_type": "text/html",
                "tls_verified": True,
            }
            self.write(scope + "-receipt.json", receipt)
            sources.append(
                {
                    "id": scope,
                    "scope": scope,
                    "url": url,
                    "file": path.name,
                    "sha256": tool.file_hash(path),
                    "media_type": "text/html",
                    "evidence_kind": "official_document",
                    "retrieval_receipt": scope + "-receipt.json",
                    "publication_reference": "SYNTHETIC fixture",
                }
            )
        source_rules["source_urls"] = [s["url"] for s in sources]
        fixtures = []
        for kind in sorted(tool.KINDS):
            inputs = work() | {
                "service_days": "365",
                "arrears_amount": "100",
                "correction_reference": "synthetic reference",
            }
            result = tool.calculate(contract(), inputs, source_rules, kind=kind)
            fixtures.append(
                {
                    "id": kind,
                    "kind": kind,
                    "contract": contract(),
                    "work": inputs,
                    "expected": {k: result[k] for k in tool.RESULT_FIELDS},
                    "reference": "synthetic expected arithmetic only",
                }
            )
        self.manifest = {
            "format": "didban-payroll-rulepack-1",
            "pack_id": "synthetic-1405",
            "calendar_year": 1405,
            "effective_from": "2026-03-21",
            "effective_to": "2027-03-20",
            "producer_id": "synthetic-producer",
            "rules": source_rules,
            "sources": sources,
            "citations": {
                key: {"source_id": "labour", "locator": "synthetic-only"}
                for key in tool.parameter_paths(source_rules)
            },
            "fixtures": fixtures,
        }
        self.write("manifest.json", self.manifest)

    def tearDown(self):
        self.temp.cleanup()

    def write(self, name, value):
        (self.pack / name).write_text(json.dumps(value, ensure_ascii=False))

    def signed(self):
        checked = tool.validate_pack(self.pack)
        private = Ed25519PrivateKey.generate()
        now = datetime.now(timezone.utc).isoformat()
        attestation = {
            "format": "didban-payroll-attestation-1",
            "evidence_hash": checked["evidence_hash"],
            "reviewer_id": "synthetic-independent-reviewer",
            "key_id": "synthetic-key",
            "reviewed_at": now,
            "scopes": sorted(tool.SCOPES),
            "independent_of_producer": True,
        }
        signed = json.dumps(
            attestation, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        ).encode()
        attestation["signature"] = base64.b64encode(private.sign(signed)).decode()
        self.write("attestation.json", attestation)
        policy = {
            "format": "didban-payroll-reviewers-1",
            "keys": [
                {
                    "key_id": "synthetic-key",
                    "reviewer_id": attestation["reviewer_id"],
                    "public_key_base64": base64.b64encode(
                        private.public_key().public_bytes(
                            Encoding.Raw, PublicFormat.Raw
                        )
                    ).decode(),
                    "authorization_reference": "synthetic test policy; no actual professional authorization",
                    "valid_from": "2020-01-01",
                    "valid_until": "2099-01-01",
                    "years": [1405],
                    "scopes": sorted(tool.SCOPES),
                }
            ],
        }
        path = self.root / "trusted-test-policy.json"
        path.write_text(json.dumps(policy))
        path.chmod(0o600)
        return path

    def test_unsigned_exact_pack_only_stages_draft_never_activates(self):
        result = tool.stage_pack(self.pack, self.root / "staged")
        self.assertEqual(result["status"], "draft_awaiting_independent_review")
        self.assertFalse(result["legal_verified"])
        self.assertFalse(result["activated"])
        self.assertEqual(
            tool.validate_pack(self.root / "staged"), tool.validate_pack(self.pack)
        )
        with self.assertRaisesRegex(tool.RulepackError, "stage_target_exists"):
            tool.stage_pack(self.pack, self.root / "staged")
        with self.assertRaisesRegex(tool.RulepackError, "attested_complete"):
            tool.validate_pack(self.pack, require_attestation=True)

    def test_signed_complete_bundle_stages_without_legal_activation(self):
        policy = self.signed()
        result = tool.stage_pack(
            self.pack,
            self.root / "signed-stage",
            trusted_reviewers=policy,
            require_attestation=True,
        )
        self.assertEqual(result["status"], "attested_staging_only")
        self.assertTrue(result["independent_signature_validated"])
        self.assertFalse(result["legal_verified"])
        self.assertFalse(result["activated"])

    def test_manual_import_or_page_excerpt_remains_incomplete_draft(self):
        for changes in (
            {"retrieval_receipt": None},
            {"evidence_kind": "web_excerpt"},
            {"evidence_kind": "official_page"},
        ):
            manifest = copy.deepcopy(self.manifest)
            manifest["sources"][0].update(changes)
            self.write("manifest.json", manifest)
            self.assertEqual(
                tool.validate_pack(self.pack)["status"], "draft_evidence_incomplete"
            )
            with self.assertRaises(tool.RulepackError):
                tool.validate_pack(self.pack, require_attestation=True)

    def test_official_looking_domain_credentials_http_and_foreign_redirect_rejected(
        self,
    ):
        for url in (
            "http://tamin.ir/file/1",
            "https://tamin.ir.evil.invalid/file/1",
            "https://u:p@tamin.ir/file/1",
            "https://127.0.0.1/",
            "https://tamin.ir:444/file/1",
        ):
            with self.subTest(url=url), self.assertRaises(tool.RulepackError):
                tool.source_url(url)

    def test_tampered_files_mismatched_receipt_and_missing_citations_fail_closed(self):
        (self.pack / "labour.html").write_text("changed")
        with self.assertRaisesRegex(tool.RulepackError, "source_hash_mismatch"):
            tool.validate_pack(self.pack)
        self.setUp_original_file()
        receipt = json.loads((self.pack / "labour-receipt.json").read_text())
        receipt["tls_verified"] = False
        self.write("labour-receipt.json", receipt)
        with self.assertRaisesRegex(tool.RulepackError, "receipt_mismatch"):
            tool.validate_pack(self.pack)
        receipt["tls_verified"] = True
        self.write("labour-receipt.json", receipt)
        self.manifest["citations"].pop("/insurance_daily_cap")
        self.write("manifest.json", self.manifest)
        with self.assertRaisesRegex(tool.RulepackError, "requires_citation"):
            tool.validate_pack(self.pack)

    def setUp_original_file(self):
        (self.pack / "labour.html").write_text(
            "<!DOCTYPE html><html><body>SYNTHETIC ONLY — not a legal source</body></html>"
        )

    def test_challenge_http200_is_never_treated_as_original_html_or_pdf(self):
        path = self.root / "challenge"
        path.write_text(
            "<!DOCTYPE html><html>Just a moment <script src='/cdn-cgi/challenge-platform/a'></script></html>"
        )
        for media in ("application/pdf", "text/html"):
            with self.assertRaisesRegex(tool.RulepackError, "challenge_body"):
                tool.document_type(path, media)
        path.write_text("<!DOCTYPE html><html>normal html</html>")
        with self.assertRaisesRegex(tool.RulepackError, "pdf_original"):
            tool.document_type(path, "application/pdf")

    def test_changed_manifest_invalidates_signature_and_self_policy_is_rejected(self):
        policy = self.signed()
        self.manifest["citations"]["/year_days"]["locator"] = "changed locator"
        self.write("manifest.json", self.manifest)
        with self.assertRaisesRegex(tool.RulepackError, "independent_full_scope"):
            tool.validate_pack(self.pack, trusted_reviewers=policy)
        inside = self.pack / "self-policy.json"
        inside.write_bytes(policy.read_bytes())
        inside.chmod(0o600)
        with self.assertRaisesRegex(tool.RulepackError, "must_be_external"):
            tool.validate_pack(self.pack, trusted_reviewers=inside)

    def test_private_policy_and_nonproducer_fullscope_authority_required(self):
        policy = self.signed()
        policy.chmod(0o644)
        with self.assertRaisesRegex(tool.RulepackError, "owned_private"):
            tool.validate_pack(self.pack, trusted_reviewers=policy)
        policy.chmod(0o600)
        content = json.loads(policy.read_text())
        content["keys"][0]["years"] = [1404]
        policy.write_text(json.dumps(content))
        with self.assertRaisesRegex(tool.RulepackError, "authorization_required"):
            tool.validate_pack(self.pack, trusted_reviewers=policy)

    def test_required_fixtures_cover_all_kinds_and_all_exact_results(self):
        self.manifest["fixtures"][0]["expected"]["net"] = "123"
        self.write("manifest.json", self.manifest)
        with self.assertRaisesRegex(tool.RulepackError, "fixture_mismatch"):
            tool.validate_pack(self.pack)
        self.manifest["fixtures"][0]["expected"].pop("net")
        self.write("manifest.json", self.manifest)
        with self.assertRaisesRegex(tool.RulepackError, "complete_exact"):
            tool.validate_pack(self.pack)

    def test_path_traversal_symlink_duplicate_json_and_float_refused(self):
        for name in ("../outside", "/etc/passwd", "foo\\bar"):
            with self.assertRaises(tool.RulepackError):
                tool.artifact(self.pack, name)
        link = self.pack / "alias"
        link.symlink_to(self.pack / "labour.html")
        with self.assertRaisesRegex(tool.RulepackError, "symlink"):
            tool.artifact(self.pack, "alias")
        for text, code in (
            ('{"key":1,"key":2}', "duplicate_json"),
            ('{"key":0.1}', "non_exact"),
        ):
            path = self.root / "bad.json"
            path.write_text(text)
            with self.assertRaisesRegex(tool.RulepackError, code):
                tool.load_json(path)

    def test_effective_dates_must_belong_to_labelled_jalali_year(self):
        self.manifest["calendar_year"] = 1404
        self.write("manifest.json", self.manifest)
        with self.assertRaisesRegex(tool.RulepackError, "outside_calendar_year"):
            tool.validate_pack(self.pack)

    def test_fetch_captures_only_tls_official_media_without_following_external_redirect(
        self,
    ):
        def handler(request):
            if request.url.path == "/redirect":
                return httpx.Response(
                    302, headers={"location": "https://evil.invalid/"}
                )
            return httpx.Response(
                200,
                headers={"content-type": "text/html; charset=utf-8"},
                content=b"<!DOCTYPE html><html>synthetic source</html>",
            )

        real = httpx.Client

        def client(**kwargs):
            self.assertFalse(kwargs["follow_redirects"])
            self.assertFalse(kwargs["trust_env"])
            return real(**kwargs, transport=httpx.MockTransport(handler))

        with patch.object(tool.httpx, "Client", side_effect=client):
            result = tool.fetch_source(
                "https://tamin.ir/original",
                self.root / "fetched",
                media_type="text/html",
            )
            self.assertFalse(result["legal_verified"])
            self.assertEqual(
                (self.root / "fetched/document").stat().st_mode & 0o777, 0o600
            )
            with self.assertRaisesRegex(tool.RulepackError, "official_https"):
                tool.fetch_source(
                    "https://tamin.ir/redirect",
                    self.root / "blocked",
                    media_type="text/html",
                )
            self.assertFalse((self.root / "blocked").exists())

    def test_stage_result_metadata_cannot_overwrite_a_source_artifact(self):
        self.manifest["sources"][0]["file"] = "stage-result.json"
        self.write("manifest.json", self.manifest)
        with self.assertRaisesRegex(tool.RulepackError, "reserved_stage_artifact"):
            tool.stage_pack(self.pack, self.root / "unsafe-stage")
        self.assertFalse((self.root / "unsafe-stage").exists())

    def test_exact_official_province_host_and_suffix_lookalikes(self):
        official = "https://hormozgan.mcls.gov.ir/official-wage-circular"
        self.assertEqual(tool.source_url(official), official)
        for url in (
            "https://hormozgan.mcls.gov.ir.evil.invalid/circular",
            "https://evilhormozgan.mcls.gov.ir/circular",
            "https://unlisted.mcls.gov.ir/circular",
            "https://secret@hormozgan.mcls.gov.ir/circular",
        ):
            with self.subTest(url=url), self.assertRaises(tool.RulepackError):
                tool.source_url(url)

    def test_tax_authority_host_boundary_and_credentials(self):
        self.assertTrue(primary_sources(["https://regulation.tax.gov.ir/official.pdf"]))
        for value in (
            "https://tax.gov.ir.evil.invalid/x",
            "https://eviltax.gov.ir/x",
            "https://secret@regulation.tax.gov.ir/x",
            "https://regulation.tax.gov.ir:444/x",
            "http://regulation.tax.gov.ir/x",
            "https://regulation.tax.gov.ir:bad/x",
        ):
            self.assertFalse(primary_sources([value]))

    def test_recursive_special_profile_and_band_leaf_citations(self):
        self.manifest["rules"]["special_tax_profiles"] = {
            "eidi": {
                key: self.manifest["rules"][key]
                for key in ("tax_mode", "tax_exemption_monthly", "tax_bands")
            }
        }
        self.write("manifest.json", self.manifest)
        with self.assertRaisesRegex(tool.RulepackError, "requires_citation"):
            tool.validate_pack(self.pack)
        for key in tool.parameter_paths(self.manifest["rules"]):
            self.manifest["citations"][key] = {
                "source_id": "tax",
                "locator": "synthetic-only",
            }
        self.write("manifest.json", self.manifest)
        self.assertIn(
            "/special_tax_profiles/eidi/tax_bands/0/rate", self.manifest["citations"]
        )
        self.assertFalse(tool.validate_pack(self.pack)["legal_verified"])

    def test_single_tax_component_validates_without_fabricating_missing_areas(self):
        params = {
            key: self.manifest["rules"][key]
            for key in (
                "tax_mode",
                "tax_exemption_monthly",
                "tax_bands",
                "rounding_unit",
            )
        }
        component = {
            "format": "didban-payroll-tax-component-1",
            "component_id": "synthetic-tax1405",
            "calendar_year": 1405,
            "effective_from": "2026-03-21",
            "effective_to": "2027-03-20",
            "target": "eidi",
            "parameters": params,
            "sources": [self.manifest["sources"][2]],
            "citations": {
                key: {"source_id": "tax", "locator": "synthetic-only"}
                for key in tool.parameter_paths(params)
            },
            "fixtures": [
                {
                    "taxable": "1000",
                    "months": 1,
                    "expected_tax": "50",
                    "reference": "synthetic boundary",
                }
            ],
        }
        self.write("manifest.json", component)
        result = tool.validate_component(self.pack)
        self.assertEqual(result["partial_scope"], "tax:eidi")
        self.assertEqual(result["fixture_count"], 1)
        self.assertEqual(result["status"], "draft_component_checks_passed")
        self.assertFalse(result["legal_verified"])
        with self.assertRaises(tool.RulepackError):
            tool.validate_pack(self.pack)
        component["fixtures"][0]["expected_tax"] = "49"
        self.write("manifest.json", component)
        with self.assertRaisesRegex(tool.RulepackError, "fixture_mismatch"):
            tool.validate_component(self.pack)

    def test_iran_browser_transfer_challenge_is_not_accepted_html(self):
        challenge = self.root / "transfer.html"
        challenge.write_text(
            "<!DOCTYPE html><html>Transferring to the website...<script>function isTehranTimezone(){}</script></html>"
        )
        with self.assertRaisesRegex(tool.RulepackError, "challenge_body"):
            tool.document_type(challenge, "text/html")

    def import_setup(self):
        path = self.root / "session.json"
        path.write_text(
            json.dumps(
                {
                    "origin": "http://127.0.0.1:18148",
                    "session_cookie": "synthetic-never-log",
                }
            )
        )
        path.chmod(0o600)
        return {
            "credential_file": path,
            "company_id": str(uuid4()),
            "idempotency_key": str(uuid4()),
            "receipt_file": self.root / "import-receipt.json",
        }

    def mock_import(self, handler):
        real = httpx.Client

        def client(**kwargs):
            self.assertFalse(kwargs["follow_redirects"])
            self.assertFalse(kwargs["trust_env"])
            return real(**kwargs, transport=httpx.MockTransport(handler))

        return patch.object(tool.httpx, "Client", side_effect=client)

    def test_import_draft_uses_normal_csrf_idempotency_and_never_review_or_activate(
        self,
    ):
        options = self.import_setup()
        calls, rule_id = [], str(uuid4())

        def handler(request):
            calls.append(request)
            if request.url.path == "/api/v1/auth/csrf":
                self.assertIn(
                    "didban_session=synthetic-never-log", request.headers["cookie"]
                )
                return httpx.Response(
                    200,
                    json={"token": "synthetic-csrf"},
                    headers={"set-cookie": "didban_csrf=synthetic-csrf; Path=/"},
                )
            self.assertEqual(request.method, "POST")
            self.assertEqual(
                request.url.path,
                "/api/v1/companies/" + options["company_id"] + "/payroll/rules",
            )
            self.assertEqual(request.headers["x-csrf-token"], "synthetic-csrf")
            self.assertEqual(
                request.headers["idempotency-key"], options["idempotency_key"]
            )
            body = json.loads(request.content)
            return httpx.Response(
                201,
                json=body | {"id": rule_id, "reviewed": False, "legal_verified": False},
            )

        with self.mock_import(handler):
            result = tool.import_draft(self.pack, **options)
            again = tool.import_draft(self.pack, **options)
        self.assertEqual(len(calls), 2)
        self.assertEqual(result["rule_id"], rule_id)
        self.assertTrue(again["replayed_local_receipt"])
        self.assertFalse(result["legal_verified"])
        self.assertFalse(result["activated"])
        self.assertEqual(options["receipt_file"].stat().st_mode & 0o777, 0o600)
        receipt = json.loads(options["receipt_file"].read_text())
        self.assertEqual(
            receipt["evidence_hash"], tool.validate_pack(self.pack)["evidence_hash"]
        )
        self.assertNotIn("synthetic-never-log", options["receipt_file"].read_text())

    def test_import_draft_forbidden_response_preserves_retry_key(
        self,
    ):
        options = self.import_setup()

        def handler(request):
            if request.method == "GET":
                return httpx.Response(200, json={"token": "synthetic-csrf"})
            return httpx.Response(
                403, json={"message": "private response not propagated"}
            )

        with (
            self.mock_import(handler),
            self.assertRaisesRegex(tool.RulepackError, "import_rejected"),
        ):
            tool.import_draft(self.pack, **options)
        receipt = json.loads(options["receipt_file"].read_text())
        self.assertEqual(receipt["status"], "prepared_or_unknown")
        self.assertEqual(receipt["idempotency_key"], options["idempotency_key"])
        options["idempotency_key"] = str(uuid4())
        with self.assertRaisesRegex(tool.RulepackError, "request_mismatch"):
            tool.import_draft(self.pack, **options)

    def test_import_refuses_incomplete_evidence_and_unprotected_credentials(self):
        options = self.import_setup()
        options["credential_file"].chmod(0o644)
        with self.assertRaisesRegex(tool.RulepackError, "owned_private"):
            tool.import_draft(self.pack, **options)
        self.manifest["sources"][0]["retrieval_receipt"] = None
        self.write("manifest.json", self.manifest)
        with self.assertRaisesRegex(tool.RulepackError, "complete_original"):
            tool.import_draft(self.pack, **options)


if __name__ == "__main__":
    unittest.main(verbosity=2)
