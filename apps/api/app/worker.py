from celery import Celery
from celery.signals import after_setup_logger, after_setup_task_logger

from app.core.config import settings
from app.core.logging import install_log_redaction, install_logger_redaction

install_log_redaction()


@after_setup_logger.connect  # type: ignore[untyped-decorator]
@after_setup_task_logger.connect  # type: ignore[untyped-decorator]
def configure_worker_log_redaction(logger: object, **_: object) -> None:
    if hasattr(logger, "handlers"):
        install_logger_redaction(logger)  # type: ignore[arg-type]


celery_app = Celery(
    "didban_mali",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "app.imports.tasks",
        "app.financial.tasks",
        "app.analysis.tasks",
        "app.reconciliation.tasks",
        "app.findings.tasks",
        "app.reports.tasks",
    ],
)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Tehran",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=1800,
    task_soft_time_limit=1740,
    task_always_eager=settings.celery_task_always_eager,
    task_eager_propagates=settings.celery_task_always_eager,
)


@celery_app.task(name="system.health_probe")  # type: ignore[untyped-decorator]
def health_probe() -> dict[str, str]:
    return {"status": "ok"}
