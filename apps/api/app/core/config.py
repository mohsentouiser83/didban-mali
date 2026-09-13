from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "دیدبان مالی"
    app_env: str = "development"
    api_prefix: str = "/api/v1"
    database_url: str = (
        "postgresql+asyncpg://didban_app:change-me-app-password@localhost:55432/didban_mali"
    )
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"
    minio_endpoint: str = "http://localhost:9000"
    minio_bucket: str = "didban-uploads"
    minio_access_key: str = "didban-local"
    minio_secret_key: str = "change-me-minio-password"
    upload_max_bytes: int = 52_428_800
    import_preview_rows: int = 20
    import_max_rows: int = 250_000
    clamd_host: str = "localhost"
    clamd_port: int = 3310
    clamd_timeout_seconds: int = 90
    sentry_dsn: str | None = Field(default=None)
    jwt_secret: str = "local-development-secret-change-before-deploy"
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    cookie_secure: bool = False
    cors_origins: str = "http://localhost:3000"
    ai_enabled: bool = False
    ai_provider: str = "disabled"
    ai_model: str = "unconfigured"
    ai_data_region: str | None = None
    ai_request_timeout_seconds: int = 15

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
