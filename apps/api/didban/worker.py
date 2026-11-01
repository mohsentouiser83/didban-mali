"""Database outbox worker; leases recover after process loss without duplicate facts."""

import asyncio
import logging
import threading
from datetime import timedelta, timezone

from sqlalchemy import and_, or_, select

from .db import initialize, transaction
from .errors import DomainError
from .models import Company, Job, ProcessingSession, now
from .workflow import process

log = logging.getLogger("didban.worker")


def run_once() -> int:
    with transaction() as db:
        companies = list(db.scalars(select(Company.id)))
    count = 0
    for company in companies:
        claim = None
        with transaction(company) as db:
            job = db.scalar(
                select(Job)
                .where(
                    Job.company_id == company,
                    or_(and_(Job.state == "pending", or_(Job.leased_until.is_(None), Job.leased_until < now())), and_(Job.state == "running", Job.leased_until < now())),
                )
                .order_by(Job.created_at, Job.id)
                .limit(1)
            )
            if job:
                job.state, job.fence, job.attempts = "running", job.fence + 1, job.attempts + 1
                job.leased_until = now() + timedelta(minutes=2)
                claim = (job.id, job.fence)
        if not claim:
            continue
        try:
            from .model_interpretation import prepare_model_interpretations
            if not asyncio.run(prepare_model_interpretations(company, claim[0], claim[1])):
                continue
            with transaction(company) as db:
                job = db.get(Job, claim[0])
                if not job or job.fence != claim[1] or job.state != "running":
                    continue
                if job.leased_until.replace(tzinfo=timezone.utc) < now():
                    continue
                process(db, job)
                count += 1
        except Exception as error:
            with transaction(company) as db:
                job = db.get(Job, claim[0])
                if not job or job.fence != claim[1]:
                    continue
                session = db.get(ProcessingSession, job.session_id)
                if isinstance(error, DomainError):
                    job.state = "failed"
                    session.state, session.error_code, session.error_message = (
                        "failed",
                        error.code,
                        error.message,
                    )
                else:
                    job.state = "pending" if job.attempts < 3 else "failed"
                    session.state = "waiting_dependency" if job.attempts < 3 else "failed"
                    session.error_code, session.error_message = (
                        "processing_failed",
                        "پردازش تکمیل نشد؛ دوباره تلاش کنید.",
                    )
                    # No cell content or exception text (which may contain financial values) in logs.
                    log.error("Processing failure type=%s job=%s", type(error).__name__, job.id)
    return count


def run(stop: threading.Event | None = None) -> None:
    stop = stop or threading.Event()
    while not stop.is_set():
        try:
            run_once()
        except Exception as error:
            log.error("Worker dependency failure type=%s", type(error).__name__)
        stop.wait(1)


if __name__ == "__main__":
    initialize()
    run()
