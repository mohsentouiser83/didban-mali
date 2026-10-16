from unittest.mock import AsyncMock

import httpx
from fastapi import Depends, FastAPI

from app.core.rate_limit import RateLimiter

rate_limit_app = FastAPI()


@rate_limit_app.get(
    "/limited", dependencies=[Depends(RateLimiter(times=3, seconds=10, scope="test:rate_limit"))]
)
async def limited_endpoint():
    return {"status": "ok"}


async def test_rate_limiter_enforcement_and_headers(monkeypatch):
    monkeypatch.delenv("DISABLE_RATE_LIMIT", raising=False)
    redis = AsyncMock()
    redis.incr.side_effect = [1, 2, 3, 4]
    redis.ttl.return_value = 10
    monkeypatch.setattr("app.core.rate_limit.get_rate_limit_redis", lambda: redis)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=rate_limit_app), base_url="http://test"
    ) as client:
        # First 3 requests succeed
        res1 = await client.get("/limited")
        assert res1.status_code == 200
        assert "X-RateLimit-Limit" in res1.headers
        assert res1.headers["X-RateLimit-Limit"] == "3"
        assert res1.headers["X-RateLimit-Remaining"] == "2"

        res2 = await client.get("/limited")
        assert res2.status_code == 200
        assert res2.headers["X-RateLimit-Remaining"] == "1"

        res3 = await client.get("/limited")
        assert res3.status_code == 200
        assert res3.headers["X-RateLimit-Remaining"] == "0"

        # 4th request exceeds limit and gets 429
        res4 = await client.get("/limited")
        assert res4.status_code == 429
        assert "Retry-After" in res4.headers
        assert "تعداد درخواست‌ها بیش از حد مجاز است" in res4.json()["detail"]

    redis.expire.assert_awaited_once_with("rate_limit:test:rate_limit:127.0.0.1", 10)
    assert redis.incr.await_count == 4
