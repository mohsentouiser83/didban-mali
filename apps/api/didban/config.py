from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    @field_validator("telegram_bot_username", "bale_bot_username", mode="before")
    @classmethod
    def empty_bot_username(cls, value: object) -> object:
        return None if value == "" else value

    model_config = SettingsConfigDict(env_prefix="DIDBAN_", env_file=ROOT / ".env", extra="ignore")
    database_url: str = "sqlite:///" + str(ROOT / "var/didban.db")
    storage: Path = ROOT / "var/private"
    web_origin: str = "http://127.0.0.1:3000"
    production: bool = False
    max_file_bytes: int = 20 * 1024 * 1024
    max_unpacked_bytes: int = 100 * 1024 * 1024
    max_rows: int = 20000
    max_files: int = 10
    scanner_host: str | None = None
    scanner_port: int = 3310
    session_hours: int = 12
    fonts: Path = ROOT / "apps/web/public/fonts"
    bots_enabled: bool = False
    telegram_bot_token: SecretStr | None = Field(default=None, repr=False)
    telegram_webhook_secret: SecretStr | None = Field(default=None, repr=False)
    telegram_bot_username: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_]{3,64}$")
    bale_bot_token: SecretStr | None = Field(default=None, repr=False)
    bale_webhook_secret: SecretStr | None = Field(default=None, repr=False)
    bale_bot_username: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_]{3,64}$")
    model_enabled: bool = False
    model_budget_unlimited: bool = False
    model_provider: Literal["AvalAI", "OpenAI"] = "AvalAI"
    openai_api_key: SecretStr | None = Field(default=None, repr=False)
    # Speech is a separate, explicitly enabled provider capability. Its cost is
    # not covered by the structured-text model tariff/reservation ledger.
    media_extraction_enabled: bool = False
    media_max_bytes: int = Field(default=20 * 1024 * 1024, ge=1024, le=20 * 1024 * 1024)
    media_max_pages: int = Field(default=4, ge=1, le=4)
    media_max_pixels: int = Field(default=16_000_000, ge=10000, le=16_000_000)
    voice_enabled: bool = False
    voice_model: str = Field(default="", max_length=100, pattern=r"^[A-Za-z0-9._/-]*$")
    voice_max_bytes: int = Field(default=10 * 1024 * 1024, ge=1024, le=10 * 1024 * 1024)


settings = Settings()
settings.storage.mkdir(parents=True, exist_ok=True, mode=0o700)
