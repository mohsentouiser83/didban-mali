"""Restart the existing persistent local installation; never create or seed a DB."""

from __future__ import annotations

from contextlib import contextmanager
import fcntl
import json
import os
from pathlib import Path
import secrets
import signal
import subprocess
import sys
import time

import httpx
import psycopg
from psycopg import sql

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
from didban.manage import migrate  # noqa: E402

MODEL_KEYS = frozenset(
    "PROVIDER API_KEY ID ALLOWED_IDS INPUT_USD_PER_MILLION OUTPUT_USD_PER_MILLION MAX_OUTPUT_TOKENS TIMEOUT_SECONDS REASONING_EFFORT INTAKE_ENABLED".split()
)


def model_environment(path: Path) -> dict[str, str]:
    """Read literal private settings; never execute a shell or inherit DB overrides."""
    if not path.exists():
        return {}
    if path.is_symlink() or path.stat().st_mode & 0o077:
        raise ValueError("Model configuration must be a private regular file (0600)")
    values = {}
    for line in path.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        name, separator, value = line.partition("=")
        if (
            not separator
            or name.removeprefix("DIDBAN_MODEL_") not in MODEL_KEYS
            or not name.startswith("DIDBAN_MODEL_")
        ):
            raise ValueError("Model configuration contains an unsupported setting")
        values[name] = value.strip().strip("\"'")
    return values


