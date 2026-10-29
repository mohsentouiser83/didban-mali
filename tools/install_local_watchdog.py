"""Install a per-user macOS launchd watchdog without storing credentials in its plist."""

from __future__ import annotations

import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
LABEL = "ir.didban-mali.local-watchdog"


def launch_agent(root: Path, path: str) -> dict:
    private = root / ".local/local-runtime"
    return {
        "Label": LABEL,
        "ProgramArguments": [
            str(root / ".venv/bin/python"),
            str(root / "tools/watch_local.py"),
        ],
        "WorkingDirectory": str(root),
        "RunAtLoad": True,
        "StartInterval": 30,
        "ProcessType": "Background",
        "AbandonProcessGroup": True,
        "EnvironmentVariables": {"PATH": path},
        "StandardOutPath": str(private / "watchdog.log"),
        "StandardErrorPath": str(private / "watchdog.log"),
    }


def main() -> None:
    private = ROOT / ".local/local-runtime"
    if not (private / "state.json").is_file():
        raise RuntimeError("An existing local installation is required")
    for executable in ("node", "docker"):
        if not shutil.which(executable):
            raise RuntimeError("Missing required local executable: " + executable)
    agents = Path.home() / "Library/LaunchAgents"
    agents.mkdir(parents=True, exist_ok=True)
    destination = agents / (LABEL + ".plist")
    executable_dirs = [
        str(Path(shutil.which(name)).parent) for name in ("node", "docker")
    ]
    path = os.pathsep.join(
        dict.fromkeys(executable_dirs + ["/usr/bin", "/bin", "/usr/sbin", "/sbin"])
    )
    destination.write_bytes(plistlib.dumps(launch_agent(ROOT, path)))
    destination.chmod(0o600)
    log = private / "watchdog.log"
    descriptor = os.open(
        log, os.O_CREAT | os.O_APPEND | os.O_WRONLY | os.O_NOFOLLOW, 0o600
    )
    os.fchmod(descriptor, 0o600)
    os.close(descriptor)
    domain = "gui/" + str(os.getuid())
    subprocess.run(["launchctl", "bootout", domain + "/" + LABEL], capture_output=True)
    # launchd may briefly retain a job while bootout is completing.
    for attempt in range(10):
        result = subprocess.run(
            ["launchctl", "bootstrap", domain, str(destination)], capture_output=True
        )
        if result.returncode == 0:
            break
        if attempt == 9:
            raise RuntimeError("launchd could not load the local watchdog")
        time.sleep(0.5)
    print("Local watchdog installed: checks every 30 seconds and starts at login.")


if __name__ == "__main__":
    main()
