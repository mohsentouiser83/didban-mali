#!/usr/bin/env python3
"""Reset a managed account after installation-admin authentication; revoke sessions."""
from __future__ import annotations

import argparse
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps/api"))

from argon2.exceptions import VerificationError
from sqlalchemy import delete, select
from didban.db import initialize, transaction
from didban.models import InstallationAudit, LoginSession, User
from didban.security import hasher


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--actor", required=True, help="Active installation administrator email")
    parser.add_argument("--email", required=True, help="Account to reset")
    args = parser.parse_args()
    actor_password = getpass.getpass("Administrator password: ")
    password = getpass.getpass("New account password (at least 12 characters): ")
    confirmation = getpass.getpass("Repeat new password: ")
    if len(password) < 12 or password != confirmation:
        parser.error("Passwords must match and have at least 12 characters")
    initialize()
    with transaction() as db:
        actor = db.scalar(select(User).where(User.email == args.actor.strip().lower(), User.active.is_(True), User.installation_admin.is_(True)))
        try:
            valid = bool(actor and hasher.verify(actor.password_hash, actor_password))
        except VerificationError:
            valid = False
        if not valid:
            parser.error("Installation administrator authentication failed")
        target = db.scalar(select(User).where(User.email == args.email.strip().lower()))
        if not target:
            parser.error("Account not found")
        target.password_hash = hasher.hash(password)
        result = db.execute(delete(LoginSession).where(LoginSession.user_id == target.id))
        db.add(InstallationAudit(actor_id=actor.id, actor_label="installation_cli:" + getpass.getuser(), action="user.password_reset", entity_id=target.id, details={"sessions_revoked": result.rowcount}))
    print("Password reset; all existing account sessions were revoked")


if __name__ == "__main__":
    main()
