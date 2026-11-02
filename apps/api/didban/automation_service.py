"""Safe rule evaluation: no SQL, model math, financial posting or external send."""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .automation_models import AutomationPreview, AutomationRule, AutomationRun
from .automation_schemas import RuleDefinition
from .errors import DomainError, require
from .security import membership
from .services import check_version, get_entity
from .workflow import audit, serialize_fact

NUMERIC_FIELDS = {"value", "remaining", "amount"}


def can_manage(db: Session, company: str, user: m.User) -> bool:
    return membership(db, company, user).role in ("owner", "finance_manager")


def save_rule(
    db: Session,
    company: str,
    user: m.User,
    data: dict,
    rule_id: str | None = None,
    version: int | None = None,
) -> dict:
    require(can_manage(db, company, user), "permission_denied", "مدیریت قواعد با مالک یا مدیر مالی است.", 403)
    definition = RuleDefinition.model_validate(data["definition"]).model_dump()
    if definition["scope"] == "native_journal":
        from .native_automation_service import validate_definition

        validate_definition(db, company, definition)
    if definition["action"] == "prepare_draft":
        from .automation_draft_service import validate_template

        validate_template(db, company, definition)
    if data["enabled"]:
        require(
            bool(data.get("preview_id")),
            "rule_preview_required",
            "پیش از فعال‌سازی، اثر قاعده را بررسی کنید.",
            409,
        )
        if definition["scope"] == "native_journal":
            from .native_automation_service import validate_activation

            validate_activation(db, company, user, definition, data["preview_id"])
        else:
            checked = get_entity(db, AutomationPreview, company, data["preview_id"])
            require(
                checked.actor_id == user.id
                and checked.definition == definition
                and checked.result["status"] != "unavailable",
                "rule_preview_mismatch",
                "پیش‌نمایش با این قاعده یکسان نیست.",
                409,
            )
    item = (
        get_entity(db, AutomationRule, company, rule_id)
        if rule_id
        else AutomationRule(company_id=company, actor_id=user.id)
    )
    if rule_id:
        check_version(item, version)
        item.version += 1
    before = {"enabled": item.enabled, "definition": item.definition} if rule_id else None
    item.name, item.enabled, item.definition = data["name"], data["enabled"], definition
    # The last editor is responsible for enabled actions; current membership is
    # checked again when a later manifest triggers the rule.
    item.actor_id = user.id
    db.add(item)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "automation.rule_saved",
        item.id,
        {"before": before, "version": item.version, "definition": definition, "enabled": item.enabled},
    )
    return serialize_fact(item)


def _matches(row: dict, conditions: list[dict]) -> tuple[bool, bool]:
    if any(row.get(condition["field"]) is None for condition in conditions):
        return False, True
    for condition in conditions:
        raw = row.get(condition["field"])
        if raw is None:
            return False, True
        target = condition["value"]
        op = condition["op"]
        if condition["field"] in NUMERIC_FIELDS:
            left, right = Decimal(str(raw)), Decimal(target)
            result = {
                "gt": left > right,
                "gte": left >= right,
                "lt": left < right,
                "lte": left <= right,
                "eq": left == right,
            }[op]
        elif condition["field"] in ("date", "due_date"):
            result = {
                "gt": str(raw) > target,
                "gte": str(raw) >= target,
                "lt": str(raw) < target,
                "lte": str(raw) <= target,
                "eq": str(raw) == target,
            }[op]
        else:
            left = "true" if raw is True else "false" if raw is False else str(raw)
            result = target in left if op == "contains" else left == target
        if not result:
            return False, False
    return True, False


def preview(db: Session, company: str, manifest_id: str, definition: dict) -> dict:
    spec = RuleDefinition.model_validate(definition).model_dump()
    require(
        spec["scope"] != "native_journal", "native_preview_required", "پیش‌نمایش دفتر اصلی را انتخاب کنید."
    )
    manifest = get_entity(db, m.ResultManifest, company, manifest_id)
    rows = manifest.metrics if spec["scope"] == "metric" else manifest.details.get("invoices", [])
    if spec["scope"] == "metric":
        rows = [row for row in rows if row["metric_key"] == spec["metric_key"]]
    unavailable = 0
    matches = []
    for row in rows:
        matched, missing = _matches(row, spec["conditions"])
        if missing:
            unavailable += 1
        if matched:
            match = {
                "subject_id": row.get("id") or row.get("metric_key"),
                "reference": row.get("reference") or row.get("label") or row.get("metric_key"),
                "value": row.get("value", row.get("remaining")),
                "evidence_refs": row.get("evidence_refs", []),
            }
            if spec["action"] == "prepare_draft":
                from .automation_draft_service import candidate
                from .operation_service import build

                try:
                    data = candidate(db, company, manifest, spec, match["subject_id"])
                    match |= {
                        "draft_eligible": True,
                        "draft_lines": build(data),
                        "value": data["amounts"]["amount"],
                    }
                except DomainError as error:
                    unavailable += 1
                    match |= {
                        "draft_eligible": False,
                        "blocked_reason": error.code,
                        "blocked_message": error.message,
                    }
            matches.append(match)
    return {
        "manifest_id": manifest.id,
        "definition": spec,
        "matches": matches,
        "match_count": len(matches),
        "unavailable_count": unavailable,
        "status": "unavailable"
        if not rows
        or (
            spec["action"] == "prepare_draft"
            and matches
            and not any(row.get("draft_eligible") for row in matches)
        )
        else "limited"
        if unavailable
        else "available",
        "financial_effect": False,
    }


