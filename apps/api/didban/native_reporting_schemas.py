from datetime import date
from typing import Literal

from pydantic import Field

from .accounting_schemas import StrictInput

NativeRole = Literal[
    "bank",
    "trade_receivable",
    "trade_payable",
    "revenue",
    "expense",
    "other_asset",
    "other_liability",
    "equity",
    "payroll_payable",
    "insurance_payable",
    "payroll_tax_payable",
    "other_payroll_deductions",
]


class NativeRoleInput(StrictInput):
    role: NativeRole | None


class NativeStatementInput(StrictInput):
    period_id: str = Field(min_length=1, max_length=36)
    as_of: date | None = None


class OpeningEvidenceInput(StrictInput):
    journal_id: str = Field(min_length=1, max_length=36)
    digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    reason: str = Field(min_length=1, max_length=1000)


class ZeroOpeningInput(StrictInput):
    period_id: str = Field(min_length=1, max_length=36)
    reason: str = Field(min_length=1, max_length=1000)


class RevokeOpeningInput(StrictInput):
    reason: str = Field(min_length=1, max_length=1000)


class StatementApprovalInput(StrictInput):
    digest: str = Field(pattern=r"^[a-f0-9]{64}$")
