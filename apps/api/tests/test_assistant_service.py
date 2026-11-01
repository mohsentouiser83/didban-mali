import asyncio
from types import SimpleNamespace

from test_assistant import manifest

from didban.assistant_service import respond
from didban.errors import DomainError


class FakeGateway:
    def __init__(self, outcome=None, enabled=True):
        self.config = SimpleNamespace(enabled=enabled, api_key="synthetic-not-live")
        self.calls = []
        self.outcome = outcome

    async def invoke(self, **kwargs):
        self.calls.append(kwargs)
        if isinstance(self.outcome, Exception):
            raise self.outcome
        if kwargs["purpose"] == "chat" and isinstance(self.outcome, dict) and "sentences" in self.outcome.get("proposal", {}):
            return {"state": "completed", "proposal": {"kind": "report", "answer": ""}}
        return self.outcome


def request(gateway, question):
    return asyncio.run(
        respond(
            manifest=manifest(),
            question=question,
            company_id="company",
            actor_id="user",
            request_key="message-1",
            gateway=gateway,
        )
    )


def test_greeting_uses_provider_without_inventing_financial_values():
    gateway = FakeGateway({"state": "completed", "proposal": {"kind": "chat", "answer": "سلام! خوبم، تو چطوری؟"}})
    result = request(gateway, "سلام")
    assert result["facts"] == [] and "سلام" in result["answer"] and gateway.calls[0]["purpose"] == "chat"


def test_disabled_provider_and_exhausted_budget_keep_exact_snapshot_facts():
    disabled = FakeGateway(enabled=False)
    result = request(disabled, "نقد بانک")
    assert (
        result["mode"] == "facts"
        and result["facts"][0]["value"] == "123456789012345678901234567890.123456"
        and disabled.calls == []
    )
    failed = FakeGateway(DomainError("budget_exhausted", "بودجه کافی نیست.", 409))
    result = request(failed, "نقد بانک")
    assert result["mode"] == "facts" and result["model_reason_code"] == "budget_exhausted"


def test_successful_model_selects_only_server_facts_and_never_supplies_amounts():
    gateway = FakeGateway(
        {
            "state": "completed",
            "request_id": "request",
            "proposal": {
                "sentences": [{"template": "metric_value", "fact_key": "cash", "evidence_refs": ["row2"]}]
            },
        }
    )
    result = request(gateway, "درباره نقد توضیح بده")
    assert (
        result["mode"] == "model_facts"
        and result["facts"][0]["value"] == "123456789012345678901234567890.123456"
    )
    assert result["manifest_id"] == "frozen-snapshot" and result["evidence_refs"] == ["row2"]
    assert gateway.calls[1]["purpose"] == "summarize_report"


def test_free_chat_without_report_preserves_bounded_history():
    gateway = FakeGateway({"state": "completed", "request_id": "chat-1",
                           "proposal": {"kind": "chat", "answer": "می‌توانیم درباره سفر صحبت کنیم."}})
    history = [{"role": "user", "text": "سلام خوبی چه خبر؟"}]
    result = asyncio.run(respond(manifest=None, question="درباره سفر حرف بزنیم",
        company_id="company", actor_id="user", request_key="free-chat", gateway=gateway, history=history))
    assert result["mode"] == "chat" and result["manifest_id"] is None and result["facts"] == []
    assert gateway.calls[0]["evidence"] == {"question": "درباره سفر حرف بزنیم", "history": history, "source_refs": []}


def test_report_question_without_report_does_not_render_model_prose():
    gateway = FakeGateway({"state": "completed", "proposal": {"kind": "report", "answer": "invented amount"}})
    result = asyncio.run(respond(manifest=None, question="موجودی ما چقدر است؟",
        company_id="company", actor_id="user", request_key="no-report", gateway=gateway))
    assert "هنوز گزارشی" in result["answer"] and result["facts"] == []


def test_model_failure_does_not_replace_general_chat_with_financial_metrics():
    gateway = FakeGateway(DomainError("model_unavailable", "قطع ارتباط"))
    result = request(gateway, "سلام خوبی چه خبر؟")
    assert result["facts"] == [] and result["model_reason_code"] == "model_unavailable"
