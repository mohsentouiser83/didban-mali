"""Service layer for petty cash expense tracking, limit checks, and accounting settlement."""

from collections import defaultdict
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_models import Account, Draft
from .dimensions_models import Dimension
from .errors import require
from .money_type import canonical_money
from .period_lock_service import require_open_period
from .petty_cash_models import PettyCashExpense, PettyCashSettlement
from .services import get_entity
from .treasury_models import TreasuryAccount
from .workflow import audit

ZERO = Decimal("0")


def _dec(val: Any) -> Decimal:
    if val is None or val == "":
        return ZERO
    return Decimal(str(val))


def _require_petty_cash_account(db: Session, company: str, treasury_account_id: str) -> TreasuryAccount:
    acc = db.scalar(
        select(TreasuryAccount).where(
            TreasuryAccount.company_id == company,
            TreasuryAccount.id == treasury_account_id,
            TreasuryAccount.active.is_(True),
        )
    )
    require(acc is not None and acc.kind == "petty_cash", "invalid_petty_cash_account", "حساب تنخواه معتبر نیست.", 404)
    return acc


def _serialize_expense(exp: PettyCashExpense) -> dict[str, Any]:
    return {
        "id": exp.id,
        "company_id": exp.company_id,
        "treasury_account_id": exp.treasury_account_id,
        "period_id": exp.period_id,
        "expense_account_id": exp.expense_account_id,
        "dimension_id": exp.dimension_id,
        "category": exp.category,
        "expense_date": str(exp.expense_date),
        "title": exp.title,
        "amount_irr": exp.amount_irr,
        "receipt_reference": exp.receipt_reference,
        "status": exp.status,
        "settlement_id": exp.settlement_id,
        "notes": exp.notes,
        "version": exp.version,
    }


def _serialize_settlement(st: PettyCashSettlement) -> dict[str, Any]:
    return {
        "id": st.id,
        "company_id": st.company_id,
        "treasury_account_id": st.treasury_account_id,
        "period_id": st.period_id,
        "settlement_date": str(st.settlement_date),
        "total_amount_irr": st.total_amount_irr,
        "replenish_from_treasury_id": st.replenish_from_treasury_id,
        "draft_id": st.draft_id,
        "status": st.status,
        "notes": st.notes,
        "version": st.version,
    }


