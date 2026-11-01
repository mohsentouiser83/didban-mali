import logging

from didban.bot_logging import protect_webhook_access_logs


def test_uvicorn_secret_path_is_suppressed_but_normal_requests_remain(caplog):
    protect_webhook_access_logs()
    protect_webhook_access_logs()
    logger = logging.getLogger("uvicorn.access")
    secret = "synthetic-webhook-secret-must-not-appear"
    with caplog.at_level(logging.INFO, logger="uvicorn.access"):
        logger.info('%s - "%s %s HTTP/%s" %d', "127.0.0.1:123", "POST",
                    "/api/v1/bots/bale/webhook/" + secret, "1.1", 200)
        logger.info('%s - "%s %s HTTP/%s" %d', "127.0.0.1:123", "GET",
                    "/api/v1/health", "1.1", 200)
    assert secret not in caplog.text
    assert "/api/v1/health" in caplog.text
