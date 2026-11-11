"""Server-only taxpayer credentials, scoped to an explicit company."""

import json
import re
from dataclasses import dataclass
from pathlib import Path

from .config import settings
from .moadian_gateway import MoadianCredentials
from .moadian_schemas import ECONOMIC_NUMBER_PATTERN, FISCAL_MEMORY_PATTERN


@dataclass(frozen=True)
class MoadianProfile:
    credentials: MoadianCredentials
    seller_tax_number: str

    @property
    def memory_id(self) -> str:
        return self.credentials.memory_id


def _read_small(path: Path, max_bytes: int) -> bytes:
    with path.open("rb") as file:
        data = file.read(max_bytes + 1)
    if not data or len(data) > max_bytes:
        raise ValueError("Invalid fiscal configuration size")
    return data


def load_profile(company: str) -> MoadianProfile | None:
    path = settings.moadian_profiles_file
    if not path or not path.is_absolute():
        return None
    try:
        profiles = json.loads(_read_small(path, 128_000))
        profile = profiles[company]
        memory_id = profile["memory_id"]
        seller_tax_number = profile["seller_tax_number"]
        if (
            not re.fullmatch(FISCAL_MEMORY_PATTERN, memory_id)
            or not re.fullmatch(ECONOMIC_NUMBER_PATTERN, seller_tax_number)
            or sum(value.get("memory_id") == memory_id for value in profiles.values()) != 1
        ):
            return None
        key = _read_small(path.parent / profile["private_key_file"], 32_000)
        certificate = _read_small(path.parent / profile["certificate_file"], 64_000)
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return None
    return MoadianProfile(MoadianCredentials(memory_id, key, certificate), seller_tax_number)
