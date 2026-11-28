"""Operational treasury accounts (bank, cashbox, petty cash) and receipt/payment documents."""

import re
from datetime import date, datetime, timezone
from decimal import Decimal, localcontext
from typing import Any
from zoneinfo import ZoneInfo

from fastapi.encoders import jsonable_encoder
from sqlalchemy import Select, select, update
from sqlalchemy.orm import Session

from . import models as m
from .accounting_models import Account, Draft
from .accounting_service import capabilities, save_account, save_draft
from .cheque_models import Cheque, ChequeClearance, ChequeEvent
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
from .operation_models import OperationDraft
from .period_lock_service import require_open_period
from .posting_models import NativeJournal
from .security import membership
from .services import check_version, get_entity
from .treasury_models import (
    TreasuryAccount,
    TreasuryAllocation,
    TreasuryDocument,
    TreasuryPointOfSale,
    TreasuryToolLine,
    TreasuryToolPointOfSale,
)
from .treasury_schemas import TreasuryAccountOption
from .workflow import audit, serialize_fact

IBAN_RE = re.compile(r"^IR[0-9]{24}$")
DIGITS_OR_DASH_RE = re.compile(r"^[0-9A-Za-z\-/]{3,60}$")


def lock_treasury_capacity(db: Session, company: str) -> None:
    """Serialize shared bank movement, treasury tool, and invoice capacity across concurrent requests."""
    if db.get_bind().dialect.name == "sqlite":
        db.execute(update(m.Company).where(m.Company.id == company).values(version=m.Company.version))
    else:
        db.scalar(select(m.Company).where(m.Company.id == company).with_for_update())


def _company_date(db: Session, company: str, stamp: datetime) -> date:
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    tenant = db.get(m.Company, company)
    assert tenant is not None
    return stamp.astimezone(ZoneInfo(tenant.timezone)).date()


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


def _serialize_treasury_account(db: Session, item: TreasuryAccount) -> dict[str, Any]:
    acc = db.get(Account, item.account_id)
    data = serialize_fact(item)
    data["account_code"] = acc.code if acc else None
    data["code"] = data["account_code"]
    data["account_name"] = acc.name if acc else None
    data["account_active"] = acc.active if acc else None
    return data


def _serialize_point_of_sale(db: Session, terminal: TreasuryPointOfSale) -> dict[str, Any]:
    bank = get_entity(db, TreasuryAccount, terminal.company_id, terminal.linked_bank_id)
    account = db.get(Account, bank.account_id)
    return serialize_fact(terminal) | {
        "kind": "pos",
        "account_id": bank.account_id,
        "account_code": account.code if account else None,
        "account_name": account.name if account else None,
        "account_active": account.active if account else None,
        "linked_bank_name": bank.name,
    }


def _active_pos_bank(db: Session, company: str, bank_id: str | None) -> TreasuryAccount:
    require(bool(bank_id), "treasury_pos_bank_required", "حساب بانکی کارت‌خوان را انتخاب کنید.")
    bank = get_entity(db, TreasuryAccount, company, bank_id)
    require(bank.kind == "bank", "treasury_pos_bank_required", "کارت‌خوان باید به یک حساب بانکی متصل شود.")
    account = get_entity(db, Account, company, bank.account_id)
    require(bank.active and account.active, "inactive_treasury_bank", "حساب بانکی کارت‌خوان غیرفعال است.", 409)
    return bank


def resolve_point_of_sale_bank(db: Session, company: str, terminal_id: str) -> TreasuryAccount:
    terminal = get_entity(db, TreasuryPointOfSale, company, terminal_id)
    require(terminal.active, "inactive_treasury_pos", "کارت‌خوان غیرفعال است.", 409)
    return _active_pos_bank(db, company, terminal.linked_bank_id)


