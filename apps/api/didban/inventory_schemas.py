"""Inputs for the first single-item inventory workflow."""

from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StrictInt

from .accounting_schemas import StrictInput


class InventoryUnitInput(StrictInput):
    name: str = Field(min_length=1, max_length=40)


class InventoryUnitsResponse(BaseModel):
    items: list[str]
    can_create: bool


class WarehouseInput(StrictInput):
    code: str | None = Field(default=None, min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=150)


class ItemWarehouseInput(StrictInput):
    warehouse_id: str = Field(min_length=1, max_length=36)


class ItemWarehousesResponse(BaseModel):
    warehouse_ids: list[str]
    can_link: bool


class UpdateWarehouseInput(StrictInput):
    code: str | None = Field(default=None, min_length=1, max_length=100)
    name: str | None = Field(default=None, min_length=1, max_length=150)
    active: bool | None = None


class InventoryItemInput(WarehouseInput):
    base_unit: str = Field(default="عدد", min_length=1, max_length=40)
    item_kind: Literal["goods", "service"] = "goods"


class UpdateInventoryItemInput(UpdateWarehouseInput):
    base_unit: str | None = Field(default=None, min_length=1, max_length=40)
    item_kind: Literal["goods", "service"] | None = None


class NrvItemPriceInput(StrictInput):
    item_id: str = Field(min_length=1, max_length=36)
    warehouse_id: str | None = Field(default=None, max_length=36)
    estimated_selling_price_irr: Annotated[str, Field(min_length=1, max_length=80)] | StrictInt
    estimated_selling_cost_irr: Annotated[str, Field(max_length=80)] | StrictInt = 0
    prior_write_down_irr: Annotated[str, Field(max_length=80)] | StrictInt = 0


class NrvAssessmentInput(StrictInput):
    as_of: date | None = None
    items: list[NrvItemPriceInput] = Field(default_factory=list, max_length=500)


class NrvAdjustmentDraftInput(StrictInput):
    period_id: str = Field(min_length=1, max_length=36)
    date: date
    as_of: date | None = None
    description: str = Field(min_length=1, max_length=500)
    items: list[NrvItemPriceInput] = Field(min_length=1, max_length=500)
    allowance_account_id: str | None = Field(default=None, min_length=1, max_length=36)
    expense_account_id: str | None = Field(default=None, min_length=1, max_length=36)
    recovery_account_id: str | None = Field(default=None, min_length=1, max_length=36)


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
    source_reference: str | None = Field(default=None, max_length=120)
    party_id: str = Field(default="", max_length=100)
    counterparty_account_id: str | None = Field(default=None, max_length=36)
    revenue_account_id: str | None = Field(default=None, min_length=1, max_length=36)
    cost_account_id: str | None = Field(default=None, min_length=1, max_length=36)
    settlement_type: Literal["on_account", "cash", "mixed"] = "on_account"
    cash_amount: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    cheque_amount: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    on_account_amount: Annotated[str, Field(max_length=80)] | StrictInt | None = None
    cash_account_id: str | None = Field(default=None, max_length=36)
    cheque_account_id: str | None = Field(default=None, max_length=36)
    cheque_number: str | None = Field(default=None, max_length=100)
    cheque_due_date: date | None = None


class InventoryTransferInput(StrictInput):
    item_id: str = Field(min_length=1, max_length=36)
    source_warehouse_id: str = Field(min_length=1, max_length=36)
    destination_warehouse_id: str = Field(min_length=1, max_length=36)
    quantity: StrictInt = Field(ge=1, le=1_000_000_000)
    period_id: str = Field(min_length=1, max_length=36)
    date: date
    description: str = Field(min_length=1, max_length=500)
    source_reference: str | None = Field(default=None, max_length=120)


class StockAdjustmentInput(StrictInput):
    item_id: str = Field(min_length=1, max_length=36)
    warehouse_id: str = Field(min_length=1, max_length=36)
    counted_quantity: StrictInt = Field(ge=0, le=1_000_000_000)
    unit: Literal["IRR", "TOMAN"] = "IRR"
    unit_price: Annotated[str, Field(min_length=1, max_length=80)] | StrictInt | None = None
    period_id: str = Field(min_length=1, max_length=36)
    date: date
    description: str = Field(min_length=1, max_length=500)
    source_reference: str | None = Field(default=None, max_length=120)
    adjustment_account_id: str = Field(min_length=1, max_length=36)


class OpeningStockInput(StrictInput):
    item_id: str = Field(min_length=1, max_length=36)
    warehouse_id: str = Field(min_length=1, max_length=36)
    quantity: StrictInt = Field(ge=1, le=1_000_000_000)
    unit_price: Annotated[str, Field(min_length=1, max_length=80)] | StrictInt
    unit: Literal["IRR", "TOMAN"]
    period_id: str = Field(min_length=1, max_length=36)
    date: date
    description: str = Field(min_length=1, max_length=500)
    source_reference: str | None = Field(default=None, max_length=120)
    equity_account_id: str = Field(min_length=1, max_length=36)


class WarehouseVoucherLine(StrictInput):
    item_id: str = Field(min_length=1, max_length=36)
    quantity: StrictInt = Field(ge=1, le=1_000_000_000)


class WarehouseReceiptLine(WarehouseVoucherLine):
    unit_price_irr: str = Field(pattern=r"^[0-9]{1,32}$")


class WarehouseVoucherInput(StrictInput):
    warehouse_id: str = Field(min_length=1, max_length=36)
    period_id: str = Field(min_length=1, max_length=36)
    date: date
    offset_account_id: str = Field(min_length=1, max_length=36)
    reference: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=500)


class WarehouseReceiptInput(WarehouseVoucherInput):
    items: list[WarehouseReceiptLine] = Field(min_length=1, max_length=100)


class WarehouseIssueInput(WarehouseVoucherInput):
    items: list[WarehouseVoucherLine] = Field(min_length=1, max_length=100)


class WarehouseVoucherRow(BaseModel):
    id: str
    draft_id: str
    source_reference: str
    date: date
    warehouse_name: str
    item_count: int
    reference: str
    description: str
    state: Literal["draft", "discarded", "posted", "reversed"]


class WarehouseVoucherList(BaseModel):
    items: list[WarehouseVoucherRow]
    next_cursor: str | None


class VoucherChoice(BaseModel):
    value: str
    label: str


class VoucherItemChoice(VoucherChoice):
    unit: str


class WarehouseVoucherOptions(BaseModel):
    can_create: bool
    items: list[VoucherItemChoice]
    warehouses: list[VoucherChoice]
    accounts: list[VoucherChoice]
