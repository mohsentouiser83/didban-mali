"""Independent evidence gates for model suggestions. Confidence is never a control."""

from copy import deepcopy
from .interpretation import analyze
from .normalization import text
from .source_profiles import LOOKUP, PROFILES, header_key

POLICY = "model-evidence-v1"
# Reviewed semantic labels, not model-authored assertions or account-code guesses.
HEADER_LABELS = {
    "date": {"تاریخ عملیات", "زمان تراکنش"},
    "amount": {"خالص گردش", "مبلغ گردش"},
    "balance": {"مانده پس از تراکنش", "مانده پس از عملیات"},
    "reference": {"کد رهگیری"},
}
ROLE_LABELS = {
    "bank": {"بانک", "موجودی بانک"},
    "cash": {"صندوق", "موجودی صندوق"},
    "trade_ar": {"حسابهای دریافتنی تجاری", "حساب‌های دریافتنی تجاری"},
    "trade_ap": {"حسابهای پرداختنی تجاری", "حساب‌های پرداختنی تجاری"},
    "revenue": {"درآمد فروش", "درآمد ارائه خدمات"},
    "expense": {"هزینه اجاره", "هزینه اداری", "هزینه حقوق"},
    "cogs": {"بهای تمام شده کالای فروش رفته"},
    "loan_payable": {"تسهیلات پرداختنی", "وام پرداختنی"},
    "tax_payable": {"مالیات پرداختنی"},
    "payroll_payable": {"حقوق پرداختنی"},
    "inventory": {"موجودی کالا"},
    "capital": {"سرمایه"},
    "income_tax_expense": {"هزینه مالیات بر درآمد"},
    "vat_receivable": {"مالیات ارزش افزوده دریافتنی"},
    "vat_payable": {"مالیات ارزش افزوده پرداختنی"},
}


def model_context(tables, settings, question):
    table = next((t for t in tables if t.name == question.sheet), None)
    if table is None:
        return None
    rows = [r for r in table.rows if any(text(v) for v in r.values)]
    preview = analyze([table], settings).previews[0]
    mapping = {m["target_field"]: int(m["source_column"]) for m in preview["mapping"]}
    saved = settings.get("sheets", {}).get(table.name, {})
    unknown = {}
    if "account" in mapping and "account_name" in mapping:
        for row in rows:
            if row.number <= preview["header_row"] or len(row.values) < max(
                mapping["account"], mapping["account_name"]
            ):
                continue
            code = text(row.values[mapping["account"] - 1])
            if code in saved.get("account_roles", {}) or code in saved.get(
                "model_account_roles", {}
            ):
                continue
            if (
                "role" in mapping
                and len(row.values) >= mapping["role"]
                and text(row.values[mapping["role"] - 1])
            ):
                continue
            unknown.setdefault(
                code,
                {
                    "account_code": code,
                    "account_name": text(row.values[mapping["account_name"] - 1]),
                    "source_row": row.number,
                },
            )
    return {
        "question_kind": question.code,
        "sheet_name": table.name,
        "header_candidates": [
            {"row": r.number, "cells": [text(v)[:256] for v in r.values[:200]]}
            for r in rows[:20]
        ],
        "sample_rows": [
            {"row": r.number, "cells": [text(v)[:256] for v in r.values[:200]]}
            for r in rows[1:4]
        ],
        "human_settings": settings.get("sheets", {}).get(table.name, {}),
        "unclassified_accounts": list(unknown.values())[:40],
        "allowed_mapping_fields": {
            kind: {"required": required, "optional": optional + ["currency"]}
            for kind, (required, optional) in PROFILES.items()
        },
    }


def accept_proposal(tables, settings, proposal, request_id):
    """Return candidate settings and complete deterministic analysis, or reject."""
    if not proposal or proposal["ambiguous"]:
        return None
    table = next((t for t in tables if t.name == proposal["sheet_name"]), None)
    if table is None:
        return None
    rows = [r for r in table.rows if any(text(v) for v in r.values)]
    header = next((r for r in rows[:20] if r.number == proposal["header_row"]), None)
    if header is None or header.formulas:
        return None
    mapping = {}
    for item in proposal["mapping"]:
        field, column = item["field"], item["column"]
        if (
            field in mapping
            or column in mapping.values()
            or column > len(header.values)
        ):
            return None
        label = text(header.values[column - 1])
        if item["evidence"] != label:
            return None
        independent = LOOKUP.get(header_key(label)) == field or header_key(label) in {
            header_key(v) for v in HEADER_LABELS.get(field, ())
        }
        if not independent:
            return None
        mapping[field] = column
    kind = proposal["source_kind"]
    required, optional = PROFILES[kind]
    if not set(required) <= mapping.keys() or not mapping.keys() <= set(
        required + optional + ["currency"]
    ):
        return None
    # Debit/credit being balanced cannot by itself identify a sales/purchase direction.
    directions = {
        "sales_invoices": {"فروش", "sales"},
        "purchase_invoices": {"خرید", "purchase", "purchases"},
        "moadian_sales": {"فروش مؤدیان", "moadian sales"},
        "moadian_purchases": {"خرید مؤدیان", "moadian purchases"},
    }
    if kind in directions and header_key(table.name) not in {
        header_key(v) for v in directions[kind]
    }:
        return None
    candidate = deepcopy(settings)
    saved = candidate.setdefault("sheets", {}).setdefault(table.name, {})
    # Human decisions are authoritative; a model may only fill a gap.
    if (
        saved.get("mapping", mapping) != mapping
        or saved.get("source_kind", kind) != kind
    ):
        return None
    saved.update(header_row=header.number, mapping=mapping, source_kind=kind)
    saved["model_proposal"] = {"request_id": str(request_id), "policy": POLICY}
    role_map = dict(saved.get("model_account_roles", {}))
    for item in proposal["account_roles"]:
        code, role = item["account_code"], item["role"]
        if (
            kind != "ledger"
            or "account_name" not in mapping
            or code in role_map
            or code in saved.get("account_roles", {})
        ):
            return None
        relevant = [
            r
            for r in rows
            if r.number > header.number
            and len(r.values) >= mapping["account"]
            and text(r.values[mapping["account"] - 1]) == code
        ]
        if not relevant:
            return None
        for row in relevant:
            if (
                len(row.values) < mapping["account_name"]
                or mapping["account_name"] in row.formulas
            ):
                return None
            label = text(row.values[mapping["account_name"] - 1])
            if label != item["evidence"] or header_key(label) not in {
                header_key(v) for v in ROLE_LABELS.get(role, ())
            }:
                return None
            if (
                "role" in mapping
                and len(row.values) >= mapping["role"]
                and text(row.values[mapping["role"] - 1])
            ):
                return None
        role_map[code] = role
    if role_map:
        saved["model_account_roles"] = role_map
    analysis = analyze([table], candidate)
    if analysis.question is not None:
        # Currency, date/role ambiguity and coverage questions retain the shared barrier.
        return None
    sheet = next((s for s in analysis.sheets if s.name == table.name), None)
    if not sheet or not sheet.rows or any(r.errors for r in sheet.rows):
        return None
    if any(c["outcome"] != "passed" for c in sheet.controls if c["key"] != "coverage"):
        return None
    return candidate, analyze(tables, candidate)
