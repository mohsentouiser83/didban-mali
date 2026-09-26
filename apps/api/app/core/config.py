from functools import lru_cache

from pydantic import Field, model_validator
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
    celery_task_always_eager: bool = False
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
    access_token_minutes: int = 1440
    refresh_token_days: int = 30
    cookie_secure: bool = False
    cors_origins: str = "http://localhost:3000"
    ai_enabled: bool = False
    ai_provider: str = "disabled"
    ai_model: str = "unconfigured"
    ai_data_region: str | None = None
    ai_request_timeout_seconds: int = 15

    @model_validator(mode="after")
    def validate_production_invariants(self) -> "Settings":
        if self.app_env.lower() in ("production", "prod"):
            if (
                "change-me" in self.jwt_secret
                or "local-development" in self.jwt_secret
                or len(self.jwt_secret) < 32
            ):
                raise ValueError(
                    "در محیط Production، مقدار JWT_SECRET باید حداقل ۳۲ کاراکتر باشد و نباید از مقادیر پیش‌فرض استفاده کند."
                )
            if not self.cookie_secure:
                raise ValueError(
                    "در محیط Production، مقدار COOKIE_SECURE باید حتماً True باشد."
                )
            if "change-me" in self.database_url:
                raise ValueError(
                    "در محیط Production، مقدار DATABASE_URL نباید حاوی رمز پیش‌فرض change-me باشد."
                )
            if "change-me" in self.minio_secret_key:
                raise ValueError(
                    "در محیط Production، مقدار MINIO_SECRET_KEY نباید حاوی رمز پیش‌فرض باشد."
                )
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
