import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote


def generate_totp_secret() -> str:
    """Generate a random 20-byte base32 secret key."""
    random_bytes = secrets.token_bytes(20)
    return base64.b32encode(random_bytes).decode("ascii").rstrip("=")


def get_totp_uri(secret: str, email: str, issuer: str = "دیدبان مالی") -> str:
    """Generate an otpauth:// URI for authenticator apps (Google Authenticator, etc.)."""
    encoded_issuer = quote(issuer)
    encoded_email = quote(email)
    return f"otpauth://totp/{encoded_issuer}:{encoded_email}?secret={secret}&issuer={encoded_issuer}&algorithm=SHA1&digits=6&period=30"


def generate_totp_code(
    secret: str,
    timestamp: float | None = None,
    time_step: int = 30,
    digits: int = 6,
) -> str:
    """Calculate RFC 6238 TOTP code for a given timestamp (defaults to current time)."""
    if timestamp is None:
        timestamp = time.time()

    counter = int(timestamp // time_step)
    counter_bytes = struct.pack(">Q", counter)

    # Pad secret if padding was stripped
    padded_secret = secret.upper()
    padding = len(padded_secret) % 8
    if padding:
        padded_secret += "=" * (8 - padding)

    key = base64.b32decode(padded_secret, casefold=True)
    hmac_digest = hmac.new(key, counter_bytes, hashlib.sha1).digest()

    offset = hmac_digest[-1] & 0x0F
    code_int = struct.unpack(">I", hmac_digest[offset : offset + 4])[0] & 0x7FFFFFFF
    code = code_int % (10**digits)
    return str(code).zfill(digits)


def verify_totp_code(
    secret: str,
    code: str,
    time_step: int = 30,
    digits: int = 6,
    window: int = 1,
) -> bool:
    """Verify code against secret with +/- window time step drift allowance."""
    if not secret or not code:
        return False

    code_clean = "".join(filter(str.isdigit, code.strip()))
    if len(code_clean) != digits:
        return False

    now = time.time()
    for offset in range(-window, window + 1):
        target_time = now + (offset * time_step)
        if hmac.compare_digest(
            generate_totp_code(secret, target_time, time_step, digits), code_clean
        ):
            return True
    return False