def owned_process(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    command = subprocess.run(
        ["ps", "-p", str(pid), "-o", "command="],
        capture_output=True,
        text=True,
        check=False,
    ).stdout
    if not command.strip():
        return False
    if not any(
        marker in command
        for marker in (
            "-m uvicorn didban.main:create_app",
            "-m didban.worker",
            "npm run start",
            str(ROOT / "tools/start-web.mjs"),
        )
    ):
        raise ValueError(
            "Recorded process no longer belongs to this local installation"
        )
    proc_cwd = Path(f"/proc/{pid}/cwd")
    if proc_cwd.exists():
        cwd = proc_cwd.resolve()
    else:
        result = subprocess.run(
            ["lsof", "-a", "-p", str(pid), "-d", "cwd", "-Fn"],
            capture_output=True,
            text=True,
            check=False,
        )
        cwd = next(
            (
                Path(line[1:])
                for line in result.stdout.splitlines()
                if line.startswith("n")
            ),
            None,
        )
    try:
        group = os.getpgid(pid)
    except ProcessLookupError:
        return False
    if cwd != ROOT or group != pid:
        raise ValueError("Recorded process is outside this local installation")
    return True


@contextmanager
def installation_lock():
    """Serialize manual restarts and the launchd watchdog without PID-file races."""
    path = ROOT / ".local/local-runtime/restart.lock"
    descriptor = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "w") as lock:
        os.fchmod(lock.fileno(), 0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            yield False
            return
        try:
            yield True
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def restart_installation() -> None:
    private = ROOT / ".local/local-runtime"
    statefile = private / "state.json"
    state = json.loads(statefile.read_text())
    if state.get("mode") != "clean_local" or not state["container"].startswith(
        "didban-local-fresh-"
    ):
        raise ValueError("An existing persistent local installation is required")
    model = model_environment(ROOT / ".env.model")
    pids = [pid for pid in state["pids"] if owned_process(pid)]
    info = json.loads(
        subprocess.check_output(["docker", "inspect", state["container"]], text=True)
    )[0]
    if not info["State"]["Running"]:
        subprocess.run(
            ["docker", "start", state["container"]], check=True, capture_output=True
        )
        info = json.loads(
            subprocess.check_output(
                ["docker", "inspect", state["container"]], text=True
            )
        )[0]
    container_env = dict(
        item.split("=", 1) for item in info["Config"]["Env"] if "=" in item
    )
    admin = psycopg.conninfo.make_conninfo(
        host="127.0.0.1",
        port=info["NetworkSettings"]["Ports"]["5432/tcp"][0]["HostPort"],
        dbname="postgres",
        user="postgres",
        password=container_env["POSTGRES_PASSWORD"],
        connect_timeout=2,
    )
    for attempt in range(30):
        try:
            with psycopg.connect(admin):
                break
        except psycopg.OperationalError:
            if attempt == 29:
                raise RuntimeError("Local database is unavailable") from None
            time.sleep(0.2)
    migrate(admin)
    for pid in pids:
        try:
            os.killpg(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    # Wait for the old listeners before replacing credentials or binding ports.
    deadline = time.monotonic() + 15
    while any(owned_process(pid) for pid in pids):
        if time.monotonic() >= deadline:
            raise RuntimeError("Local services did not stop gracefully")
        time.sleep(0.2)
    scanner = subprocess.run(
        ["docker", "port", "didban-intake-scanner-test", "3310"],
        capture_output=True,
        text=True,
    )
    base = {
        "PATH": os.environ["PATH"],
        "PYTHONPATH": str(ROOT / "apps/api"),
        "DIDBAN_STORAGE_ROOT": str(private / "objects"),
        "DIDBAN_SCANNER_PORT": scanner.stdout.strip().rsplit(":", 1)[-1]
        if scanner.returncode == 0
        else "3310",
    } | model
    for login, boundary in [
        ("ui_app", "APP"),
        ("ui_identity", "IDENTITY"),
        ("ui_worker", "WORKER"),
    ]:
        password = secrets.token_urlsafe(36)
        with psycopg.connect(admin) as conn:
            conn.execute(
                sql.SQL("ALTER ROLE {} PASSWORD {}").format(
                    sql.Identifier(login), sql.Literal(password)
                )
            )
        base["DIDBAN_" + boundary + "_DSN"] = psycopg.conninfo.make_conninfo(
            admin, user=login, password=password
        )
    api_env = {
        key: value for key, value in base.items() if key != "DIDBAN_WORKER_DSN"
    } | {
        "DIDBAN_SECRET": (private / "application-secret").read_text().strip(),
        "DIDBAN_PUBLIC_ORIGIN": "http://127.0.0.1:18148",
        "DIDBAN_COOKIE_SECURE": "false",
    }
    worker_env = {
        key: value
        for key, value in base.items()
        if key not in {"DIDBAN_APP_DSN", "DIDBAN_IDENTITY_DSN"}
    }
    python = str(ROOT / ".venv/bin/python")
    services = [
        (
            "api",
            [
                python,
                "-m",
                "uvicorn",
                "didban.main:create_app",
                "--factory",
                "--host",
                "127.0.0.1",
                "--port",
                "18149",
                "--no-access-log",
                "--no-proxy-headers",
            ],
            api_env,
        ),
        ("worker", [python, "-m", "didban.worker"], worker_env),
        (
            "web",
            ["node", str(ROOT / "tools/start-web.mjs")],
            {
                "PATH": os.environ["PATH"],
                "DIDBAN_API_ORIGIN": "http://127.0.0.1:18149",
                "NEXT_TELEMETRY_DISABLED": "1",
            },
        ),
    ]
    state["pids"] = []
    children = []
    for name, args, environment in services:
        with (private / (name + ".log")).open("a") as log:
            child = subprocess.Popen(
                args,
                cwd=ROOT,
                env=environment,
                stdout=log,
                stderr=log,
                start_new_session=True,
            )
        children.append(child)
        state["pids"].append(child.pid)
        statefile.write_text(json.dumps(state, indent=2) + "\n")
        statefile.chmod(0o600)
    for attempt in range(50):
        if any(child.poll() is not None for child in children):
            raise RuntimeError("A local service exited before readiness")
        try:
            if (
                httpx.get("http://127.0.0.1:18149/health/ready", timeout=2).status_code
                == 200
                and httpx.get("http://127.0.0.1:18148/login", timeout=2).status_code
                == 200
                and httpx.get(
                    "http://127.0.0.1:18148/api/v1/auth/csrf", timeout=2
                ).status_code
                == 200
            ):
                print(
                    "Local installation ready; existing data and configured model settings preserved. No fixtures or model calls created."
                )
                return
        except httpx.HTTPError:
            pass
        time.sleep(0.2)
    raise RuntimeError(
        "Local services did not become ready; inspect private service logs"
    )


def main() -> None:
    with installation_lock() as acquired:
        if not acquired:
            print("Another local restart is already in progress.")
            return
        restart_installation()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(
            "Local restart failed ("
            + type(error).__name__
            + "). Existing database and files were not reset.",
            file=sys.stderr,
        )
        raise SystemExit(1) from None
