"""Container API must leave job processing to its separate worker."""
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]


@pytest.mark.parametrize(
    ("production", "embedded", "expected"),
    [(False, True, 1), (False, False, 0), (True, True, 0)],
)
def test_worker_startup_mode(tmp_path, production, embedded, expected):
    source = f'''
import asyncio
from unittest.mock import Mock, patch
from didban.api import app, lifespan
from didban.config import settings

settings.production = {production!r}
settings.embedded_worker = {embedded!r}

async def check():
    thread = Mock()
    with patch("didban.api.initialize"), patch("didban.api.threading.Thread", return_value=thread) as factory:
        async with lifespan(app):
            assert factory.call_count == {expected}
            assert thread.start.call_count == {expected}
            if {expected}:
                stop = factory.call_args.kwargs["args"][0]
                assert not stop.is_set()
        if {expected}:
            assert stop.is_set()

asyncio.run(check())
'''
    env = os.environ | {
        "PYTHONPATH": str(ROOT / "apps/api"),
        "DIDBAN_DATABASE_URL": f"sqlite:///{tmp_path / 'runtime.db'}",
        "DIDBAN_STORAGE": str(tmp_path / "private"),
        "DIDBAN_PRODUCTION": "false",
    }
    result = subprocess.run(
        [sys.executable, "-c", source], env=env, cwd=ROOT,
        capture_output=True, text=True, timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr
