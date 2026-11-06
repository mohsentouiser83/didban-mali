"""Installation model configuration and scoped consumption; no provider invocation."""
from datetime import timezone
from decimal import Decimal, localcontext
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .errors import require
from .model_accounting import has_installation_tariff
from .model_gateway import MODEL, exact, usd
from .models import (
    AuditEvent,
    BudgetPolicy,
    BudgetReservation,
    Company,
    InstallationAudit,
    InstallationModelBudget,
    ModelRequest,
    ModelTariff,
    User,
    now,
)
from .workflow import audit, serialize_fact


def billing_period(db: Session, company_id: str) -> str:
    company = db.get(Company, company_id)
    return now().astimezone(ZoneInfo(company.timezone)).strftime("%Y-%m")


def public_installation_budget(budget: InstallationModelBudget) -> dict:
    return {"id": budget.id, "period": budget.period, "cap": budget.cap,
            "per_session_cap": budget.per_session_cap, "used": budget.used,
            "reserved": budget.reserved, "currency": "USD", "version": budget.version}


def installation_model_configuration() -> dict:
    """Expose readiness without exposing credentials or claiming provider access."""
    return {
        "model": MODEL,
        "provider": settings.model_provider,
        "enabled": settings.model_enabled,
        "key_configured": bool(settings.openai_api_key and settings.openai_api_key.get_secret_value()),
        "configuration_source": "server_environment",
        "budget_mode": "unlimited" if settings.model_budget_unlimited else "capped",
        "availability_verified": False,
    }


def configure_installation_budget(db: Session, actor: User, values: dict, expected_version: int | None) -> dict:
    require(actor.installation_admin and actor.active, "permission_denied", "تنظیم بودجه با مدیر نصب است.", 403)
    cap = usd(values["cap"])
    per_session = usd(values["per_session_cap"]) if values.get("per_session_cap") is not None else None
    existing = db.scalar(select(InstallationModelBudget).where(InstallationModelBudget.period == values["period"]).with_for_update())
    before = public_installation_budget(existing) if existing else None
    if existing:
        require(expected_version == existing.version, "version_conflict", "بودجه تغییر کرده؛ صفحه را تازه کنید.", 409)
        with localcontext() as context:
            context.prec = 50
            require(cap >= Decimal(existing.used) + Decimal(existing.reserved), "budget_below_committed", "سقف از مصرف و رزرو کنونی کمتر است.", 409)
        existing.cap = exact(cap)
        existing.per_session_cap = exact(per_session) if per_session is not None else None
        existing.version += 1
        existing.actor_id = actor.id
    else:
        existing = InstallationModelBudget(period=values["period"], cap=exact(cap), per_session_cap=exact(per_session) if per_session is not None else None, used="0", reserved="0", actor_id=actor.id)
        db.add(existing)
        db.flush()
    after = public_installation_budget(existing)
    db.add(InstallationAudit(actor_id=actor.id, actor_label="installation_admin", action="model.installation_budget_configured", entity_id=existing.id,
                             details={"before": before, "after": after}))
    return after


def configure_tariff(db: Session, company_id: str, actor: User, values: dict) -> dict:
    require(actor.installation_admin and actor.active, "permission_denied", "تنظیم تعرفه با مدیر نصب است.", 403)
    prices = {key: exact(usd(values[key])) for key in ("input_per_million", "cached_input_per_million", "cache_write_per_million", "output_per_million")}
    require(values["effective_from"].tzinfo is not None, "tariff_timezone_required", "زمان اثر تعرفه باید منطقه زمانی داشته باشد.")
    tariff = ModelTariff(company_id=company_id, currency="USD", **(values | prices))
    db.add(tariff)
    db.flush()
    audit(db, company_id, actor.id, "model.tariff_created", tariff.id,
          {"price_version": tariff.price_version, "model": MODEL, "currency": "USD", **prices,
           "max_input_tokens": tariff.max_input_tokens, "max_output_tokens": tariff.max_output_tokens,
           "effective_from": tariff.effective_from.astimezone(timezone.utc).isoformat()})
    return serialize_fact(tariff)


