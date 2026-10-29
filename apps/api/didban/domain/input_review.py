"""Strict interpretation-only correction validation; source amounts are never mutable."""

from __future__ import annotations
from ..domain.source_profiles import ROLES, PROFILES


def validate_correction(selection: dict, context: dict) -> dict | None:
    if not isinstance(selection, dict):
        return None
    if selection.get("action") == "set_column_mapping":
        sheet = next(
            (
                s
                for s in context.get("sheets", [])
                if s["file_id"] == selection.get("file_id")
                and s["sheet_name"] == selection.get("sheet_name")
            ),
            None,
        )
        if (
            not sheet
            or sheet["source_kind"] not in PROFILES
            or not isinstance(selection.get("mapping"), list)
        ):
            return None
        proposed = selection["mapping"]
        if not proposed or len(proposed) > 64:
            return None
        mapping = {}
        evidence = []
        allowed = set(
            PROFILES[sheet["source_kind"]][0]
            + PROFILES[sheet["source_kind"]][1]
            + ["currency"]
        )
        for item in proposed:
            if not isinstance(item, dict):
                return None
            field = item.get("field")
            column = item.get("column")
            if (
                field not in allowed
                or type(column) is not int
                or column < 1
                or column > len(sheet["columns"])
            ):
                return None
            if (
                field in mapping
                or column in mapping.values()
                or item.get("evidence") != sheet["columns"][column - 1]
            ):
                return None
            mapping[field] = column
            evidence.append(
                {"field": field, "column": column, "evidence": item["evidence"]}
            )
        if not set(PROFILES[sheet["source_kind"]][0]) <= mapping.keys():
            return None
        return {
            "action": "set_column_mapping",
            "file_id": sheet["file_id"],
            "sheet_name": sheet["sheet_name"],
            "source_kind": sheet["source_kind"],
            "header_row": sheet["header_row"],
            "before_mapping": sheet["mapping"],
            "mapping": mapping,
            "evidence": evidence,
            "reason": str(selection.get("reason", "")).strip()[:1000],
        }
    if selection.get("action") != "set_account_role":
        return None
    account = next(
        (
            a
            for a in context.get("accounts", [])
            if a["file_id"] == selection.get("file_id")
            and a["sheet_name"] == selection.get("sheet_name")
            and a["account_code"] == selection.get("account_code")
        ),
        None,
    )
    if not account or selection.get("role") not in ROLES - {
        "unknown",
        "calibration_only",
    }:
        return None
    # The model must identify supplied evidence, never fabricate an account or row.
    if selection.get("evidence") not in (
        account["account_name"],
        account["account_code"],
    ):
        return None
    return {
        "action": "set_account_role",
        "file_id": account["file_id"],
        "sheet_name": account["sheet_name"],
        "account_code": account["account_code"],
        "before_role": account.get("role"),
        "role": selection["role"],
        "evidence": selection["evidence"],
        "reason": str(selection.get("reason", "")).strip()[:1000],
    }
