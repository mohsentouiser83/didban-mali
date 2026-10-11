"""Tenant-owned chat history and financial facts for grounded conversations."""

import json
import logging
import re
from datetime import datetime, timedelta
from decimal import Decimal
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field
from redis.asyncio import Redis
from sqlalchemy import and_, exists, select
from sqlalchemy.orm import aliased

from app.ai.assistant import answer_question
from app.cashflow.service import _cash_position, get_cashflow_forecast
from app.core.config import settings
from app.financial.models import (
    AccountClass,
    AccountClassification,
    Counterparty,
    JournalEntry,
    JournalLine,
)

logger = logging.getLogger(__name__)


class ChatReply(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answer_template: str = Field(min_length=1, max_length=6000)
    source_keys: list[str] = Field(max_length=12)


def history_key(user_id: UUID, company_id: UUID, conversation_id: UUID) -> str:
    return f"assistant:chat:v2:{user_id}:{company_id}:{conversation_id}"


def display_number(value: str) -> str:
    return (
        format(Decimal(value), ",f")
        .replace(",", "٬")
        .replace(".", "٫")
        .translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))
    )


def render_reply(reply: ChatReply, facts: dict, sources: dict) -> str:
    """Model prose cannot insert unverified numeric values or arbitrary sources."""
    template = re.sub(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}", r"{{\1}}", reply.answer_template)
    placeholders = re.findall(r"\{\{([a-zA-Z0-9_]+)\}\}", template)
    if any(key not in facts for key in placeholders) or any(
        key not in sources for key in reply.source_keys
    ):
        raise ValueError("Unknown financial fact or source")
    without_facts = re.sub(r"\{\{[a-zA-Z0-9_]+\}\}", "", template)
    if re.search(r"[0-9۰-۹٠-٩{}]", without_facts):
        raise ValueError("Financial numbers must reference server facts")
    for key in placeholders:
        template = template.replace("{{" + key + "}}", facts[key]["display"])
    return template.replace("ریال ریال", "ریال").replace("روز روز", "روز")


def payable_query(company_id: UUID, today):
    newer = aliased(AccountClassification)
    current_liability = exists(
        select(AccountClassification.id).where(
            AccountClassification.company_id == company_id,
            AccountClassification.account_id == JournalLine.account_id,
            AccountClassification.account_class == AccountClass.LIABILITY,
            AccountClassification.effective_from <= today,
            ~exists(
                select(newer.id).where(
                    newer.company_id == company_id,
                    newer.account_id == AccountClassification.account_id,
                    newer.effective_from <= today,
                    newer.effective_from > AccountClassification.effective_from,
                )
            ).correlate(AccountClassification),
        )
    ).correlate(JournalLine)
    return (
        select(JournalLine, JournalEntry, Counterparty)
        .join(
            JournalEntry,
            and_(JournalEntry.id == JournalLine.entry_id, JournalEntry.company_id == company_id),
        )
        .join(
            Counterparty,
            and_(
                Counterparty.id == JournalLine.counterparty_id,
                Counterparty.company_id == company_id,
            ),
        )
        .where(
            JournalLine.company_id == company_id,
            JournalEntry.entry_date <= today,
            current_liability,
        )
    )


