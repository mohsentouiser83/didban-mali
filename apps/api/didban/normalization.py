"""Convert validated interpretations into traceable canonical facts."""

from decimal import Decimal, localcontext

from .errors import DomainError, require
from .ingestion import money, normalized, parsed_date
from .models import (
    BankMovement,
    Interpretation,
    Invoice,
    InvoiceSnapshot,
    JournalLine,
    PersonnelRecord,
    PlannedPayment,
    Settlement,
    SourceRow,
)

ROLES = {
    "revenue",
    "other_income",
    "operating_expense",
    "payroll_expense",
    "income_tax_expense",
    "cogs",
    "bank_fee",
    "trade_ar",
    "other_ar",
    "trade_ap",
    "loan_payable",
    "payroll_payable",
    "tax_payable",
    "other_payable",
    "inventory",
    "capital",
    "asset",
    "cash",
    "bank",
}
ENTRY_TYPES = {
    "regular",
    "opening",
    "closing",
    "closing_transfer",
    "profit_transfer",
    "balance_transfer",
    "adjustment",
    "real_cogs_adjustment",
}


def journal_entry_type_key(entry_id: str, date: str, row_id: str) -> str:
    return f"{entry_id}|{date}" if entry_id else f"row:{row_id}"


def moadian_portal_state(subject: str, status: str) -> str:
    subject = normalized(subject)
    if subject == "اصلی":
        status = normalized(status).replace("تأیید", "تایید")
        return "original" if status in {"تایید شده", "تایید سیستمی"} else "portal_status_review"
    return {
        "اصلاحی": "correction",
        "ابطالی": "cancellation",
        "برگشت از فروش": "return",
    }.get(subject, "portal_subject_review")


