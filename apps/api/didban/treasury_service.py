"""Operational treasury accounts (bank, cashbox, petty cash) and receipt/payment documents."""

import re
from datetime import date
from decimal import Decimal, localcontext
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_models import Account
from .accounting_service import capabilities, save_account
from .cheque_models import Cheque, ChequeClearance
from .commercial_models import CommercialCounterparty
from .commercial_service import resolve_counterparty, resolve_counterparty_id
from .errors import DomainError, require
from .finance import ANCHOR_KINDS
from .ingestion import money
from .money_type import canonical_money
from .native_invoice_models import (
    NativeInvoice,
    NativeInvoiceAllocation,
    NativeInvoiceAllocationReversal,
)
from .native_reporting_models import NativeAccountRole
from .numbering_service import allocate_number
from .period_lock_service import require_open_period
from .security import membership
from .services import check_version, get_entity
from .treasury_models import TreasuryAccount, TreasuryAllocation, TreasuryDocument, TreasuryToolLine
from .workflow import audit, serialize_fact

IBAN_RE = re.compile(r"^IR[0-9]{24}$")
DIGITS_OR_DASH_RE = re.compile(r"^[0-9A-Za-z\-/]{3,60}$")


def bank_movement_used_amount(db: Session, company: str, bank_id: str) -> Decimal:
    """Total canonical IRR committed against a BankMovement across allocations, clearances, and treasury tools."""
    with localcontext() as ctx:
        ctx.prec = 60
        used_alloc = sum(
            (
                Decimal(row.amount)
                for row in db.scalars(
                    select(m.Allocation).where(
                        m.Allocation.company_id == company,
                        m.Allocation.bank_id == bank_id,
                        m.Allocation.reversed_at.is_(None),
                    )
                )
            ),
            Decimal(0),
        )
        used_cheque = sum(
            (
                Decimal(row.amount)
                for row in db.scalars(
                    select(ChequeClearance).where(
                        ChequeClearance.company_id == company,
                        ChequeClearance.bank_id == bank_id,
                    )
                )
            ),
            Decimal(0),
        )
        used_tools = sum(
            (
                Decimal(line.amount)
                for line, doc in db.execute(
                    select(TreasuryToolLine, TreasuryDocument)
                    .join(
                        TreasuryDocument,
                        (TreasuryDocument.company_id == TreasuryToolLine.company_id)
                        & (TreasuryDocument.id == TreasuryToolLine.document_id),
                    )
                    .where(
                        TreasuryToolLine.company_id == company,
                        TreasuryToolLine.bank_movement_id == bank_id,
                        TreasuryDocument.state != "reversed",
                    )
                ).all()
            ),
            Decimal(0),
        )
        return used_alloc + used_cheque + used_tools


def _validate_treasury_fields(kind: str, data: dict[str, Any]) -> None:
    if data.get("iban"):
        iban = str(data["iban"]).strip().upper()
        require(bool(IBAN_RE.fullmatch(iban)), "invalid_iban", "شماره شبا باید با IR شروع شود و ۲۶ کاراکتر باشد.")
        data["iban"] = iban
    if data.get("account_number"):
        acc_no = str(data["account_number"]).strip()
        require(
            bool(DIGITS_OR_DASH_RE.fullmatch(acc_no)),
            "invalid_bank_account_number",
            "شماره حساب بانکی معتبر نیست.",
        )
    if kind == "petty_cash" and data.get("petty_cash_limit_irr") is not None:
        val = Decimal(canonical_money(data["petty_cash_limit_irr"]))
        require(val >= 0, "invalid_petty_cash_limit", "سقف تنخواه نمی‌تواند منفی باشد.")
        data["petty_cash_limit_irr"] = canonical_money(val)


def _serialize_treasury_account(db: Session, company: str, item: TreasuryAccount) -> dict[str, Any]:
    acc = db.get(Account, item.account_id)
    data = serialize_fact(item)
    data["account_code"] = acc.code if acc else None
    data["account_name"] = acc.name if acc else None
    return data


