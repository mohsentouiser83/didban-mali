"""Read-only receivables assistant. Models choose a tool, never invent financial prose."""

from collections import defaultdict
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Literal, Protocol
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.financial.models import Counterparty, SalesInvoice
from app.imports.models import ImportBatch, SourceFile, SourceRow

Intent = Literal["collection_priorities", "receivables_summary", "unsupported", "conversation"]


class AssistantQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    question: str = Field(min_length=1, max_length=1200)
    conversation_id: UUID | None = None


class AssistantPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    intent: Intent


class AssistantPlanner(Protocol):
    async def plan(self, question: str) -> AssistantPlan: ...


class InvoiceEvidence(BaseModel):
    invoice_id: UUID
    invoice_no: str
    remaining_amount_irr: str
    due_date: date | None
    delay_days: int
    import_batch_id: UUID | None
    filename: str | None
    sheet: str | None
    row_number: int | None


class CollectionPriority(BaseModel):
    customer_id: UUID
    customer_name: str
    overdue_amount_irr: str
    max_delay_days: int
    overdue_invoice_count: int
    evidence: list[InvoiceEvidence]
    omitted_evidence_count: int


class AssistantAnswer(BaseModel):
    request_id: UUID = Field(default_factory=uuid4)
    conversation_id: UUID | None = None
    sources: list[dict[str, str]] = Field(default_factory=list)
    facts: list[dict[str, str]] = Field(default_factory=list)
    intent: Intent
    mode: Literal["rules", "model", "fallback"]
    status: Literal["answered", "no_data", "unsupported"]
    answer_fa: str
    as_of_date: date
    latest_invoice_date: date | None = None
    latest_imported_at: datetime | None = None
    total_outstanding_irr: str | None = None
    total_overdue_irr: str | None = None
    customer_count: int = 0
    priorities: list[CollectionPriority] = Field(default_factory=list)
    caveats_fa: list[str] = Field(default_factory=list)


SUGGESTIONS = [
    "کدام مطالبات را امروز پیگیری کنیم؟",
    "خلاصه مطالبات شرکت چیست؟",
]


def rule_plan(question: str) -> AssistantPlan:
    normalized = question.replace("ي", "ی").replace("ك", "ک").replace("\u200c", " ").lower()
    # The offline path recognizes complete examples only. It must not silently answer
    # a customer-specific, dated, mixed-topic or mutation request as a company-wide query.
    normalized = " ".join(normalized.strip(" ؟?!.،").split())
    intents = {
        "کدام مطالبات را امروز پیگیری کنیم": "collection_priorities",
        "کدام مشتریان را امروز پیگیری کنیم": "collection_priorities",
        "خلاصه مطالبات شرکت چیست": "receivables_summary",
        "کل مطالبات شرکت چقدر است": "receivables_summary",
    }
    return AssistantPlan(intent=intents.get(normalized, "unsupported"))


def receivables_query(company_id: UUID, as_of: date):
    # Explicit predicates supplement company access and PostgreSQL RLS at every join.
    return (
        select(SalesInvoice, Counterparty, SourceRow, ImportBatch, SourceFile)
        .join(
            Counterparty,
            and_(
                Counterparty.id == SalesInvoice.counterparty_id,
                Counterparty.company_id == company_id,
            ),
        )
        .outerjoin(
            SourceRow,
            and_(SourceRow.id == SalesInvoice.source_row_id, SourceRow.company_id == company_id),
        )
        .outerjoin(
            ImportBatch,
            and_(ImportBatch.id == SourceRow.import_batch_id, ImportBatch.company_id == company_id),
        )
        .outerjoin(
            SourceFile,
            and_(SourceFile.id == ImportBatch.file_id, SourceFile.company_id == company_id),
        )
        .where(SalesInvoice.company_id == company_id, SalesInvoice.issue_date <= as_of)
    )


