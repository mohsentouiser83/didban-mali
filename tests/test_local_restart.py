"""Private configuration loading must not execute code or expand server access."""

import os
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools.restart_local import model_environment  # noqa: E402


class LocalRestartTests(unittest.TestCase):
    def test_missing_model_file_keeps_manual_installation_supported(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(model_environment(Path(directory) / "missing"), {})

    def test_private_values_are_literal_and_do_not_change_parent_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.env"
            marker = Path(directory) / "must-not-exist"
            path.write_text(
                f'DIDBAN_MODEL_API_KEY="$(touch {marker})"\nDIDBAN_MODEL_ID=gpt-6-luna\n'
            )
            path.chmod(0o600)
            before = dict(os.environ)
            values = model_environment(path)
            self.assertEqual(values["DIDBAN_MODEL_API_KEY"], f"$(touch {marker})")
            self.assertFalse(marker.exists())
            self.assertEqual(dict(os.environ), before)

    def test_database_and_unrecognized_keys_cannot_be_injected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.env"
            path.chmod(0o600) if path.exists() else path.touch(mode=0o600)
            for setting in (
                "DIDBAN_APP_DSN=secret",
                "PATH=/untrusted",
                "DIDBAN_MODEL_UNKNOWN=x",
            ):
                path.write_text(setting)
                with self.assertRaises(ValueError):
                    model_environment(path)

    def test_public_file_or_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.env"
            path.write_text("DIDBAN_MODEL_ID=test")
            path.chmod(0o644)
            with self.assertRaises(ValueError):
                model_environment(path)
            path.chmod(0o600)
            link = Path(directory) / "link"
            link.symlink_to(path)
            with self.assertRaises(ValueError):
                model_environment(link)


if __name__ == "__main__":
    unittest.main()
