"""Allowlisted provider accounting evidence, excluding prompts and response output."""

import re


def provider_identifier(value: object) -> str | None:
    """Keep the complete opaque identifier; never return a truncated lookup key."""
    if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9._~:/+=-]{1,8192}", value):
        return value
    return None


def usage_counters(value: object) -> dict | None:
    """Retain supplied counters without coercing absent/invalid values to zero."""
    if not isinstance(value, dict):
        return None
    fields = {
        "input_tokens", "output_tokens", "total_tokens", "cached_tokens",
        "cache_write_tokens", "reasoning_tokens", "image_tokens", "text_tokens",
        "num_requests", "ttl_12h_tokens", "ttl_30m_tokens",
    }
    nested = {"input_tokens_details", "output_tokens_details", "cache_write_tokens_details"}

    def counters(data: dict, depth: int) -> dict:
        result = {}
        for key in fields & data.keys():
            counter = data[key]
            if type(counter) is int or counter is None:
                result[key] = counter
        if depth < 3:
            for key in nested & data.keys():
                if isinstance(data[key], dict):
                    result[key] = counters(data[key], depth + 1)
        return result

    return counters(value, 0)


def response_evidence(envelope: dict | None, transport: dict, reason: str | None) -> dict:
    """Do not persist arbitrary headers, output text, reasoning or provider errors."""
    value = envelope or {}
    tools = value.get("tool_usage")
    return {
        **transport,
        "provider_response_id": provider_identifier(value.get("id")),
        "model": provider_identifier(value.get("model")),
        "service_tier": provider_identifier(value.get("service_tier")),
        "status": provider_identifier(value.get("status")),
        "usage_present": "usage" in value,
        "usage": usage_counters(value.get("usage")),
        "tool_usage": {
            key: usage_counters(tools[key]) for key in ("web_search", "image_gen") if key in tools
        } if isinstance(tools, dict) else None,
        "cost_reason": reason,
    }