async def answer_question(
    session: AsyncSession,
    company_id: UUID,
    question: str,
    planner: AssistantPlanner | None = None,
) -> AssistantAnswer:
    today = datetime.now(ZoneInfo("Asia/Tehran")).date()
    mode = "rules"
    caveats: list[str] = []
    if planner is None:
        plan = rule_plan(question)
        caveats.append("مدل زبانی متصل نیست؛ در این حالت فقط پرسش‌های پیشنهادی پاسخ داده می‌شوند.")
    else:
        try:
            plan = await planner.plan(question)
            mode = "model"
        except Exception:
            # No provider payload, question or exception text is exposed or logged.
            plan = rule_plan(question)
            mode = "fallback"
            caveats.append(
                "مدل زبانی پاسخ معتبر نداد؛ پاسخ پرسش پیشنهادی با محاسبات دیدبان تهیه شده است."
            )

    answer = AssistantAnswer(
        intent=plan.intent,
        mode=mode,
        status="unsupported",
        as_of_date=today,
        answer_fa="فعلاً خلاصه مطالبات و اولویت پیگیری امروز را بررسی می‌کنم. یکی از پرسش‌های پیشنهادی را انتخاب کنید؛ بررسی مشتری مشخص، تاریخ دیگر و تغییر اطلاعات هنوز پشتیبانی نمی‌شود.",
        caveats_fa=caveats,
    )
    if plan.intent == "unsupported":
        return answer

    rows = (await session.execute(receivables_query(company_id, today))).all()
    if not rows:
        answer.status = "no_data"
        answer.answer_fa = (
            "فاکتور فروشی تا تاریخ مبنا ثبت نشده است. برای بررسی مطالبات، فایل فروش را اضافه کنید."
        )
        return answer

    answer.latest_invoice_date = max(invoice.issue_date for invoice, *_ in rows)
    upload_dates = [file.created_at for *_, file in rows if file is not None]
    answer.latest_imported_at = max(upload_dates) if upload_dates else None
    total, overdue = Decimal(0), Decimal(0)
    open_customers: set[UUID] = set()
    grouped: dict[UUID, list[InvoiceEvidence]] = defaultdict(list)
    names: dict[UUID, str] = {}
    unknown_dates = 0
    missing_evidence = False
    for invoice, customer, source, batch, file in rows:
        remaining = invoice.gross_amount_irr - (invoice.paid_amount_irr or Decimal(0))
        if remaining <= 0:
            continue
        total += remaining
        open_customers.add(customer.id)
        if invoice.due_date is None:
            unknown_dates += 1
            continue
        delay = (today - invoice.due_date).days
        if delay <= 0:
            continue
        overdue += remaining
        names[customer.id] = customer.name
        missing_evidence |= source is None or batch is None or file is None
        grouped[customer.id].append(
            InvoiceEvidence(
                invoice_id=invoice.id,
                invoice_no=invoice.invoice_no,
                remaining_amount_irr=format(remaining, "f"),
                due_date=invoice.due_date,
                delay_days=delay,
                import_batch_id=batch.id if batch and source and file else None,
                filename=file.original_name if file else None,
                sheet=source.sheet if source else None,
                row_number=source.row_number if source else None,
            )
        )
    priorities = []
    for customer_id, evidence in grouped.items():
        evidence.sort(
            key=lambda item: (
                -item.delay_days,
                -Decimal(item.remaining_amount_irr),
                str(item.invoice_id),
            )
        )
        priorities.append(
            CollectionPriority(
                customer_id=customer_id,
                customer_name=names[customer_id],
                overdue_amount_irr=format(
                    sum((Decimal(item.remaining_amount_irr) for item in evidence), Decimal(0)), "f"
                ),
                max_delay_days=max(item.delay_days for item in evidence),
                overdue_invoice_count=len(evidence),
                evidence=evidence[:3],
                omitted_evidence_count=max(0, len(evidence) - 3),
            )
        )
    priorities.sort(
        key=lambda item: (
            -Decimal(item.overdue_amount_irr),
            -item.max_delay_days,
            str(item.customer_id),
        )
    )
    answer.status = "answered"
    answer.total_outstanding_irr = format(total, "f")
    answer.total_overdue_irr = format(overdue, "f")
    answer.customer_count = len(open_customers)
    answer.priorities = priorities[:5]
    answer.answer_fa = (
        (
            "پیگیری را از مشتریان زیر شروع کنید؛ ترتیب بر اساس مبلغ سررسیدگذشته و سپس بیشترین تأخیر است."
            if overdue > 0
            else "در فاکتورهای دارای سررسید ثبت‌شده، مطالبه سررسیدگذشته‌ای پیدا نشد."
        )
        if plan.intent == "collection_priorities"
        else "خلاصه مطالبات بر اساس مانده فاکتورهای ثبت‌شده تا امروز محاسبه شده است."
    )
    answer.caveats_fa.append(
        "مبالغ بر اساس آخرین وضعیت ثبت‌شده فاکتورها هستند؛ پرداخت‌های ثبت‌نشده در محاسبه لحاظ نمی‌شوند. تاریخ مبنا، تاریخ آخرین دریافت داده نیست."
    )
    if answer.latest_imported_at is None:
        answer.caveats_fa.append(
            "زمان دریافت فایل‌های منبع در دسترس نیست؛ تازگی داده قابل تأیید نیست."
        )
    else:
        imported = answer.latest_imported_at
        if imported.tzinfo is None:
            imported = imported.replace(tzinfo=UTC)
        if (datetime.now(UTC) - imported).days > 3:
            answer.caveats_fa.append(
                "از دریافت فایل منبع بیش از سه روز گذشته است؛ پیش از اقدام، وضعیت وصول را به‌روز کنید."
            )
    if unknown_dates:
        answer.caveats_fa.append(
            "برخی فاکتورها سررسید ندارند؛ در کل مطالبات منظور شده‌اند، اما وضعیت تأخیر آن‌ها قابل محاسبه نیست."
        )
    if missing_evidence:
        answer.caveats_fa.append("نشانی فایل یا ردیف منبع بعضی فاکتورها در دسترس نیست.")
    if len(priorities) > 5:
        answer.caveats_fa.append(
            "فقط پنج مشتری نخست نمایش داده می‌شوند؛ جمع مبالغ شامل همه مشتریان است."
        )
    return answer
