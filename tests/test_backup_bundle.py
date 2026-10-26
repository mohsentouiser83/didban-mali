"""Backup confidentiality, tamper/path rejection and non-destructive restore guard."""

from pathlib import Path
import io
import json
import os
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
from cryptography.exceptions import InvalidTag

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from backup_bundle import encrypt, decrypt, pack, unpack  # noqa: E402
from installation_backup import restore  # noqa: E402
from installation_snapshot import ComposeInstallation  # noqa: E402


class BackupBundleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.password = "synthetic-only-backup-passphrase-426!"

    def tearDown(self):
        self.temp.cleanup()

    def bundle(self):
        payload = self.root / "payload"
        payload.mkdir()
        (payload / "configuration.env").write_text(
            "DIDBAN_SECRET=private-fixture-value"
        )
        (payload / "database.dump").write_bytes(os.urandom(3_000_000))
        pack(payload, self.root / "payload.tar.gz")
        encrypt(
            self.root / "payload.tar.gz", self.root / "backup.didban", self.password
        )
        return self.root / "backup.didban"

    def test_roundtrip_streaming_private_permissions_and_no_clear_secret(self):
        source = self.bundle()
        self.assertEqual(source.stat().st_mode & 0o777, 0o600)
        self.assertNotIn(b"private-fixture-value", source.read_bytes())
        decrypt(source, self.root / "decoded.tar.gz", self.password)
        unpack(self.root / "decoded.tar.gz", self.root / "decoded")
        self.assertEqual(
            (self.root / "decoded/database.dump").read_bytes(),
            (self.root / "payload/database.dump").read_bytes(),
        )
        self.assertEqual(
            (self.root / "decoded/configuration.env").stat().st_mode & 0o777, 0o600
        )

    def test_wrong_password_and_ciphertext_tampering_leave_no_plaintext(self):
        source = self.bundle()
        target = self.root / "bad.tar.gz"
        with self.assertRaises(InvalidTag):
            decrypt(source, target, self.password + "wrong")
        self.assertFalse(target.exists())
        content = bytearray(source.read_bytes())
        content[100] ^= 1
        source.write_bytes(content)
        with self.assertRaises(InvalidTag):
            decrypt(source, target, self.password)
        self.assertFalse(target.exists())

    def test_truncated_backup_and_output_overwrite_are_rejected(self):
        source = self.bundle()
        with self.assertRaises(FileExistsError):
            encrypt(self.root / "payload.tar.gz", source, self.password)
        source.write_bytes(b"DIDBAN")
        with self.assertRaises(ValueError):
            decrypt(source, self.root / "bad", self.password)

    def test_tar_traversal_links_duplicates_and_unmanifested_files_are_rejected(self):
        for name, kind in [
            ("../escape", tarfile.REGTYPE),
            ("alias", tarfile.SYMTYPE),
            ("duplicate", tarfile.REGTYPE),
        ]:
            archive = self.root / "unsafe.tar.gz"
            with tarfile.open(archive, "w:gz") as stream:
                info = tarfile.TarInfo(name)
                info.type = kind
                info.linkname = "/etc/passwd"
                info.size = 1 if kind == tarfile.REGTYPE else 0
                stream.addfile(info, io.BytesIO(b"x"))
                if name == "duplicate":
                    stream.addfile(info, io.BytesIO(b"x"))
            with self.assertRaises(ValueError):
                unpack(archive, self.root / ("out-" + kind.decode()))
            self.assertFalse((self.root / "escape").exists())

    def test_plaintext_file_tampering_fails_integrity_even_in_valid_archive(self):
        self.bundle()
        p = self.root / "payload"
        (p / "database.dump").write_text("changed")
        with tarfile.open(self.root / "tampered.tar.gz", "w:gz") as stream:
            for file in p.iterdir():
                stream.add(file, arcname=file.name)
        with self.assertRaisesRegex(ValueError, "checksum"):
            unpack(self.root / "tampered.tar.gz", self.root / "tampered")

    def test_existing_project_collision_refuses_without_cleanup_or_deletion(self):
        payload = self.root / "collision-payload"
        payload.mkdir()
        (payload / "configuration.env").write_text("DIDBAN_SECRET=fixture")
        (payload / "snapshot.json").write_text(
            json.dumps({"format": 1, "quiesced": True})
        )
        pack(payload, self.root / "collision.tar.gz")
        encrypt(
            self.root / "collision.tar.gz",
            self.root / "collision.didban",
            self.password,
        )
        calls = []

        def command(arguments, **kwargs):
            calls.append(arguments)
            if arguments[:3] == ["docker", "ps", "-aq"]:
                return b"existing-container"
            if arguments[:3] == ["docker", "volume", "ls"]:
                return b"existing-volume"
            raise AssertionError(
                "No mutation may run after an existing target is detected"
            )

        with (
            patch("installation_backup.run", side_effect=command),
            patch("installation_backup.secrets.token_hex", return_value="collision"),
        ):
            with self.assertRaisesRegex(ValueError, "not empty"):
                restore(
                    self.root / "collision.didban",
                    self.root / "new-target",
                    self.password,
                )
        self.assertFalse(any("down" in call or "up" in call for call in calls))
        self.assertFalse((self.root / "new-target/recovery.env").exists())

    def test_failed_fresh_restore_removes_resolved_plaintext_configuration(self):
        payload = self.root / "failed-payload"
        payload.mkdir()
        (payload / "configuration.env").write_text("DIDBAN_SECRET=fixture")
        (payload / "snapshot.json").write_text(
            json.dumps({"format": 1, "quiesced": True})
        )
        (payload / "definition.json").write_text(
            json.dumps({"services": {}, "secret": "private-fixture"})
        )
        (payload / "configuration-bindings").mkdir()
        (payload / "configuration-bindings/file.conf").write_text("private config")
        pack(payload, self.root / "failed.tar.gz")
        encrypt(self.root / "failed.tar.gz", self.root / "failed.didban", self.password)
        calls = []

        def command(arguments, **kwargs):
            calls.append(arguments)
            if arguments[:3] == ["docker", "ps", "-aq"] or arguments[:3] == [
                "docker",
                "volume",
                "ls",
            ]:
                return b""
            if "up" in arguments:
                raise RuntimeError("synthetic startup failure")
            if "down" in arguments:
                return b""
            raise AssertionError("Unexpected command")

        destination = self.root / "failed-target"
        with patch("installation_backup.run", side_effect=command):
            with self.assertRaisesRegex(RuntimeError, "synthetic"):
                restore(self.root / "failed.didban", destination, self.password)
        self.assertFalse((destination / "recovery.env").exists())
        self.assertFalse((destination / "recovery.compose.json").exists())
        self.assertFalse((destination / "configuration-bindings").exists())
        self.assertTrue(any("down" in call for call in calls))

    def test_quiescence_failure_resumes_only_previously_running_services(self):
        env = self.root / "quiesce.env"
        env.write_text("DIDBAN_SECRET=synthetic")
        env.chmod(0o600)
        installation = ComposeInstallation("synthetic-project", env)
        commands = []

        class Lock:
            def __init__(self, *args, **kwargs):
                self.stdin = io.BytesIO()
                self.stdout = io.BytesIO(b"\nDIDBAN_LOCKED\n")

            def wait(self, timeout=None):
                return 0

        def command(arguments, **kwargs):
            commands.append(arguments)
            return b"api\nworker\n" if "ps" in arguments else b""

        with (
            patch("installation_snapshot.run", side_effect=command),
            patch("installation_snapshot.subprocess.Popen", Lock),
            patch.object(installation, "container", return_value="owned-test-postgres"),
            patch.object(
                installation,
                "assert_quiesced",
                side_effect=RuntimeError("another client"),
            ),
        ):
            with self.assertRaisesRegex(RuntimeError, "another client"):
                with installation.quiesced():
                    self.fail("No snapshot should begin")
        resumed = next(call for call in commands if "start" in call)
        self.assertEqual(resumed[-3:], ["start", "api", "worker"])
        self.assertNotIn("web", resumed)
        self.assertTrue(any("stop" in call for call in commands))

    def test_restore_never_accepts_existing_destination_and_env_must_be_private(self):
        destination = self.root / "existing"
        destination.mkdir()
        (destination / "important").write_text("preserve")
        with self.assertRaisesRegex(ValueError, "existing targets"):
            restore(self.root / "nonexistent", destination, self.password)
        self.assertEqual((destination / "important").read_text(), "preserve")
        env = self.root / "config.env"
        env.write_text("DIDBAN_SECRET=fixture")
        env.chmod(0o644)
        with self.assertRaisesRegex(ValueError, "private"):
            ComposeInstallation("valid-project", env)
        env.chmod(0o600)
        with self.assertRaises(ValueError):
            ComposeInstallation("--bad-project", env)


if __name__ == "__main__":
    outcome = unittest.main(verbosity=2, exit=False).result
    (ROOT / "docs/backup-bundle-validation.json").write_text(
        json.dumps(
            {
                "status": "passed" if outcome.wasSuccessful() else "failed",
                "tests_run": outcome.testsRun,
                "scope": "encryption, authenticated integrity, safe archive and existing-target refusal; not a database restore test",
            },
            indent=2,
        )
        + "\n"
    )
    raise SystemExit(not outcome.wasSuccessful())