def _point_of_sale_query(company: str, active_only: bool) -> Select[tuple[TreasuryPointOfSale]]:
    stmt = select(TreasuryPointOfSale).where(TreasuryPointOfSale.company_id == company)
    if active_only:
        stmt = stmt.join(
            TreasuryAccount,
            (TreasuryAccount.company_id == TreasuryPointOfSale.company_id)
            & (TreasuryAccount.id == TreasuryPointOfSale.linked_bank_id),
        ).join(
            Account,
            (Account.company_id == TreasuryAccount.company_id) & (Account.id == TreasuryAccount.account_id),
        ).where(TreasuryPointOfSale.active.is_(True), TreasuryAccount.active.is_(True), Account.active.is_(True))
    return stmt.order_by(TreasuryPointOfSale.name, TreasuryPointOfSale.id)


def _treasury_account_query(
    company: str,
    kind: str | None,
    active_only: bool,
) -> Select[tuple[TreasuryAccount]]:
    stmt = select(TreasuryAccount).where(TreasuryAccount.company_id == company)
    if kind:
        stmt = stmt.where(TreasuryAccount.kind == kind)
    if active_only:
        stmt = stmt.where(TreasuryAccount.active.is_(True))
    return stmt.order_by(TreasuryAccount.kind.asc(), TreasuryAccount.name.asc(), TreasuryAccount.id.asc())


def list_treasury_accounts(
    db: Session,
    company: str,
    user: m.User,
    kind: str | None = None,
    active_only: bool = False,
) -> dict[str, Any]:
    membership(db, company, user, "manage_accounts", scope=("treasury", "view"))
    items = []
    if kind != "pos":
        items.extend(_serialize_treasury_account(db, row) for row in db.scalars(
            _treasury_account_query(company, kind, active_only)
        ))
    if kind in (None, "pos"):
        items.extend(_serialize_point_of_sale(db, row) for row in db.scalars(_point_of_sale_query(company, active_only)))
    return {"items": items}


def list_treasury_account_options(
    db: Session,
    company: str,
    user: m.User,
    kind: str | None = None,
    active_only: bool = False,
) -> dict[str, list[TreasuryAccountOption]]:
    membership(db, company, user, "read")
    items = []
    if kind != "pos":
        stmt = _treasury_account_query(company, kind, active_only).with_only_columns(
            TreasuryAccount.id, TreasuryAccount.name, TreasuryAccount.kind, TreasuryAccount.active,
        )
        items.extend(TreasuryAccountOption.model_validate(dict(row)) for row in db.execute(stmt).mappings())
    if kind in (None, "pos"):
        items.extend(TreasuryAccountOption(id=row.id, name=row.name, kind="pos", active=row.active)
                     for row in db.scalars(_point_of_sale_query(company, active_only)))
    return {"items": items}


def create_treasury_account(
    db: Session,
    company: str,
    user: m.User,
    data: dict[str, Any],
) -> dict[str, Any]:
    membership(db, company, user, "manage_accounts", scope=("treasury", "create"))
    kind = data["kind"]
    lock_treasury_capacity(db, company)
    if kind == "pos":
        bank = _active_pos_bank(db, company, data.get("linked_bank_id"))
        terminal = TreasuryPointOfSale(
            company_id=company,
            name=data["name"],
            code=allocate_number(db, company, "treasury_pos", TreasuryPointOfSale, "code"),
            linked_bank_id=bank.id,
            active=data.get("active", True),
        )
        db.add(terminal)
        db.flush()
        audit(db, company, user.id, "treasury.account_created", terminal.id, {"kind": kind, "linked_bank_id": bank.id})
        return _serialize_point_of_sale(db, terminal)

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
        if "code" not in acc_payload and "level" not in acc_payload:
            acc_payload["code"] = allocate_number(db, company, "account", Account, "code")
        created_acc = save_account(db, company, user, acc_payload, scope=("treasury", "create"))
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
        is_official=data.get("is_official", True),
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
    return _serialize_treasury_account(db, item)


