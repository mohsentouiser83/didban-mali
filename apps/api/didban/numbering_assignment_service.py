"""Stable number reservations for reviewable immutable journal snapshots."""

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from . import models as m
from .numbering_models import NumberingAssignment
from .numbering_service import allocate_number


def assign_number(db: Session, company: str, entity_type: str, record_id: str) -> str:
    # Serialize lookup and allocation together, including SQLite installations.
    db.execute(update(m.Company).where(m.Company.id == company).values(name=m.Company.name))
    assignment = db.scalar(
        select(NumberingAssignment).where(
            NumberingAssignment.company_id == company,
            NumberingAssignment.entity_type == entity_type,
            NumberingAssignment.record_id == record_id,
        )
    )
    if assignment:
        return assignment.number
    number = allocate_number(
        db, company, entity_type, NumberingAssignment, "number",
        filters=(NumberingAssignment.entity_type == entity_type,),
    )
    if entity_type == "journal_entry":
        from .posting_models import NativeJournal

        # Older immutable journals predate reservations and expose their sequence.
        while number.isascii() and number.isdigit() and int(number) <= 2_147_483_647 and db.scalar(
            select(NativeJournal.id).where(
                NativeJournal.company_id == company,
                NativeJournal.sequence == int(number),
                NativeJournal.snapshot["number"].as_string().is_(None),
            )
        ):
            number = allocate_number(
                db, company, entity_type, NumberingAssignment, "number",
                filters=(NumberingAssignment.entity_type == entity_type,),
            )
    db.add(NumberingAssignment(company_id=company, entity_type=entity_type, record_id=record_id, number=number))
    db.flush()
    return number
