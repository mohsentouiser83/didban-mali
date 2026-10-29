"""Bounded internal deadline observation; no user automation or monetary changes."""

import time
from .preparation_worker import PreparationWorker


class ActionableMaintenanceWorker(PreparationWorker):
    def __init__(self, settings):
        super().__init__(settings)
        self.next_check = 0.0

    def run_once(self):
        if time.monotonic() < self.next_check:
            return False
        self.next_check = time.monotonic() + 60
        with self.connection() as conn:
            with conn.transaction():
                sent = conn.execute(
                    "SELECT app.maintain_actionable_due() AS sent"
                ).fetchone()["sent"]
        return bool(sent)