def list_treasury_accounts(
    db: Session,
    company: str,
    user: m.User,
    kind: str | None = None,
    active_only: bool = False,
) -> dict[str, Any]:
    membership(db, company, user, "read")
    stmt = select(TreasuryAccount).where(TreasuryAccount.company_id == company)
    if kind:
        stmt = stmt.where(TreasuryAccount.kind == kind)
    if active_only:
        stmt = stmt.where(TreasuryAccount.active.is_(True))
    items = list(db.scalars(stmt.order_by(TreasuryAccount.kind.asc(), TreasuryAccount.name.asc())))
    return {"items": [_serialize_treasury_account(db, company, row) for row in items]}


def create_treasury_account(
    db: Session,
    company: str,
    user: m.User,
    data: dict[str, Any],
) -> dict[str, Any]:
    require(
        capabilities(db, company, user)["can_manage_accounts"],
        "permission_denied",
        "اجازه تعریف حساب خزانه ندارید.",
        403,
    )
    kind = data["kind"]
    _validate_treasury_fields(kind, data)
    account_id = data.get("account_id")
    if account_id:
        acc = get_entity(db, Account, company, account_id)
        require(acc.active, "inactive_account", "حساب دفتر غیرفعال است.", 409)
        from .account_catalogue_service import require_postable_account

        require_postable_account(db, company, acc)
        existing_link = db.scalar(
            select(TreasuryAccount.id).where(
                TreasuryAccount.company_id == company, TreasuryAccount.account_id == acc.id
            )
        )
        require(
            existing_link is None,
            "treasury_account_exists",
            "این حساب دفتر قبلاً به یک حساب خزانه متصل شده است.",
            409,
        )
        role_row = db.scalar(
            select(NativeAccountRole).where(
                NativeAccountRole.company_id == company, NativeAccountRole.account_id == acc.id
            )
        )
        if role_row and role_row.role:
            require(
                role_row.role in (kind, "cash_bank"),
                "invalid_account_role",
                "نقش حساب دفتر با نوع حساب خزانه سازگار نیست.",
                409,
            )
        elif not role_row:
            db.add(
                NativeAccountRole(
                    company_id=company, account_id=acc.id, role=kind, actor_id=user.id, version=1
                )
            )
            db.flush()
    else:
        acc_payload = {
            "name": data["name"],
            "nature": "debit",
            "active": data.get("active", True),
            "role": kind,
        }
        if data.get("code"):
            acc_payload["code"] = data["code"]
        if data.get("level"):
            acc_payload["level"] = data["level"]
        if data.get("parent_account_id"):
            acc_payload["parent_id"] = data["parent_account_id"]
        created_acc = save_account(db, company, user, acc_payload)
        account_id = created_acc["id"]

    custodian_cp_id = data.get("custodian_counterparty_id")
    if custodian_cp_id:
        get_entity(db, CommercialCounterparty, company, custodian_cp_id)

    item = TreasuryAccount(
        company_id=company,
        kind=kind,
        name=data["name"],
        account_id=account_id,
        active=data.get("active", True),
        bank_name=data.get("bank_name"),
        account_number=data.get("account_number"),
        iban=data.get("iban"),
        branch_name=data.get("branch_name"),
        branch_code=data.get("branch_code"),
        custodian_name=data.get("custodian_name"),
        custodian_counterparty_id=custodian_cp_id,
        petty_cash_limit_irr=data.get("petty_cash_limit_irr"),
        needs_completion=False,
    )
    db.add(item)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "treasury.account_created",
        item.id,
        {"kind": kind, "account_id": account_id},
    )
    return _serialize_treasury_account(db, company, item)


