"""Rule conditions select allowlisted facts, never expressions or executable code."""

import re
from datetime import date
from typing import Literal

from pydantic import Field, model_validator

from .accounting_schemas import StrictInput
from .money_type import canonical_money


class RuleCondition(StrictInput):
    field: Literal[
        "value",
        "remaining",
        "amount",
        "party_id",
        "reference",
        "direction",
        "overdue",
        "date",
        "due_date",
        "status",
        "account_id",
    ]
    op: Literal["gt", "gte", "lt", "lte", "eq", "contains"]
    value: str = Field(min_length=1, max_length=100)


class DraftTemplate(StrictInput):
    kind: Literal["sale_service", "purchase_service"]
    accounts: dict[str, str] = Field(min_length=2, max_length=2)

    @model_validator(mode="after")
    def explicit_accounts(self):
        roles = (
            {"trade_receivable", "service_revenue"}
            if self.kind == "sale_service"
            else {"service_expense", "trade_payable"}
        )
        if set(self.accounts) != roles or any(
            not value.strip() or len(value) > 36 for value in self.accounts.values()
        ):
            raise ValueError("Select the two explicit company accounts for this operation")
        if len(set(self.accounts.values())) != 2:
            raise ValueError("Debit and credit accounts must differ")
        return self


class RuleDefinition(StrictInput):
    scope: Literal["metric", "invoice", "native_journal"]
    metric_key: str = Field(default="", max_length=80)
    period_id: str = Field(default="", max_length=36)
    conditions: list[RuleCondition] = Field(min_length=1, max_length=10)
    action: Literal["notify", "followup", "draft_request", "prepare_draft"]
    draft_template: DraftTemplate | None = None

    @model_validator(mode="after")
    def valid_conditions(self):
        numeric = {"value", "remaining", "amount"}
        if self.scope == "native_journal":
            if (
                not self.period_id
                or self.metric_key
                or self.action not in ("notify", "followup", "draft_request")
            ):
                raise ValueError("Native rules require an explicit period and an internal action")
        elif self.period_id:
            raise ValueError("Period belongs to native-journal scope")
        if self.scope == "metric" and (not self.metric_key or self.action == "followup"):
            raise ValueError("Metric key required; followup requires an invoice")
        if self.action == "prepare_draft":
            if self.scope != "invoice" or self.draft_template is None:
                raise ValueError("A draft requires invoice scope and an explicit template")
        elif self.draft_template is not None:
            raise ValueError("Draft template is only valid for prepare_draft")
        for condition in self.conditions:
            if self.scope == "metric" and condition.field != "value":
                raise ValueError("Metric condition field must be value")
            if self.scope == "invoice" and condition.field == "value":
                raise ValueError("Invoice condition field cannot be value")
            if self.scope == "invoice" and condition.field == "account_id":
                raise ValueError("An invoice does not declare an accounting account")
            if self.scope == "native_journal" and condition.field not in (
                "amount",
                "party_id",
                "reference",
                "date",
                "status",
                "account_id",
            ):
                raise ValueError("Field is unavailable on a native journal line")
            if condition.field in numeric:
                if condition.op == "contains":
                    raise ValueError("Numeric contains is unsupported")
                if not re.fullmatch(r"[+-]?\d+(?:\.\d+)?", condition.value):
                    raise ValueError("Enter a plain decimal amount")
                canonical_money(condition.value)
            elif condition.field in ("date", "due_date"):
                if condition.op == "contains":
                    raise ValueError("Dates require a calendar comparison")
                date.fromisoformat(condition.value)
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", condition.value):
                    raise ValueError("Use an explicit ISO date")
            elif condition.field == "account_id" and (condition.op != "eq" or len(condition.value) > 36):
                raise ValueError("Accounts require an exact company account ID")
            elif condition.field == "status" and (
                condition.op != "eq"
                or condition.value
                not in (
                    ("posted", "reversed", "reversal")
                    if self.scope == "native_journal"
                    else ("available", "limited", "unavailable")
                )
            ):
                raise ValueError("Select a known status for the chosen source")
            elif condition.op not in ("eq", "contains"):
                raise ValueError("Text fields require eq or contains")
        return self


class RuleInput(StrictInput):
    name: str = Field(min_length=1, max_length=120)
    enabled: bool = False
    definition: RuleDefinition
    preview_id: str | None = Field(default=None, max_length=36)


class RulePreview(StrictInput):
    manifest_id: str = Field(min_length=1, max_length=36)
    definition: RuleDefinition


class NativeRulePreview(StrictInput):
    definition: RuleDefinition


class PatternInput(StrictInput):
    interpretation_id: str = Field(min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=120)


class PatternUpdate(StrictInput):
    enabled: bool
    name: str = Field(min_length=1, max_length=120)
