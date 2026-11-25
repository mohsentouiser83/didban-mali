"""Non-deletable company templates and source-backed Studio table adapters."""

from datetime import date
from decimal import Decimal, localcontext
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .errors import DomainError, require
from .report_studio_schemas import StudioGlobalFilters, StudioLayoutSpec, StudioWidgetSpec

SYSTEM_REPORTS = (
    ("journals", "دفتر روزنامه", "ledger", (("journal_lines", "ردیف‌های دفتر روزنامه"),)),
    (
        "statements",
        "صورت‌های مالی",
        "ledger",
        (("statement_metrics", "شاخص‌های مالی"), ("statement_accounts", "مانده حساب‌ها")),
    ),
    ("dimensions", "گزارش ابعاد مالی", "dimensions", (("dimension_totals", "درآمد و هزینه به تفکیک ابعاد"),)),
    ("payroll", "گزارش حقوق واردشده", "payroll", (("imported_payroll", "حقوق و کسورات"),)),
    ("cashflow", "جریان نقد دوره", "ledger", (("daily_cash", "گردش روزانه نقد"),)),
)


def template_id(company: str, key: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"didban:{company}:system-report:{key}"))


def template_key(company: str, identifier: str) -> str | None:
    return next((key for key, *_ in SYSTEM_REPORTS if template_id(company, key) == identifier), None)


def definitions(company: str) -> list[dict]:
    result = []
    for key, title, entity, widgets in SYSTEM_REPORTS:
        spec = StudioLayoutSpec.model_validate(
            {
                "title": title,
                "global_filters": {"period_id": "default-period", "basis": "all", "unit": "IRR"},
                "sections": [
                    {
                        "id": f"system-{key}",
                        "title": title,
                        "layout": "grid-1",
                        "widgets": [
                            {
                                "id": f"system-{metric}",
                                "title": label,
                                "type": "data_table",
                                "entity": entity,
                                "metric": metric,
                                "limit": 50,
                                "col_span": 12,
                            }
                            for metric, label in widgets
                        ],
                    }
                ],
            }
        )
        result.append(
            {
                "id": template_id(company, key),
                "name": title,
                "version": 1,
                "system_key": key,
                "can_delete": False,
                "is_dashboard": False,
                "created_at": None,
                "spec": spec.model_dump(),
            }
        )
    return result


TABLE_METRICS = {metric for _, _, _, widgets in SYSTEM_REPORTS for metric, _ in widgets}


def _manifest(db: Session, company: str, period: m.Period) -> m.ResultManifest | None:
    return db.scalar(
        select(m.ResultManifest)
        .where(
            m.ResultManifest.company_id == company,
            m.ResultManifest.period_id == period.id,
        )
        .order_by(m.ResultManifest.created_at.desc(), m.ResultManifest.id.desc())
        .limit(1)
    )


