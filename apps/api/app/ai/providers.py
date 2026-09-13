import asyncio
from collections.abc import Awaitable, Callable
from typing import Any, Protocol


class AiProviderError(RuntimeError):
    pass


class AiProvider(Protocol):
    async def generate_json(self, *, purpose: str, payload: dict[str, Any]) -> Any: ...


class DisabledAiProvider:
    async def generate_json(self, *, purpose: str, payload: dict[str, Any]) -> Any:
        del purpose, payload
        raise AiProviderError("AI provider is not approved or configured")


async def call_with_timeout(
    provider: AiProvider,
    *,
    purpose: str,
    payload: dict[str, Any],
    timeout_seconds: int,
    validator: Callable[[Any], Any],
) -> Any:
    try:
        raw = await asyncio.wait_for(
            provider.generate_json(purpose=purpose, payload=payload), timeout=timeout_seconds
        )
    except TimeoutError as exc:
        raise AiProviderError("AI provider timed out") from exc
    return validator(raw)


ProviderFactory = Callable[[], AiProvider | Awaitable[AiProvider]]