def update_treasury_account(
    db: Session,
    company: str,
    user: m.User,
    treasury_id: str,
    data: dict[str, Any],
    expected_version: int,
) -> dict[str, Any]:
    membership(db, company, user, "manage_accounts", scope=("treasury", "edit"))
    lock_treasury_capacity(db, company)
    terminal = db.scalar(select(TreasuryPointOfSale).where(
        TreasuryPointOfSale.company_id == company, TreasuryPointOfSale.id == treasury_id,
    ))
    if terminal is not None:
        check_version(terminal, expected_version)
        if "linked_bank_id" in data or data.get("active") is True:
            bank = _active_pos_bank(db, company, data.get("linked_bank_id", terminal.linked_bank_id))
            terminal.linked_bank_id = bank.id
        for field in ("name", "active"):
            if field in data:
                require(data[field] is not None, "invalid_field_value", f"فیلد «{field}» نمی‌تواند خالی باشد.")
                setattr(terminal, field, data[field])
        terminal.version += 1
        db.flush()
        audit(db, company, user.id, "treasury.account_updated", terminal.id,
              {"version": terminal.version, "linked_bank_id": terminal.linked_bank_id})
        return _serialize_point_of_sale(db, terminal)

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
        "is_official",
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
    return _serialize_treasury_account(db, item)


def _posted_treasury_proof_error(
    db: Session,
    company: str,
    ta: TreasuryAllocation,
    tl: TreasuryToolLine,
    doc: TreasuryDocument,
    as_of: date,
) -> str | None:
    if not doc.journal_id:
        return "treasury_payment_proof_missing"
    journal = db.scalar(
        select(NativeJournal).where(
            NativeJournal.company_id == company,
            NativeJournal.id == doc.journal_id,
        )
    )
    if journal is None or journal.reversal_of or journal.date != doc.date or journal.date > as_of:
        return "treasury_payment_proof_invalid"
    draft = db.scalar(
        select(Draft).where(Draft.company_id == company, Draft.id == journal.draft_id)
    )
    if draft is None or draft.state != "posted":
        return "treasury_payment_proof_invalid"
    reversed_journal = db.scalar(
        select(NativeJournal.id).where(
            NativeJournal.company_id == company,
            NativeJournal.reversal_of == journal.id,
            NativeJournal.date <= as_of,
        )
    )
    if reversed_journal is not None:
        return "treasury_payment_proof_reversed"
    lines = (journal.snapshot or {}).get("lines") or []
    with localcontext() as ctx:
        ctx.prec = 60
        total_debit = sum((Decimal(str(line.get("debit", "0"))) for line in lines), Decimal(0))
        total_credit = sum((Decimal(str(line.get("credit", "0"))) for line in lines), Decimal(0))
        doc_total = Decimal(doc.total_amount)
        if total_debit != doc_total or total_credit != doc_total:
            return "treasury_payment_proof_mismatch"
        side_key = "credit" if doc.direction == "receipt" else "debit"
        cp_amount = Decimal(0)
        for line in lines:
            line_cp = line.get("counterparty_id") or (
                resolve_counterparty_id(db, company, line.get("party_id", ""))
                if line.get("party_id")
                else None
            )
            if line_cp == doc.counterparty_id:
                cp_amount += Decimal(str(line.get(side_key, "0")))
        if cp_amount < Decimal(ta.amount):
            return "treasury_payment_proof_mismatch"
    if doc.operation_id:
        op = db.scalar(
            select(OperationDraft).where(
                OperationDraft.company_id == company,
                OperationDraft.id == doc.operation_id,
            )
        )
        if op is None or op.draft_id != journal.draft_id:
            return "treasury_payment_proof_invalid"
        dup_native = db.scalar(
            select(NativeInvoiceAllocation.id).where(
                NativeInvoiceAllocation.company_id == company,
                NativeInvoiceAllocation.operation_id == op.id,
                NativeInvoiceAllocation.date <= as_of,
                ~NativeInvoiceAllocation.id.in_(
                    select(NativeInvoiceAllocationReversal.allocation_id).where(
                        NativeInvoiceAllocationReversal.company_id == company,
                        NativeInvoiceAllocationReversal.date <= as_of,
                    )
                ),
            )
        )
        if dup_native is not None:
            return "settlement_duplicate_path"
    if tl.bank_movement_id:
        bm = db.scalar(
            select(m.BankMovement).where(
                m.BankMovement.company_id == company,
                m.BankMovement.id == tl.bank_movement_id,
            )
        )
        if bm is None or bm.kind in ANCHOR_KINDS or bm.date > as_of:
            return "treasury_bank_proof_invalid"
        bm_val = Decimal(bm.amount)
        if (bm_val <= 0) if doc.direction == "receipt" else (bm_val >= 0):
            return "treasury_bank_proof_invalid"
        if bank_movement_used_amount(db, company, bm.id) > bm_val.copy_abs():
            return "treasury_bank_capacity_invalid"
    if tl.cheque_id:
        chq = db.scalar(
            select(Cheque).where(Cheque.company_id == company, Cheque.id == tl.cheque_id)
        )
        expected_dir = "received" if doc.direction == "receipt" else "issued"
        if (
            chq is None
            or chq.direction != expected_dir
            or (chq.received_date or chq.issue_date) > as_of
            or Decimal(tl.amount) > Decimal(chq.amount)
        ):
            return "treasury_cheque_proof_invalid"
        cheque_state = db.scalar(
            select(ChequeEvent.new_state)
            .where(
                ChequeEvent.company_id == company,
                ChequeEvent.cheque_id == chq.id,
                ChequeEvent.event_date <= as_of,
            )
            .order_by(ChequeEvent.event_date.desc(), ChequeEvent.created_at.desc(), ChequeEvent.id.desc())
            .limit(1)
        )
        if (cheque_state or chq.state) in ("cancelled", "returned", "bounced"):
            return "treasury_cheque_proof_invalid"
    return None


