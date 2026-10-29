"""Opt-in real custom archive roundtrip on two disposable test databases only."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import uuid
from unittest.mock import patch

import psycopg
from psycopg import sql

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tests"))
import test_backup_local  # noqa: E402
import backup_local as backup  # noqa: E402


@unittest.skipUnless(
    os.environ.get("DIDBAN_TEST_POSTGRES_BIN"),
    "Explicit matching PostgreSQL test client directory required",
)
class LocalDatabaseBackupTests(unittest.TestCase):
    def test_real_dump_encrypted_manifest_and_restore_exact_human_inputs(self):
        fixture = test_backup_local.LocalBackupTests()
        fixture.setUp()
        cluster_temp = tempfile.TemporaryDirectory(prefix="backup-pg-", dir="/tmp")
        cluster = Path(cluster_temp.name).resolve()
        binaries = Path(os.environ["DIDBAN_TEST_POSTGRES_BIN"])

        def cluster_command(arguments):
            result = subprocess.run(arguments, capture_output=True, timeout=30)
            self.assertEqual(
                result.returncode,
                0,
                "Disposable test cluster command failed; output suppressed",
            )

        cluster_command(
            [
                str(binaries / "initdb"),
                "-D",
                str(cluster / "data"),
                "-A",
                "trust",
                "--encoding=UTF8",
                "--no-locale",
                "--no-sync",
            ]
        )
        cluster_command(
            [
                str(binaries / "pg_ctl"),
                "-D",
                str(cluster / "data"),
                "-l",
                str(cluster / "server.log"),
                "-o",
                "-k " + str(cluster) + " -h '' -p 55433",
                "-w",
                "start",
            ]
        )
        admin = psycopg.conninfo.make_conninfo(
            host=str(cluster), port=55433, dbname="postgres"
        )
        source = "backup_src_" + uuid.uuid4().hex[:20]
        target = "backup_dst_" + uuid.uuid4().hex[:20]
        actual_connect = psycopg.connect
        env = {
            key: value for key, value in os.environ.items() if not key.startswith("PG")
        }
        env.update(PGHOST=str(cluster), PGPORT="55433")
        before = backup.tree_hashes(fixture.private)

        def execute(arguments, output):
            result = subprocess.run(
                arguments, env=env, stdout=output, stderr=subprocess.PIPE, timeout=30
            )
            self.assertEqual(
                result.returncode,
                0,
                "Isolated PostgreSQL archive command failed; output suppressed",
            )

        def dump(container, path, **kwargs):
            with path.open("wb") as output:
                execute(
                    [
                        str(binaries / "pg_dump"),
                        "-Fc",
                        "--no-owner",
                        "--dbname=" + source,
                    ],
                    output,
                )

        def command(args, output=None):
            if "inspect" in args:
                return json.dumps([fixture.info]).encode()
            execute(
                [
                    str(binaries / "pg_dumpall"),
                    "--globals-only",
                    "--database=" + source,
                ],
                output,
            )
            return b""

        def connect(**kwargs):
            return actual_connect(
                psycopg.conninfo.make_conninfo(admin, dbname=source),
                application_name="didban-local-backup",
            )

        try:
            with actual_connect(admin, autocommit=True) as conn:
                for name in (source, target):
                    conn.execute(
                        sql.SQL(
                            "CREATE DATABASE {} TEMPLATE template0 ENCODING 'UTF8'"
                        ).format(sql.Identifier(name))
                    )
            with actual_connect(
                psycopg.conninfo.make_conninfo(admin, dbname=source)
            ) as conn:
                conn.execute(
                    "CREATE SCHEMA app; CREATE SCHEMA didban_meta; CREATE TABLE didban_meta.schema_migrations(name text,sha256 text); CREATE TABLE app.source_files(object_key text,sha256 text); CREATE TABLE app.export_jobs(object_key text,sha256 text,status text); CREATE TABLE app.human_inputs(id integer primary key, note text, amount numeric(40,2), bytes bytea)"
                )
                conn.execute(
                    "INSERT INTO app.source_files VALUES(%s,%s)",
                    ("a" * 32 + "/" + "b" * 32, fixture.conn.object_hash),
                )
                conn.execute(
                    "INSERT INTO app.human_inputs VALUES(1,%s,123456789012345678901234567890.12,%s)",
                    ("اطلاعات دستی بدون تغییر", b"\x00\xffsource"),
                )
            fixture.info["NetworkSettings"] = {
                "Ports": {"5432/tcp": [{"HostIp": "127.0.0.1", "HostPort": "5432"}]}
            }
            with (
                patch.object(backup, "ROOT", fixture.root),
                patch.object(backup, "command", side_effect=command),
                patch.object(backup, "dump", side_effect=dump),
                patch.object(backup.psycopg, "connect", side_effect=connect),
                patch.object(backup, "owned_process", return_value=False),
            ):
                result = backup.capture_locked(
                    state_file=fixture.statefile,
                    container_id=fixture.container,
                    target=fixture.target,
                    passphrase_file=fixture.passfile,
                )
            self.assertEqual(result["status"], "encrypted_local_backup_verified")
            decoded = fixture.decode()
            self.assertTrue(
                (decoded / "database.dump").read_bytes().startswith(b"PGDMP")
            )
            self.assertIn(b"CREATE ROLE", (decoded / "globals.sql").read_bytes())
            self.assertEqual(backup.tree_hashes(decoded / "private"), before)
            execute(
                [
                    str(binaries / "pg_restore"),
                    "--exit-on-error",
                    "--no-owner",
                    "--dbname=" + target,
                    str(decoded / "database.dump"),
                ],
                subprocess.DEVNULL,
            )
            with actual_connect(
                psycopg.conninfo.make_conninfo(admin, dbname=target)
            ) as conn:
                row = conn.execute(
                    "SELECT note,amount::text,bytes FROM app.human_inputs WHERE id=1"
                ).fetchone()
                self.assertEqual(
                    row,
                    (
                        "اطلاعات دستی بدون تغییر",
                        "123456789012345678901234567890.12",
                        b"\x00\xffsource",
                    ),
                )
                self.assertEqual(
                    conn.execute("SELECT * FROM app.source_files").fetchall(),
                    [("a" * 32 + "/" + "b" * 32, fixture.conn.object_hash)],
                )
        finally:
            with actual_connect(admin, autocommit=True) as conn:
                for name in (source, target):
                    conn.execute(
                        sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(
                            sql.Identifier(name)
                        )
                    )
            cluster_command(
                [
                    str(binaries / "pg_ctl"),
                    "-D",
                    str(cluster / "data"),
                    "-m",
                    "immediate",
                    "-w",
                    "stop",
                ]
            )
            cluster_temp.cleanup()
            fixture.tearDown()


if __name__ == "__main__":
    unittest.main(verbosity=2)
