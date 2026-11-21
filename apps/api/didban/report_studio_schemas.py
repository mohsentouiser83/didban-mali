"""Multi-section report studio schemas for dynamic dashboards and widgets."""

from typing import Literal

from pydantic import Field

from .schemas import InputModel

ENTITY_TYPES = Literal[
    "invoices",
    "ledger",
    "parties",
    "cheques",
    "payroll",
    "inventory",
    "dimensions",
]

WIDGET_TYPES = Literal[
    "kpi_card",
    "line_chart",
    "bar_chart",
    "donut_chart",
    "data_table",
    "ai_summary",
]

LAYOUT_TYPES = Literal[
    "grid-1",
    "grid-2",
    "grid-3",
    "grid-4",
    "split-2-1",
    "split-1-2",
]


class StudioGlobalFilters(InputModel):
    period_id: str = Field(min_length=1, max_length=36)
    date_from: str | None = None
    date_to: str | None = None
    basis: Literal["all", "ledger", "invoice", "bank"] = "all"
    dimension_id: str | None = None
    unit: Literal["IRR", "TOMAN"] = "IRR"


class StudioWidgetFilters(InputModel):
    direction: Literal["all", "sales", "purchases"] = "all"
    party_id: str | None = None
    overdue_only: bool = False
    status: str | None = None
    category: str | None = None


class StudioWidgetSpec(InputModel):
    id: str = Field(min_length=1, max_length=50)
    title: str = Field(min_length=1, max_length=120)
    type: WIDGET_TYPES
    entity: ENTITY_TYPES
    metric: str = Field(default="total_amount", max_length=60)
    group_by: Literal["none", "month", "direction", "status", "party", "category"] = "none"
    limit: int = Field(default=8, ge=1, le=50)
    filters: StudioWidgetFilters = Field(default_factory=StudioWidgetFilters)
    unit: Literal["IRR", "TOMAN"] = "IRR"
    color: str | None = Field(default="primary", max_length=30)
    col_span: int = Field(default=3, ge=1, le=12)


class StudioSectionSpec(InputModel):
    id: str = Field(min_length=1, max_length=50)
    title: str = Field(default="", max_length=120)
    description: str | None = Field(default=None, max_length=300)
    layout: LAYOUT_TYPES = "grid-2"
    basis: Literal["all", "ledger", "invoice", "bank", "cheques", "payroll", "inventory"] = "all"
    widgets: list[StudioWidgetSpec] = Field(default_factory=list, max_length=12)


class StudioLayoutSpec(InputModel):
    title: str = Field(default="داشبورد تحلیلی جدید", max_length=120)
    description: str = Field(default="", max_length=500)
    global_filters: StudioGlobalFilters
    sections: list[StudioSectionSpec] = Field(default_factory=list, max_length=25)


class StudioPreviewInput(InputModel):
    spec: StudioLayoutSpec


class StudioInterpretInput(InputModel):
    prompt: str = Field(min_length=1, max_length=1000)
    period_id: str = Field(min_length=1, max_length=36)
    unit: Literal["IRR", "TOMAN"] = "IRR"


class StudioSaveDefinitionInput(InputModel):
    name: str = Field(min_length=1, max_length=120)
    spec: StudioLayoutSpec


class StudioUpdateDefinitionInput(InputModel):
    name: str = Field(min_length=1, max_length=120)
    spec: StudioLayoutSpec