def treasury_allocation_effect(
    db: Session,
    company: str,
    ta: TreasuryAllocation,
    tl: TreasuryToolLine,
    doc: TreasuryDocument,
    as_of: date,
) -> dict[str, Any]:
    """Separate draft reservation from definitive posted invoice reduction with payment proof."""
    if ta.reversed_at and _company_date(db, company, ta.reversed_at) <= as_of:
        return {
            "reversed": True,
            "effective": False,
            "reserved": False,
            "status": "reversed",
            "reason": None,
            "reversal": {"reason": ta.reversal_reason},
        }
    if doc.state == "draft":
        return {
            "reversed": False,
            "effective": False,
            "reserved": True,
            "status": "reserved",
            "reason": "treasury_document_unposted",
        }
    error_code = _posted_treasury_proof_error(db, company, ta, tl, doc, as_of)
    if error_code == "treasury_payment_proof_reversed":
        return {"reversed": True, "effective": False, "reserved": False, "status": "reversed", "reason": None}
    if error_code is not None:
        return {
            "reversed": False,
            "effective": False,
            "reserved": False,
            "status": "unavailable",
            "reason": error_code,
        }
    return {"reversed": False, "effective": True, "reserved": False, "status": "available", "reason": None}


def effective_treasury_paid_for_invoice(
    db: Session, company: str, invoice_id: str, as_of: date | None = None
) -> Decimal:
    """Total definitive (posted + valid payment proof) treasury allocations for an invoice."""
    effective_date = as_of or date.max
    total = Decimal(0)
    with localcontext() as ctx:
        ctx.prec = 60
        for ta, tl, doc in db.execute(
            select(TreasuryAllocation, TreasuryToolLine, TreasuryDocument)
            .join(
                TreasuryToolLine,
                (TreasuryToolLine.company_id == TreasuryAllocation.company_id)
                & (TreasuryToolLine.id == TreasuryAllocation.tool_line_id),
            )
            .join(
                TreasuryDocument,
                (TreasuryDocument.company_id == TreasuryToolLine.company_id)
                & (TreasuryDocument.id == TreasuryToolLine.document_id),
            )
            .where(
                TreasuryAllocation.company_id == company,
                TreasuryAllocation.invoice_id == invoice_id,
                TreasuryAllocation.date <= effective_date,
            )
        ).all():
            eff = treasury_allocation_effect(db, company, ta, tl, doc, effective_date)
            if eff["effective"]:
                total += Decimal(ta.amount)
    return total


