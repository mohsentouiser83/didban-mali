"""Exclude identifiable non-trade cash movements from invoice attribution."""

import hashlib
import re

from app.financial.normalization import normalize_text

ACCOUNT_NUMBER = re.compile(r"(?<![\d.])\d{2,4}\.\d{1,4}\.\d{3,12}\.\d{1,4}(?![\d.])")


def identity_fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def account_keys(description: str) -> set[str]:
    compact = re.sub(r"\s+", "", description.upper())
    return {
        identity_fingerprint(number)
        for number in [*ACCOUNT_NUMBER.findall(description), *re.findall(r"IR\d{24}", compact)]
    }


def non_trade_movement(description: str, known_accounts: set[str], direction: str) -> bool:
    text = normalize_text(description)
    if "انتقال" in text and len(account_keys(description) & known_accounts) >= 2:
        return True
    return (
        direction == "sales" and "واریز سود" in text and ("سپرده" in text or "علی الحساب" in text)
    )
