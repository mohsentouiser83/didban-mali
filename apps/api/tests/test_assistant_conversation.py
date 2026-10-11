import json
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.ai.assistant import AssistantAnswer, AssistantQuestion
from app.ai.conversation import (
    ChatReply,
    chat_question,
    financial_context,
    history_key,
    payable_query,
    render_reply,
)


def test_history_is_owned_by_user_and_company():
    user, company, conversation = uuid4(), uuid4(), uuid4()
    key = history_key(user, company, conversation)
    assert key != history_key(uuid4(), company, conversation)
    assert key != history_key(user, uuid4(), conversation)


def test_only_server_numbers_and_sources_can_be_rendered():
    facts = {"cash_balance": {"display": "۹۰٬۰۷۱٬۹۹۲٬۵۴۷٬۴۰۹٬۹۳۱ ریال"}}
    sources = {"cashflow": {}}
    assert render_reply(
        ChatReply(answer_template="مانده {{cash_balance}} است.", source_keys=["cashflow"]),
        facts,
        sources,
    ).startswith("مانده ۹۰٬۰۷۱")
    for text in [
        "مانده 123 ریال",
        "مانده ۱۲۳ ریال",
        "{{unknown}}",
        "{{cash_balance}} و 1",
        "{cash_balance}",
    ]:
        with pytest.raises(ValueError):
            render_reply(ChatReply(answer_template=text, source_keys=[]), facts, sources)
    with pytest.raises(ValueError):
        render_reply(ChatReply(answer_template="سلام", source_keys=["other"]), facts, sources)


def test_payable_query_has_tenant_and_current_classification_predicates():
    sql = str(payable_query(uuid4(), date(2026, 10, 10)))
    assert "journal_entries.company_id" in sql
    assert "counterparties.company_id" in sql
    assert "journal_lines.company_id" in sql
    assert "account_classifications.company_id" in sql
    assert "NOT (EXISTS" in sql


async def test_context_missing_cash_and_debt_are_not_zero():
    rec = AssistantAnswer(
        intent="unsupported",
        mode="rules",
        status="no_data",
        as_of_date=date.today(),
        answer_fa="داده نداریم",
    )
    session = AsyncMock()
    result = MagicMock()
    result.all.return_value = []
    session.execute.return_value = result
    with (
        patch("app.ai.conversation.answer_question", AsyncMock(return_value=rec)),
        patch(
            "app.ai.conversation._cash_position",
            AsyncMock(return_value=SimpleNamespace(value_numeric=None, warnings=[])),
        ),
    ):
        context, _ = await financial_context(session, uuid4())
    assert context["facts"] == {}
    assert any("نمی‌توان نتیجه گرفت" in text for text in context["notes"])


async def test_followup_uses_server_history_and_saves_bounded_pairs():
    user, company, conversation = uuid4(), uuid4(), uuid4()
    history = [
        {"role": "user", "content": "نقدینگی؟"},
        {"role": "assistant", "content": "مانده قبلی"},
    ]
    redis = AsyncMock()
    lock = AsyncMock()
    redis.lock = MagicMock(return_value=lock)
    redis.get.return_value = json.dumps(history)
    factory = MagicMock()
    factory.from_url.return_value.__aenter__ = AsyncMock(return_value=redis)
    factory.from_url.return_value.__aexit__ = AsyncMock(return_value=False)
    planner = SimpleNamespace(
        chat=AsyncMock(
            return_value=ChatReply(
                answer_template="این مانده بر اساس داده ثبت‌شده است.", source_keys=["cashflow"]
            )
        )
    )
    evidence = AssistantAnswer(
        intent="unsupported", mode="rules", status="no_data", as_of_date=date.today(), answer_fa=""
    )
    context = {
        "facts": {},
        "sources": {"cashflow": {"title": "نقدینگی", "path": "cashflow"}},
        "notes": [],
    }
    with (
        patch("app.ai.conversation.Redis", factory),
        patch("app.ai.conversation.financial_context", AsyncMock(return_value=(context, evidence))),
    ):
        reply = await chat_question(
            AsyncMock(),
            company,
            user,
            AssistantQuestion(question="چرا؟", conversation_id=conversation),
            planner,
        )
    planner.chat.assert_awaited_once_with("چرا؟", history, context)
    assert reply.conversation_id == conversation
    assert reply.mode == "model"
    assert redis.set.call_args.kwargs["ex"] == 86400
    saved = json.loads(redis.set.call_args.args[1])
    assert saved[-2]["content"] == "چرا؟"
    assert redis.get.call_args.args[0] == history_key(user, company, conversation)


