"""One bounded launchd health check for the existing private local installation."""

from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import time

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools.restart_local import installation_lock, owned_process, restart_installation  # noqa: E402

PRIVATE = ROOT / ".local/local-runtime"
URLS = (
    "http://127.0.0.1:18149/health/ready",
    "http://127.0.0.1:18148/login",
    "http://127.0.0.1:18148/api/v1/auth/csrf",
)


def event(message: str) -> None:
    # Callers supply fixed events/exception class names, never raw errors or config.
    print(datetime.now(timezone.utc).isoformat(), message, flush=True)


def run(command: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        command, capture_output=True, text=True, timeout=20, check=True
    )


def ensure_dependencies(state: dict) -> None:
    if state.get("mode") != "clean_local" or not state["container"].startswith(
        "didban-local-fresh-"
    ):
        raise ValueError("An existing persistent local installation is required")
    try:
        run(["docker", "info", "--format", "{{.ServerVersion}}"])
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        # Opening the installed app is idempotent; wait for a later check to retry.
        run(["/usr/bin/open", "-gj", "-a", "/Applications/Docker.app"])
        raise RuntimeError("Docker is starting") from None
    for container in (state["container"], "didban-intake-scanner-test"):
        info = json.loads(run(["docker", "inspect", container]).stdout)[0]
        if not info["State"]["Running"]:
            run(["docker", "start", container])
            event("dependency_started " + container)


def missing_process(state: dict) -> bool:
    pids = state.get("pids", [])
    return len(pids) != 3 or any(not owned_process(pid) for pid in pids)


def endpoints_ready() -> bool:
    try:
        with httpx.Client(timeout=3, trust_env=False) as client:
            return all(client.get(url).status_code == 200 for url in URLS)
    except httpx.HTTPError:
        return False


def recovery_due(monitor: dict, process_missing: bool, ready: bool, now: float) -> bool:
    monitor["failed_checks"] = (
        0 if ready and not process_missing else monitor.get("failed_checks", 0) + 1
    )
    failed = process_missing or monitor["failed_checks"] >= 2
    return failed and now - monitor.get("last_attempt", 0) >= 120


def write_monitor(path: Path, monitor: dict) -> None:
    temporary = path.with_suffix(".tmp")
    descriptor = os.open(
        temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600
    )
    with os.fdopen(descriptor, "w") as output:
        os.fchmod(output.fileno(), 0o600)
        json.dump(monitor, output)
    temporary.replace(path)


def check_once() -> None:
    with installation_lock() as acquired:
        if not acquired:
            return
        state = json.loads((PRIVATE / "state.json").read_text())
        path = PRIVATE / "watchdog-state.json"
        monitor = json.loads(path.read_text()) if path.exists() else {}
        try:
            ensure_dependencies(state)
            absent = missing_process(state)
            ready = endpoints_ready()
            if recovery_due(monitor, absent, ready, time.time()):
                monitor["last_attempt"] = time.time()
                # Persist backoff before starting any replacement processes.
                write_monitor(path, monitor)
                event(
                    "recovery_started reason="
                    + ("process_missing" if absent else "health_check_failed")
                )
                restart_installation()
                monitor["failed_checks"] = 0
                monitor["last_recovery"] = datetime.now(timezone.utc).isoformat()
                event("recovery_ready")
            monitor["last_check"] = datetime.now(timezone.utc).isoformat()
            monitor["healthy"] = endpoints_ready() and not missing_process(
                json.loads((PRIVATE / "state.json").read_text())
            )
            if monitor.get("last_error"):
                event("dependencies_recovered")
            monitor.pop("last_error", None)
        except Exception as error:
            category = type(error).__name__
            if monitor.get("last_error") != category:
                event("check_failed type=" + category)
            monitor["last_error"] = category
            monitor["healthy"] = False
        write_monitor(path, monitor)


if __name__ == "__main__":
    check_once()
