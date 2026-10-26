from __future__ import annotations
from dataclasses import dataclass, field
import os
from pathlib import Path
from urllib.parse import urlparse
from psycopg.conninfo import make_conninfo

ROOT = Path(__file__).resolve().parents[3]


@dataclass(frozen=True)
class Settings:
    app_dsn: str = field(repr=False)
    identity_dsn: str = field(repr=False)
    secret: str = field(repr=False)
    public_origin: str = "https://localhost"
    cookie_secure: bool = True
    session_seconds: int = 28800
    login_attempts: int = 10
    rate_window_seconds: int = 900
    max_json_bytes: int = 65536
    pool_size: int = 5
    storage_root: Path = ROOT / ".local/private-files"
    max_file_bytes: int = 20971520
    max_expanded_bytes: int = 67108864
    auto_interpretation: bool = True
    auto_financial: bool = True
    auto_analysis: bool = True
    max_rows: int = 20000
    scanner_host: str = "127.0.0.1"
    scanner_port: int = 3310
    worker_dsn: str = field(default="", repr=False)

    def __post_init__(self) -> None:
        origin = urlparse(self.public_origin)
        if len(self.secret.encode()) < 32:
            raise ValueError("DIDBAN_SECRET must contain at least 32 bytes")
        if not self.app_dsn or not self.identity_dsn:
            raise ValueError("Separate application and identity DSNs are required")
        if origin.scheme not in ("https", "http") or not origin.netloc or origin.path:
            raise ValueError("DIDBAN_PUBLIC_ORIGIN must be an origin without a path")
        if not self.cookie_secure and origin.hostname not in (
            "localhost",
            "127.0.0.1",
            "::1",
            "testserver",
        ):
            raise ValueError("Insecure cookies are restricted to local development")

    @classmethod
    def from_env(cls) -> Settings:
        def dsn(boundary: str) -> str:
            explicit = os.environ.get(f"DIDBAN_{boundary}_DSN")
            if explicit:
                return explicit
            password = os.environ.get(f"DIDBAN_{boundary}_DB_PASSWORD")
            if not password:
                return ""
            return make_conninfo(
                host=os.environ.get("DIDBAN_DB_HOST", "postgres"),
                port=os.environ.get("DIDBAN_DB_PORT", "5432"),
                dbname=os.environ.get("DIDBAN_DB_NAME", "didban"),
                user=os.environ.get(
                    f"DIDBAN_{boundary}_DB_USER",
                    {
                        "APP": "didban_runtime_login",
                        "IDENTITY": "didban_identity_login",
                        "WORKER": "didban_worker_login",
                    }[boundary],
                ),
                password=password,
            )

        return cls(
            storage_root=Path(
                os.environ.get(
                    "DIDBAN_STORAGE_ROOT", str(ROOT / ".local/private-files")
                )
            ),
            scanner_host=os.environ.get("DIDBAN_SCANNER_HOST", "127.0.0.1"),
            scanner_port=int(os.environ.get("DIDBAN_SCANNER_PORT", "3310")),
            worker_dsn=dsn("WORKER"),
            app_dsn=dsn("APP"),
            identity_dsn=dsn("IDENTITY"),
            secret=os.environ.get("DIDBAN_SECRET", ""),
            public_origin=os.environ.get("DIDBAN_PUBLIC_ORIGIN", "https://localhost"),
            cookie_secure=os.environ.get("DIDBAN_COOKIE_SECURE", "true").lower()
            == "true",
        )