def save_preview(db: Session, company: str, user: m.User, manifest_id: str, definition: dict) -> dict:
    spec = RuleDefinition.model_validate(definition).model_dump()
    if spec["action"] == "prepare_draft":
        from .automation_draft_service import validate_template

        validate_template(db, company, spec)
    result = preview(db, company, manifest_id, definition)
    receipt = AutomationPreview(
        company_id=company,
        actor_id=user.id,
        manifest_id=manifest_id,
        definition=result["definition"],
        result=result,
    )
    db.add(receipt)
    db.flush()
    return result | {"preview_id": receipt.id}


def execute(db: Session, company: str, rule: AutomationRule, manifest: m.ResultManifest) -> dict:
    previous = db.scalar(
        select(AutomationRun).where(
            AutomationRun.company_id == company,
            AutomationRun.rule_id == rule.id,
            AutomationRun.rule_version == rule.version,
            AutomationRun.manifest_id == manifest.id,
        )
    )
    if previous:
        return serialize_fact(previous)
    require(rule.enabled, "rule_disabled", "قاعده غیرفعال است.", 409)
    actor = db.get(m.User, rule.actor_id)
    valid = bool(actor and actor.active)
    if valid:
        member = db.scalar(
            select(m.Membership).where(
                m.Membership.company_id == company,
                m.Membership.user_id == actor.id,
                m.Membership.active.is_(True),
            )
        )
        valid = bool(member and member.role in ("owner", "finance_manager"))
    blocked_reason = None
    if rule.definition["scope"] == "invoice":
        from .module_service import module_state

        module = (
            "payables"
            if (rule.definition.get("draft_template") or {}).get("kind") == "purchase_service"
            else "receivables"
        )
        if not module_state(db, company, module)["enabled"]:
            valid = False
            blocked_reason = "module_disabled"
    result = preview(db, company, manifest.id, rule.definition)
    action_count = 0
    prepared_drafts = []
    if valid:
        for match in result["matches"]:
            action = rule.definition["action"]
            if action == "prepare_draft":
                if not match.get("draft_eligible"):
                    continue
                from .automation_draft_service import prepare

                # A bad candidate cannot roll back a newly published financial
                # manifest. The immutable run records the local failure instead.
                try:
                    with db.begin_nested():
                        prepared = prepare(
                            db,
                            company,
                            actor,
                            manifest,
                            rule.definition,
                            match["subject_id"],
                            rule.id,
                            rule.version,
                        )
                    prepared_drafts.append(
                        {
                            "subject_id": match["subject_id"],
                            "operation_id": prepared["operation_id"],
                            "draft_id": prepared["draft"]["id"],
                            "draft_version": prepared["draft"]["version"],
                        }
                    )
                except DomainError as error:
                    match |= {
                        "draft_eligible": False,
                        "blocked_reason": error.code,
                        "blocked_message": error.message,
                    }
                    continue
            elif action == "followup":
                from .control_models import ControlCase
                from .control_service import create_case

                # A promise/task is operational metadata, never a settlement.
                exists = db.scalar(
                    select(ControlCase.id).where(
                        ControlCase.company_id == company, ControlCase.invoice_id == match["subject_id"]
                    )
                )
                if exists:
                    continue
                invoice = get_entity(db, m.Invoice, company, match["subject_id"])
                if invoice.direction != "sales":
                    continue
                create_case(
                    db,
                    company,
                    actor,
                    {
                        "kind": "invoice",
                        "subject_id": invoice.id,
                        "assignee_membership_id": None,
                        "due_date": None,
                        "next_action": rule.name,
                    },
                )
            else:
                label = "درخواست تهیه پیش‌نویس" if action == "draft_request" else rule.name
                href = "/accounting" if action == "draft_request" else "/review"
                db.add(
                    m.Notification(
                        company_id=company, title=f"{label}: {match['reference']}"[:150], href=href
                    )
                )
            action_count += 1
    result = result | {
        "action_count": action_count,
        "prepared_drafts": prepared_drafts,
        "action_state": "completed" if valid else (blocked_reason or "actor_access_revoked"),
    }
    receipt = AutomationRun(
        company_id=company,
        rule_id=rule.id,
        rule_version=rule.version,
        manifest_id=manifest.id,
        definition=rule.definition,
        result=result,
    )
    db.add(receipt)
    db.flush()
    audit(
        db,
        company,
        actor.id if valid else None,
        "automation.executed",
        receipt.id,
        {"rule_id": rule.id, "manifest_id": manifest.id, "actions": action_count},
    )
    return serialize_fact(receipt)


def on_manifest(db: Session, company: str, manifest: m.ResultManifest) -> None:
    # Executed inside the existing publishing transaction, without external IO.
    for rule in db.scalars(
        select(AutomationRule).where(AutomationRule.company_id == company, AutomationRule.enabled.is_(True))
    ):
        if rule.definition["scope"] == "native_journal":
            continue
        execute(db, company, rule, manifest)
