"""Read-only company-file inspection, followed by checkpointed plan persistence."""

from __future__ import annotations
import hashlib
from copy import deepcopy
from ..adapters.source_reader import SourceReader
from ..domain.intake import PreparationFailure
from ..domain.source_understanding import SourceContext, understand
from ..domain.source_profiles import header_key
from ..domain.interpretation import fingerprint
from ..domain.moadian_export import portal_export

MEMORY_POLICY = "structure-memory-v1"


def inspect_file_set(storage, files, current_id, current_tables):
    result = []
    for file in files:
        if file["scan_status"] != "clean" or not file["preparation_summary"]:
            continue
        if str(file["id"]) == current_id:
            tables = current_tables
        else:
            path = storage.path(file["object_key"])
            if hashlib.sha256(path.read_bytes()).hexdigest() != file["sha256"]:
                raise PreparationFailure("source_integrity_mismatch")
            tables = SourceReader().read(
                path, file["format"], file["preparation_settings"]
            )
        result.append(
            SourceContext(
                str(file["id"]),
                file["sha256"],
                tables,
                file["interpretation_settings"].get("overlap") == "keep_excluded",
                file.get("role_decisions"),
            )
        )
    return result


def apply_memory(tables, settings, history):
    candidate = deepcopy(settings)
    for table in tables:
        saved = candidate.setdefault("sheets", {}).setdefault(table.name, {})
        if saved.get("mapping") or saved.get("actor_id"):
            continue
        for row in table.rows[:100]:
            if row.formulas:
                continue
            if portal_export(row.values):
                break
            signature = fingerprint([header_key(value) for value in row.values])
            matches = [
                (item, value)
                for item in history
                for value in item["settings"].get("structure_memory", {}).values()
                if value.get("signature") == signature
            ]
            variants = {fingerprint(value["mapping"]) for _, value in matches}
            if len(variants) != 1:
                continue
            item, value = matches[0]
            # Reuse only structural mapping, never money units, roles or declarations.
            saved.update(
                header_row=row.number,
                mapping=value["mapping"],
                understanding_evidence={
                    "policy": MEMORY_POLICY,
                    "source_run_id": str(item["id"]),
                    "signature": signature,
                },
            )
            break
    return candidate


def remember(tables, settings, analysis):
    result = deepcopy(settings)
    for sheet in analysis.sheets:
        if sheet.skipped or not sheet.rows or any(row.errors for row in sheet.rows):
            continue
        table = next(table for table in tables if table.name == sheet.name)
        header = next(row for row in table.rows if row.number == sheet.header_row)
        result.setdefault("structure_memory", {})[sheet.name] = {
            "policy": MEMORY_POLICY,
            "signature": fingerprint([header_key(value) for value in header.values]),
            "mapping": sheet.mapping,
        }
    return result


def prepare(storage, files, file, tables, history):
    contexts = inspect_file_set(storage, files, str(file["id"]), tables)
    settings = apply_memory(tables, file["interpretation_settings"], history)
    return understand(str(file["id"]), tables, settings, contexts)
