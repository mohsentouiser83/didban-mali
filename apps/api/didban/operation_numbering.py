"""Shared number namespaces for service, goods and inventory draft workflows."""

from sqlalchemy.orm import Session

from .numbering_service import allocate_number
from .operation_models import OperationDraft

SALES_KINDS = ("sale_service", "sale_goods")
PURCHASE_KINDS = ("purchase_service", "purchase_goods")
STOCK_KINDS = ("opening_stock", "transfer_goods", "stock_adjustment")


def allocate_reference(db: Session, company: str, kind: str) -> str:
    for candidate_type, kinds in (
        ("sales_invoice", SALES_KINDS),
        ("purchase_invoice", PURCHASE_KINDS),
        ("inventory_movement", STOCK_KINDS),
    ):
        if kind in kinds:
            entity_type = candidate_type
            scope = OperationDraft.kind.in_(kinds)
            break
    else:
        entity_type = "operation"
        scope = OperationDraft.kind.not_in(SALES_KINDS + PURCHASE_KINDS + STOCK_KINDS)
    return allocate_number(
        db, company, entity_type, OperationDraft, "source_reference", filters=(scope,),
    )