def update_treasury_account(
    db: Session,
    company: str,
    user: m.User,
    treasury_id: str,
    data: dict[str, Any],
    expected_version: int,
) -> dict[str, Any]:
    require(
        capabilities(db, company, user)["can_manage_accounts"],
        "permission_denied",
        "اجازه ویرایش حساب خزانه ندارید.",
        403,
    )
    item = get_entity(db, TreasuryAccount, company, treasury_id)
    check_version(item, expected_version)
    _validate_treasury_fields(item.kind, data)
    if data.get("custodian_counterparty_id"):
        get_entity(db, CommercialCounterparty, company, data["custodian_counterparty_id"])
    for field in (
        "name",
        "active",
        "bank_name",
        "account_number",
        "iban",
        "branch_name",
        "branch_code",
        "custodian_name",
        "custodian_counterparty_id",
        "petty_cash_limit_irr",
    ):
        if field in data:
            if field in ("name", "active") and data[field] is None:
                raise DomainError("invalid_field_value", f"فیلد «{field}» نمی‌تواند خالی باشد.")
            setattr(item, field, data[field])
    item.needs_completion = False
    item.version += 1
    db.flush()
    audit(db, company, user.id, "treasury.account_updated", item.id, {"version": item.version})
    return _serialize_treasury_account(db, company, item)


def _invoice_remaining(db: Session, company: str, invoice: NativeInvoice) -> Decimal:
    source = invoice.source or {}
    total = Decimal(canonical_money(source.get("amount", "0")))
    used_legacy = sum(
        (
            Decimal(row.amount)
            for row in db.scalars(
                select(NativeInvoiceAllocation).where(
                    NativeInvoiceAllocation.company_id == company,
                    NativeInvoiceAllocation.invoice_id == invoice.id,
                    ~NativeInvoiceAllocation.id.in_(
                        select(NativeInvoiceAllocationReversal.allocation_id).where(
                            NativeInvoiceAllocationReversal.company_id == company
                        )
                    ),
                )
            )
        ),
        Decimal(0),
    )
    used_treasury = sum(
        (
            Decimal(row.amount)
            for row in db.scalars(
                select(TreasuryAllocation).where(
                    TreasuryAllocation.company_id == company,
                    TreasuryAllocation.invoice_id == invoice.id,
                    TreasuryAllocation.reversed_at.is_(None),
                )
            )
        ),
        Decimal(0),
    )
    return max(Decimal(0), total - used_legacy - used_treasury)


def _tool_line_allocated(db: Session, company: str, tool_line_id: str) -> Decimal:
    return sum(
        (
            Decimal(row.amount)
            for row in db.scalars(
                select(TreasuryAllocation).where(
                    TreasuryAllocation.company_id == company,
                    TreasuryAllocation.tool_line_id == tool_line_id,
                    TreasuryAllocation.reversed_at.is_(None),
                )
            )
        ),
        Decimal(0),
    )


def _serialize_document(db: Session, company: str, doc: TreasuryDocument) -> dict[str, Any]:
    tools = list(
        db.scalars(
            select(TreasuryToolLine)
            .where(TreasuryToolLine.company_id == company, TreasuryToolLine.document_id == doc.id)
            .order_by(TreasuryToolLine.line_index.asc())
        )
    )
    tool_ids = [t.id for t in tools]
    allocs = (
        list(
            db.scalars(
                select(TreasuryAllocation).where(
                    TreasuryAllocation.company_id == company,
                    TreasuryAllocation.tool_line_id.in_(tool_ids),
                )
            )
        )
        if tool_ids
        else []
    )
    return serialize_fact(doc) | {
        "tools": [serialize_fact(t) for t in tools],
        "allocations": [serialize_fact(a) for a in allocs],
    }


