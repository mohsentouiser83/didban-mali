import asyncio
import os
import time
from typing import Any

from fastapi import HTTPException, Request, Response, status
import redis.asyncio as redis

from app.core.config import settings

_client_by_loop: dict[int, redis.Redis] = {}


def get_rate_limit_redis() -> redis.Redis:
    try:
        loop = asyncio.get_running_loop()
        loop_id = id(loop)
    except RuntimeError:
        loop_id = 0

    client = _client_by_loop.get(loop_id)
    if client is None:
        client = redis.from_url(
            settings.redis_url,
            max_connections=20,
            decode_responses=True,
        )
        _client_by_loop[loop_id] = client
    return client


class RateLimiter:
    """Redis-backed fixed-window rate limiter with graceful fallback.

    Args:
        times: Maximum number of allowed requests in the time window.
        seconds: Length of the time window in seconds.
        scope: Identifying scope (e.g. 'auth:login', 'upload', 'reports').
    """

    def __init__(self, times: int, seconds: int, scope: str = "default") -> None:
        self.times = times
        self.seconds = seconds
        self.scope = scope

    async def __call__(self, request: Request, response: Response) -> None:
        if os.getenv("DISABLE_RATE_LIMIT") == "1":
            return

        client_ip = (
            request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
            or (request.client.host if request.client else "unknown")
        )
        key = f"rate_limit:{self.scope}:{client_ip}"

        try:
            r = get_rate_limit_redis()
            current = await r.incr(key)
            if current == 1:
                await r.expire(key, self.seconds)
                ttl = self.seconds
            else:
                ttl = await r.ttl(key)
                if ttl < 0:
                    ttl = self.seconds
                    await r.expire(key, self.seconds)

            remaining = max(0, self.times - current)
            response.headers["X-RateLimit-Limit"] = str(self.times)
            response.headers["X-RateLimit-Remaining"] = str(remaining)
            response.headers["X-RateLimit-Reset"] = str(int(time.time()) + ttl)

            if current > self.times:
                response.headers["Retry-After"] = str(ttl)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"تعداد درخواست‌ها بیش از حد مجاز است. لطفاً پس از {ttl} ثانیه مجدداً تلاش کنید.",
                    headers={"Retry-After": str(ttl)},
                )
        except HTTPException:
            raise
        except Exception:
            # Fail-open if Redis is temporarily unavailable so critical business ops proceed
            pass
