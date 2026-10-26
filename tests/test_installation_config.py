"""Read-only organizational configuration checks, separate from TLS handshake."""

import copy
import json
from pathlib import Path
import sys
import unittest
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from check_installation_config import validate  # noqa: E402
from recovery_configuration import validate_effective, portable  # noqa: E402


def configuration():
    return {
        "services": {
            "api": {
                "environment": {
                    "DIDBAN_PUBLIC_ORIGIN": "https://finance.fixture.invalid",
                    "DIDBAN_COOKIE_SECURE": "true",
                    "DIDBAN_SECRET": "a" * 64,
                    "DIDBAN_APP_DB_PASSWORD": "b" * 48,
                    "DIDBAN_IDENTITY_DB_PASSWORD": "c" * 48,
                },
                "ports": [{"host_ip": "127.0.0.1"}],
                "read_only": True,
            },
            "web": {
                "environment": {"DIDBAN_API_ORIGIN": "http://api:8000"},
                "ports": [{"host_ip": "127.0.0.1"}],
                "read_only": True,
            },
            "postgres": {"environment": {"POSTGRES_PASSWORD": "d" * 48}},
            "worker": {"environment": {"DIDBAN_WORKER_DB_PASSWORD": "e" * 48}},
        }
    }


class InstallationConfigTests(unittest.TestCase):
    def test_private_https_configuration_passes_without_mutation(self):
        data = configuration()
        before = copy.deepcopy(data)
        self.assertEqual(len(validate(data)), 8)
        self.assertEqual(data, before)

    def test_effective_secret_drift_is_rejected_and_literals_survive_saved_definition(
        self,
    ):
        data = configuration()
        data["name"] = "source-project"
        data["volumes"] = {"private-files": {"name": "source-private-files"}}
        data["networks"] = {"default": {"name": "source-network"}}
        data["services"]["api"]["environment"]["DIDBAN_SECRET"] = "private$secret"
        containers = {
            service: {
                "Image": "sha256:" + service,
                "Config": {
                    "Env": [
                        k + "=" + str(v) for k, v in definition["environment"].items()
                    ]
                },
            }
            for service, definition in data["services"].items()
        }
        validate_effective(data, containers)
        with tempfile.TemporaryDirectory() as directory:
            saved = portable(data, containers, Path(directory))
        self.assertNotIn("name", saved)
        self.assertNotIn("name", saved["volumes"]["private-files"])
        self.assertNotIn("name", saved["networks"]["default"])
        self.assertEqual(
            saved["services"]["api"]["environment"]["DIDBAN_SECRET"], "private$$secret"
        )
        self.assertEqual(saved["services"]["api"]["image"], "sha256:api")
        original_env = list(containers["api"]["Config"]["Env"])
        containers["api"]["Config"]["Env"].append(
            "DIDBAN_APP_DSN=host=another-private-database"
        )
        with self.assertRaisesRegex(ValueError, "Undeclared"):
            validate_effective(data, containers)
        containers["api"]["Config"]["Env"] = original_env
        containers["api"]["Config"]["Env"] = [
            "DIDBAN_SECRET=old-secret" if item.startswith("DIDBAN_SECRET=") else item
            for item in original_env
        ]
        with self.assertRaisesRegex(ValueError, "differs"):
            validate_effective(data, containers)

    def test_http_ambiguous_origin_and_disabled_secure_cookie_fail(self):
        for origin in [
            "http://finance.fixture.invalid",
            "https://localhost",
            "https://127.0.0.1",
            "https://finance.fixture.invalid/path",
            "https://user:pass@finance.fixture.invalid",
            "https://finance.fixture.invalid?q=x",
            "https://finance.fixture.invalid#x",
        ]:
            data = configuration()
            data["services"]["api"]["environment"]["DIDBAN_PUBLIC_ORIGIN"] = origin
            with self.assertRaises(ValueError):
                validate(data)
        data = configuration()
        data["services"]["api"]["environment"]["DIDBAN_COOKIE_SECURE"] = "false"
        with self.assertRaises(ValueError):
            validate(data)

    def test_weak_reused_secrets_and_public_database_are_rejected(self):
        data = configuration()
        data["services"]["api"]["environment"]["DIDBAN_SECRET"] = "short"
        with self.assertRaises(ValueError):
            validate(data)
        data = configuration()
        data["services"]["postgres"]["environment"]["POSTGRES_PASSWORD"] = "b" * 48
        with self.assertRaises(ValueError):
            validate(data)
        data = configuration()
        data["services"]["postgres"]["ports"] = [{"published": 5432}]
        with self.assertRaises(ValueError):
            validate(data)

    def test_public_ports_writable_root_and_cross_boundary_secrets_fail(self):
        for service in ["api", "web"]:
            data = configuration()
            data["services"][service]["ports"] = [{"host_ip": "0.0.0.0"}]
            with self.assertRaises(ValueError):
                validate(data)
            data = configuration()
            data["services"][service]["read_only"] = False
            with self.assertRaises(ValueError):
                validate(data)
        for service, key in [
            ("web", "DIDBAN_SECRET"),
            ("web", "DIDBAN_MODEL_API_KEY"),
            ("worker", "DIDBAN_SECRET"),
            ("worker", "DIDBAN_DB_ADMIN_PASSWORD"),
        ]:
            data = configuration()
            data["services"][service]["environment"][key] = "sensitive"
            with self.assertRaises(ValueError):
                validate(data)


if __name__ == "__main__":
    result = unittest.main(verbosity=2, exit=False).result
    (ROOT / "docs/installation-config-validation.json").write_text(
        json.dumps(
            {
                "status": "passed" if result.wasSuccessful() else "failed",
                "tests_run": result.testsRun,
                "scope": "configuration only; no TLS certificate/handshake, external deployment or organization acceptance",
            },
            indent=2,
        )
        + "\n"
    )
    raise SystemExit(not result.wasSuccessful())