async def test_expired_or_foreign_conversation_is_not_reused():
    redis = AsyncMock()
    redis.get.return_value = None
    redis.lock = MagicMock(return_value=AsyncMock())
    factory = MagicMock()
    factory.from_url.return_value.__aenter__ = AsyncMock(return_value=redis)
    factory.from_url.return_value.__aexit__ = AsyncMock(return_value=False)
    with patch("app.ai.conversation.Redis", factory), pytest.raises(HTTPException) as error:
        await chat_question(
            AsyncMock(),
            uuid4(),
            uuid4(),
            AssistantQuestion(question="چرا", conversation_id=uuid4()),
            SimpleNamespace(chat=AsyncMock()),
        )
    assert error.value.status_code == 410


async def test_native_gemini_chat_sends_history_and_response_schema(monkeypatch):
    import httpx
    from pydantic import SecretStr

    from app.ai.assistant_provider import CompatibleAssistantPlanner
    from app.core.config import settings

    monkeypatch.setattr(
        settings,
        "assistant_api_url",
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    )
    monkeypatch.setattr(settings, "assistant_model", "gemini-3.5-flash")
    monkeypatch.setattr(settings, "assistant_api_key", SecretStr("test-only-key"))
    client = AsyncMock()
    client.post.return_value = httpx.Response(
        200,
        request=httpx.Request("POST", "https://model.example"),
        json={
            "candidates": [
                {"content": {"parts": [{"text": '{"answer_template":"سلام!","source_keys":[]}'}]}}
            ]
        },
    )
    with patch("app.ai.assistant_provider.httpx.AsyncClient") as factory:
        factory.return_value.__aenter__.return_value = client
        await CompatibleAssistantPlanner().chat(
            "چرا؟",
            [
                {"role": "user", "content": "نقدینگی؟"},
                {"role": "assistant", "content": "پاسخ قبلی"},
            ],
            {"facts": {}, "sources": {"cashflow": {}}, "notes": []},
        )
    call = client.post.call_args
    assert call.args[0].endswith("gemini-3.5-flash:generateContent")
    assert call.kwargs["headers"] == {"x-goog-api-key": "test-only-key"}
    payload = call.kwargs["json"]
    assert [m["role"] for m in payload["contents"]] == ["user", "model", "user"]
    assert payload["generationConfig"]["responseJsonSchema"]["additionalProperties"] is False
    assert "test-only-key" not in json.dumps(payload)


async def test_context_debt_is_net_and_overdue_is_capped_by_unpaid_balance():
    from datetime import datetime, timedelta
    from decimal import Decimal
    from zoneinfo import ZoneInfo

    today = datetime.now(ZoneInfo("Asia/Tehran")).date()
    vendor = SimpleNamespace(id=uuid4(), name="تأمین‌کننده نمونه")
    entry = SimpleNamespace(entry_date=today - timedelta(days=80))
    rows = [
        (SimpleNamespace(credit_irr=Decimal("100"), debit_irr=Decimal("0")), entry, vendor),
        (SimpleNamespace(credit_irr=Decimal("0"), debit_irr=Decimal("60")), entry, vendor),
    ]
    session = AsyncMock()
    result = MagicMock()
    result.all.return_value = rows
    session.execute.return_value = result
    rec = AssistantAnswer(
        intent="unsupported", mode="rules", status="no_data", as_of_date=today, answer_fa=""
    )
    with (
        patch("app.ai.conversation.answer_question", AsyncMock(return_value=rec)),
        patch(
            "app.ai.conversation._cash_position",
            AsyncMock(return_value=SimpleNamespace(value_numeric=None, warnings=[])),
        ),
    ):
        context, _ = await financial_context(session, uuid4())
    assert context["facts"]["payables_total"]["value"] == "40"
    assert context["facts"]["payables_overdue"]["value"] == "40"
    assert "cash_balance" not in context["facts"]