def create_treasury_document(
    db: Session, company: str, user: m.User, data: dict[str, Any]
) -> dict[str, Any]:
    require(
        capabilities(db, company, user)["can_prepare"],
        "permission_denied",
        "اجازه ثبت دریافت یا پرداخت ندارید.",
        403,
    )
    period = get_entity(db, m.Period, company, data["period_id"])
    require_open_period(db, company, period.id)
    require(period.start <= data["date"] <= period.end, "date_outside_period", "تاریخ خارج از دوره مالی است.")

    cp = resolve_counterparty(db, company, data["party_id"], require_active=True)
    require(cp is not None, "counterparty_required", "طرف‌حساب معتبر انتخاب کنید.", 404)

    unit = data.get("unit", "IRR")
    tools_data = data["tools"]
    with localcontext() as ctx:
        ctx.prec = 60
        total_irr = Decimal(0)
        normalized_tools = []
        for idx, t in enumerate(tools_data):
            amt_irr = Decimal(money(t["amount"], unit))
            require(amt_irr > 0, "treasury_tool_positive", "مبلغ هر ردیف ابزار باید مثبت باشد.")
            if t.get("treasury_account_id"):
                ta = get_entity(db, TreasuryAccount, company, t["treasury_account_id"])
                require(ta.active, "inactive_treasury_account", "حساب خزانه غیرفعال است.", 409)
            if t.get("cheque_id"):
                chq = get_entity(db, Cheque, company, t["cheque_id"])
                expected_dir = "received" if data["direction"] == "receipt" else "issued"
                require(
                    chq.direction == expected_dir,
                    "cheque_direction_mismatch",
                    "جهت چک با نوع دریافت/پرداخت هم‌خوان نیست.",
                    409,
                )
            if t.get("bank_movement_id"):
                bm = get_entity(db, m.BankMovement, company, t["bank_movement_id"])
                require(bm.kind not in ANCHOR_KINDS, "anchor_not_payment", "مانده مبنا شاهد دریافت/پرداخت نیست.")
                bm_val = Decimal(bm.amount)
                require(
                    (bm_val > 0 if data["direction"] == "receipt" else bm_val < 0),
                    "bank_direction_mismatch",
                    "جهت گردش بانک با نوع سند هم‌خوان نیست.",
                )
                used = bank_movement_used_amount(db, company, bm.id)
                require(
                    used + amt_irr <= bm_val.copy_abs(),
                    "bank_movement_capacity",
                    "ظرفیت آزاد گردش بانک برای این مبلغ کافی نیست.",
                    409,
                )
            total_irr += amt_irr
            normalized_tools.append((idx, t, canonical_money(amt_irr)))

    doc = TreasuryDocument(
        company_id=company,
        direction=data["direction"],
        number=allocate_number(db, company, "operation", TreasuryDocument, "number"),
        date=data["date"],
        period_id=period.id,
        counterparty_id=cp.id,
        total_amount=canonical_money(total_irr),
        original_unit=unit,
        description=data.get("description") or "",
        state="draft",
        actor_id=user.id,
    )
    db.add(doc)
    db.flush()

    created_tools: list[TreasuryToolLine] = []
    for idx, t, amt_str in normalized_tools:
        tl = TreasuryToolLine(
            company_id=company,
            document_id=doc.id,
            line_index=idx,
            tool_kind=t["tool_kind"],
            treasury_account_id=t.get("treasury_account_id"),
            cheque_id=t.get("cheque_id"),
            bank_movement_id=t.get("bank_movement_id"),
            amount=amt_str,
            reference=t.get("reference"),
            due_date=t.get("due_date"),
        )
        db.add(tl)
        created_tools.append(tl)
    db.flush()

    for alloc in data.get("allocations", []):
        require(0 <= alloc["tool_line_index"] < len(created_tools), "invalid_tool_line_index", "ردیف ابزار معتبر نیست.")
        tl = created_tools[alloc["tool_line_index"]]
        _create_allocation_row(db, company, user, doc, tl, alloc["invoice_id"], alloc["amount"], unit)

    audit(db, company, user.id, "treasury.document_created", doc.id, {"direction": doc.direction, "number": doc.number})
    return _serialize_document(db, company, doc)


