"""Inputs for the first single-item inventory workflow."""

from datetime import date
from typing import Annotated, Literal

from pydantic import Field, StrictInt

from .accounting_schemas import StrictInput


class WarehouseInput(StrictInput):
    code: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=150)


class InventoryItemInput(WarehouseInput):
    inventory_account_id: str = Field(min_length=1, max_length=36)


class InventoryDraftInput(StrictInput):
    kind: Literal["purchase_goods", "sale_goods"]
    item_id: str = Field(min_length=1, max_length=36)
    warehouse_id: str = Field(min_length=1, max_length=36)
    quantity: StrictInt = Field(ge=1, le=1_000_000_000)
    unit_price: Annotated[str, Field(min_length=1, max_length=80)] | StrictInt
    unit: Literal["IRR", "TOMAN"]
    period_id: str = Field(min_length=1, max_length=36)
    date: date
    description: str = Field(min_length=1, max_length=500)
    source_reference: str = Field(min_length=1, max_length=120)
    party_id: str = Field(min_length=1, max_length=100)
    counterparty_account_id: str = Field(min_length=1, max_length=36)
    revenue_account_id: str | None = Field(default=None, min_length=1, max_length=36)
    cost_account_id: str | None = Field(default=None, min_length=1, max_length=36)
