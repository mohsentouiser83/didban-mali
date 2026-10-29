"""Exercise recovery with disposable processes/state; never use the real installation."""

from contextlib import contextmanager
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools import watch_local  # noqa: E402
from tools.install_local_watchdog import launch_agent  # noqa: E402
from tools.restart_local import installation_lock  # noqa: E402


class LocalWatchdogTests(unittest.TestCase):
    def test_health_failure_debounced_and_recovery_rate_limited(self):
        monitor = {}
        self.assertFalse(watch_local.recovery_due(monitor, False, False, 1000))
        self.assertTrue(watch_local.recovery_due(monitor, False, False, 1030))
        monitor["last_attempt"] = 1030
        self.assertFalse(watch_local.recovery_due(monitor, True, False, 1060))
        self.assertTrue(watch_local.recovery_due(monitor, True, False, 1150))
        self.assertFalse(watch_local.recovery_due(monitor, False, True, 1180))
        self.assertEqual(monitor["failed_checks"], 0)

    def test_lock_serializes_restart_and_watchdog(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".local/local-runtime").mkdir(parents=True)
            with patch("tools.restart_local.ROOT", root):
                with installation_lock() as acquired:
                    self.assertTrue(acquired)
                    with installation_lock() as second:
                        self.assertFalse(second)
                with installation_lock() as acquired:
                    self.assertTrue(acquired)

    def test_recovery_replaces_exited_disposable_service_and_persists_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            private = Path(directory)
            statefile = private / "state.json"
            statefile.write_text(json.dumps({"pids": []}))
            children = []

            @contextmanager
            def lock():
                yield True

            def restart():
                child = subprocess.Popen(
                    [sys.executable, "-c", "import time; time.sleep(30)"]
                )
                children.append(child)
                statefile.write_text(json.dumps({"pids": [child.pid]}))

            def absent(state):
                return not state["pids"] or children[-1].poll() is not None

            try:
                with (
                    patch.object(watch_local, "PRIVATE", private),
                    patch.object(watch_local, "installation_lock", lock),
                    patch.object(watch_local, "ensure_dependencies"),
                    patch.object(watch_local, "missing_process", side_effect=absent),
                    patch.object(
                        watch_local,
                        "endpoints_ready",
                        side_effect=lambda: bool(children)
                        and children[-1].poll() is None,
                    ),
                    patch.object(
                        watch_local, "restart_installation", side_effect=restart
                    ) as recover,
                    patch.object(watch_local, "event") as events,
                ):
                    watch_local.check_once()
                    self.assertEqual(recover.call_count, 1)
                    monitor = json.loads((private / "watchdog-state.json").read_text())
                    self.assertTrue(monitor["healthy"])
                    self.assertIn("last_recovery", monitor)
                    self.assertEqual(
                        (private / "watchdog-state.json").stat().st_mode & 0o777, 0o600
                    )
                    watch_local.check_once()
                    self.assertEqual(recover.call_count, 1)
                    children[-1].terminate()
                    children[-1].wait(timeout=5)
                    monitor["last_attempt"] = 0
                    (private / "watchdog-state.json").write_text(json.dumps(monitor))
                    watch_local.check_once()
                    self.assertEqual(recover.call_count, 2)
                    events.assert_any_call("recovery_ready")
            finally:
                for child in children:
                    if child.poll() is None:
                        child.terminate()
                    child.wait(timeout=5)

    def test_failures_never_log_secret_error_text(self):
        with tempfile.TemporaryDirectory() as directory:
            private = Path(directory)
            (private / "state.json").write_text("{}")

            @contextmanager
            def lock():
                yield True

            with (
                patch.object(watch_local, "PRIVATE", private),
                patch.object(watch_local, "installation_lock", lock),
                patch.object(
                    watch_local,
                    "ensure_dependencies",
                    side_effect=RuntimeError("secret-dsn"),
                ),
                patch.object(watch_local, "event") as event,
            ):
                watch_local.check_once()
                event.assert_called_once_with("check_failed type=RuntimeError")
                self.assertNotIn(
                    "secret-dsn", (private / "watchdog-state.json").read_text()
                )

    def test_stopped_dependencies_are_started_without_creating_or_resetting_them(self):
        def command(args):
            if args[1] == "inspect":
                return subprocess.CompletedProcess(
                    args, 0, stdout='[{"State":{"Running":false}}]'
                )
            return subprocess.CompletedProcess(args, 0, stdout="")

        with (
            patch.object(watch_local, "run", side_effect=command) as run,
            patch.object(watch_local, "event"),
        ):
            watch_local.ensure_dependencies(
                {"mode": "clean_local", "container": "didban-local-fresh-test"}
            )
            calls = [call.args[0] for call in run.call_args_list]
            self.assertIn(["docker", "start", "didban-local-fresh-test"], calls)
            self.assertIn(["docker", "start", "didban-intake-scanner-test"], calls)
            self.assertFalse(any("rm" in args or "create" in args for args in calls))

    def test_launch_agent_is_periodic_and_contains_no_application_secrets(self):
        agent = launch_agent(Path("/test"), "/usr/bin:/bin")
        self.assertTrue(agent["RunAtLoad"])
        self.assertEqual(agent["StartInterval"], 30)
        self.assertEqual(agent["EnvironmentVariables"], {"PATH": "/usr/bin:/bin"})
        self.assertTrue(agent["AbandonProcessGroup"])


if __name__ == "__main__":
    unittest.main()
