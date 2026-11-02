"""Separate complete balances from projections over only known dated flows."""

from copy import deepcopy


def projection(snapshot: dict) -> dict:
    limited = snapshot.get("status") == "limited"
    result = {
        "status": snapshot["status"],
        "projection_scope": "known_dated_flows" if limited else "declared_complete_obligations",
    }
    for key in ("closing", "minimum", "first_deficit"):
        result["known_dated_" + key] = snapshot.get("known_dated_" + key, snapshot.get(key))
        result[key] = None if limited else snapshot.get(key)
    return result


def scoped_path(value: dict, limited: bool) -> dict:
    result = deepcopy(value)
    if limited:
        for key in ("closing", "minimum", "first_deficit"):
            result["known_dated_" + key] = result.get("known_dated_" + key, result.get(key))
            result[key] = None
        result["projection_scope"] = "known_dated_flows"
    return result
