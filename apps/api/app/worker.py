from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "didban_mali",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.imports.tasks", "app.financial.tasks", "app.analysis.tasks"],
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
)


@celery_app.task(name="system.health_probe")  # type: ignore[untyped-decorator]
def health_probe() -> dict[str, str]:
    return {"status": "ok"}
