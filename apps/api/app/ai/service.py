import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid6 import uuid7

from app.ai.models import (
    AiCompanySettingRevision,
    AiInvocation,
    AiInvocationStatus,
    AiPurpose,
)
from app.ai.schemas import AiInvocationResponse, AiSettingsResponse
from app.core.config import settings

PROMPT_VERSIONS = {
    AiPurpose.FINDING_EXPLANATION: "finding-explanation-fa-v1",
    AiPurpose.SEMANTIC_MATCHING: "semantic-candidate-ranking-fa-v1",
}


@dataclass(frozen=True)
class EffectiveAiSettings:
    enabled: bool
    explanations_enabled: bool
    semantic_matching_enabled: bool
    revision_id: UUID | None
    updated_at: datetime | None

    @property
    def provider_configured(self) -> bool:
        return settings.ai_provider != "disabled" and settings.ai_model != "unconfigured"

    @property
    def data_region_configured(self) -> bool:
        return bool(settings.ai_data_region and settings.ai_data_region.strip())

    @property
    def base_effective(self) -> bool:
        return (
            settings.ai_enabled
            and self.enabled
            and self.provider_configured
            and self.data_region_configured
        )


def canonical_hash(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


async def current_ai_settings(session: AsyncSession, company_id: UUID) -> EffectiveAiSettings:
    revision = await session.scalar(
        select(AiCompanySettingRevision)
        .where(AiCompanySettingRevision.company_id == company_id)
        .order_by(AiCompanySettingRevision.created_at.desc(), AiCompanySettingRevision.id.desc())
        .limit(1)
    )
    if revision is None:
        return EffectiveAiSettings(False, False, False, None, None)
    return effective_settings_from_revision(revision)


def effective_settings_from_revision(
    revision: AiCompanySettingRevision,
) -> EffectiveAiSettings:
    return EffectiveAiSettings(
        revision.enabled,
        revision.explanations_enabled,
        revision.semantic_matching_enabled,
        revision.id,
        revision.created_at,
    )


def settings_response(value: EffectiveAiSettings) -> AiSettingsResponse:
    return AiSettingsResponse(
        enabled=value.enabled,
        explanations_enabled=value.explanations_enabled,
        semantic_matching_enabled=value.semantic_matching_enabled,
        global_enabled=settings.ai_enabled,
        provider_configured=value.provider_configured,
        data_region_configured=value.data_region_configured,
        explanations_effective=value.base_effective and value.explanations_enabled,
        semantic_matching_effective=value.base_effective and value.semantic_matching_enabled,
        revision_id=value.revision_id,
        updated_at=value.updated_at,
    )


def invocation_response(item: AiInvocation) -> AiInvocationResponse:
    return AiInvocationResponse(
        id=item.id,
        company_id=item.company_id,
        purpose=item.purpose,
        status=item.status,
        source_finding_id=item.source_finding_id,
        source_reconciliation_run_id=item.source_reconciliation_run_id,
        provider=item.provider,
        model=item.model,
        prompt_version=item.prompt_version,
        output=item.output_json,
        latency_ms=item.latency_ms,
        failure_code=item.failure_code,
        failure_message=item.failure_message,
        created_at=item.created_at,
        completed_at=item.completed_at,
    )


def disabled_invocation(
    *,
    company_id: UUID,
    purpose: AiPurpose,
    created_by: UUID,
    idempotency_key: str,
    request_hash: str,
    input_manifest: dict[str, Any],
    allowed_numbers: set[str],
    evidence_ids: list[UUID],
    failure_code: str,
    failure_message: str,
    source_finding_id: UUID | None = None,
    source_reconciliation_run_id: UUID | None = None,
) -> AiInvocation:
    now = datetime.now(UTC)
    return AiInvocation(
        id=uuid7(),
        company_id=company_id,
        purpose=purpose,
        status=AiInvocationStatus.DISABLED,
        source_finding_id=source_finding_id,
        source_reconciliation_run_id=source_reconciliation_run_id,
        provider=settings.ai_provider,
        model=settings.ai_model,
        prompt_version=PROMPT_VERSIONS[purpose],
        input_manifest_json=input_manifest,
        allowed_numbers_json=sorted(allowed_numbers),
        evidence_ids_json=[str(item) for item in evidence_ids],
        output_json=None,
        latency_ms=0,
        failure_code=failure_code,
        failure_message=failure_message,
        created_by=created_by,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        created_at=now,
        completed_at=now,
    )


def disabled_reason(value: EffectiveAiSettings, purpose: AiPurpose) -> tuple[str, str]:
    common = "تحلیل قطعی سامانه بدون اختلال ادامه دارد."
    if not settings.ai_enabled:
        return "AI_GLOBAL_DISABLED", f"قابلیت AI در سطح سامانه غیرفعال است؛ {common}"
    feature_enabled = (
        value.explanations_enabled
        if purpose == AiPurpose.FINDING_EXPLANATION
        else value.semantic_matching_enabled
    )
    if not value.enabled or not feature_enabled:
        return "AI_COMPANY_DISABLED", f"این قابلیت برای شرکت فعال نشده است؛ {common}"
    if not value.provider_configured:
        return "AI_PROVIDER_NOT_APPROVED", (
            f"ارائه‌دهنده AI هنوز تصویب و پیکربندی نشده است؛ {common}"
        )
    if not value.data_region_configured:
        return "AI_DATA_REGION_UNSET", f"محل پردازش داده تعیین نشده است؛ {common}"
    return "AI_ADAPTER_UNAVAILABLE", f"رابط ارائه‌دهنده در دسترس نیست؛ {common}"
