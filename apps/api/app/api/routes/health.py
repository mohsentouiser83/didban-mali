from typing import Literal

from fastapi import APIRouter, Response, status
from pydantic import BaseModel
from redis.asyncio import Redis
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine

router = APIRouter(prefix="/health", tags=["health"])


class LiveResponse(BaseModel):
    status: Literal["ok"]
    service: str


class DependencyStatus(BaseModel):
    status: Literal["ready", "not_ready"]
    database: bool
    redis: bool


@router.get("/live", response_model=LiveResponse)
async def live() -> LiveResponse:
    return LiveResponse(status="ok", service=settings.app_name)


@router.get("/ready", response_model=DependencyStatus)
async def ready(response: Response) -> DependencyStatus:
    database_ok = False
    redis_ok = False

    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        database_ok = True
    except Exception:  # Readiness reports failure without leaking connection details.
        database_ok = False

    redis_client = Redis.from_url(settings.redis_url)
    try:
        redis_ok = bool(await redis_client.ping())
    except Exception:  # Readiness reports failure without leaking connection details.
        redis_ok = False
    finally:
        await redis_client.aclose()

    is_ready = database_ok and redis_ok
    if not is_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return DependencyStatus(
        status="ready" if is_ready else "not_ready",
        database=database_ok,
        redis=redis_ok,
    )
