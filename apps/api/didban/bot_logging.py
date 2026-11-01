"""Protect the path-authenticated Bale webhook in application access logs."""

import logging


class WebhookAccessFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        # Uvicorn defers URL formatting until logging. Suppress the whole record
        # rather than mutating shared args used by other handlers.
        return "/api/v1/bots/bale/webhook/" not in record.getMessage()


def protect_webhook_access_logs() -> None:
    logger = logging.getLogger("uvicorn.access")
    if not any(isinstance(item, WebhookAccessFilter) for item in logger.filters):
        logger.addFilter(WebhookAccessFilter())