def evaluate_table(
    db: Session,
    company: str,
    period: m.Period,
    widget: StudioWidgetSpec,
    filters: StudioGlobalFilters,
    manifest: m.ResultManifest | None = None,
) -> dict:
    """Uses existing financial rules; never replaces unavailable values with zero."""
    metric = widget.metric
    require(widget.group_by == "none", "system_report_grouping", "این منبع جدول گروه‌بندی آماده دارد.")
    expected_basis = "bank" if metric == "daily_cash" else "ledger"
    require(
        filters.basis in {"all", expected_basis},
        "system_report_basis",
        "مبنای انتخاب‌شده با منبع این جدول سازگار نیست.",
    )
    require(not filters.dimension_id, "system_report_dimension", "فیلتر بُعد برای این جدول پشتیبانی نمی‌شود.")
    require(
        widget.filters.party_id is None
        and not widget.filters.overdue_only
        and widget.filters.direction == "all"
        and widget.filters.status is None
        and widget.filters.category is None,
        "system_report_filters",
        "این فیلتر برای منبع جدول پشتیبانی نمی‌شود.",
    )
    try:
        start = date.fromisoformat(filters.date_from) if filters.date_from else period.start
        end = date.fromisoformat(filters.date_to) if filters.date_to else period.end
    except ValueError as error:
        raise DomainError("invalid_report_date", "تاریخ گزارش معتبر نیست.") from error
    require(period.start <= start <= end <= period.end, "date_outside_period", "بازهٔ گزارش خارج از دوره است.")
    columns: list[tuple[str, str]] = []
    rows: list[dict] = []
    reason = None
    monetary: set[str] = set()
    source: dict = {}
    if metric == "journal_lines":
        from .accounting_models import Account
        from .posting_models import NativeJournal

        accounts = {row.id: row for row in db.scalars(select(Account).where(Account.company_id == company))}
        journals = db.scalars(
            select(NativeJournal)
            .where(
                NativeJournal.company_id == company,
                NativeJournal.period_id == period.id,
                NativeJournal.date >= start,
                NativeJournal.date <= end,
            )
            .order_by(NativeJournal.date, NativeJournal.sequence)
        ).all()
        columns = [
            ("sequence", "شماره سند"),
            ("date", "تاریخ"),
            ("account", "حساب"),
            ("description", "شرح"),
            ("debit", "بدهکار"),
            ("credit", "بستانکار"),
        ]
        monetary = {"debit", "credit"}
        source = {"basis": "native_book", "journal_ids": [row.id for row in journals]}
        for journal in journals:
            for line in journal.snapshot["lines"]:
                account = accounts.get(line["account_id"])
                rows.append(
                    {
                        "sequence": journal.snapshot.get("number", journal.sequence),
                        "date": journal.date.isoformat(),
                        "account": f"{line.get('code', account.code if account else line['account_id'])} · {line.get('name', account.name if account else '')}",
                        "description": line.get("description") or journal.snapshot.get("description"),
                        "debit": line["debit"],
                        "credit": line["credit"],
                    }
                )
    elif metric.startswith("statement_"):
        from .native_reporting_service import calculate_statement

        require(start == period.start, "statement_start", "ابتدای صورت مالی باید ابتدای دوره باشد.")
        snapshot = calculate_statement(db, company, period.id, end)
        source = {"basis": "native_book", "journal_ids": snapshot["journal_ids"], "as_of": snapshot["as_of"]}
        if metric == "statement_metrics":
            columns = [("label", "شاخص"), ("value", "مبلغ"), ("reason", "محدودیت")]
            rows = [
                {
                    "label": item["label"],
                    "value": item.get("value"),
                    "reason": "؛ ".join(_reason(code) for code in item.get("reason_codes", [])),
                }
                for item in snapshot["metrics"]
            ]
            monetary = {"value"}
        else:
            columns = [
                ("code", "کد حساب"),
                ("name", "حساب"),
                ("party_id", "طرف‌حساب"),
                ("debit", "بدهکار"),
                ("credit", "بستانکار"),
                ("cumulative_balance", "مانده تجمعی"),
            ]
            rows = snapshot["items"]
            monetary = {"debit", "credit", "cumulative_balance"}
            reason = "؛ ".join(_reason(code) for code in snapshot["opening_evidence"].get("reason_codes", []))
    elif metric == "imported_payroll":
        from .personnel_service import personnel_result

        result = personnel_result(db, company, "employee-reports", period.id, basis="imported")
        columns = [
            ("employee_name", "کارمند"),
            ("employee_id", "کد پرسنلی"),
            ("date", "تاریخ"),
            ("gross_pay", "ناخالص"),
            ("payroll_tax", "مالیات حقوق"),
            ("employee_insurance", "بیمه کارمند"),
            ("other_deductions", "سایر کسورات"),
            ("net_pay", "خالص"),
        ]
        rows = [
            {**item, **item["values"]}
            for item in result["items"]
            if start.isoformat() <= item["date"] <= end.isoformat()
        ]
        monetary = {key for key, _ in columns[3:]}
        reason = result.get("reason")
        source = {"basis": "imported", "manifest_id": result["manifest_id"]}
    else:
        selected = manifest or _manifest(db, company, period)
        require(
            selected is None or (selected.company_id == company and selected.period_id == period.id),
            "report_source_mismatch",
            "منبع گزارش با شرکت و دوره یکسان نیست.",
        )
        source = {"basis": "imported", "manifest_id": selected.id if selected else None}
        if metric == "daily_cash":
            columns = [("date", "تاریخ"), ("inflow", "ورودی"), ("outflow", "خروجی"), ("balance", "مانده")]
            rows = (
                [
                    item
                    for item in ((selected.details or {}).get("daily_cash") or [])
                    if start.isoformat() <= item["date"] <= end.isoformat()
                ]
                if selected
                else []
            )
            monetary = {"inflow", "outflow", "balance"}
            if not rows:
                reason = "گردش نقد این دوره در منبع موجود نیست."
            elif any(item.get("balance") is None for item in rows):
                reason = "پوشش یا ماندهٔ مبنای بانک کامل نیست؛ ماندهٔ روزانه ناموجود است."
        elif metric == "dimension_totals":
            from .dimensions_service import report

            require(
                start == period.start and end == period.end,
                "dimension_dates",
                "گزارش ابعاد، کل دوره را پوشش می‌دهد.",
            )
            columns = [
                ("code", "کد"),
                ("name", "بُعد"),
                ("revenue", "درآمد تخصیص‌یافته"),
                ("expense", "هزینه تخصیص‌یافته"),
                ("profit", "سود کامل"),
            ]
            monetary = {"revenue", "expense", "profit"}
            if selected:
                try:
                    result = report(db, company, selected.id, "cost_center")
                    rows, reason = result["buckets"], result.get("reason")
                except DomainError as error:
                    if error.status != 404:
                        raise
                    reason = error.message
            else:
                reason = "منبع دفتر این دوره موجود نیست."
    with localcontext() as context:
        context.prec = 60
        divisor = Decimal(10) if widget.unit == "TOMAN" else Decimal(1)
        display_rows = [
            {
                **row,
                **{
                    key: format(Decimal(str(row[key])) / divisor, "f") if row.get(key) is not None else None
                    for key in monetary
                },
            }
            for row in rows[: widget.limit]
        ]
    unit = "تومان" if widget.unit == "TOMAN" else "ریال"
    return {
        "columns": [
            {
                "key": key,
                "label": f"{label} ({unit})" if key in monetary else label,
                "format": "money"
                if key in monetary
                else "date"
                if key == "date"
                else "text",
            }
            for key, label in columns
        ],
        "rows": display_rows,
        "total_count": len(rows),
        "reason": reason,
        "source": source,
    }


def _reason(code: str) -> str:
    return {
        "unclassified_profit_accounts": "نقش بعضی حساب‌ها مشخص نیست؛ سود و زیان کامل نیست.",
        "unclassified_balance_accounts": "نقش بعضی حساب‌ها مشخص نیست؛ مانده کامل نیست.",
        "period_accounting_role_conflict": "نقش حساب با سند پایان یا آغاز دوره سازگار نیست.",
        "opening_evidence_missing": "افتتاحیه مشخص نشده؛ مانده قابل محاسبه نیست.",
    }.get(code, "مبنای افتتاحیه معتبر یا کامل نیست؛ مانده قابل محاسبه نیست.")
