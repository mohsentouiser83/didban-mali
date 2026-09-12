from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "دیدبان مالی"
    app_env: str = "development"
    api_prefix: str = "/api/v1"
    database_url: str = "postgresql+asyncpg://didban:change-me@localhost:5432/didban_mali"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"
    minio_endpoint: str = "http://localhost:9000"
    minio_bucket: str = "didban-uploads"
    sentry_dsn: str | None = Field(default=None)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
