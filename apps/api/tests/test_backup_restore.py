"""Backup/restore reads the same immutable snapshots and private source evidence."""

import hashlib
import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def test_development_backup_restores_sources_snapshots_and_permissions(tmp_path):
    source_db = tmp_path / "browser-qa.db"
    storage = tmp_path / "originals"
    env = os.environ | {
        "PYTHONPATH": str(ROOT / "apps/api"),
        "DIDBAN_DATABASE_URL": "sqlite:///" + str(source_db),
        "DIDBAN_STORAGE": str(storage),
        "DIDBAN_MODEL_ENABLED": "false",
    }
    seed = subprocess.run(
        [sys.executable, str(ROOT / "scripts/seed_browser_qa.py")],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert seed.returncode == 0, seed.stdout + seed.stderr
    output = tmp_path / "backup"
    backup = subprocess.run(
        [sys.executable, str(ROOT / "scripts/backup.py"), "--mode", "sqlite", "--output", str(output)],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert backup.returncode == 0, backup.stdout + backup.stderr
    manifest = json.loads((output / "manifest.json").read_text())
    for entry in manifest["files"]:
        restored = output / entry["path"]
        assert restored.stat().st_size == entry["bytes"]
        assert hashlib.sha256(restored.read_bytes()).hexdigest() == entry["sha256"]
    with sqlite3.connect(output / "database.sqlite3") as restored:
        reports = restored.execute("SELECT metrics,details,digest FROM result_manifests").fetchall()
        assert len(reports) == 1
        metrics = {metric["metric_key"]: metric for metric in json.loads(reports[0][0])}
        assert metrics["cash"]["value"] == "2798"
        assert json.loads(reports[0][1])["forecast"]["closing"] == "2628"
        assert restored.execute("SELECT approve_financial_report FROM memberships").fetchall() == [(0,), (0,)]
        assert restored.execute("SELECT COUNT(*) FROM report_approvals").fetchone()[0] == 0
        for key, checksum, size in restored.execute("SELECT storage_key,sha256,size FROM source_files"):
            content = (output / "private" / key).read_bytes()
            assert len(content) == size and hashlib.sha256(content).hexdigest() == checksum
    # The online snapshot does not mutate the live source database or remove originals.
    with sqlite3.connect(source_db) as source:
        assert source.execute("SELECT digest FROM result_manifests").fetchone()[0] == reports[0][2]
    assert len(list(storage.iterdir())) == 8

    # Test verified restore script into a fresh isolated location
    target_db = tmp_path / "restored" / "target.db"
    target_storage = tmp_path / "restored" / "storage"
    restore = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/restore.py"),
            "--backup-dir",
            str(output),
            "--target-db",
            str(target_db),
            "--target-storage",
            str(target_storage),
        ],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert restore.returncode == 0, restore.stdout + restore.stderr
    assert "Restore succeeded" in restore.stdout

    # Verify target db is functional and provenance is intact
    with sqlite3.connect(target_db) as rconn:
        assert rconn.execute("SELECT COUNT(*) FROM source_files").fetchone()[0] == 8
        assert rconn.execute("SELECT COUNT(*) FROM result_manifests").fetchone()[0] == 1


def test_restore_script_rejects_corrupted_backup(tmp_path):
    backup_dir = tmp_path / "bad_backup"
    backup_dir.mkdir()
    (backup_dir / "database.sqlite3").write_bytes(b"corrupted")
    manifest = {
        "schema": "didban-backup-1",
        "created_at": "2026-11-13T00:00:00Z",
        "mode": "sqlite",
        "files": [{"path": "database.sqlite3", "bytes": 9, "sha256": "0000000000000000000000000000000000000000000000000000000000000000"}],
    }
    (backup_dir / "manifest.json").write_text(json.dumps(manifest))

    res = subprocess.run(
        [sys.executable, str(ROOT / "scripts/restore.py"), "--backup-dir", str(backup_dir), "--verify-only"],
        capture_output=True,
        text=True,
    )
    assert res.returncode != 0
    assert "Checksum mismatch" in res.stderr or "Checksum mismatch" in res.stdout


def test_restore_script_rejects_path_traversal(tmp_path):
    backup_dir = tmp_path / "traversal_backup"
    backup_dir.mkdir()
    manifest = {
        "schema": "didban-backup-1",
        "created_at": "2026-11-13T00:00:00Z",
        "mode": "sqlite",
        "files": [{"path": "../../../etc/passwd", "bytes": 10, "sha256": "abc"}],
    }
    (backup_dir / "manifest.json").write_text(json.dumps(manifest))

    res = subprocess.run(
        [sys.executable, str(ROOT / "scripts/restore.py"), "--backup-dir", str(backup_dir), "--verify-only"],
        capture_output=True,
        text=True,
    )
    assert res.returncode != 0
    assert "Path traversal" in res.stderr or "Path traversal" in res.stdout

