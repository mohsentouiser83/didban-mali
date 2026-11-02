"""Company-local correction memory; reuse never bypasses normal row controls."""

import json
from hashlib import sha256

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .automation_models import LearningPattern
from .errors import require
from .ingestion import REQUIRED, Sheet
from .security import membership
from .services import check_version, get_entity
from .workflow import audit, serialize_fact


def fingerprint(sheet: str, headers: list[str]) -> str:
    return sha256(json.dumps([sheet, headers], ensure_ascii=False).encode()).hexdigest()


def _payload(item: m.Interpretation) -> dict:
    return {
        "family": item.family,
        "mapping": item.mapping,
        "unit": item.unit,
        "calendar": item.calendar,
        "sheet": item.sheet,
        "headers": item.evidence.get("headers", []),
        "role_overrides": item.evidence.get("role_overrides", {}),
    }


def _valid(item: m.Interpretation) -> bool:
    headers = item.evidence.get("headers", [])
    return bool(
        item.provenance == "human"
        and headers
        and item.family in REQUIRED
        and set(REQUIRED[item.family]) <= set(item.mapping)
        and set(item.mapping.values()) <= set(headers)
        and item.calendar in ("gregorian", "jalali")
        and (item.family == "employees" or item.unit in ("IRR", "TOMAN", "per_row"))
    )


def candidates(db: Session, company: str) -> dict:
    manifest = db.scalar(
        select(m.ResultManifest)
        .where(m.ResultManifest.company_id == company)
        .order_by(m.ResultManifest.created_at.desc(), m.ResultManifest.id.desc())
        .limit(1)
    )
    if not manifest:
        return {"items": []}
    ids = manifest.selection.get("interpretation_ids", [])
    items = db.scalars(
        select(m.Interpretation).where(m.Interpretation.company_id == company, m.Interpretation.id.in_(ids))
    )
    return {
        "items": [
            {
                "id": item.id,
                "sheet": item.sheet,
                "family": item.family,
                "mapping": item.mapping,
                "headers": item.evidence.get("headers", []),
            }
            for item in items
            if _valid(item)
        ]
    }


def remember(db: Session, company: str, user: m.User, data: dict) -> dict:
    membership(db, company, user, "write")
    item = get_entity(db, m.Interpretation, company, data["interpretation_id"])
    require(_valid(item), "unvalidated_learning_source", "فقط اصلاح انسانیِ پردازش‌شده قابل یادگیری است.", 409)
    eligible = any(
        item.id in manifest.selection.get("interpretation_ids", [])
        for manifest in db.scalars(select(m.ResultManifest).where(m.ResultManifest.company_id == company))
    )
    require(eligible, "unvalidated_learning_source", "این اصلاح هنوز در گزارش معتبر استفاده نشده است.", 409)
    key = fingerprint(item.sheet, item.evidence["headers"])
    old = db.scalar(
        select(LearningPattern).where(
            LearningPattern.company_id == company, LearningPattern.fingerprint == key
        )
    )
    require(old is None, "learning_pattern_exists", "برای این ساختار الگو موجود است؛ آن را بررسی کنید.", 409)
    pattern = LearningPattern(
        company_id=company,
        name=data["name"],
        fingerprint=key,
        enabled=True,
        interpretation_id=item.id,
        actor_id=user.id,
        payload=_payload(item),
    )
    db.add(pattern)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "learning.remembered",
        pattern.id,
        {"interpretation_id": item.id, "fingerprint": key},
    )
    return serialize_fact(pattern)


def update(db: Session, company: str, user: m.User, pattern_id: str, data: dict, version: int) -> dict:
    membership(db, company, user, "write")
    pattern = get_entity(db, LearningPattern, company, pattern_id)
    check_version(pattern, version)
    before = {"name": pattern.name, "enabled": pattern.enabled}
    pattern.name, pattern.enabled = data["name"], data["enabled"]
    pattern.version += 1
    audit(
        db,
        company,
        user.id,
        "learning.updated",
        pattern.id,
        {"before": before, "after": data, "version": pattern.version},
    )
    return serialize_fact(pattern)


def reuse(db: Session, company: str, sheet: Sheet, proposal: dict) -> dict:
    pattern = db.scalar(
        select(LearningPattern).where(
            LearningPattern.company_id == company,
            LearningPattern.fingerprint == fingerprint(sheet.name, sheet.headers),
            LearningPattern.enabled.is_(True),
        )
    )
    if not pattern:
        return proposal
    saved = pattern.payload
    result = {**proposal, "mapping": dict(proposal["mapping"]), "evidence": dict(proposal["evidence"])}
    # Explicit contrary units, calendars and recognized source families win.
    if proposal["unit"] == "unsupported" or (
        proposal["family"] != "unknown" and proposal["family"] != saved["family"]
    ):
        return proposal
    used = False
    if proposal["family"] == "unknown":
        result["family"] = saved["family"]
        result["mapping"] = dict(saved["mapping"])
        used = True
    if not proposal["unit"] and "currency" not in result["mapping"] and saved["unit"] in ("IRR", "TOMAN"):
        result["unit"] = saved["unit"]
        used = True
    if not proposal["calendar"] and saved["calendar"] in ("gregorian", "jalali"):
        result["calendar"] = saved["calendar"]
        used = True
    if result["family"] == "ledger":
        account_column = result["mapping"].get("account", "")
        role_column = result["mapping"].get("role", "")
        overrides = {}
        for account, role in saved.get("role_overrides", {}).items():
            matching = [row for _, row in sheet.rows if row.get(account_column) == account]
            if matching and all(not row.get(role_column) for row in matching):
                overrides[account] = role
        if overrides:
            result["evidence"]["role_overrides"] = overrides
            used = True
    if used:
        result["evidence"]["learning_pattern"] = {
            "id": pattern.id,
            "version": pattern.version,
            "interpretation_id": pattern.interpretation_id,
            "controls_required": True,
        }
    return result