def normalize(row: SourceRow, interpretation: Interpretation, session_id: str) -> object | None:
    mapping = interpretation.mapping

    def get(key: str) -> str:
        return str(row.values.get(mapping.get(key, ""), "") or "").strip()

    unit = get("currency") or interpretation.unit or ""
    calendar = interpretation.calendar or ""
    family = interpretation.family
    for field in (
        "entry_id",
        "account",
        "reference",
        "invoice_id",
        "party_id",
        "event_id",
        "plan_id",
        "obligation_id",
        "tax_id",
        "parent_reference",
        "bank_account",
        "bank_reference",
    ):
        require(len(get(field)) <= 100, "identifier_too_long", "شناسه مالی بیش از حد طولانی است.")
    # Text formulas may be evidence, but no formula-dependent financial values are accepted.
    for field in (
        "amount",
        "debit",
        "credit",
        "balance",
        "tax",
        "total_obligation",
        "paid_as_of",
        "date",
        "due_date",
        "paid_on",
    ):
        require(
            not get(field).startswith(("=", "+=")),
            "formula_requires_values",
            "سلول مالی فرمول دارد؛ خروجی مقدار ثابت بارگذاری کنید.",
        )
    base = {
        "company_id": row.company_id,
        "source_row_id": row.id,
        "session_id": session_id,
        "original_unit": unit,
        "original_amount": get("amount") or get("debit") or get("total_obligation"),
    }
    date = (
        parsed_date(get("date"), calendar) if family != "history" else parsed_date(get("paid_on"), calendar)
    )
    if family in ("employees", "payroll"):
        employee_id, name = get("employee_id"), get("employee_name")
        require(bool(employee_id and name) and len(employee_id) <= 100 and len(name) <= 150,
                "employee_identity_missing", "کد و نام کارمند معتبر نیست.")
        values = {}
        if family == "payroll":
            fields = ("gross_pay", "net_pay", "payroll_tax", "employee_insurance", "employer_insurance", "other_deductions")
            values = {field: money(get(field), unit) for field in fields}
            require(all(Decimal(value) >= 0 for value in values.values()), "invalid_payroll", "مبلغ حقوق و کسورات نباید منفی باشد.")
            with localcontext() as context:
                context.prec = 50
                expected_net = Decimal(values["gross_pay"]) - sum((Decimal(values[k]) for k in ("payroll_tax", "employee_insurance", "other_deductions")), Decimal(0))
            require(expected_net == Decimal(values["net_pay"]), "payroll_not_balanced", "خالص حقوق با ناخالص و کسورات برابر نیست.")
        return PersonnelRecord(**base, kind=family, employee_id=employee_id,
                               employee_name=name, date=date, values=values)
    if family == "ledger":
        require(
            bool(get("account")),
            "journal_identity_missing",
            "حساب باید مشخص باشد.",
        )
        role = interpretation.evidence.get("role_overrides", {}).get(get("account")) or get("role")
        valid_role = role in ROLES or role.startswith("bank_")
        require(valid_role, "account_role_ambiguous", "نقش حساب روشن نیست؛ فایل با نقش معتبر تکمیل شود.")
        entry_id = get("entry_id")
        entry_key = journal_entry_type_key(entry_id, date.isoformat(), row.id)
        entry_type = interpretation.evidence.get("entry_type_overrides", {}).get(entry_key) or get(
            "entry_type"
        )
        require(entry_type in ENTRY_TYPES, "entry_type_ambiguous", "نوع سند روشن نیست.")
        debit, credit = money(get("debit"), unit), money(get("credit"), unit)
        require(
            Decimal(debit) >= 0 and Decimal(credit) >= 0 and not (Decimal(debit) and Decimal(credit)),
            "invalid_journal_line",
            "بدهکار و بستانکار ردیف معتبر نیست.",
        )
        return JournalLine(
            **base,
            entry_id=entry_id,
            date=date,
            account=get("account"),
            role=role,
            party_id=get("party_id"),
            debit=debit,
            credit=credit,
            entry_type=entry_type,
            reference=get("reference"),
        )
    if family == "bank":
        account = interpretation.evidence.get("account") or get("account") or row.sheet
        require(
            account.casefold() not in {"csv", "sheet", "sheet1", "شیت ۱", "شیت۱"},
            "bank_account_ambiguous",
            "شناسه حساب بانکی در فایل مشخص نیست.",
        )
        kind = get("row_type") or "movement"
        balance = money(get("balance"), unit) if get("balance") else None
        cutoff = (
            interpretation.evidence.get("anchor_cutoff")
            or get("anchor_cutoff")
            or ("start_of_day" if kind == "opening" else None)
        )
        require(
            not (
                balance is not None
                and kind in ("opening", "anchor", "snapshot", "balance_anchor")
                and cutoff not in ("start_of_day", "end_of_day")
            ),
            "anchor_cutoff_ambiguous",
            "برش مانده مبنا مشخص نیست.",
        )
        return BankMovement(
            **base,
            account=account,
            date=date,
            amount=money(get("amount"), unit),
            balance=balance,
            reference=get("reference"),
            party_id=get("party_id"),
            kind=kind,
            anchor_cutoff=cutoff,
        )
    if family in ("sales", "purchases"):
        require(
            bool(get("invoice_id") and get("party_id")),
            "invoice_identity_missing",
            "شماره فاکتور و طرف حساب باید مشخص باشند.",
        )
        amount = money(get("amount"), unit)
        require(
            Decimal(amount) >= 0,
            "invoice_adjustment_requires_review",
            "فاکتور منفی به زنجیره اصلاح معتبر نیاز دارد.",
        )
        return Invoice(
            **base,
            reference=get("invoice_id"),
            party_id=get("party_id"),
            date=date,
            due_date=parsed_date(get("due_date"), calendar) if get("due_date") else None,
            amount=amount,
            direction=family,
            tax=money(get("tax"), unit) if get("tax") else None,
            tax_id=get("tax_id") or None,
        )
    if family == "settlements":
        require(
            bool(get("event_id") and get("invoice_id")),
            "settlement_identity_missing",
            "شناسه پرداخت و فاکتور باید مشخص باشند.",
        )
        direction = get("direction")
        require(
            direction in ("receipt", "payment"), "settlement_direction", "جهت دریافت یا پرداخت مشخص نیست."
        )
        amount = money(get("amount"), unit)
        require(Decimal(amount) > 0, "invalid_settlement", "مبلغ دریافت یا پرداخت باید مثبت باشد.")
        return Settlement(
            **base,
            bank_account=get("bank_account") or get("account") or None,
            bank_reference=get("bank_reference") or get("reference") or None,
            reference=get("event_id"),
            invoice_reference=get("invoice_id"),
            date=date,
            amount=amount,
            direction=direction,
        )
    if family.startswith("moadian_"):
        state = get("kind")
        if "portal_status" in mapping:
            state = moadian_portal_state(state, get("portal_status"))
        return InvoiceSnapshot(
            **base,
            party_id=get("party_id") or None,
            reference=get("invoice_id"),
            tax_id=get("tax_id"),
            amount=money(get("amount"), unit),
            tax=money(get("tax"), unit) if get("tax") else None,
            date=date,
            direction="purchases" if family.endswith("purchases") else "sales",
            state=state,
            parent_reference=get("parent_reference") or None,
        )
    if family == "plans":
        require(
            bool(get("plan_id") and get("obligation_id")),
            "obligation_identity_missing",
            "شناسه برنامه و تعهد باید مشخص باشند.",
        )
        total, paid = Decimal(money(get("total_obligation"), unit)), Decimal(money(get("paid_as_of"), unit))
        require(total >= paid >= 0, "invalid_obligation", "مبلغ پرداخت‌شده از تعهد بیشتر است.")
        return PlannedPayment(
            company_id=row.company_id,
            source_row_id=row.id,
            session_id=session_id,
            label=get("plan_id"),
            amount=exact_difference(total, paid),
            due_date=date,
            obligation_id=get("obligation_id"),
            invoice_reference=get("invoice_id") or None,
            state="confirmed" if get("confirmed").lower() in ("true", "1", "بله") else "proposed",
        )
    if family == "history":
        # Kept in immutable source rows as calibration evidence, never a second settlement.
        money(get("amount"), unit)
        parsed_date(get("due_date"), calendar)
        return None
    raise DomainError("unknown_source_family", "نوع منبع مشخص نیست.")


def exact_difference(total: Decimal, paid: Decimal) -> str:
    with localcontext() as context:
        context.prec = 50
        return format(total - paid, "f")