async def financial_context(session, company_id: UUID):
    today = datetime.now(ZoneInfo("Asia/Tehran")).date()
    facts, sources = (
        {},
        {
            "receivables": {"title": "مطالبات و فاکتورهای فروش", "path": "receivables"},
            "cashflow": {"title": "مانده و پیش‌بینی نقدینگی", "path": "cashflow"},
            "payables": {"title": "بدهی‌های ثبت‌شده", "path": "payables"},
        },
    )
    notes = [
        "تاریخ مبنا " + today.isoformat(),
        "تمام مبلغ‌ها ریال هستند. اطلاعات ممکن است قدیمی یا ناقص باشند.",
    ]

    def fact(key, label, value, source, unit="ریال"):
        raw = format(Decimal(str(value)), "f")
        facts[key] = {
            "label": label,
            "value": raw,
            "unit": unit,
            "display": display_number(raw) + (" " + unit if unit else ""),
            "source": source,
        }

    receivables = await answer_question(session, company_id, "خلاصه مطالبات شرکت چیست؟")
    notes.extend(text for text in receivables.caveats_fa if "مدل زبانی" not in text)
    if receivables.status == "answered":
        fact("receivables_total", "کل مطالبات", receivables.total_outstanding_irr, "receivables")
        fact(
            "receivables_overdue",
            "مطالبات سررسیدگذشته",
            receivables.total_overdue_irr,
            "receivables",
        )
        for index, customer in enumerate(receivables.priorities):
            fact(
                f"customer_{index}_amount",
                customer.customer_name + "؛ مبلغ معوق",
                customer.overdue_amount_irr,
                "receivables",
            )
            fact(
                f"customer_{index}_delay",
                customer.customer_name + "؛ بیشترین تأخیر",
                customer.max_delay_days,
                "receivables",
                "روز",
            )
        notes.append(
            "جزئیات مشتریان فقط شامل پنج اولویت نخست است؛ درباره مشتری خارج از این فهرست عدد حدس نزن."
        )
    else:
        notes.append("داده مطالبات موجود نیست؛ مقدار نامشخص به معنی صفر نیست.")
    cash = await _cash_position(session, company_id, today)
    notes.extend(cash.warnings)
    if cash.value_numeric is not None:
        fact("cash_balance", "مانده قابل محاسبه حساب‌ها", cash.value_numeric, "cashflow")
        forecast = await get_cashflow_forecast(
            session, company_id, as_of_date=today, outflow_mode="planned", horizon_days=30
        )
        fact(
            "cash_inflows",
            "دریافت‌های تخمینی سی روز آینده",
            forecast.projected_inflows_30d_irr,
            "cashflow",
        )
        fact(
            "cash_outflows",
            "پرداخت‌های برنامه‌ریزی‌شده سی روز آینده",
            forecast.projected_outflows_30d_irr,
            "cashflow",
        )
        fact(
            "cash_end", "مانده پیش‌بینی‌شده پایان افق", forecast.weeks[-1].ending_cash_irr, "cashflow"
        )
        fact(
            "cash_lowest",
            "کمترین مانده پیش‌بینی‌شده",
            min([forecast.current_cash_irr] + [w.ending_cash_irr for w in forecast.weeks]),
            "cashflow",
        )
        notes.append(
            "پیش‌بینی پایه و سی‌روزه است. دریافت‌ها تخمینی و پرداخت‌ها فقط برنامه‌های ثبت‌شده‌اند؛ نبود برنامه پرداخت به معنی نبود هزینه نیست. مانده پایان افق مجموع وصول قطعی نیست."
        )
    else:
        notes.append("مانده قابل اتکای نقدینگی موجود نیست؛ مقدار نامشخص به معنی صفر نیست.")
    rows = (await session.execute(payable_query(company_id, today))).all()
    if rows:
        grouped = {}
        for line, entry, counterparty in rows:
            item = grouped.setdefault(
                counterparty.id,
                {"name": counterparty.name, "total": Decimal(0), "overdue": Decimal(0)},
            )
            net = line.credit_irr - line.debit_irr
            item["total"] += net
            if entry.entry_date + timedelta(days=45) < today and net > 0:
                item["overdue"] += net
        vendors = [v for v in grouped.values() if v["total"] > 0]
        fact(
            "payables_total",
            "کل بدهی ثبت‌شده به طرف‌های حساب",
            sum((v["total"] for v in vendors), Decimal(0)),
            "payables",
        )
        fact(
            "payables_overdue",
            "بدهی سررسیدگذشته برآوردی",
            sum((min(v["overdue"], v["total"]) for v in vendors), Decimal(0)),
            "payables",
        )
        for index, vendor in enumerate(sorted(vendors, key=lambda v: -v["total"])[:5]):
            fact(
                f"vendor_{index}_amount",
                vendor["name"] + "؛ بدهی ثبت‌شده",
                vendor["total"],
                "payables",
            )
        notes.append(
            "سررسید بدهی‌ها برآوردی بر اساس چهل‌وپنج روز پس از تاریخ سند است، نه سررسید توافقی. تنها اسناد با طبقه‌بندی بدهی و طرف حساب منظور شده‌اند؛ پوشش ممکن است ناقص باشد."
        )
    else:
        notes.append(
            "سند بدهی دارای طبقه‌بندی و طرف حساب تا تاریخ مبنا پیدا نشد؛ نمی‌توان نتیجه گرفت شرکت هیچ بدهی ندارد."
        )
    return {"facts": facts, "sources": sources, "notes": notes}, receivables


