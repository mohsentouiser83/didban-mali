from pydantic import Field

from .accounting_schemas import StrictInput
from .manual_group_schemas import Identifier, ManualGroupDecision


class NativeBankMatchInput(StrictInput):
    bank_manifest_id: Identifier
    native_statement_id: Identifier
    bank_account: str = Field(min_length=1, max_length=100)
    ledger_account: str = Field(min_length=1, max_length=100)
    bank_ids: list[Identifier] = Field(min_length=1, max_length=100)
    ledger_ids: list[Identifier] = Field(min_length=1, max_length=100)


class NativeBankMatchDecision(ManualGroupDecision):
    pass
