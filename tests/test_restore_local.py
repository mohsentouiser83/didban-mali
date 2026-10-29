"""Recovery preflight guards; never touch the user's installation or Docker."""

import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import restore_local as recovery  # noqa: E402
from backup_bundle import digest  # noqa: E402


class LocalRestoreGuards(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.payload = self.root / "payload"
        private = self.payload / "private"
        private.mkdir(parents=True)
        for name, value in [
            ("state.json", json.dumps({"mode": "clean_local", "pids": [999999]})),
            ("application-secret", "private-secret"),
        ]:
            (private / name).write_text(value)
            (private / name).chmod(0o600)
        self.metadata = {
            "format": "didban-local-1",
            "quiesced": True,
            "database": "postgres",
            "database_user": "postgres",
            "model_configuration_present": False,
            "migrations": [],
        }
        self.save()
        (self.payload / "database.dump").write_bytes(b"PGDMPsynthetic")
        (self.payload / "container-inspect.json").write_text(
            json.dumps(
                {"Config": {"Env": ["POSTGRES_PASSWORD=private-original-password"]}}
            )
        )
        (self.payload / "globals.sql").write_text(
            "CREATE ROLE postgres;\nALTER ROLE postgres WITH SUPERUSER;\nCREATE ROLE other_role;\n"
        )

    def save(self):
        (self.payload / "snapshot.json").write_text(json.dumps(self.metadata))

    def tearDown(self):
        self.temp.cleanup()

    def test_existing_and_protected_destinations_are_refused(self):
        for path in [
            ROOT,
            ROOT / ".local/recovery",
            ROOT.parent / "didban-mali/recovery",
            self.root,
        ]:
            with self.subTest(path=path), self.assertRaises(ValueError):
                recovery.new_destination(path)
        link = self.root / "project-link"
        link.symlink_to(ROOT, target_is_directory=True)
        with self.assertRaises(ValueError):
            recovery.new_destination(link / "new-recovery")

    def test_valid_payload_keeps_attributes_but_removes_only_bootstrap_creation(self):
        metadata, state, values, roles = recovery.validate_payload(self.payload)
        self.assertEqual(metadata, self.metadata)
        self.assertEqual(state["pids"], [999999])
        self.assertEqual(values["POSTGRES_PASSWORD"], "private-original-password")
        self.assertNotIn("CREATE ROLE postgres;", roles)
        self.assertIn("ALTER ROLE postgres WITH SUPERUSER;", roles)
        self.assertIn("CREATE ROLE other_role;", roles)

    def test_nonquiesced_or_incomplete_model_bundle_is_refused(self):
        for key, value in [
            ("quiesced", False),
            ("format", "other"),
            ("model_configuration_present", True),
        ]:
            before = dict(self.metadata)
            self.metadata[key] = value
            self.save()
            with self.subTest(key=key), self.assertRaises(ValueError):
                recovery.validate_payload(self.payload)
            self.metadata = before
        self.save()

    def test_migration_mismatch_and_unsafe_files_are_refused(self):
        source = self.payload / "source-migrations"
        source.mkdir()
        migration = source / "001_schema.sql"
        migration.write_text("-- restored source")
        self.metadata["migrations"] = [[migration.name, digest(migration)]]
        self.save()
        with self.assertRaises(ValueError):
            recovery.validate_payload(self.payload)
        self.metadata["migrations"] = []
        self.save()
        (self.payload / "unsafe-link").symlink_to(migration)
        with self.assertRaises(ValueError):
            recovery.validate_payload(self.payload)

    def test_docker_cleanup_failure_still_removes_plaintext_and_attempts_both_resources(
        self,
    ):
        destination = self.root / "failed-restore"
        destination.mkdir()
        (destination / "private-extraction").write_text("synthetic-private-data")
        with patch.object(
            recovery, "run", side_effect=RuntimeError("unavailable")
        ) as command:
            with self.assertRaisesRegex(RuntimeError, "Private extraction removed"):
                recovery.cleanup_failed_recovery(
                    destination, "owned-new-container", "owned-new-volume", True, True
                )
            self.assertEqual(command.call_count, 2)
        self.assertFalse(destination.exists())

    def test_bad_authentication_creates_no_resources_and_removes_plaintext(self):
        bundle = self.root / "corrupt.didban"
        bundle.write_bytes(b"invalid-authenticated-backup")
        password = self.root / "password"
        password.write_text("synthetic-long-passphrase")
        password.chmod(0o600)
        destination = self.root / "new-recovery"
        with patch.object(recovery, "run") as command:
            with self.assertRaises(ValueError):
                recovery.restore_new(
                    bundle=bundle, destination=destination, passphrase_file=password
                )
            command.assert_not_called()
        self.assertFalse(destination.exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
