"""Local pre-upgrade backup guards; all installation/process/database fixtures disposable."""

from contextlib import contextmanager
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import backup_local as backup  # noqa: E402
from backup_bundle import decrypt, digest, unpack  # noqa: E402


class Result:
    def __init__(self, rows):
        self.rows = rows

    def fetchall(self):
        return self.rows


class Connection:
    def execute(self, query):
        if "schema_migrations" in query:
            return Result([])
        if "object_key" in query:
            return Result([("a" * 32 + "/" + "b" * 32, self.object_hash)])
        raise AssertionError(query)


class LocalBackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.private = self.root / ".local/local-runtime"
        self.private.mkdir(parents=True)
        self.objects = self.private / "objects"
        file = self.objects / ("a" * 32) / ("b" * 32)
        file.parent.mkdir(parents=True)
        file.write_bytes(b"original spreadsheet bytes\x00\xff")
        self.conn = Connection()
        self.conn.object_hash = digest(file)
        self.state = {
            "mode": "clean_local",
            "container": "didban-local-fresh-test",
            "volume": "owned-db-volume",
            "pids": [],
            "users": {"private": "retain exactly"},
            "storage_root": str(self.objects),
        }
        self.statefile = self.private / "state.json"
        self.write_private(self.statefile, json.dumps(self.state).encode())
        self.write_private(
            self.private / "application-secret", b"unchanged-application-secret"
        )
        self.write_private(
            self.root / ".env.model", b"DIDBAN_MODEL_API_KEY=synthetic-never-log\n"
        )
        self.password = "synthetic-private-passphrase-1234"
        self.passfile = self.root / "passphrase"
        self.write_private(self.passfile, self.password.encode() + b"\n")
        self.target = self.root / "result.didban"
        self.container = "a" * 64
        self.info = {
            "Id": self.container,
            "Name": "/didban-local-fresh-test",
            "State": {"Running": True},
            "Mounts": [
                {
                    "Type": "volume",
                    "Destination": "/var/lib/postgresql/data",
                    "Name": "owned-db-volume",
                }
            ],
            "Config": {"Env": ["POSTGRES_PASSWORD=synthetic-db-password"]},
        }
        self.calls = []

    def tearDown(self):
        self.temp.cleanup()

    def write_private(self, path, content):
        path.write_bytes(content)
        path.chmod(0o600)

    @contextmanager
    def snapshot(self, info, pids):
        yield self.conn, "postgres", "postgres"

    def command(self, args, output=None):
        self.calls.append(args)
        if "inspect" in args:
            return json.dumps([self.info]).encode()
        self.assertIn("--globals-only", args)
        output.write(b"-- synthetic roles archive\n")
        return b""

    def dump(self, container, path, **kwargs):
        self.assertEqual(container, self.container)
        self.assertEqual(kwargs, {"database": "postgres", "user": "postgres"})
        path.write_bytes(b"PGDMP-synthetic\x00")

    def capture(self, **overrides):
        options = dict(
            state_file=self.statefile,
            container_id=self.container,
            target=self.target,
            passphrase_file=self.passfile,
        )
        options.update(overrides)
        with (
            patch.object(backup, "ROOT", self.root),
            patch.object(backup, "command", self.command),
            patch.object(backup, "database_snapshot", self.snapshot),
            patch.object(backup, "dump", self.dump),
            patch.object(backup, "owned_process", return_value=False),
        ):
            return backup.capture_locked(**options)

    def decode(self):
        decrypt(self.target, self.root / "decoded.tar.gz", self.password)
        unpack(self.root / "decoded.tar.gz", self.root / "decoded")
        return self.root / "decoded"

    def test_full_verified_encrypted_roundtrip_preserves_all_private_bytes(self):
        before = backup.tree_hashes(self.private)
        result = self.capture()
        self.assertEqual(result["status"], "encrypted_local_backup_verified")
        self.assertEqual(result["sha256"], digest(self.target))
        self.assertEqual(self.target.stat().st_mode & 0o777, 0o600)
        self.assertNotIn(b"synthetic-never-log", self.target.read_bytes())
        decoded = self.decode()
        self.assertEqual(backup.tree_hashes(decoded / "private"), before)
        self.assertEqual(
            (decoded / "model.env").read_bytes(),
            (self.root / ".env.model").read_bytes(),
        )
        self.assertEqual(
            (decoded / "globals.sql").read_bytes(), b"-- synthetic roles archive\n"
        )
        self.assertEqual(backup.tree_hashes(self.private), before)
        self.assertFalse(
            any(
                "start" in call or "stop" in call or "ALTER" in call
                for call in self.calls
            )
        )
        self.assertEqual(list(self.root.glob(".didban-local-backup-*")), [])

    def test_existing_target_never_overwritten_or_services_stopped(self):
        self.target.write_bytes(b"existing-backup")
        with patch.object(backup, "stop_owned") as stop:
            with self.assertRaisesRegex(ValueError, "already exists"):
                self.capture()
            stop.assert_not_called()
        self.assertEqual(self.target.read_bytes(), b"existing-backup")

    def test_passphrase_requires_private_regular_owned_file(self):
        self.passfile.chmod(0o644)
        with self.assertRaisesRegex(ValueError, "private regular"):
            self.capture()
        self.assertEqual(self.calls, [])
        self.passfile.unlink()
        self.passfile.symlink_to(self.private / "application-secret")
        with self.assertRaises(OSError):
            self.capture()

    def test_explicit_state_path_container_id_and_volume_ownership(self):
        for change in ("state_path", "container_id", "volume", "storage"):
            with self.subTest(change=change):
                old = json.loads(json.dumps(self.info))
                options = {}
                if change == "state_path":
                    options["state_file"] = self.root / "wrong-state.json"
                if change == "container_id":
                    options["container_id"] = "b" * 64
                if change == "volume":
                    self.info["Mounts"][0]["Name"] = "unknown-volume"
                if change == "storage":
                    state = self.state | {"storage_root": str(self.root / "other")}
                    self.write_private(self.statefile, json.dumps(state).encode())
                with self.assertRaises(ValueError):
                    self.capture(**options)
                self.assertFalse(self.target.exists())
                self.info = old
                self.write_private(self.statefile, json.dumps(self.state).encode())

    def test_missing_or_corrupt_referenced_object_refuses_snapshot(self):
        self.conn.object_hash = "0" * 64
        with self.assertRaisesRegex(ValueError, "object absent or corrupted"):
            self.capture()
        self.assertFalse(self.target.exists())

    def test_file_changes_during_dump_refuse_snapshot_and_cleanup(self):
        with patch.object(self, "dump") as mocked:
            # Avoid recursion through the patched instance method.
            mocked.side_effect = lambda container, path, **kwargs: (
                path.write_bytes(b"PGDMP"),
                (self.private / "application-secret").write_bytes(b"changed"),
            )
            with self.assertRaisesRegex(RuntimeError, "files changed"):
                self.capture()
        self.assertFalse(self.target.exists())
        self.assertEqual(list(self.root.glob(".didban-local-backup-*")), [])

    def test_symlink_special_files_and_destination_inside_source_refused(self):
        with self.assertRaisesRegex(ValueError, "outside"):
            self.capture(target=self.private / "backup.didban")
        (self.objects / "link").symlink_to(self.passfile)
        with self.assertRaisesRegex(ValueError, "link or special"):
            self.capture()
        self.assertFalse(self.target.exists())

    def test_validation_failure_never_publishes_target(self):
        with patch.object(backup, "unpack", side_effect=ValueError("invalid checksum")):
            with self.assertRaisesRegex(ValueError, "invalid checksum"):
                self.capture()
        self.assertFalse(self.target.exists())

    def test_unknown_pid_aborts_before_any_signal(self):
        with (
            patch.object(
                backup,
                "owned_process",
                side_effect=[True, ValueError("unknown process")],
            ),
            patch.object(backup.os, "killpg") as kill,
        ):
            with self.assertRaisesRegex(ValueError, "unknown"):
                backup.stop_owned({"pids": [10001, 10002]}, True)
            kill.assert_not_called()

    def test_running_services_need_explicit_quiesce_and_only_owned_are_signaled(self):
        with (
            patch.object(backup, "owned_process", return_value=True),
            patch.object(backup.os, "killpg") as kill,
        ):
            with self.assertRaisesRegex(ValueError, "explicitly"):
                backup.stop_owned({"pids": [10001]}, False)
            kill.assert_not_called()
        with (
            patch.object(
                backup, "owned_process", side_effect=[True, False, True, False]
            ),
            patch.object(backup.os, "killpg") as kill,
        ):
            self.assertEqual(backup.stop_owned({"pids": [10001, 10002]}, True), [10001])
            kill.assert_called_once_with(10001, backup.signal.SIGTERM)

    def test_database_snapshot_locks_without_writing_and_rejects_unknown_clients(self):
        from unittest.mock import MagicMock

        conn = MagicMock()
        conn.execute.return_value.fetchone.return_value = [1]
        with patch.object(backup, "owned_process", return_value=False):
            with self.assertRaisesRegex(RuntimeError, "Another database client"):
                backup.assert_quiesced(conn, [])
        conn.execute.return_value.fetchone.return_value = [0]
        with patch.object(backup, "owned_process", return_value=True):
            with self.assertRaisesRegex(RuntimeError, "restarted"):
                backup.assert_quiesced(conn, [10001])


if __name__ == "__main__":
    unittest.main(verbosity=2)
