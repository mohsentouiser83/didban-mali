import pytest

from app.core.config import Settings


def test_production_config_rejects_insecure_defaults():
    # Production with default jwt secret fails
    with pytest.raises(ValueError, match="JWT_SECRET"):
        Settings(
            app_env="production",
            jwt_secret="local-development-secret-change-before-deploy",
            cookie_secure=True,
            database_url="postgresql+asyncpg://user:realpass@localhost:5432/db",
            minio_secret_key="real-minio-secret-12345",
        )

    # Production with cookie_secure False fails
    with pytest.raises(ValueError, match="COOKIE_SECURE"):
        Settings(
            app_env="production",
            jwt_secret="a" * 32,
            cookie_secure=False,
            database_url="postgresql+asyncpg://user:realpass@localhost:5432/db",
            minio_secret_key="real-minio-secret-12345",
        )

    # Production with default database password fails
    with pytest.raises(ValueError, match="DATABASE_URL"):
        Settings(
            app_env="production",
            jwt_secret="a" * 32,
            cookie_secure=True,
            database_url="postgresql+asyncpg://user:change-me-app-password@localhost:5432/db",
            minio_secret_key="real-minio-secret-12345",
        )

    # Production with valid secure settings passes
    secure_settings = Settings(
        app_env="production",
        jwt_secret="super-secure-production-secret-key-32-chars-long",
        cookie_secure=True,
        database_url="postgresql+asyncpg://user:real-production-pw@postgres.internal:5432/db",
        minio_secret_key="real-minio-production-secret-key",
    )
    assert secure_settings.cookie_secure is True