def model_status(db: Session, company_id: str) -> dict:
    period = billing_period(db, company_id)
    tariff = db.scalar(select(ModelTariff.id).where(ModelTariff.company_id == company_id, ModelTariff.model == MODEL, ModelTariff.effective_from <= now()).limit(1))
    company_policy = db.scalar(select(BudgetPolicy.id).where(BudgetPolicy.company_id == company_id, BudgetPolicy.period == period).limit(1))
    installation = db.scalar(select(InstallationModelBudget.id).where(InstallationModelBudget.period == period).limit(1))
    key_configured = bool(settings.openai_api_key and settings.openai_api_key.get_secret_value())
    tariff_configured = bool(tariff or (settings.model_budget_unlimited and has_installation_tariff(settings.model_provider, MODEL)))
    budget_configured = settings.model_budget_unlimited or bool(company_policy and installation)
    configured = bool(key_configured and tariff_configured and budget_configured)
    status = "disabled" if not settings.model_enabled else "configured_unverified" if configured else "unconfigured"
    return {"model": MODEL, "enabled": settings.model_enabled, "configured": configured,
            "key_configured": key_configured, "tariff_configured": tariff_configured,
            "budget_configured": budget_configured, "budget_mode": "unlimited" if settings.model_budget_unlimited else "capped", "status": status,
            "availability_verified": False}


def company_usage(db: Session, company_id: str, actor: User, period: str | None = None) -> dict:
    period = period or billing_period(db, company_id)
    reservations = db.scalars(select(BudgetReservation).where(BudgetReservation.company_id == company_id, BudgetReservation.period == period))
    with localcontext() as context:
        context.prec = 50
        used, reserved, unknown = Decimal(0), Decimal(0), Decimal(0)
        for reservation in reservations:
            if reservation.state == "settled":
                used += Decimal(reservation.actual_cost or "0")
            elif reservation.state in ("held", "unknown"):
                reserved += Decimal(reservation.amount)
                if reservation.state == "unknown":
                    unknown += Decimal(reservation.amount)
    policies = db.scalars(select(BudgetPolicy).where(BudgetPolicy.company_id == company_id).order_by(BudgetPolicy.created_at.desc(), BudgetPolicy.id.desc()).limit(100))
    status = model_status(db, company_id)
    response = {"model_status": status["status"], "model": MODEL, "period": period, "used": exact(used),
                "reserved": exact(reserved), "unknown_reserved": exact(unknown), "currency": "USD",
                "budget_mode": "unlimited" if settings.model_budget_unlimited else "capped",
                "policies": [serialize_fact(policy) for policy in policies]}
    if actor.installation_admin:
        budget = db.scalar(select(InstallationModelBudget).where(InstallationModelBudget.period == period))
        response["installation_budget"] = public_installation_budget(budget) if budget else None
    return response


def public_model_request(request: ModelRequest) -> dict:
    return {key: getattr(request, key) for key in ("id", "created_at", "purpose", "model", "prompt_version", "state", "attempts", "error_code", "usage", "next_attempt_at")}


def model_response_evidence(db: Session, company_id: str, actor: User, reservation_id: str) -> dict:
    """Only the current installation admin may inspect provider tracking metadata."""
    require(actor.active and actor.installation_admin, "permission_denied", "بررسی مصرف با مدیر نصب است.", 403)
    reservation = db.scalar(select(BudgetReservation).where(
        BudgetReservation.company_id == company_id, BudgetReservation.id == reservation_id,
    ))
    require(reservation is not None, "not_found", "درخواست پیدا نشد.", 404)
    receipt = db.scalar(select(AuditEvent).where(
        AuditEvent.company_id == company_id,
        AuditEvent.entity_id == reservation_id,
        AuditEvent.action == "model.response_received",
    ).order_by(AuditEvent.created_at, AuditEvent.id))
    return {
        "reservation_id": reservation.id,
        "request_id": reservation.request_id,
        "attempt": reservation.attempt,
        "available": receipt is not None,
        "received_at": receipt.created_at if receipt else None,
        "evidence": receipt.details if receipt else None,
    }