def treasury_allocation_has_payment_proof(
    db: Session, company: str, tl: TreasuryToolLine, doc: TreasuryDocument
) -> bool:
    """Return True only when the treasury document is posted with valid payment proof."""
    if doc.state != "posted":
        return False
    return _posted_treasury_proof_error(db, company, TreasuryAllocation(amount=tl.amount), tl, doc, date.max) is None


def _invoice_remaining(db: Session, company: str, invoice: NativeInvoice) -> Decimal:
    """Available invoice capacity for new allocations/reservations across all active paths."""
    from .commercial_doc_models import CommercialDocument, CommercialReturn, CounterpartyCreditApplication

    source = invoice.source or {}
    total = Decimal(canonical_money(source.get("amount", "0")))
    with localcontext() as ctx:
        ctx.prec = 60
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
                    select(TreasuryAllocation)
                    .join(
                        TreasuryToolLine,
                        (TreasuryToolLine.company_id == TreasuryAllocation.company_id)
                        & (TreasuryToolLine.id == TreasuryAllocation.tool_line_id),
                    )
                    .join(
                        TreasuryDocument,
                        (TreasuryDocument.company_id == TreasuryToolLine.company_id)
                        & (TreasuryDocument.id == TreasuryToolLine.document_id),
                    )
                    .where(
                        TreasuryAllocation.company_id == company,
                        TreasuryAllocation.invoice_id == invoice.id,
                        TreasuryAllocation.reversed_at.is_(None),
                        TreasuryDocument.state != "reversed",
                    )
                )
            ),
            Decimal(0),
        )
        commercial_used = Decimal(0)
        cdoc = db.scalar(
            select(CommercialDocument).where(
                CommercialDocument.company_id == company,
                CommercialDocument.native_invoice_id == invoice.id,
            )
        )
        if cdoc is not None:
            commercial_used += sum(
                (
                    Decimal(r.invoice_balance_reduced_irr)
                    for r in db.scalars(
                        select(CommercialReturn).where(
                            CommercialReturn.company_id == company,
                            CommercialReturn.document_id == cdoc.id,
                            CommercialReturn.status == "posted",
                        )
                    )
                ),
                Decimal(0),
            )
            commercial_used += sum(
                (
                    Decimal(app.amount_irr)
                    for app in db.scalars(
                        select(CounterpartyCreditApplication).where(
                            CounterpartyCreditApplication.company_id == company,
                            CounterpartyCreditApplication.target_document_id == cdoc.id,
                        )
                    )
                ),
                Decimal(0),
            )
        return max(Decimal(0), total - used_legacy - used_treasury - commercial_used)


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
    terminals = {
        tool_id: (terminal_id, name)
        for tool_id, terminal_id, name in db.execute(
            select(TreasuryToolPointOfSale.tool_line_id, TreasuryPointOfSale.id, TreasuryPointOfSale.name)
            .join(
                TreasuryPointOfSale,
                (TreasuryPointOfSale.company_id == TreasuryToolPointOfSale.company_id)
                & (TreasuryPointOfSale.id == TreasuryToolPointOfSale.point_of_sale_id),
            )
            .where(TreasuryToolPointOfSale.company_id == company, TreasuryToolPointOfSale.tool_line_id.in_(tool_ids))
        )
    } if tool_ids else {}
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
    cp = db.get(CommercialCounterparty, doc.counterparty_id)
    with localcontext() as ctx:
        ctx.prec = 60
        alloc_by_tool: dict[str, Decimal] = {}
        for a in allocs:
            if a.reversed_at is None:
                alloc_by_tool[a.tool_line_id] = alloc_by_tool.get(a.tool_line_id, Decimal(0)) + Decimal(a.amount)
        serialized_tools = []
        any_proof = False
        for t in tools:
            used_amt = alloc_by_tool.get(t.id, Decimal(0))
            rem_amt = max(Decimal(0), Decimal(t.amount) - used_amt)
            line_proof = treasury_allocation_has_payment_proof(db, company, t, doc)
            if line_proof:
                any_proof = True
            terminal_id, terminal_name = terminals.get(t.id, (None, None))
            serialized_tools.append(
                serialize_fact(t)
                | {
                    "point_of_sale_id": terminal_id,
                    "point_of_sale_name": terminal_name,
                    "allocated_amount": canonical_money(used_amt),
                    "remaining_amount": canonical_money(rem_amt),
                    "has_payment_proof": line_proof,
                }
            )
        total_allocated = sum(alloc_by_tool.values(), Decimal(0))
        allocatable_amount = (
            Decimal(0) if doc.state == "reversed" else max(Decimal(0), Decimal(doc.total_amount) - total_allocated)
        )
        inv_refs: dict[str, str] = {}
        for a in allocs:
            if a.invoice_id not in inv_refs:
                inv = db.get(NativeInvoice, a.invoice_id)
                if inv and inv.company_id == company:
                    inv_refs[a.invoice_id] = (inv.source or {}).get("reference", a.invoice_id)
    return serialize_fact(doc) | {
        "counterparty_name": cp.name if cp and cp.company_id == company else None,
        "counterparty_code": cp.code if cp and cp.company_id == company else None,
        "allocated_amount": canonical_money(total_allocated),
        "allocatable_amount": canonical_money(allocatable_amount),
        "has_payment_proof": any_proof,
        "tools": serialized_tools,
        "allocations": [
            serialize_fact(a) | {"invoice_reference": inv_refs.get(a.invoice_id)}
            for a in allocs
        ],
    }


