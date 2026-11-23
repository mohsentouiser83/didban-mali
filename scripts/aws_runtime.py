#!/usr/bin/env python3
"""Launch Didban with verified RDS TLS, or prepare its restricted RDS role."""

import os
import sys

import psycopg
from psycopg import sql
from sqlalchemy import URL

APP_ROLE = "didban_app"
DATABASE = "didban_fresh"
ROLE_BOOTSTRAP_LOCK = 2026112301
TLS = {"sslmode": "verify-full", "sslrootcert": "/app/rds-ca.pem"}


def prepare_database(host: str, password: str) -> None:
    with psycopg.connect(
        host=host,
        dbname=DATABASE,
        user="didban_admin",
        password=os.environ["DIDBAN_DB_ADMIN_PASSWORD"],
        **TLS,
    ) as connection:
        connection.execute("SELECT pg_advisory_xact_lock(%s)", (ROLE_BOOTSTRAP_LOCK,))
        role = connection.execute(
            "SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication "
            "FROM pg_roles WHERE rolname = %s",
            (APP_ROLE,),
        ).fetchone()
        if role and any(role):
            raise RuntimeError("The existing didban_app role has elevated privileges")
        if role is None:
            verifier = connection.pgconn.encrypt_password(
                password.encode(), APP_ROLE.encode(), b"scram-sha-256"
            ).decode()
            connection.execute(
                sql.SQL("CREATE ROLE {} LOGIN PASSWORD {}").format(
                    sql.Identifier(APP_ROLE), sql.Literal(verifier)
                )
            )
        connection.execute("REVOKE CREATE ON SCHEMA public FROM PUBLIC")
        connection.execute(
            sql.SQL("GRANT USAGE, CREATE ON SCHEMA public TO {}").format(sql.Identifier(APP_ROLE))
        )
    with psycopg.connect(host=host, dbname=DATABASE, user=APP_ROLE, password=password, **TLS):
        pass


def main(args: list[str]) -> None:
    if not args:
        raise SystemExit("Supply bootstrap-db or a command to run")
    host = os.environ["DIDBAN_DB_HOST"]
    # Keep the secret out of the command line and pass it only to the intended process.
    password = os.environ.pop("DIDBAN_DB_APP_PASSWORD")
    if args == ["bootstrap-db"]:
        try:
            prepare_database(host, password)
        except psycopg.Error as error:
            raise SystemExit(f"RDS preparation failed ({type(error).__name__})") from None
        print("Restricted database role verified")
        return
    os.environ["DIDBAN_DATABASE_URL"] = URL.create(
        "postgresql+psycopg", username=APP_ROLE, password=password,
        host=host, database=DATABASE, query=TLS,
    ).render_as_string(hide_password=False)
    os.execvp(args[0], args)


if __name__ == "__main__":
    main(sys.argv[1:])
