"""CLI tools run against an isolated miniature installation, never workspace data."""
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def installation(tmp_path):
    root = tmp_path / "installation"
    shutil.copytree(ROOT / "apps/api/didban", root / "apps/api/didban", ignore=shutil.ignore_patterns("__pycache__"))
    (root / "scripts").mkdir()
    for name in ("bootstrap.py", "reset_password.py", "backup.py"):
        shutil.copy2(ROOT / "scripts" / name, root / "scripts" / name)
    storage = root / "private"
    storage.mkdir(mode=0o700)
    env = os.environ | {"DIDBAN_DATABASE_URL": f"sqlite:///{root / 'installation.db'}", "DIDBAN_STORAGE": str(storage),
                        "DIDBAN_PRODUCTION": "false", "DIDBAN_MODEL_ENABLED": "false", "DIDBAN_OPENAI_API_KEY": ""}
    return root, storage, env


def test_sqlite_backup_restores_exact_database_originals_and_private_manifest(tmp_path):
    root, storage, env = installation(tmp_path)
    original = b"date,amount\n2026-09-01,123.400\n"
    (storage / "original-source").write_bytes(original)
    (root / ".env").write_text("DIDBAN_MODEL_ENABLED=false\n")
    with sqlite3.connect(root / "installation.db") as db:
        db.execute("CREATE TABLE immutable_fixture (id TEXT PRIMARY KEY, amount TEXT)")
        db.execute("INSERT INTO immutable_fixture VALUES ('one','123.400')")
    destination = tmp_path / "protected-backup"
    result = subprocess.run([sys.executable, str(root / "scripts/backup.py"), "--mode", "sqlite", "--output", str(destination)], env=env, cwd=root, capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stderr
    with sqlite3.connect(destination / "database.sqlite3") as restored:
        assert restored.execute("SELECT amount FROM immutable_fixture").fetchone() == ("123.400",)
    assert (destination / "private/original-source").read_bytes() == original
    assert (destination / "installation.env").stat().st_mode & 0o777 == 0o600
    assert destination.stat().st_mode & 0o777 == 0o700
    manifest = json.loads((destination / "manifest.json").read_text())
    for item in manifest["files"]:
        data = (destination / item["path"]).read_bytes()
        assert len(data) == item["bytes"] and hashlib.sha256(data).hexdigest() == item["sha256"]
    assert manifest["retention_performed"] is False
    assert (storage / "original-source").read_bytes() == original


def test_account_bootstrap_and_password_reset_are_audited_and_revoke_sessions(tmp_path):
    root, _storage, env = installation(tmp_path)
    program = r'''
import getpass,runpy,sys
from datetime import timedelta
from pathlib import Path
root=Path.cwd();sys.path.insert(0,str(root/"apps/api"))
passwords=iter(["Synthetic-old-123!","Synthetic-old-123!"])
getpass.getpass=lambda prompt:next(passwords)
sys.argv=["bootstrap.py","--email","admin@example.test","--name","مدیر آزمون","--admin","--company","شرکت آزمون"]
runpy.run_path(str(root/"scripts/bootstrap.py"),run_name="__main__")
from sqlalchemy import select
from didban.db import transaction
from didban.models import InstallationAudit,LoginSession,Membership,User,now
from didban.security import hasher
with transaction() as db:
    user=db.scalar(select(User));user_id=user.id
    db.add(LoginSession(user_id=user.id,token_hash="b"*64,csrf="synthetic",expires_at=now()+timedelta(hours=1)))
    assert db.scalar(select(Membership)).approve_financial_report is False
passwords=iter(["Synthetic-old-123!","Synthetic-new-123!","Synthetic-new-123!"])
sys.argv=["reset_password.py","--actor","admin@example.test","--email","admin@example.test"]
runpy.run_path(str(root/"scripts/reset_password.py"),run_name="__main__")
with transaction() as db:
    assert hasher.verify(db.get(User,user_id).password_hash,"Synthetic-new-123!")
    assert not list(db.scalars(select(LoginSession)))
    actions={event.action for event in db.scalars(select(InstallationAudit))}
    assert actions=={"user.bootstrap_created","user.password_reset"}
'''
    result = subprocess.run([sys.executable, "-c", program], env=env, cwd=root, capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr
