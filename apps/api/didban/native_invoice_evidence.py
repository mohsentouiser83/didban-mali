"""Proof that operational metadata matches exact approved native financial evidence."""

from datetime import date, datetime
from decimal import Decimal, localcontext
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_models import Draft
from .accounting_setup_models import CompanyAccountingSetup
from .errors import require
from .module_service import require_module
from .money_type import canonical_money
from .native_reporting_models import NativeAccountRole
from .operation_models import OperationDraft
from .operation_service import PAIRS, POLICY, build
from .posting_models import NativeJournal
from .security import membership
from .services import get_entity

KINDS = {"sale_service", "purchase_service", "receipt", "payment"}
ACCOUNT_ROLES = {
    "trade_receivable": "trade_receivable",
    "trade_payable": "trade_payable",
    "service_revenue": "revenue",
    "service_expense": "expense",
    "bank_a": "bank",
}


def _today(db: Session, company: str) -> date:
    return datetime.now(ZoneInfo(db.get(m.Company, company).timezone)).date()


def _access(
    db: Session,
    company: str,
    user: m.User,
    direction: str | None = None,
    write: bool = False,
    authoring: bool = False,
) -> None:
    require(user.active, "permission_denied", "حساب کاربری غیرفعال است.", 403)
    membership(db, company, user, "write" if write else "read")
    if write or authoring:
        setup = db.get(CompanyAccountingSetup, company)
        require(
            setup is not None and setup.mode == "primary",
            "primary_accounting_required",
            "کاربرد حسابداری اصلی لازم است.",
            409,
        )
    if direction:
        require(direction in ("sale", "purchase"), "invalid_direction", "نوع فاکتور معتبر نیست.")
        if write or authoring:
            require_module(db, company, "receivables" if direction == "sale" else "payables", ready=False)


def _proof(db: Session, company: str, operation_id: str, as_of: date, journal_id: str | None = None) -> dict:
    op = get_entity(db, OperationDraft, company, operation_id)
    require(
        op.kind in KINDS and op.policy_version == POLICY,
        "native_invoice_operation",
        "نوع عملیات مرجع معتبر نیست.",
        409,
    )
    journal = db.scalar(
        select(NativeJournal).where(
            NativeJournal.company_id == company, NativeJournal.draft_id == op.draft_id
        )
    )
    if journal_id is not None and journal is not None and journal_id != journal.id:
        return _replacement_proof(db, company, op, journal, journal_id, as_of)
    require(
        journal is not None and not journal.reversal_of,
        "native_invoice_unposted",
        "عملیات باید ثبت نهایی شده باشد.",
        409,
    )
    require(
        not db.scalar(
            select(NativeJournal.id).where(
                NativeJournal.company_id == company,
                NativeJournal.reversal_of == journal.id,
                NativeJournal.date <= as_of,
            )
        ),
        "native_invoice_source_reversed",
        "سند مرجع برگشت شده است.",
        409,
    )
    draft = get_entity(db, Draft, company, op.draft_id)
    data = dict(op.payload)
    data["date"] = date.fromisoformat(data["date"])
    require(
        data["date"] <= as_of and data["date"] <= _today(db, company),
        "native_invoice_future_source",
        "تاریخ سند مرجع در آینده است.",
        409,
    )
    require(
        bool(data["party_id"].strip()) and data["party_id"] == data["party_id"].strip(),
        "native_invoice_party",
        "طرف حساب صریح لازم است.",
        409,
    )
    require(
        draft.state == "posted"
        and journal.date == data["date"]
        and journal.period_id == data["period_id"]
        and journal.snapshot.get("original_unit") == data["unit"],
        "native_invoice_source_changed",
        "تاریخ، دوره یا واحد سند تغییر کرده است.",
        409,
    )
    with localcontext() as ctx:
        ctx.prec = 60
        factor = 10 if data["unit"] == "TOMAN" else 1
        expected = [
            (
                x.get("party_id", ""),
                canonical_money(Decimal(x["debit"]) * factor),
                canonical_money(Decimal(x["credit"]) * factor),
            )
            for x in build(data)
        ]
        actual = [
            (x.get("party_id", ""), canonical_money(x["debit"]), canonical_money(x["credit"]))
            for x in journal.snapshot["lines"]
        ]
        require(
            actual == expected,
            "native_invoice_source_changed",
            "مبلغ یا طرف حساب سند با عملیات برابر نیست.",
            409,
        )
        # Profile equality proves an account-only correction, not the meaning
        # of its actual approved account. Known semantics must still agree.
        for template_role, line in zip(PAIRS[op.kind], journal.snapshot["lines"], strict=True):
            assignment = db.scalar(
                select(NativeAccountRole).where(
                    NativeAccountRole.company_id == company,
                    NativeAccountRole.account_id == line["account_id"],
                )
            )
            require(
                assignment is None
                or assignment.role is None
                or assignment.role == ACCOUNT_ROLES[template_role],
                "native_invoice_role_conflict",
                "نقش صریح حساب سند با نوع عملیات برابر نیست.",
                409,
            )
        amount = canonical_money(Decimal(data["amounts"]["amount"]) * factor)
    return {
        "operation_id": op.id,
        "kind": op.kind,
        "journal_id": journal.id,
        "journal_digest": journal.digest,
        "approved_draft_version": journal.draft_version,
        "reference": op.source_reference,
        "party_id": data["party_id"],
        "date": data["date"].isoformat(),
        "amount": amount,
        "unit": data["unit"],
    }


def _replacement_proof(
    db: Session, company: str, op: OperationDraft, original: NativeJournal, journal_id: str, as_of: date
) -> dict:
    journal = get_entity(db, NativeJournal, company, journal_id)
    require(
        not journal.reversal_of and journal.date <= as_of and journal.date <= _today(db, company),
        "native_invoice_replacement_unsupported",
        "سند جایگزین معتبر و تاریخ‌دار لازم است.",
        409,
    )
    cursor = journal
    visited = set()
    while cursor.id != original.id:
        require(
            cursor.id not in visited and bool(cursor.replacement_of),
            "native_invoice_replacement_lineage",
            "سند باید جایگزین مرتبط با همین عملیات باشد.",
            409,
        )
        visited.add(cursor.id)
        parent = get_entity(db, NativeJournal, company, cursor.replacement_of)
        require(
            db.scalar(
                select(NativeJournal.id).where(
                    NativeJournal.company_id == company,
                    NativeJournal.reversal_of == parent.id,
                    NativeJournal.date <= as_of,
                )
            )
            is not None,
            "native_invoice_replacement_unreversed_parent",
            "برگشت سند قبلی در این تاریخ معتبر نیست.",
            409,
        )
        cursor = parent
    require(
        not db.scalar(
            select(NativeJournal.id).where(
                NativeJournal.company_id == company,
                NativeJournal.reversal_of == journal.id,
                NativeJournal.date <= as_of,
            )
        ),
        "native_invoice_source_reversed",
        "سند جایگزین برگشت شده است.",
        409,
    )
    draft = get_entity(db, Draft, company, journal.draft_id)
    lines = journal.snapshot["lines"]
    unit = journal.snapshot.get("original_unit")
    require(
        draft.state == "posted"
        and len(lines) == 2
        and unit in ("IRR", "TOMAN")
        and journal.date >= date.fromisoformat(op.payload["date"]),
        "native_invoice_replacement_unsupported",
        "جایگزین باید دو ردیف خدمات یا تسویه با واحد معتبر داشته باشد.",
        409,
    )
    party = lines[0].get("party_id", "")
    require(
        bool(party.strip()) and party == party.strip() and lines[1].get("party_id", "") == party,
        "native_invoice_replacement_party",
        "طرف حساب صریح و یکسان در دو ردیف لازم است.",
        409,
    )
    with localcontext() as context:
        context.prec = 60
        amount = canonical_money(lines[0]["debit"])
        require(
            Decimal(amount) > 0
            and Decimal(lines[0]["credit"]) == 0
            and Decimal(lines[1]["debit"]) == 0
            and canonical_money(lines[1]["credit"]) == amount,
            "native_invoice_replacement_unsupported",
            "ردیف‌های جایگزین با الگوی ساده عملیات برابر نیستند.",
            409,
        )
        factor = 10 if unit == "TOMAN" else 1
        for template_role, line in zip(PAIRS[op.kind], lines, strict=True):
            require(
                canonical_money(Decimal(line["original_debit"]) * factor) == canonical_money(line["debit"])
                and canonical_money(Decimal(line["original_credit"]) * factor)
                == canonical_money(line["credit"]),
                "native_invoice_replacement_unit",
                "واحد و مبلغ سند جایگزین سازگار نیستند.",
                409,
            )
            assignment = db.scalar(
                select(NativeAccountRole).where(
                    NativeAccountRole.company_id == company,
                    NativeAccountRole.account_id == line["account_id"],
                )
            )
            require(
                assignment is None
                or assignment.role is None
                or assignment.role == ACCOUNT_ROLES[template_role],
                "native_invoice_role_conflict",
                "نقش صریح حساب سند با نوع عملیات برابر نیست.",
                409,
            )
    return {
        "operation_id": op.id,
        "kind": op.kind,
        "journal_id": journal.id,
        "journal_digest": journal.digest,
        "approved_draft_version": journal.draft_version,
        "reference": op.source_reference,
        "party_id": party,
        "date": journal.date.isoformat(),
        "amount": amount,
        "unit": unit,
        "replacement_of": journal.replacement_of,
    }
