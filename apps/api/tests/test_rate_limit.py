from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.core.rate_limit import RateLimiter

test_app = FastAPI()

@test_app.get("/limited", dependencies=[Depends(RateLimiter(times=3, seconds=10, scope="test:rate_limit"))])
async def limited_endpoint():
    return {"status": "ok"}

def test_rate_limiter_enforcement_and_headers():
    client = TestClient(test_app)
    
    # First 3 requests succeed
    res1 = client.get("/limited")
    assert res1.status_code == 200
    assert "X-RateLimit-Limit" in res1.headers
    assert res1.headers["X-RateLimit-Limit"] == "3"
    assert res1.headers["X-RateLimit-Remaining"] == "2"

    res2 = client.get("/limited")
    assert res2.status_code == 200
    assert res2.headers["X-RateLimit-Remaining"] == "1"

    res3 = client.get("/limited")
    assert res3.status_code == 200
    assert res3.headers["X-RateLimit-Remaining"] == "0"

    # 4th request exceeds limit and gets 429
    res4 = client.get("/limited")
    assert res4.status_code == 429
    assert "Retry-After" in res4.headers
    assert "تعداد درخواست‌ها بیش از حد مجاز است" in res4.json()["detail"]
