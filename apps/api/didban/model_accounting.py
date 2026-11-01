"""Provision accounting records for the explicitly enabled uncapped server mode.

Caps remain stored for returning to capped mode. This mode removes only spend
limits; reservations, usage settlement and unknown costs remain durable.
"""
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import InstallationAudit, InstallationModelBudget, ModelTariff, now
from .workflow import audit

# AvalAI published standard-tier, <=272K-context prices, checked 2026-11-01.
# https://docs.avalai.ir/fa/pricing
# Cache writes have no published price for this model: nonzero writes must be
# reconciled, never silently priced at zero (see cost_for_usage).
AVALAI_LUNA_TARIFF = {
    "model": "gpt-5.6-luna", "price_version": "avalai-2026-11-01-standard",
    "currency": "USD", "input_per_million": "0.20",
    "cached_input_per_million": "0.02", "cache_write_per_million": "0",
    "output_per_million": "1.20", "max_input_tokens": 30000,
    "max_output_tokens": 2048,
}


def has_installation_tariff(provider: str, model: str) -> bool:
    return provider == "AvalAI" and model == AVALAI_LUNA_TARIFF["model"]


def ensure_uncapped_accounting(db: Session, company_id: str, actor_id: str, period: str, provider: str, model: str) -> None:
    """Called only after current company authorization, in the dispatch transaction."""
    budget = db.scalar(select(InstallationModelBudget).where(InstallationModelBudget.period == period).with_for_update())
    if budget is None:
        try:
            with db.begin_nested():
                # Zero is the dormant capped-mode limit, never a fake large cap.
                budget = InstallationModelBudget(period=period, cap="0", per_session_cap=None,
                                                 used="0", reserved="0", actor_id=actor_id)
                db.add(budget)
                db.flush()
                db.add(InstallationAudit(actor_id=actor_id, actor_label="server_configuration",
                                         action="model.uncapped_accounting_created", entity_id=budget.id,
                                         details={"period": period, "budget_mode": "unlimited"}))
        except IntegrityError:
            # Another company may have created the shared month concurrently.
            budget = db.scalar(select(InstallationModelBudget).where(InstallationModelBudget.period == period).with_for_update())
            if budget is None:
                raise
    if not has_installation_tariff(provider, model):
        return
    tariff = db.scalar(select(ModelTariff.id).where(ModelTariff.company_id == company_id,
                                                  ModelTariff.model == model, ModelTariff.effective_from <= now()).limit(1))
    if tariff is None:
        try:
            with db.begin_nested():
                tariff = ModelTariff(company_id=company_id, effective_from=now(), **AVALAI_LUNA_TARIFF)
                db.add(tariff)
                db.flush()
                audit(db, company_id, actor_id, "model.installation_tariff_applied", tariff.id,
                      {"provider": provider, "price_version": tariff.price_version,
                       "source": "https://docs.avalai.ir/fa/pricing", "budget_mode": "unlimited"})
        except IntegrityError:
            if not db.scalar(select(ModelTariff.id).where(ModelTariff.company_id == company_id,
                                                         ModelTariff.model == model, ModelTariff.effective_from <= now()).limit(1)):
                raise
