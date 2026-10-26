from __future__ import annotations
from datetime import datetime

from psycopg import Connection
from psycopg.types.json import Jsonb


class CommandRepository:
    """Transaction-local command receipts; secret-bearing receipts are encrypted."""

    def __init__(self, conn: Connection):
        self.conn = conn

    def lock(self, scope: str, route: str, key: str) -> None:
        self.conn.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
            ("|".join((scope, route, key)),),
        )

    def identity_receipt(self, scope: str, route: str, key: str) -> dict | None:
        return self.conn.execute(
            "SELECT * FROM app.identity_idempotency WHERE scope_key=%s AND route_key=%s AND key=%s AND expires_at>clock_timestamp()",
            (scope, route, key),
        ).fetchone()

    def company_receipt(
        self, company: str, actor: str, route: str, key: str
    ) -> dict | None:
        return self.conn.execute(
            "SELECT * FROM app.idempotency_records WHERE company_id=%s AND actor_id=%s AND route_key=%s AND key=%s AND expires_at>clock_timestamp()",
            (company, actor, route, key),
        ).fetchone()

    def begin_company(
        self,
        company: str,
        actor: str,
        route: str,
        key: str,
        fingerprint: str,
        expiry: datetime,
    ):
        return self.conn.execute(
            """INSERT INTO app.idempotency_records(company_id,actor_id,route_key,key,request_hash,state,expires_at)
          VALUES(%s,%s,%s,%s,%s,'in_progress',%s) ON CONFLICT(company_id,actor_id,route_key,key) DO UPDATE
          SET request_hash=excluded.request_hash,state='in_progress',response_status=NULL,response_body=NULL,expires_at=excluded.expires_at RETURNING id""",
            (company, actor, route, key, fingerprint, expiry),
        ).fetchone()["id"]

    def save_identity(
        self,
        scope: str,
        route: str,
        key: str,
        fingerprint: str,
        encrypted: str,
        expiry: datetime,
    ) -> None:
        self.conn.execute(
            """INSERT INTO app.identity_idempotency(scope_key,route_key,key,request_hash,response_encrypted,expires_at)
          VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT(scope_key,route_key,key) DO UPDATE
          SET request_hash=excluded.request_hash,response_encrypted=excluded.response_encrypted,expires_at=excluded.expires_at""",
            (scope, route, key, fingerprint, encrypted, expiry),
        )

    def complete_company(self, command_id, response: dict) -> None:
        self.conn.execute(
            "SELECT app.complete_idempotent_command(%s,%s,%s)",
            (command_id, response["status"], Jsonb(response)),
        )
