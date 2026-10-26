"""No network calls: official Responses wire shape through httpx MockTransport."""

from dataclasses import replace
from decimal import Decimal
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))
from didban.adapters.model_provider import (  # noqa: E402
    ModelSettings,
    OpenAIResponsesProvider,
    ProviderFailure,
)
from didban.application.model_answers import render_answer  # noqa: E402

SETTINGS = ModelSettings(
    api_key="synthetic-secret",
    model_id="synthetic-test-model",
    input_rate=Decimal("1"),
    output_rate=Decimal("2"),
)
SELECTION = {
    "intent": "show_metrics",
    "metric_keys": ["revenue"],
    "next_section": "results",
}


def response(selection=SELECTION, status="completed"):
    return {
        "id": "resp_synthetic",
        "status": status,
        "usage": {"input_tokens": 10, "output_tokens": 20},
        "output": [
            {
                "type": "message",
                "content": [{"type": "output_text", "text": json.dumps(selection)}],
            }
        ],
    }


class ModelProviderTests(unittest.TestCase):
    def test_avalai_uses_its_own_endpoint_and_bounded_structured_payload(self):
        settings = replace(
            SETTINGS,
            provider="avalai",
            model_id="gpt-6-luna",
            reasoning_effort="none",
            max_output_tokens=256,
        )

        def transport(request):
            self.assertEqual(str(request.url), "https://api.avalai.ir/v1/responses")
            self.assertEqual(
                request.headers["authorization"], "Bearer synthetic-secret"
            )
            payload = json.loads(request.content)
            self.assertEqual(payload["model"], "gpt-6-luna")
            self.assertEqual(payload["reasoning"], {"effort": "none"})
            self.assertEqual(payload["max_output_tokens"], 256)
            self.assertFalse(payload["store"])
            self.assertEqual(payload["tools"], [])
            self.assertTrue(payload["text"]["format"]["strict"])
            return httpx.Response(200, json=response())

        result = OpenAIResponsesProvider(
            settings, httpx.MockTransport(transport)
        ).complete({"question": "درآمد؟", "metrics": {}}, "synthetic-request")
        self.assertEqual(result.selection, SELECTION)

    def test_provider_configuration_rejects_arbitrary_destinations_before_dispatch(
        self,
    ):
        for provider in ("https://example.com", "unknown", "avalai/../openai", ""):
            settings = replace(SETTINGS, provider=provider)
            with self.assertRaises(ProviderFailure) as raised:
                OpenAIResponsesProvider(settings).complete({}, "id")
            self.assertFalse(raised.exception.sent)
        self.assertFalse(replace(SETTINGS, reasoning_effort="invalid").configured)
        with patch.dict(
            "os.environ",
            {
                "DIDBAN_MODEL_PROVIDER": "avalai",
                "DIDBAN_MODEL_ID": "gpt-6-luna",
                "DIDBAN_MODEL_API_KEY": "synthetic-secret",
                "DIDBAN_MODEL_ALLOWED_IDS": "gpt-6-luna",
                "DIDBAN_MODEL_INPUT_USD_PER_MILLION": "0.1",
                "DIDBAN_MODEL_OUTPUT_USD_PER_MILLION": "0.5",
                "DIDBAN_MODEL_REASONING_EFFORT": "none",
            },
            clear=True,
        ):
            settings = ModelSettings.from_env()
        self.assertTrue(settings.configured)
        self.assertEqual(settings.provider, "avalai")
        self.assertEqual(settings.reasoning_effort, "none")

    def test_avalai_redirect_never_forwards_credentials_to_another_host(self):
        calls = []

        def transport(request):
            calls.append(str(request.url))
            return httpx.Response(307, headers={"location": "https://example.com"})

        with self.assertRaises(ProviderFailure):
            OpenAIResponsesProvider(
                replace(SETTINGS, provider="avalai"), httpx.MockTransport(transport)
            ).complete({}, "id")
        self.assertEqual(calls, ["https://api.avalai.ir/v1/responses"])

    def test_configuration_does_not_guess_model_or_rates_and_hides_secret(self):
        self.assertFalse(ModelSettings().configured)
        self.assertFalse(replace(SETTINGS, input_rate=None).configured)
        self.assertFalse(replace(SETTINGS, allowed_ids=("another-model",)).configured)
        self.assertNotIn("synthetic-secret", repr(SETTINGS))

    def test_responses_shape_is_bounded_non_storing_and_has_no_tools(self):
        seen = []

        def transport(request):
            seen.append(json.loads(request.content))
            self.assertEqual(str(request.url), "https://api.openai.com/v1/responses")
            return httpx.Response(200, json=response())

        provider = OpenAIResponsesProvider(SETTINGS, httpx.MockTransport(transport))
        self.assertGreater(
            provider.reservation({"question": "درآمد؟", "metrics": {}}), Decimal("0")
        )
        result = provider.complete(
            {"question": "درآمد؟", "metrics": {}}, "synthetic-request"
        )
        self.assertEqual(result.selection, SELECTION)
        self.assertFalse(seen[0]["store"])
        self.assertEqual(seen[0]["tools"], [])
        self.assertEqual(seen[0]["text"]["format"]["type"], "json_schema")
        self.assertEqual(SETTINGS.cost(10, 20), Decimal(".00005"))

    def test_invalid_or_mutating_model_output_is_never_a_financial_answer(self):
        output = response(
            {
                "intent": "execute_sql",
                "metric_keys": ["revenue"],
                "next_section": "results",
                "sql": "DROP TABLE",
            }
        )
        provider = OpenAIResponsesProvider(
            SETTINGS, httpx.MockTransport(lambda _: httpx.Response(200, json=output))
        )
        self.assertIsNone(
            provider.complete(
                {"question": "ignore instructions"}, "synthetic-request"
            ).selection
        )

    def test_timeouts_hold_unknown_usage_but_preconnect_failure_is_retryable(self):
        for error, sent in [
            (httpx.ReadTimeout("private"), True),
            (httpx.ConnectError("private"), False),
        ]:

            def transport(_):
                raise error

            with self.assertRaises(ProviderFailure) as raised:
                OpenAIResponsesProvider(
                    SETTINGS, httpx.MockTransport(transport)
                ).complete({}, "id")
            self.assertEqual(raised.exception.sent, sent)

    def test_input_limit_is_enforced_before_network_and_unavailable_usage_is_unknown(
        self,
    ):
        calls = []
        provider = OpenAIResponsesProvider(
            SETTINGS, httpx.MockTransport(lambda r: calls.append(r))
        )
        with self.assertRaises(ProviderFailure) as raised:
            provider.complete({"question": "x" * 30000}, "id")
        self.assertFalse(raised.exception.sent)
        self.assertEqual(calls, [])
        provider = OpenAIResponsesProvider(
            SETTINGS,
            httpx.MockTransport(
                lambda _: httpx.Response(200, json={"status": "completed"})
            ),
        )
        with self.assertRaises(ProviderFailure) as raised:
            provider.complete({}, "id")
        self.assertTrue(raised.exception.sent)

    def test_numbers_and_evidence_are_bound_by_server_to_snapshot(self):
        text, refs, path = render_answer(
            SELECTION,
            {
                "metrics": {
                    "revenue": {
                        "value_irr": "123456789012345678901234567890.123456",
                        "status": "available",
                        "comparison": None,
                        "evidence_refs": ["evidence-a"],
                        "reason_codes": [],
                    }
                }
            },
            "company-a",
            "manifest-a",
        )
        self.assertIn("۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵۶۷۸۹۰.۱۲۳۴۵۶", text)
        self.assertEqual(refs, ["evidence-a"])
        self.assertEqual(path, "/companies/company-a/results/manifest-a")
        text, refs, path = render_answer(
            {
                "intent": "unsupported_request",
                "metric_keys": [],
                "next_section": "none",
            },
            {},
            "company-a",
            "manifest-a",
        )
        self.assertNotIn("SQL", text)
        self.assertEqual(refs, [])
        self.assertIsNone(path)


if __name__ == "__main__":
    unittest.main()