def create_treasury_document(
    db: Session, company: str, user: m.User, data: dict[str, Any]
) -> dict[str, Any]:
    membership(db, company, user, "write", scope=("treasury", "create"))
    lock_treasury_capacity(db, company)
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
        pending_bank_usage: dict[str, Decimal] = {}
        pending_cheque_ids: set[str] = set()
        for idx, t in enumerate(tools_data):
            amt_irr = Decimal(money(t["amount"], unit))
            require(amt_irr > 0, "treasury_tool_positive", "مبلغ هر ردیف ابزار باید مثبت باشد.")
            terminal_id = t.get("point_of_sale_id")
            if terminal_id:
                require(
                    t["tool_kind"] == "card" and not t.get("treasury_account_id"),
                    "invalid_pos_tool",
                    "کارت‌خوان را برای ابزار کارت و بدون حساب خزانهٔ جداگانه انتخاب کنید.",
                )
                linked_bank = resolve_point_of_sale_bank(db, company, terminal_id)
                t = t | {"treasury_account_id": linked_bank.id}
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
                require(
                    chq.state not in ("cancelled", "returned", "bounced"),
                    "cheque_state_invalid",
                    "چک باطل‌شده یا برگشتی قابل استفاده در سند خزانه نیست.",
                    409,
                )
                require(
                    chq.id not in pending_cheque_ids,
                    "duplicate_cheque_tool",
                    "یک چک نمی‌تواند در چند ردیف یک سند تکرار شود.",
                    409,
                )
                require(
                    amt_irr <= Decimal(chq.amount),
                    "treasury_cheque_capacity",
                    "مبلغ ابزار بیشتر از مبلغ چک است.",
                    409,
                )
                require(
                    db.scalar(
                        select(TreasuryToolLine.id)
                        .join(
                            TreasuryDocument,
                            (TreasuryDocument.company_id == TreasuryToolLine.company_id)
                            & (TreasuryDocument.id == TreasuryToolLine.document_id),
                        )
                        .where(
                            TreasuryToolLine.company_id == company,
                            TreasuryToolLine.cheque_id == chq.id,
                            TreasuryDocument.state != "reversed",
                        )
                        .limit(1)
                    ) is None,
                    "treasury_cheque_already_used",
                    "چک پیش‌تر در سند خزانه دیگری استفاده شده است.",
                    409,
                )
                pending_cheque_ids.add(chq.id)
            if t.get("bank_movement_id"):
                bm = get_entity(db, m.BankMovement, company, t["bank_movement_id"])
                require(bm.kind not in ANCHOR_KINDS, "anchor_not_payment", "مانده مبنا شاهد دریافت/پرداخت نیست.")
                bm_val = Decimal(bm.amount)
                require(
                    (bm_val > 0 if data["direction"] == "receipt" else bm_val < 0),
                    "bank_direction_mismatch",
                    "جهت گردش بانک با نوع سند هم‌خوان نیست.",
                )
                used = bank_movement_used_amount(db, company, bm.id) + pending_bank_usage.get(bm.id, Decimal(0))
                require(
                    used + amt_irr <= bm_val.copy_abs(),
                    "bank_movement_capacity",
                    "ظرفیت آزاد گردش بانک برای این مبلغ کافی نیست.",
                    409,
                )
                pending_bank_usage[bm.id] = pending_bank_usage.get(bm.id, Decimal(0)) + amt_irr
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
    terminal_tools: list[tuple[TreasuryToolLine, str]] = []
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
        if t.get("point_of_sale_id"):
            terminal_tools.append((tl, t["point_of_sale_id"]))
    db.flush()
    db.add_all([
        TreasuryToolPointOfSale(company_id=company, tool_line_id=tl.id, point_of_sale_id=terminal_id)
        for tl, terminal_id in terminal_tools
    ])
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
    membership(db, company, user, "write", scope=("treasury", "create"))
    lock_treasury_capacity(db, company)
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
    membership(db, company, user, "write", scope=("treasury", "delete"))
    require(bool(reason and reason.strip()), "reason_required", "دلیل برگشت تخصیص الزامی است.")
    lock_treasury_capacity(db, company)
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


