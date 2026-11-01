#!/usr/bin/env python3
"""Report bot deployment prerequisites without network calls or secret output."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps/api"))

from didban.config import settings


def readiness() -> dict:
    providers = {}
    for provider in ("telegram", "bale"):
        token = getattr(settings, f"{provider}_bot_token")
        secret = getattr(settings, f"{provider}_webhook_secret")
        secret_value = secret.get_secret_value() if secret else ""
        providers[provider] = {
            "token_configured": bool(token and re.fullmatch(r"[A-Za-z0-9:_-]{10,256}", token.get_secret_value())),
            "webhook_secret_valid": bool(re.fullmatch(r"[A-Za-z0-9_-]{32,256}", secret_value)),
        }
    origin = urlsplit(settings.web_origin)
    return {
        "bots_enabled": settings.bots_enabled,
        "providers": providers,
        "model_enabled": settings.model_enabled,
        "model_key_configured": bool(settings.openai_api_key and settings.openai_api_key.get_secret_value()),
        "https_web_origin": origin.scheme == "https" and bool(origin.hostname),
        "requires_manual_verification": [
            "public HTTPS API URL and registered provider webhook",
            "proxy/API access logs must redact webhook secret paths",
            "company model budget/tariff readiness and account pairing confirmation",
            "synthetic private-chat delivery test for each provider",
        ],
        "network_checked": False,
    }


def main() -> int:
    result = readiness()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    configured = result["bots_enabled"] and any(
        all(provider.values()) for provider in result["providers"].values()
    )
    return 0 if configured else 2


if __name__ == "__main__":
    raise SystemExit(main())
