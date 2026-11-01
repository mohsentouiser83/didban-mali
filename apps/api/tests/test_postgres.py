"""Opt-in real PostgreSQL acceptance against an isolated disposable database."""
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]


@pytest.mark.skipif(not os.environ.get("DIDBAN_POSTGRES_TEST_URL"), reason="Requires isolated PostgreSQL validation role")
def test_postgres_rls_integrity_and_concurrent_initialization():
    result = subprocess.run([sys.executable, str(ROOT / "scripts/validate-postgres.py")], cwd=ROOT, env=os.environ, capture_output=True, text=True, timeout=90)
    assert result.returncode == 0, result.stdout + result.stderr
    assert '"status": "passed"' in result.stdout