def prepare_treasury_document_draft(
    db: Session,
    company: str,
    user: m.User,
    document_id: str,
    data: dict[str, Any],
    expected_version: int,
) -> dict[str, Any]:
    """Create a balanced accounting draft for a TreasuryDocument; requires exact-version human posting."""
    membership(db, company, user, "write", scope=("treasury", "create"))
    ability = capabilities(db, company, user)
    require(
        ability["posting_available"], "primary_accounting_required", "کاربرد حسابداری اصلی لازم است.", 409
    )
    lock_treasury_capacity(db, company)
    doc = get_entity(db, TreasuryDocument, company, document_id)
    check_version(doc, expected_version)
    require(doc.state == "draft", "treasury_doc_not_draft", "سند خزانه در وضعیت پیش‌نویس نیست.", 409)
    require(doc.operation_id is None and doc.journal_id is None, "treasury_draft_exists", "پیش‌نویس حسابداری این سند قبلاً ساخته شده است.", 409)
    require_open_period(db, company, doc.period_id)

    cp_acc = get_entity(db, Account, company, data["counterparty_account_id"])
    require(cp_acc.active, "inactive_account", "حساب طرف‌حساب غیرفعال است.", 409)
    expected_cp_role = "trade_receivable" if doc.direction == "receipt" else "trade_payable"
    cp_role = db.scalar(
        select(NativeAccountRole.role).where(
            NativeAccountRole.company_id == company, NativeAccountRole.account_id == cp_acc.id
        )
    )
    if cp_role is not None:
        require(cp_role == expected_cp_role, "invalid_account_role", "نقش حساب طرف‌حساب با نوع سند خزانه سازگار نیست.", 409)

    tools = list(
        db.scalars(
            select(TreasuryToolLine)
            .where(TreasuryToolLine.company_id == company, TreasuryToolLine.document_id == doc.id)
            .order_by(TreasuryToolLine.line_index.asc())
        )
    )
    require(bool(tools), "treasury_tools_empty", "سند خزانه ردیف ابزار ندارد.")
    journal_lines: list[dict[str, Any]] = []
    is_receipt = doc.direction == "receipt"
    for tl in tools:
        if tl.treasury_account_id:
            ta = get_entity(db, TreasuryAccount, company, tl.treasury_account_id)
            tool_acc_id = ta.account_id
        elif tl.tool_kind == "cheque" and data.get("cheque_account_id"):
            chq_acc = get_entity(db, Account, company, data["cheque_account_id"])
            require(chq_acc.active, "inactive_account", "حساب چک غیرفعال است.", 409)
            tool_acc_id = chq_acc.id
        else:
            raise DomainError("treasury_account_required", "حساب خزانه یا حساب چک برای ردیف ابزار مشخص نیست.")
        journal_lines.append(
            {
                "account_id": tool_acc_id,
                "party_id": "",
                "debit": tl.amount if is_receipt else "0",
                "credit": "0" if is_receipt else tl.amount,
                "description": (doc.description or f"سند خزانه {doc.number}")[:500],
            }
        )
    journal_lines.append(
        {
            "account_id": cp_acc.id,
            "party_id": doc.counterparty_id,
            "counterparty_id": doc.counterparty_id,
            "debit": "0" if is_receipt else doc.total_amount,
            "credit": doc.total_amount if is_receipt else "0",
            "description": (doc.description or f"سند خزانه {doc.number}")[:500],
        }
    )
    draft_res = save_draft(
        db,
        company,
        user,
        {
            "period_id": doc.period_id,
            "date": doc.date,
            "description": (doc.description or f"سند خزانه {doc.number}")[:500],
            "unit": "IRR",
            "lines": journal_lines,
        },
        scope=("treasury", "create"),
    )
    op_id = m.uid()
    op = OperationDraft(
        id=op_id,
        company_id=company,
        draft_id=draft_res["id"],
        kind=f"treasury_{doc.direction}",
        source_reference=doc.number,
        payload=jsonable_encoder(
            {
                "kind": f"treasury_{doc.direction}",
                "treasury_document_id": doc.id,
                "period_id": doc.period_id,
                "date": doc.date.isoformat(),
                "party_id": doc.counterparty_id,
                "unit": "IRR",
                "amounts": {"amount": doc.total_amount},
                "lines": journal_lines,
            }
        ),
        actor_id=user.id,
        policy_version="user-provisional-2026-11-02-v1",
    )
    db.add(op)
    doc.operation_id = op_id
    doc.version += 1
    db.flush()
    audit(db, company, user.id, "treasury.draft_prepared", doc.id, {"draft_id": draft_res["id"], "operation_id": op_id})
    return {"document": _serialize_document(db, company, doc), "draft": draft_res, "operation_id": op_id}


