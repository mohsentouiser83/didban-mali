from __future__ import annotations
import argparse
from getpass import getpass
import hashlib
import os
import re
import secrets

import psycopg
from psycopg import sql

from .config import ROOT
from .security import HASHER


def migrate(dsn: str) -> list[str]:
    applied = []
    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute("SELECT pg_advisory_lock(782409214)")
        conn.execute("CREATE SCHEMA IF NOT EXISTS didban_meta")
        conn.execute("""CREATE TABLE IF NOT EXISTS didban_meta.schema_migrations(
          name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())""")
        for path in sorted((ROOT / "database").glob("*.sql")):
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            row = conn.execute(
                "SELECT sha256 FROM didban_meta.schema_migrations WHERE name=%s",
                (path.name,),
            ).fetchone()
            if row:
                if row[0] != digest:
                    raise RuntimeError("Applied migration changed: " + path.name)
                continue
            # DDL and its checksum must commit together, including after a crash.
            script = re.sub(r"(?m)^BEGIN;\s*", "", path.read_text(), count=1)
            script = re.sub(r"(?m)^COMMIT;\s*$", "", script, count=1)
            with conn.transaction():
                conn.execute(script)
                conn.execute(
                    "INSERT INTO didban_meta.schema_migrations(name,sha256) VALUES(%s,%s)",
                    (path.name, digest),
                )
            applied.append(path.name)
    return applied


def provision_login(dsn: str, role: str, name: str, password: str) -> None:
    if role not in ("didban_app", "didban_identity", "didban_worker"):
        raise ValueError("Invalid runtime role")
    if name in ("postgres", "didban_app", "didban_identity", "didban_worker"):
        raise ValueError("Choose a separate login name")
    if len(password) < 16:
        raise ValueError("Database password must be at least 16 characters")
    with psycopg.connect(dsn) as conn:
        conn.execute(
            sql.SQL(
                "CREATE ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT PASSWORD {}"
            ).format(sql.Identifier(name), sql.Literal(password))
        )
        # INHERIT is needed to receive only the chosen boundary's privileges.
        conn.execute(sql.SQL("ALTER ROLE {} INHERIT").format(sql.Identifier(name)))
        conn.execute(
            sql.SQL("GRANT {} TO {}").format(sql.Identifier(role), sql.Identifier(name))
        )
        if role == "didban_worker":
            conn.execute(sql.SQL("GRANT didban_app TO {}").format(sql.Identifier(name)))


def bootstrap(dsn: str, email: str, display_name: str, password: str) -> str:
    if len(password) < 12 or not password.strip():
        raise ValueError("Password must have at least 12 characters")
    with psycopg.connect(dsn) as conn:
        conn.execute("SELECT pg_advisory_xact_lock(782409215)")
        if conn.execute("SELECT 1 FROM app.users LIMIT 1").fetchone():
            raise RuntimeError("Bootstrap is allowed only on an empty installation")
        row = conn.execute(
            """INSERT INTO app.users(email,display_name,password_hash,is_installation_admin,activated_at)
          VALUES(%s,%s,%s,true,clock_timestamp()) RETURNING id""",
            (email.strip().lower(), display_name.strip(), HASHER.hash(password)),
        ).fetchone()
        return str(row[0])


def migration_dsn() -> str:
    explicit = os.environ.get("DIDBAN_MIGRATION_DSN")
    if explicit:
        return explicit
    return psycopg.conninfo.make_conninfo(
        host=os.environ.get("DIDBAN_DB_HOST", "postgres"),
        port=os.environ.get("DIDBAN_DB_PORT", "5432"),
        dbname=os.environ.get("DIDBAN_DB_NAME", "didban"),
        user=os.environ["DIDBAN_DB_ADMIN_USER"],
        password=os.environ["DIDBAN_DB_ADMIN_PASSWORD"],
    )


def ensure_runtime_logins(dsn: str) -> None:
    for boundary, role, default_name in [
        ("APP", "didban_app", "didban_runtime_login"),
        ("IDENTITY", "didban_identity", "didban_identity_login"),
        ("WORKER", "didban_worker", "didban_worker_login"),
    ]:
        name = os.environ.get(f"DIDBAN_{boundary}_DB_USER", default_name)
        with psycopg.connect(dsn) as conn:
            other = "didban_app" if role == "didban_identity" else "didban_identity"
            existing = conn.execute(
                "SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,pg_has_role(rolname,%s,'MEMBER'),rolcanlogin,pg_has_role(rolname,%s,'MEMBER') FROM pg_roles WHERE rolname=%s",
                (role, other, name),
            ).fetchone()
        if existing:
            if any(existing[:4]) or not existing[4] or not existing[5] or existing[6]:
                raise RuntimeError("Existing runtime login has incompatible privileges")
            continue
        provision_login(dsn, role, name, os.environ[f"DIDBAN_{boundary}_DB_PASSWORD"])


def init_env() -> None:
    template = (ROOT / ".env.example").read_text()
    for key in (
        "DIDBAN_DB_ADMIN_PASSWORD",
        "DIDBAN_APP_DB_PASSWORD",
        "DIDBAN_IDENTITY_DB_PASSWORD",
        "DIDBAN_WORKER_DB_PASSWORD",
        "DIDBAN_SECRET",
    ):
        template = template.replace(
            key + "=\n", key + "=" + secrets.token_urlsafe(48) + "\n"
        )
    fd = os.open(ROOT / ".env", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as stream:
        stream.write(template)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Explicit installation commands; never run inside the API process."
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("migrate")
    sub.add_parser("migrate-and-provision")
    sub.add_parser("generate-secrets")
    sub.add_parser("init-env")
    initial = sub.add_parser("bootstrap")
    initial.add_argument("--email", required=True)
    initial.add_argument("--name", required=True)
    provision = sub.add_parser("provision-login")
    provision.add_argument(
        "--role",
        choices=["didban_app", "didban_identity", "didban_worker"],
        required=True,
    )
    provision.add_argument("--name", required=True)
    args = parser.parse_args()
    if args.command == "init-env":
        init_env()
        print("Created private .env; existing files are never overwritten.")
        return
    if args.command == "generate-secrets":
        for key in (
            "DIDBAN_DB_ADMIN_PASSWORD",
            "DIDBAN_APP_DB_PASSWORD",
            "DIDBAN_IDENTITY_DB_PASSWORD",
            "DIDBAN_SECRET",
        ):
            print(key + "=" + secrets.token_urlsafe(48))
        return
    dsn = migration_dsn()
    if args.command == "migrate":
        print({"applied": migrate(dsn)})
    elif args.command == "migrate-and-provision":
        applied = migrate(dsn)
        ensure_runtime_logins(dsn)
        print({"applied": applied, "runtime_logins": "ready"})
    elif args.command == "bootstrap":
        print(
            {
                "user_id": bootstrap(
                    dsn, args.email, args.name, getpass("Initial password: ")
                )
            }
        )
    else:
        provision_login(dsn, args.role, args.name, getpass("Database login password: "))
        print("Runtime login created; store its DSN outside version control.")


if __name__ == "__main__":
    main()
