import logging
import re
from collections.abc import Mapping
from typing import Any

REDACTED = "[REDACTED]"
SENSITIVE_KEYS = {
    "authorization",
    "cookie",
    "password",
    "secret",
    "token",
    "access_token",
    "refresh_token",
    "csrf_token",
    "payload",
    "raw",
    "raw_json",
    "advisor_note",
}
_BEARER = re.compile(r"(?i)bearer\s+[A-Za-z0-9._~+/=-]+")
_ASSIGNMENT = re.compile(r"(?i)(password|secret|token|authorization|cookie)\s*([=:])\s*([^\s,;]+)")
_DATABASE_URL = re.compile(r"(?i)(postgres(?:ql)?(?:\+\w+)?://[^:\s]+:)([^@\s]+)(@)")


def redact_log_value(value: Any, *, key: str | None = None) -> Any:
    if key is not None and key.casefold() in SENSITIVE_KEYS:
        return REDACTED
    if isinstance(value, Mapping):
        return {
            str(item_key): redact_log_value(item, key=str(item_key))
            for item_key, item in value.items()
        }
    if isinstance(value, tuple):
        return tuple(redact_log_value(item) for item in value)
    if isinstance(value, list):
        return [redact_log_value(item) for item in value]
    if not isinstance(value, str):
        return value
    sanitized = _BEARER.sub(f"Bearer {REDACTED}", value)
    sanitized = _ASSIGNMENT.sub(
        lambda match: f"{match.group(1)}{match.group(2)}{REDACTED}", sanitized
    )
    return _DATABASE_URL.sub(lambda match: f"{match.group(1)}{REDACTED}{match.group(3)}", sanitized)


class SensitiveDataFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = redact_log_value(record.msg)
        if isinstance(record.args, Mapping):
            record.args = redact_log_value(record.args)
        elif isinstance(record.args, tuple):
            record.args = tuple(redact_log_value(item) for item in record.args)
        return True


def install_log_redaction() -> None:
    loggers = [
        logging.getLogger(),
        *(
            logging.getLogger(name)
            for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "celery")
        ),
    ]
    for logger in loggers:
        install_logger_redaction(logger)


def install_logger_redaction(logger: logging.Logger) -> None:
    data_filter = SensitiveDataFilter()
    seen_handlers: set[int] = set()
    for handler in logger.handlers:
        if id(handler) not in seen_handlers:
            handler.addFilter(data_filter)
            seen_handlers.add(id(handler))
