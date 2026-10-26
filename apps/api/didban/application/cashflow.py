"""Read-only period report over an immutable post-core snapshot."""

from __future__ import annotations
from datetime import datetime, timedelta, timezone
from uuid import uuid5, NAMESPACE_URL
from ..errors import ApiError, missing
from .auth import response


class CashflowService:
    def __init__(self, intake):
        self.intake = intake

    def execute(
        self, op, actor, company, ids, body, key, expected, request_id, limit, cursor
    ):
        with self.intake.db.transaction(
            identity=False, actor=str(actor["id"]), company=company
        ) as conn:
            self.intake.authorize(conn, actor, company, False)
            row = conn.execute(
                "SELECT s.* FROM app.cashflow_period_snapshots s JOIN app.result_manifests m ON m.company_id=s.company_id AND m.id=s.manifest_id WHERE s.company_id=%s AND s.manifest_id=%s AND m.status='published'",
                (company, ids["manifest_id"]),
            ).fetchone()
            if not row:
                exists = conn.execute(
                    "SELECT id FROM app.result_manifests WHERE company_id=%s AND id=%s AND status='published'",
                    (company, ids["manifest_id"]),
                ).fetchone()
                if not exists:
                    raise missing()
                raise ApiError(
                    503, "cashflow_pending", "گزارش گردش نقد در حال آماده‌سازی است."
                )
            resource = op + ":" + ids["manifest_id"]
            position = self.intake.security.read_cursor(
                cursor, resource, str(actor["id"]), company
            )
            epoch = datetime(2000, 1, 1, tzinfo=timezone.utc)
            offset = int((position[0] - epoch).total_seconds()) + 1 if position else 0
            items = row["payload"][
                "accounts" if op == "listCashAccountBalances" else "days"
            ]
            page = items[offset : offset + limit]
            next_cursor = (
                self.intake.security.cursor(
                    resource,
                    str(actor["id"]),
                    company,
                    {
                        "created_at": epoch + timedelta(seconds=offset + len(page) - 1),
                        "id": uuid5(
                            NAMESPACE_URL, resource + ":" + str(offset + len(page) - 1)
                        ),
                    },
                )
                if offset + limit < len(items)
                else None
            )
            return response(
                {
                    "items": page,
                    "next_cursor": next_cursor,
                    **(
                        {
                            "reason_codes": row["payload"].get("reason_codes", []),
                            "snapshot_created_at": row["created_at"],
                        }
                        if op == "listCashDays"
                        else {}
                    ),
                }
            )
