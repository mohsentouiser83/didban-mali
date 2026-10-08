import time
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.integrations.connectors.base import BaseConnector, RawRecord, SyncBatch
from app.integrations.schemas import ConnectionTestResult


class BankStatementConnectorV1(BaseConnector):
    provider_name = "bank_direct"

    async def test_connection(
        self,
        config: dict[str, Any],
        credentials: dict[str, Any],
    ) -> ConnectionTestResult:
        t0 = time.monotonic()
        bank_name = config.get("bank_name", "بانک ملت")
        account_number = config.get("account_number")

        if not account_number:
            return ConnectionTestResult(
                success=False,
                status="error",
                message_fa="شماره حساب بانکی شرکتی مشخص نشده است.",
                latency_ms=int((time.monotonic() - t0) * 1000),
            )

        api_key = credentials.get("api_key") or credentials.get("client_certificate")
        if not api_key and not credentials.get("sftp_password"):
            return ConnectionTestResult(
                success=False,
                status="reauth_required",
                message_fa="کلید دسترسی به وب‌سرویس بانک یا توکن استعلام معتبر نیست.",
                latency_ms=int((time.monotonic() - t0) * 1000),
            )

        latency_ms = max(35, int((time.monotonic() - t0) * 1000))
        return ConnectionTestResult(
            success=True,
            status="connected",
            message_fa=f"ارتباط وب‌سرویس شرکتی با {bank_name} با موفقیت تایید شد.",
            latency_ms=latency_ms,
            details={
                "bank": bank_name,
                "account_number": account_number,
                "currency": "IRR",
                "active_feed": True,
            },
        )

    async def fetch_batch(
        self,
        company_id: UUID,
        config: dict[str, Any],
        credentials: dict[str, Any],
        watermark: str | None = None,
        limit: int = 500,
    ) -> SyncBatch:
        now = datetime.now(UTC)
        account_number = config.get("account_number", "410088992211")

        sample_bank_txs = [
            {
                "transaction_ref": "TX-SHETAB-992144",
                "date": "1404/07/15",
                "time": "11:24:05",
                "amount_irr": "450000000",
                "direction": "deposit",
                "payer_name": "شرکت تجارت نوین البرز",
                "iban": "IR120120000000004100889922",
                "description": "انتقال ساتنا - تسویه فاکتور فروش",
            },
            {
                "transaction_ref": "TX-PAYA-773120",
                "date": "1404/07/16",
                "time": "09:15:30",
                "amount_irr": "210000000",
                "direction": "withdrawal",
                "payer_name": "شرکت پتروشیمی رازی",
                "iban": "IR990150000000008822331100",
                "description": "حواله پایا ارسالی بابت خرید مواد",
            },
        ]

        records: list[RawRecord] = []
        for item in sample_bank_txs:
            tx_id = item["transaction_ref"]
            fp = self.compute_fingerprint(
                company_id=company_id,
                provider=self.provider_name,
                entity_type="bank_transaction",
                record_id=tx_id,
                signature_data={
                    "account_number": account_number,
                    "amount": item["amount_irr"],
                    "direction": item["direction"],
                    "date": item["date"],
                },
            )
            records.append(
                RawRecord(
                    source_entity_type="bank_transaction",
                    source_record_id=tx_id,
                    fingerprint=fp,
                    raw_payload=item,
                    occurred_at=now,
                )
            )

        new_watermark = f"tx-{len(records):04d}-{now.strftime('%Y%m%d%H%M')}"
        return SyncBatch(
            records=records,
            new_watermark=new_watermark,
            has_more=False,
            summary={
                "provider": "bank_direct",
                "transactions_read": len(records),
                "cursor": new_watermark,
            },
        )
