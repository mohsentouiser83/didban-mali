"""Stable company module catalogue; absent configuration preserves existing areas."""

from __future__ import annotations

MODULES = (
    "accounting",
    "cash",
    "balances",
    "invoices",
    "settlements",
    "moadian",
    "forecast",
    "payroll",
)
DEFAULT_MODULES = {name: name != "payroll" for name in MODULES}
