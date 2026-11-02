"""Unverified document transcription proposals; never accepted financial facts."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DocumentRow(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    date: str | None = Field(max_length=200)
    reference: str | None = Field(max_length=200)
    party_id: str | None = Field(max_length=200)
    account: str | None = Field(max_length=200)
    amount: str | None = Field(max_length=200)
    evidence_refs: list[str] = Field(min_length=1, max_length=4)


class DocumentProposal(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    family: Literal["sales", "purchases", "bank", "unknown"]
    unit: Literal["IRR", "TOMAN", "unknown"]
    calendar: Literal["gregorian", "jalali", "unknown"]
    rows: list[DocumentRow] = Field(max_length=100)
    evidence_refs: list[str] = Field(min_length=1, max_length=4)
    unresolved_fields: list[str] = Field(max_length=30)
