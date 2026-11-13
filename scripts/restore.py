#!/usr/bin/env python3
"""Safe isolated restore procedure for Didban Mali backups.

Validates manifest hashes, path boundaries, schema/app version, and restores
database, private storage originals, and environment safely.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))


class RestoreValidationError(Exception):
    """Raised when backup validation fails."""


def validate_manifest(backup_dir: Path) -> dict:
    if not backup_dir.is_dir():
        raise RestoreValidationError(f"Backup directory does not exist: {backup_dir}")
    if (backup_dir / "INCOMPLETE").is_file():
        raise RestoreValidationError("Backup is marked INCOMPLETE; refusing to restore")
    manifest_path = backup_dir / "manifest.json"
    if not manifest_path.is_file():
        raise RestoreValidationError("Backup manifest.json missing")

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception as e:
        raise RestoreValidationError(f"Invalid manifest.json: {e}") from e

    if manifest.get("schema") != "didban-backup-1":
        raise RestoreValidationError(f"Unsupported backup schema: {manifest.get('schema')}")

    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        raise RestoreValidationError("Backup manifest contains no file entries")

    backup_dir_resolved = backup_dir.resolve()
    for entry in files:
        rel_path = entry.get("path")
        if not rel_path or ".." in rel_path or os.path.isabs(rel_path):
            raise RestoreValidationError(f"Path traversal or invalid path detected: {rel_path}")

        file_path = (backup_dir / rel_path).resolve()
        if not str(file_path).startswith(str(backup_dir_resolved)):
            raise RestoreValidationError(f"File path outside backup directory: {rel_path}")

        if not file_path.is_file():
            raise RestoreValidationError(f"Missing backup file: {rel_path}")

        expected_bytes = entry.get("bytes")
        expected_sha = entry.get("sha256")
        actual_bytes = file_path.stat().st_size
        if actual_bytes != expected_bytes:
            raise RestoreValidationError(
                f"Size mismatch for {rel_path}: expected {expected_bytes}, got {actual_bytes}"
            )

        with file_path.open("rb") as f:
            actual_sha = hashlib.file_digest(f, "sha256").hexdigest()
        if actual_sha != expected_sha:
            raise RestoreValidationError(
                f"Checksum mismatch for {rel_path}: expected {expected_sha}, got {actual_sha}"
            )

    return manifest


def verify_sqlite_db(db_path: Path) -> None:
    if not db_path.is_file():
        raise RestoreValidationError(f"Database file not found: {db_path}")
    try:
        with sqlite3.connect(db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("PRAGMA integrity_check")
            row = cursor.fetchone()
            if not row or row[0] != "ok":
                raise RestoreValidationError(f"SQLite integrity check failed: {row}")
    except sqlite3.Error as e:
        raise RestoreValidationError(f"SQLite database verification failed: {e}") from e


def verify_restored_provenance(db_path: Path, storage_dir: Path) -> dict:
    provenance = {}
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()

        # Verify source files match stored hashes
        cursor.execute("SELECT storage_key, sha256, size FROM source_files")
        rows = cursor.fetchall()
        verified_files = 0
        for storage_key, expected_sha, expected_size in rows:
            orig_file = storage_dir / storage_key
            if not orig_file.is_file():
                raise RestoreValidationError(f"Restored private storage missing source file: {storage_key}")
            if orig_file.stat().st_size != expected_size:
                raise RestoreValidationError(
                    f"Size mismatch for source file {storage_key}: expected {expected_size}, got {orig_file.stat().st_size}"
                )
            with orig_file.open("rb") as f:
                actual_sha = hashlib.file_digest(f, "sha256").hexdigest()
            if actual_sha != expected_sha:
                raise RestoreValidationError(f"Checksum mismatch for source file {storage_key}")
            verified_files += 1
        provenance["verified_source_files"] = verified_files

        # Result manifests count
        cursor.execute("SELECT COUNT(*) FROM result_manifests")
        provenance["result_manifests_count"] = cursor.fetchone()[0]

        # Memberships and report approvals count
        cursor.execute("SELECT COUNT(*) FROM memberships")
        provenance["memberships_count"] = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM report_approvals")
        provenance["report_approvals_count"] = cursor.fetchone()[0]

        # Check native journal count if table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='native_journals'")
        if cursor.fetchone():
            cursor.execute("SELECT COUNT(*) FROM native_journals")
            provenance["native_journals_count"] = cursor.fetchone()[0]

    return provenance


def restore_sqlite(
    backup_dir: Path,
    target_db: Path,
    target_storage: Path,
    target_env: Path | None = None,
    verify_provenance: bool = True,
) -> dict:
    start_time = time.time()
    manifest = validate_manifest(backup_dir)

    source_db = backup_dir / "database.sqlite3"
    verify_sqlite_db(source_db)

    # Ensure target parent dirs exist
    target_db.parent.mkdir(parents=True, exist_ok=True)
    target_storage.mkdir(parents=True, exist_ok=True)

    # Restore DB
    with sqlite3.connect(source_db) as src, sqlite3.connect(target_db) as dst:
        src.backup(dst)

    # Restore private storage
    src_private = backup_dir / "private"
    if src_private.is_dir():
        for file in src_private.rglob("*"):
            if file.is_file():
                rel = file.relative_to(src_private)
                dest = target_storage / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(file, dest)

    # Restore env if present
    src_env = backup_dir / "installation.env"
    if src_env.is_file() and target_env is not None:
        target_env.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_env, target_env)
        target_env.chmod(0o600)

    provenance = {}
    if verify_provenance:
        provenance = verify_restored_provenance(target_db, target_storage)

    duration = time.time() - start_time
    return {
        "status": "completed",
        "backup_mode": manifest.get("mode"),
        "backup_created_at": manifest.get("created_at"),
        "restored_at": datetime.now(timezone.utc).isoformat(),
        "duration_seconds": round(duration, 3),
        "target_db": str(target_db),
        "target_storage": str(target_storage),
        "provenance": provenance,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup-dir", type=Path, required=True, help="Path to valid backup directory")
    parser.add_argument("--verify-only", action="store_true", help="Only verify backup integrity")
    parser.add_argument("--target-db", type=Path, help="Target SQLite database file")
    parser.add_argument("--target-storage", type=Path, help="Target private storage directory")
    parser.add_argument("--target-env", type=Path, help="Target installation.env path")
    parser.add_argument("--skip-provenance", action="store_true", help="Skip database provenance checks")

    args = parser.parse_args()
    backup_dir = args.backup_dir.resolve()

    if args.verify_only:
        manifest = validate_manifest(backup_dir)
        if (backup_dir / "database.sqlite3").is_file():
            verify_sqlite_db(backup_dir / "database.sqlite3")
        print(f"Backup verification succeeded: {len(manifest['files'])} files verified")
        return

    if not args.target_db or not args.target_storage:
        parser.error("--target-db and --target-storage are required when not using --verify-only")

    result = restore_sqlite(
        backup_dir=backup_dir,
        target_db=args.target_db.resolve(),
        target_storage=args.target_storage.resolve(),
        target_env=args.target_env.resolve() if args.target_env else None,
        verify_provenance=not args.skip_provenance,
    )
    print(f"Restore succeeded: {json.dumps(result, ensure_ascii=False, indent=2)}")


if __name__ == "__main__":
    main()
