"""Seed processing evidence for isolated synthetic tests and capacity checks."""

from collections.abc import Iterable

from sqlalchemy import select

from didban import models as m
from didban.db import transaction
from didban.ingestion import read_file, scan
from didban.source_intake import queue_source_processing, store_source


def seed_processing_fixture(
    company_id: str, period_id: str, email: str, files: Iterable[tuple[str, bytes]]
) -> str:
    with transaction(company_id) as db:
        actor = db.scalar(select(m.User).where(m.User.email == email))
        assert actor is not None
        session = m.ProcessingSession(
            company_id=company_id, period_id=period_id, actor_id=actor.id
        )
        db.add(session)
        db.flush()
        file_ids = [
            store_source(
                db,
                company_id,
                actor,
                session.id,
                name,
                content,
                scan(content),
                read_file(name, content),
            ).id
            for name, content in files
        ]
        queue_source_processing(db, session, actor, file_ids)
        return session.id