def on_treasury_journal_posted(
    db: Session, company: str, user: m.User, draft: Draft, journal: NativeJournal
) -> None:
    """Activate TreasuryDocument when its linked accounting draft is approved and posted, or reverse on reversal."""
    if journal.reversal_of:
        reversed_doc = db.scalar(
            select(TreasuryDocument).where(
                TreasuryDocument.company_id == company,
                TreasuryDocument.journal_id == journal.reversal_of,
            )
        )
        if reversed_doc is not None and reversed_doc.state != "reversed":
            reversed_doc.state = "reversed"
            reversed_doc.version += 1
            db.flush()
            audit(
                db,
                company,
                user.id,
                "treasury.document_reversed",
                reversed_doc.id,
                {"reversal_journal_id": journal.id},
            )
        return

    op = db.scalar(
        select(OperationDraft).where(
            OperationDraft.company_id == company,
            OperationDraft.draft_id == draft.id,
        )
    )
    if op is None or op.kind not in ("treasury_receipt", "treasury_payment"):
        return
    doc = db.scalar(
        select(TreasuryDocument).where(
            TreasuryDocument.company_id == company,
            TreasuryDocument.operation_id == op.id,
        )
    )
    if doc is None:
        return
    require(doc.state == "draft", "treasury_doc_not_draft", "سند خزانه در وضعیت پیش‌نویس نیست.", 409)
    doc.state = "posted"
    doc.journal_id = journal.id
    doc.version += 1
    db.flush()
    audit(
        db,
        company,
        user.id,
        "treasury.document_posted",
        doc.id,
        {"journal_id": journal.id, "operation_id": op.id},
    )


def list_treasury_documents(db: Session, company: str, user: m.User, direction: str | None = None) -> dict[str, Any]:
    membership(db, company, user, "read")
    stmt = select(TreasuryDocument).where(TreasuryDocument.company_id == company)
    if direction:
        stmt = stmt.where(TreasuryDocument.direction == direction)
    docs = list(db.scalars(stmt.order_by(TreasuryDocument.date.desc(), TreasuryDocument.created_at.desc())))
    return {"items": [_serialize_document(db, company, d) for d in docs]}
