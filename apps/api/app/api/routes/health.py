from typing import Literal

from fastapi import APIRouter, Response, status
from pydantic import BaseModel
from redis.asyncio import Redis
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine
from app.imports.storage import get_storage

router = APIRouter(prefix="/health", tags=["health"])


class LiveResponse(BaseModel):
    status: Literal["ok"]
    service: str


class DependencyStatus(BaseModel):
    status: Literal["ready", "not_ready"]
    database: bool
    redis: bool
    storage: bool


@router.get("/live", response_model=LiveResponse)
async def live() -> LiveResponse:
    return LiveResponse(status="ok", service=settings.app_name)


@router.get("/ready", response_model=DependencyStatus)
async def ready(response: Response) -> DependencyStatus:
    database_ok = False
    redis_ok = settings.celery_task_always_eager
    storage_ok = False

    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        database_ok = True
    except Exception:
        database_ok = False

    if not settings.celery_task_always_eager:
        redis_client = Redis.from_url(settings.redis_url)
        try:
            redis_ok = bool(await redis_client.ping())
        except Exception:
            redis_ok = False
        finally:
            await redis_client.aclose()

    try:
        storage = get_storage()
        storage.client.head_bucket(Bucket=settings.minio_bucket)
        storage_ok = True
    except Exception:
        storage_ok = False

    is_ready = database_ok and redis_ok and storage_ok
    if not is_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return DependencyStatus(
        status="ready" if is_ready else "not_ready",
        database=database_ok,
        redis=redis_ok,
        storage=storage_ok,
    )