def _create_allocation_row(
    db: Session,
    company: str,
    user: m.User,
    doc: TreasuryDocument,
    tl: TreasuryToolLine,
    invoice_id: str,
    raw_amount: Any,
    unit: str = "IRR",
) -> TreasuryAllocation:
    invoice = get_entity(db, NativeInvoice, company, invoice_id)
    expected_dir = "sale" if doc.direction == "receipt" else "purchase"
    require(invoice.direction == expected_dir, "treasury_allocation_direction", "جهت فاکتور با دریافت/پرداخت هم‌خوان نیست.", 409)
    inv_party_raw = (invoice.source or {}).get("party_id", "")
    inv_cp_id = resolve_counterparty_id(db, company, inv_party_raw)
    require(
        inv_cp_id == doc.counterparty_id,
        "treasury_allocation_party",
        "طرف حساب فاکتور با طرف حساب رسید یکسان نیست.",
        409,
    )
    inv_date = date.fromisoformat((invoice.source or {})["date"])
    require(doc.date >= inv_date, "treasury_allocation_date", "تاریخ رسید پیش از تاریخ فاکتور است.")

    amt_irr = Decimal(money(raw_amount, unit))
    require(amt_irr > 0, "treasury_allocation_positive", "مبلغ تخصیص باید مثبت باشد.")
    dup = db.scalar(
        select(TreasuryAllocation.id).where(
            TreasuryAllocation.company_id == company,
            TreasuryAllocation.tool_line_id == tl.id,
            TreasuryAllocation.invoice_id == invoice.id,
            TreasuryAllocation.reversed_at.is_(None),
        )
    )
    require(dup is None, "treasury_allocation_exists", "این ردیف ابزار قبلاً به همین فاکتور تخصیص یافته است.", 409)

    tl_remaining = Decimal(tl.amount) - _tool_line_allocated(db, company, tl.id)
    inv_remaining = _invoice_remaining(db, company, invoice)
    require(
        amt_irr <= tl_remaining and amt_irr <= inv_remaining,
        "treasury_allocation_capacity",
        "مبلغ تخصیص از ظرفیت ابزار یا مانده فاکتور بیشتر است.",
        409,
    )

    row = TreasuryAllocation(
        company_id=company,
        tool_line_id=tl.id,
        invoice_id=invoice.id,
        amount=canonical_money(amt_irr),
        date=doc.date,
        actor_id=user.id,
    )
    db.add(row)
    db.flush()
    audit(db, company, user.id, "treasury.allocation_created", row.id, {"invoice_id": invoice.id, "amount": row.amount})
    return row


def allocate_treasury_tool(
    db: Session, company: str, user: m.User, document_id: str, data: dict[str, Any], expected_version: int
) -> dict[str, Any]:
    require(capabilities(db, company, user)["can_prepare"], "permission_denied", "اجازه تخصیص ندارید.", 403)
    doc = get_entity(db, TreasuryDocument, company, document_id)
    check_version(doc, expected_version)
    require(doc.state != "reversed", "treasury_doc_reversed", "رسید برگشت‌خورده قابل تخصیص نیست.", 409)
    tl = get_entity(db, TreasuryToolLine, company, data["tool_line_id"])
    require(tl.document_id == doc.id, "not_found", "ردیف ابزار در این سند یافت نشد.", 404)
    _create_allocation_row(db, company, user, doc, tl, data["invoice_id"], data["amount"], "IRR")
    doc.version += 1
    db.flush()
    return _serialize_document(db, company, doc)


def reverse_treasury_allocation(
    db: Session, company: str, user: m.User, allocation_id: str, reason: str, expected_version: int
) -> dict[str, Any]:
    require(capabilities(db, company, user)["can_prepare"], "permission_denied", "اجازه برگشت تخصیص ندارید.", 403)
    row = get_entity(db, TreasuryAllocation, company, allocation_id)
    tl = get_entity(db, TreasuryToolLine, company, row.tool_line_id)
    doc = get_entity(db, TreasuryDocument, company, tl.document_id)
    check_version(doc, expected_version)
    require(row.reversed_at is None, "treasury_allocation_reversed", "این تخصیص قبلاً برگشت شده است.", 409)
    row.reversed_at = m.now()
    row.reversed_by = user.id
    row.reversal_reason = reason.strip()
    doc.version += 1
    db.flush()
    audit(db, company, user.id, "treasury.allocation_reversed", row.id, {"reason": row.reversal_reason})
    return _serialize_document(db, company, doc)


def list_treasury_documents(db: Session, company: str, user: m.User, direction: str | None = None) -> dict[str, Any]:
    membership(db, company, user, "read")
    stmt = select(TreasuryDocument).where(TreasuryDocument.company_id == company)
    if direction:
        stmt = stmt.where(TreasuryDocument.direction == direction)
    docs = list(db.scalars(stmt.order_by(TreasuryDocument.date.desc(), TreasuryDocument.created_at.desc())))
    return {"items": [_serialize_document(db, company, d) for d in docs]}