def list_expenses(
    db: Session,
    company: str,
    *,
    treasury_account_id: str | None = None,
    dimension_id: str | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    stmt = select(PettyCashExpense).where(PettyCashExpense.company_id == company)
    if treasury_account_id:
        stmt = stmt.where(PettyCashExpense.treasury_account_id == treasury_account_id)
    if dimension_id:
        stmt = stmt.where(PettyCashExpense.dimension_id == dimension_id)
    if status:
        stmt = stmt.where(PettyCashExpense.status == status)
    items = db.scalars(stmt.order_by(PettyCashExpense.expense_date.desc(), PettyCashExpense.created_at.desc())).all()

    recorded_total = sum((_dec(e.amount_irr) for e in items if e.status == "recorded"), ZERO)
    settled_total = sum((_dec(e.amount_irr) for e in items if e.status == "settled"), ZERO)
    limit_irr: str | None = None
    remaining_limit_irr: str | None = None
    if treasury_account_id:
        acc = db.scalar(
            select(TreasuryAccount).where(
                TreasuryAccount.company_id == company, TreasuryAccount.id == treasury_account_id
            )
        )
        if acc and acc.petty_cash_limit_irr is not None:
            limit_irr = acc.petty_cash_limit_irr
            remaining_limit_irr = canonical_money(max(ZERO, _dec(limit_irr) - recorded_total))

    return {
        "items": [_serialize_expense(e) for e in items],
        "summary": {
            "recorded_total_irr": canonical_money(recorded_total),
            "settled_total_irr": canonical_money(settled_total),
            "petty_cash_limit_irr": limit_irr,
            "remaining_limit_irr": remaining_limit_irr,
        },
    }


def record_expense(db: Session, company: str, user: Any, data: dict[str, Any]) -> dict[str, Any]:
    petty_acc = _require_petty_cash_account(db, company, data["treasury_account_id"])
    period = db.scalar(select(m.Period).where(m.Period.company_id == company, m.Period.id == data["period_id"]))
    require(period is not None, "period_not_found", "دوره مالی معتبر نیست.", 404)
    require_open_period(db, company, period.id)

    exp_account = db.scalar(
        select(Account).where(
            Account.company_id == company, Account.id == data["expense_account_id"], Account.active.is_(True)
        )
    )
    require(exp_account is not None, "account_not_found", "حساب هزینه معتبر نیست.", 404)

    dim_id = data.get("dimension_id")
    if dim_id:
        dim = db.scalar(
            select(Dimension).where(
                Dimension.company_id == company, Dimension.id == dim_id, Dimension.active.is_(True)
            )
        )
        require(dim is not None, "dimension_not_found", "پروژه یا مرکز هزینه انتخاب‌شده معتبر نیست.", 404)

    amount = _dec(data["amount_irr"])
    require(amount > ZERO, "invalid_amount", "مبلغ هزینه باید بیشتر از صفر باشد.", 422)

    if petty_acc.petty_cash_limit_irr is not None:
        open_expenses = db.scalars(
            select(PettyCashExpense).where(
                PettyCashExpense.company_id == company,
                PettyCashExpense.treasury_account_id == petty_acc.id,
                PettyCashExpense.status == "recorded",
            )
        ).all()
        open_total = sum((_dec(e.amount_irr) for e in open_expenses), ZERO)
        require(
            open_total + amount <= _dec(petty_acc.petty_cash_limit_irr),
            "petty_cash_limit_exceeded",
            "جمع هزینه‌های تسویه‌نشده از سقف مجاز تنخواه بیشتر می‌شود.",
            422,
        )

    expense = PettyCashExpense(
        company_id=company,
        treasury_account_id=petty_acc.id,
        period_id=period.id,
        expense_account_id=exp_account.id,
        dimension_id=dim_id,
        category=data.get("category", "other"),
        expense_date=data["expense_date"],
        title=data["title"],
        amount_irr=canonical_money(amount),
        receipt_reference=data.get("receipt_reference"),
        notes=data.get("notes"),
    )
    db.add(expense)
    db.flush()
    audit(db, company, user.id, "petty_cash.expense_recorded", expense.id, {"amount_irr": expense.amount_irr})
    return _serialize_expense(expense)


def cancel_expense(db: Session, company: str, user: Any, expense_id: str) -> dict[str, Any]:
    expense = get_entity(db, PettyCashExpense, company, expense_id)
    require(expense.status == "recorded", "expense_not_cancellable", "فقط هزینه تسویه‌نشده قابل لغو است.", 409)
    expense.status = "cancelled"
    expense.version += 1
    db.flush()
    audit(db, company, user.id, "petty_cash.expense_cancelled", expense.id)
    return _serialize_expense(expense)


def list_settlements(db: Session, company: str, *, treasury_account_id: str | None = None) -> dict[str, Any]:
    stmt = select(PettyCashSettlement).where(PettyCashSettlement.company_id == company)
    if treasury_account_id:
        stmt = stmt.where(PettyCashSettlement.treasury_account_id == treasury_account_id)
    rows = db.scalars(
        stmt.order_by(PettyCashSettlement.settlement_date.desc(), PettyCashSettlement.created_at.desc())
    ).all()
    return {"items": [_serialize_settlement(r) for r in rows]}


def settle_petty_cash(db: Session, company: str, user: Any, data: dict[str, Any]) -> dict[str, Any]:
    petty_acc = _require_petty_cash_account(db, company, data["treasury_account_id"])
    period = db.scalar(select(m.Period).where(m.Period.company_id == company, m.Period.id == data["period_id"]))
    require(period is not None, "period_not_found", "دوره مالی معتبر نیست.", 404)
    require_open_period(db, company, period.id)

    credit_ledger_account_id = petty_acc.account_id
    replenish_id = data.get("replenish_from_treasury_id")
    if replenish_id:
        src_acc = db.scalar(
            select(TreasuryAccount).where(
                TreasuryAccount.company_id == company,
                TreasuryAccount.id == replenish_id,
                TreasuryAccount.active.is_(True),
            )
        )
        require(
            src_acc is not None and src_acc.kind in ("bank", "cash"),
            "invalid_replenish_source",
            "حساب مبدأ شارژ تنخواه باید بانک یا صندوق فعال باشد.",
            404,
        )
        credit_ledger_account_id = src_acc.account_id

    stmt = select(PettyCashExpense).where(
        PettyCashExpense.company_id == company,
        PettyCashExpense.treasury_account_id == petty_acc.id,
        PettyCashExpense.status == "recorded",
    )
    if data.get("expense_ids"):
        stmt = stmt.where(PettyCashExpense.id.in_(data["expense_ids"]))
    expenses = db.scalars(stmt.order_by(PettyCashExpense.expense_date)).all()
    require(len(expenses) > 0, "no_open_petty_cash_expenses", "هزینه تسویه‌نشده‌ای برای این تنخواه وجود ندارد.", 422)

    total_amount = sum((_dec(e.amount_irr) for e in expenses), ZERO)
    grouped_debits: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for exp in expenses:
        grouped_debits[exp.expense_account_id] += _dec(exp.amount_irr)

    draft_lines: list[dict[str, Any]] = [
        {
            "account_id": acc_id,
            "debit": canonical_money(amt),
            "credit": "0",
            "description": f"تسویه تنخواه {petty_acc.name}",
        }
        for acc_id, amt in grouped_debits.items()
    ]
    draft_lines.append(
        {
            "account_id": credit_ledger_account_id,
            "debit": "0",
            "credit": canonical_money(total_amount),
            "description": (
                f"شارژ و تسویه تنخواه {petty_acc.name}" if replenish_id else f"کاهش مانده تنخواه {petty_acc.name}"
            ),
        }
    )

    draft = Draft(
        company_id=company,
        period_id=period.id,
        date=data["settlement_date"],
        description=f"پیش‌نویس سند تسویه تنخواه {petty_acc.name}",
        lines=draft_lines,
        original_unit="IRR",
        actor_id=user.id,
        state="draft",
    )
    db.add(draft)
    db.flush()

    settlement = PettyCashSettlement(
        company_id=company,
        treasury_account_id=petty_acc.id,
        period_id=period.id,
        settlement_date=data["settlement_date"],
        total_amount_irr=canonical_money(total_amount),
        replenish_from_treasury_id=replenish_id,
        draft_id=draft.id,
        status="draft",
        notes=data.get("notes"),
    )
    db.add(settlement)
    db.flush()

    for exp in expenses:
        exp.status = "settled"
        exp.settlement_id = settlement.id
        exp.version += 1

    db.flush()
    audit(
        db,
        company,
        user.id,
        "petty_cash.settled",
        settlement.id,
        {"total_amount_irr": settlement.total_amount_irr, "draft_id": draft.id, "expense_count": len(expenses)},
    )
    return _serialize_settlement(settlement)
