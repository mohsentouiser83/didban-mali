from __future__ import annotations
from collections.abc import Callable
from datetime import datetime, timedelta, timezone

from psycopg import Connection

from ..errors import conflict
from ..infrastructure.commands import CommandRepository
from ..security import Security, json_value


class Replay:
    def __init__(self, security: Security):
        self.security = security

    def run(
        self,
        conn: Connection,
        *,
        identity: bool,
        scope: str,
        actor: str | None,
        company: str | None,
        route: str,
        key: str,
        payload: dict,
        action: Callable[[], dict],
    ) -> dict:
        repo = CommandRepository(conn)
        repo.lock(scope, route, key)
        fingerprint = self.security.fingerprint(payload)
        if identity:
            row = repo.identity_receipt(scope, route, key)
        else:
            row = repo.company_receipt(company, actor, route, key)
        if row:
            if row["request_hash"] != fingerprint:
                raise conflict("idempotency_payload_conflict")
            return (
                self.security.decrypt(row["response_encrypted"])
                if identity
                else row["response_body"]
            )
        expiry = datetime.now(timezone.utc) + timedelta(hours=24)
        command_id = None
        if not identity:
            command_id = repo.begin_company(
                company, actor, route, key, fingerprint, expiry
            )
        response = json_value(action())
        if identity:
            repo.save_identity(
                scope, route, key, fingerprint, self.security.encrypt(response), expiry
            )
        else:
            repo.complete_company(command_id, response)
        return response
