"""Exercise monthly statements against the local API, worker, and database."""

import asyncio
import os
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.tenant import set_request_user
from app.financial.models import BankTransaction
from app.imports.models import ImportBatch

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(os.getenv("RUN_INTEGRATION_TESTS") != "1", reason="Requires local stack"),
]


async def test_monthly_statements_share_accounts_and_deleting_files_preserves_the_account():
    async with httpx.AsyncClient(
        base_url=os.getenv("INTEGRATION_API_URL", "http://localhost:8000/api/v1"), timeout=30
    ) as client:
        response = await client.post("/auth/register", json={
            "email": f"bank-accounts-{uuid4().hex}@example.com",
            "full_name": "آزمایش حساب بانکی", "password": "Bank-Accounts-Test-1234",
        })
        assert response.status_code == 201, response.text
        user_id = UUID(response.json()["user"]["id"])

        async def request(method, path, **kwargs):
            result = await client.request(method, path, headers={
                "X-CSRF-Token": client.cookies.get("didban_csrf", ""),
                "Idempotency-Key": uuid4().hex,
            }, **kwargs)
            assert result.is_success, result.text
            return result.json() if result.content else None

        company = await request("POST", "/companies", json={"legal_name": "آزمایش چند حساب بانکی"})
        base = f"/companies/{company['id']}/imports"

        async def upload(month, label, account_id=None):
            data = {"source_kind": "bank", "source_label": label}
            if account_id:
                data["bank_account_id"] = account_id
            batch = await request("POST", base + "/uploads", data=data, files={
                "file": (f"{month}.csv", (
                    "booking_date,description,amount_signed,iban\n"
                    f"2026-{month}-01,monthly payment {month},1000,IR820540102680020817909002\n"
                ).encode(), "text/csv"),
            })
            path = base + "/" + batch["id"]

            async def wait_for(field, values):
                for _ in range(150):
                    result = await request("GET", path)
                    assert result["status"] != "failed", result
                    if result[field] in values:
                        return result
                    await asyncio.sleep(0.2)
                pytest.fail("Statement processing timed out")

            await wait_for("scan_status", {"clean"})
            await request("PUT", path + "/mapping", json={
                "mapping": {field: field for field in ("booking_date", "description", "amount_signed", "iban")},
                "transforms": {
                    "booking_date": ["normalize_digits", "parse_date"],
                    "amount_signed": ["normalize_digits", "strip_thousands"],
                },
                "currency_unit": "rial", "calendar": "gregorian", "header_row": 1,
            })
            validation = await request("POST", path + "/validate")
            assert validation["batch"]["accepted_count"] == 1, validation
            await request("POST", path + "/commit")
            await wait_for("status", {"completed", "completed_limited"})
            return batch["id"]

        first = await upload("08", "ملت جاری")
        accounts = await request("GET", base + "/bank-accounts")
        assert len(accounts) == 1
        account_id = accounts[0]["id"]
        assert accounts[0]["account_last4"] == "9002"
        second = await upload("09", "عنوان نباید حساب را عوض کند", account_id)
        third = await upload("10", "سامان جاری")
        assert len(await request("GET", base + "/bank-accounts")) == 2

        engine = create_async_engine(settings.database_url)
        try:
            async with async_sessionmaker(engine)() as session:
                await set_request_user(session, user_id)
                sources = (await session.scalars(select(ImportBatch.source_id).where(
                    ImportBatch.id.in_([UUID(first), UUID(second)]),
                ))).all()
                assert len(sources) == 2 and sources[0] == sources[1]
                count = await session.scalar(select(func.count()).select_from(BankTransaction).where(
                    BankTransaction.bank_account_id == UUID(account_id),
                ))
                assert count == 2
                await session.rollback()
        finally:
            await engine.dispose()

        # Even an accessible second company must not accept the first company's account.
        other = await request("POST", "/companies", json={"legal_name": "شرکت دوم آزمایشی"})
        result = await client.post(f"/companies/{other['id']}/imports/uploads", headers={
            "X-CSRF-Token": client.cookies.get("didban_csrf", ""), "Idempotency-Key": uuid4().hex,
        }, data={"source_kind": "bank", "source_label": "ملت", "bank_account_id": account_id},
            files={"file": ("other.csv", b"booking_date,description,amount_signed\n2026-10-01,test,1000", "text/csv")})
        assert result.status_code == 404, result.text

        await request("DELETE", base + "/" + first)
        await request("DELETE", base + "/" + second)
        assert account_id in {account["id"] for account in await request("GET", base + "/bank-accounts")}
        await upload("11", "ملت", account_id)
        assert len(await request("GET", base + "/bank-accounts")) == 2
        await request("DELETE", base + "/" + third)
