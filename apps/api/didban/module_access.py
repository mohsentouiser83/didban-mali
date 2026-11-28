"""Company module and operation assignments for authenticated application routes."""

from typing import Literal

Module = Literal[
    "accounting", "treasury", "commercial", "inventory", "periods", "payroll",
    "reconciliation", "cashflow", "moadian", "documents", "reports", "settings", "assistant",
]
Action = Literal["view", "create", "edit", "delete"]

ROUTER_MODULES: dict[str, Module] = {
    "accounting": "accounting", "accounting_operations": "accounting",
    "accounting_setup": "accounting", "dimensions": "accounting",
    "electronic_ledgers": "accounting", "posting": "accounting",
    "treasury": "treasury", "cheques": "treasury",
    "commercial": "commercial", "commercial_docs": "commercial",
    "native_invoices": "commercial", "collection_assistant": "commercial",
    "inventory": "inventory",
    "closing": "periods", "period_locks": "periods", "periods": "periods",
    "payroll_routes": "payroll", "personnel": "payroll",
    "counterparty_reconciliation": "reconciliation", "group_matches": "reconciliation",
    "manual_groups": "reconciliation", "native_bank_matches": "reconciliation",
    "reconciliation": "reconciliation", "control": "commercial",
    "financial_operations": "cashflow", "native_forecasts": "cashflow", "scenarios": "cashflow",
    "moadian_transmissions": "moadian",
    "bot_extraction": "documents", "bot_intake": "documents", "document_archive": "documents",
    "document_threads": "documents", "processing": "documents", "sources": "documents",
    "native_reporting": "reports", "report_builder": "reports", "report_studio": "reports",
    "reporting": "reports",
    "model_admin": "settings", "numbering": "settings",
    "operations": "assistant",
}

ENDPOINT_MODULES: dict[tuple[str, str], Module] = {
    ("companies", "update_company"): "settings",
    ("operations", "list_invoices"): "commercial",
    ("operations", "list_bank_movements"): "cashflow",
    ("operations", "list_settlements"): "cashflow",
    ("operations", "list_allocations"): "cashflow",
    ("operations", "list_audit_events"): "settings",
    ("native_reporting", "role"): "accounting",
    ("native_reporting", "roles"): "accounting",
    ("native_reporting", "opening"): "periods",
    ("native_reporting", "openings"): "periods",
    ("native_reporting", "zero_opening"): "periods",
    ("native_reporting", "zero_openings"): "periods",
    ("native_reporting", "revoke_zero"): "periods",
    ("operations", "budget"): "settings",
    ("operations", "usage"): "settings",
    ("processing", "import_moadian"): "moadian",
    ("posting", "trial_balance"): "reports",
    ("posting", "save_report"): "reports",
    ("posting", "report_runs"): "reports",
    ("posting", "report_run"): "reports",
    ("posting", "export"): "reports",
}

# POST endpoints that read/preview evidence, change an existing record, or remove it.
POST_ACTIONS: dict[Action, set[tuple[str, str]]] = {
    "view": {
        ("moadian_transmissions", "preview"), ("report_builder", "block_preview"),
        ("report_builder", "ai_compose"), ("report_builder", "export_report"),
        ("report_builder", "interpret"), ("report_builder", "preview"),
        ("report_studio", "interpret_prompt"), ("report_studio", "preview_dashboard"),
        ("operations", "voice_transcription"), ("operations", "assistant"),
    },
    "edit": {
        ("bot_extraction", "review"), ("cheques", "action"),
        ("inventory", "link_item_warehouse"),
        ("commercial", "convert_proforma"), ("commercial_docs", "decide_quarantine"),
        ("counterparty_reconciliation", "decide_run"), ("group_matches", "decide"),
        ("manual_groups", "decide"), ("moadian_transmissions", "retry"),
        ("moadian_transmissions", "inquiry"), ("native_bank_matches", "decide"),
        ("native_forecasts", "answer"), ("numbering", "get_next"),
        ("operations", "budget"), ("payroll_routes", "batch_update_timesheets"),
        ("period_locks", "close"), ("period_locks", "reopen"),
        ("processing", "answer"), ("processing", "retry"), ("reconciliation", "decide"),
        ("report_studio", "set_active_dashboard"), ("report_studio", "set_official_report_as_dashboard"),
    },
    "delete": {
        ("commercial", "cancel_proforma"), ("financial_operations", "allocation_reverse"),
        ("native_invoices", "reverse"), ("native_reporting", "revoke_zero"),
        ("posting", "discard"), ("processing", "cancel"),
        ("report_studio", "reset_active_dashboard"), ("sources", "archive"),
        ("treasury", "reverse_allocation"),
    },
}

# These operations are governed by independent company privileges or personal account ownership.
INDEPENDENT = {
    ("accounting", "permissions"), ("accounting", "grant"),
    ("native_reporting", "approval"), ("operations", "notification_update"), ("operations", "list_notifications"),
    ("periods", "period_options"), ("accounting", "capabilities"),
    ("posting", "post"), ("reporting", "approve"),
}


def endpoint_access(router: str, endpoint: str, method: str) -> tuple[Module, Action] | None:
    key = router, endpoint
    module = ENDPOINT_MODULES.get(key) or ROUTER_MODULES.get(router)
    if module is None or key in INDEPENDENT:
        return None
    if method == "POST":
        for action, endpoints in POST_ACTIONS.items():
            if key in endpoints:
                return module, action
        return module, "create"
    return module, {"PATCH": "edit", "PUT": "edit", "DELETE": "delete"}.get(method, "view")
