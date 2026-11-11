"""Inputs for an original Type 1 Moadian sales invoice."""

import re
from datetime import datetime
from typing import Literal

from pydantic import AwareDatetime, Field, field_validator

from .accounting_schemas import StrictInput

FISCAL_MEMORY_PATTERN = r"[1-9ADEFGHKMNOPRTWXYZ]{6}"
ECONOMIC_NUMBER_PATTERN = r"(?:[0-9]{11}|[0-9]{14})"


class MoadianInvoiceInput(StrictInput):
    invoice_id: str = Field(min_length=1, max_length=36)
    invoice_version: int = Field(strict=True, ge=1)
    tax_id: str = Field(pattern=rf"^{FISCAL_MEMORY_PATTERN}[0-9A-F]{{15}}[0-9]$")
    issued_at: AwareDatetime
    buyer_type: Literal["natural", "legal"]
    buyer_tax_number: str = Field(pattern=rf"^{ECONOMIC_NUMBER_PATTERN}$")
    item_tax_id: str = Field(pattern=r"^[0-9]{13}$")
    unit_code: str = Field(pattern=r"^[0-9]{1,8}$")
    vat_treatment: Literal["exempt", "zero_rated"]
    vat_evidence: str = Field(min_length=1, max_length=300)

    @field_validator("issued_at", mode="before")
    @classmethod
    def explicit_issue_time(cls, value: object) -> object:
        if isinstance(value, datetime):
            return value
        if not isinstance(value, str) or not re.fullmatch(
            r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(?::[0-9]{2}(?:\.[0-9]{1,3})?)?(?:Z|[+-][0-9]{2}:[0-9]{2})",
            value,
        ):
            raise ValueError("Issue time must be an ISO datetime with offset")
        return value
