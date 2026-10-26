"""One bounded live request with synthetic data through the application adapter.

No retries, company data, credentials or raw provider bodies in output/reports.
"""

from __future__ import annotations

import argparse
from dataclasses import replace
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
from didban.adapters.model_provider import (  # noqa: E402
    ModelSettings,
    OpenAIResponsesProvider,
    ProviderFailure,
)

CONTEXT = {
    "question": "درآمد این دوره چقدر است؟",
    "report_scope": "synthetic_connection_test_only",
    "metrics": {
        "revenue": {
            "value_irr": "100",
            "status": "available",
            "comparison": None,
            "reason_codes": [],
            "evidence_refs": [],
        }
    },
}


def load_settings(path: Path) -> ModelSettings:
    if path.stat().st_mode & 0o077:
        raise ValueError("private_config_permissions_required")
    for raw in path.read_text().splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        name, separator, value = raw.partition("=")
        if not separator or not name.startswith("DIDBAN_MODEL_"):
            raise ValueError("invalid_model_config_file")
        # This is a literal configuration file, never executed as shell code.
        os.environ[name] = value.strip().strip("\"'")
    settings = replace(ModelSettings.from_env(), max_output_tokens=256)
    if (
        not settings.configured
        or settings.provider != "avalai"
        or settings.model_id != "gpt-6-luna"
    ):
        raise ValueError("avalai_luna_configuration_required")
    if settings.reasoning_effort != "none":
        raise ValueError("smoke_test_requires_reasoning_none")
    return settings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env.model")
    parser.add_argument(
        "--report", type=Path, default=ROOT / "docs/avalai-smoke-validation.json"
    )
    args = parser.parse_args()
    try:
        settings = load_settings(args.env_file)
    except (OSError, ValueError):
        print(
            "Live test not sent: complete the private AvalAI Luna configuration first."
        )
        return 2
    provider = OpenAIResponsesProvider(settings)
    reservation = provider.reservation(CONTEXT)
    # The authorized smoke test cannot grow into a large request via configuration.
    if reservation > 0.01:
        print("Live test not sent: estimated upper bound exceeds USD 0.01.")
        return 2
    report = {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "provider": "avalai",
        "model": "gpt-6-luna",
        "synthetic_data_only": True,
        "max_output_tokens": 256,
        "attempts": 1,
        "automatic_retries": 0,
        "estimated_upper_bound_usd": str(reservation),
    }
    try:
        result = provider.complete(CONTEXT, "didban-smoke-" + uuid4().hex)
    except ProviderFailure as failure:
        report.update(
            status="failed", code=failure.code, potentially_billed=failure.sent
        )
    else:
        expected = {
            "intent": "show_metrics",
            "metric_keys": ["revenue"],
            "next_section": "results",
        }
        report.update(
            status="passed" if result.selection == expected else "unexpected_selection",
            selection=result.selection,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            estimated_token_cost_usd=str(
                settings.cost(result.input_tokens, result.output_tokens)
            ),
            billing_note="Token-rate estimate only; provider fees and final invoice may differ.",
        )
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
