#!/usr/bin/env python3
"""Create installation-managed users. Never exposes a public signup endpoint."""
from __future__ import annotations

import argparse
import getpass
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps/api"))

from sqlalchemy import select
from didban.db import initialize, transaction
from didban.models import AuditEvent, Company, InstallationAudit, Membership, User, uid
from didban.security import hasher


def main() -> None:
    parser = argparse.ArgumentParser(description="Create an installation-managed Didban user")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--admin", action="store_true", help="Installation administrator, independent of company role")
    parser.add_argument("--company", help="Create a new company and make this user its owner")
    args = parser.parse_args()
    email, name = args.email.strip().lower(), args.name.strip()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) or not name:
        parser.error("A valid email and nonblank name are required")
    password = getpass.getpass("Password (at least 12 characters): ")
    confirmation = getpass.getpass("Repeat password: ")
    if len(password) < 12 or password != confirmation:
        parser.error("Passwords must match and have at least 12 characters")
    initialize()
    company_id = uid() if args.company else None
    with transaction(company_id) as db:
        if db.scalar(select(User.id).where(User.email == email)):
            parser.error("This email already exists; no changes were made")
        user = User(email=email, name=name, password_hash=hasher.hash(password), installation_admin=args.admin)
        db.add(user)
        db.flush()
        if company_id:
            company = Company(id=company_id, name=args.company.strip())
            if not company.name:
                parser.error("Company name cannot be blank")
            db.add(company)
            db.flush()
            db.add(Membership(company_id=company.id, user_id=user.id, role="owner", approve_financial_report=False))
            db.add(AuditEvent(company_id=company.id, actor_id=user.id, action="bootstrap.company_created", entity_id=company.id, details={"installation_admin": args.admin, "approve_financial_report": False}))
        db.add(InstallationAudit(actor_id=user.id, actor_label="installation_cli:" + getpass.getuser(), action="user.bootstrap_created", entity_id=user.id, details={"installation_admin": args.admin, "company_id": company_id}))
        db.flush()
        user_id = user.id
    print(f"Created user {user_id}")
    if company_id:
        print(f"Created company {company_id}; report approval permission is not granted automatically")


if __name__ == "__main__":
    main()