async def chat_question(session, company_id, user_id, payload, planner):
    conversation_id = payload.conversation_id or uuid4()
    key = history_key(user_id, company_id, conversation_id)
    async with Redis.from_url(settings.redis_url, decode_responses=True) as redis:
        async with redis.lock(key + ":lock", timeout=180, blocking_timeout=2):
            stored = await redis.get(key)
            if payload.conversation_id and stored is None:
                raise HTTPException(410, "این گفتگو پایان یافته است؛ گفتگوی جدیدی شروع کنید.")
            history = json.loads(stored) if stored else []
            context, evidence = await financial_context(session, company_id)
            for attempt in range(2):
                try:
                    reply = await planner.chat(payload.question, history, context)
                    text = render_reply(reply, context["facts"], context["sources"])
                    break
                except Exception as error:
                    status = (
                        error.response.status_code
                        if isinstance(error, httpx.HTTPStatusError)
                        else None
                    )
                    logger.warning(
                        "Assistant chat failed: category=%s http_status=%s attempt=%s",
                        type(error).__name__
                        + (":" + str(error) if type(error) is ValueError else ""),
                        status,
                        attempt + 1,
                    )
                    retryable = isinstance(error, (ValueError, httpx.TimeoutException)) or (
                        status is not None and status >= 500
                    )
                    if status == 429:
                        raise HTTPException(
                            429, "سهمیه مدل موقتاً پر شده است؛ کمی بعد دوباره تلاش کنید."
                        ) from None
                    if attempt == 1 or not retryable:
                        raise HTTPException(
                            502, "دستیار پاسخ معتبر دریافت نکرد؛ دوباره تلاش کنید."
                        ) from None
            used_sources = set(reply.source_keys)
            for fact_key in re.findall(r"\{\{([a-zA-Z0-9_]+)\}\}", reply.answer_template):
                used_sources.add(context["facts"][fact_key]["source"])
            if "cashflow" in used_sources:
                text += "\n\nدریافت‌های آینده تخمینی‌اند و پرداخت‌ها فقط برنامه‌های ثبت‌شده را شامل می‌شوند؛ نبود برنامه پرداخت به معنی نبود هزینه نیست."
            if "payables" in used_sources:
                text += "\n\nپوشش بدهی‌ها محدود به اسناد طبقه‌بندی‌شده است؛ سررسیدها با فرض چهل‌وپنج روز برآورد شده‌اند."
            history = history + [
                {"role": "user", "content": payload.question},
                {"role": "assistant", "content": text},
            ]
            await redis.set(key, json.dumps(history[-20:], ensure_ascii=False), ex=86400)
    evidence.conversation_id = conversation_id
    evidence.intent = "conversation"
    evidence.mode = "model"
    evidence.status = "answered"
    evidence.answer_fa = text
    evidence.sources = [context["sources"][key] for key in sorted(used_sources)]
    evidence.facts = [{"key": key, **value} for key, value in context["facts"].items()]
    evidence.caveats_fa = [n for n in context["notes"] if not n.startswith("تاریخ مبنا")]
    return evidence
