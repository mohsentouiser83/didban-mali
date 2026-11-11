"""Perpetual stock movements backed by exact, human-approved journal versions."""

from collections import deque
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, localcontext
from zoneinfo import ZoneInfo

from fastapi.encoders import jsonable_encoder
from sqlalchemy import and_, select
from sqlalchemy.orm import Session, aliased

from . import models as m
from .accounting_models import Account, Draft
from .accounting_service import capabilities, save_draft, validate_lines
from .errors import DomainError, require
from .inventory_models import InventoryItem, InventoryMovement, InventoryWarehouse
from .module_service import module_state, require_module
from .money_type import aggregate_money, canonical_money
from .native_reporting_models import NativeAccountRole
from .operation_models import OperationDraft
from .operation_service import POLICY
from .posting_models import NativeJournal
from .services import get_entity
from .workflow import audit, serialize_fact

MODULES = {"purchase_goods": "payables", "sale_goods": "receivables"}
GOODS_KINDS = frozenset(MODULES)
STOCK_POLICY = "perpetual-fifo-v1"
MOVEMENT_LIMIT = 100
MAX_STOCK_QUANTITY = 2**53 - 1


@dataclass
class Lot:
    remaining: int
    unit_cost_irr: str


def _require_catalog_permission(db: Session, company: str, user: m.User) -> None:
    ability = capabilities(db, company, user)
    require(ability["can_manage_accounts"], "permission_denied", "اجازه تعریف کالا و انبار ندارید.", 403)
    require(
        ability["posting_available"],
        "primary_accounting_required",
        "تعریف کالا و انبار در کاربرد حسابداری اصلی در دسترس است.",
        409,
    )


def _require_account(db: Session, company: str, account_id: str, expected_role: str) -> None:
    account = get_entity(db, Account, company, account_id)
    require(account.active, "inactive_account", "حساب غیرفعال است.")
    role = db.scalar(
        select(NativeAccountRole.role).where(
            NativeAccountRole.company_id == company, NativeAccountRole.account_id == account_id
        )
    )
    require(
        role is None or role == expected_role,
        "inventory_account_role",
        f"نقش حساب «{account.name}» با کاربرد آن در عملیات کالا سازگار نیست.",
        409,
    )


def _add_catalog(
    db: Session,
    company: str,
    user: m.User,
    data: dict,
    model: type[InventoryItem] | type[InventoryWarehouse],
    event: str,
) -> dict:
    require(
        not db.scalar(select(model.id).where(model.company_id == company, model.code == data["code"])),
        "inventory_duplicate_code",
        "این کد قبلاً ثبت شده است.",
        409,
    )
    row = model(company_id=company, **data)
    db.add(row)
    db.flush()
    audit(db, company, user.id, event, row.id)
    return serialize_fact(row)


def add_item(db: Session, company: str, user: m.User, data: dict) -> dict:
    _require_catalog_permission(db, company, user)
    _require_account(db, company, data["inventory_account_id"], "other_asset")
    return _add_catalog(db, company, user, data, InventoryItem, "inventory.item_created")


def add_warehouse(db: Session, company: str, user: m.User, data: dict) -> dict:
    _require_catalog_permission(db, company, user)
    return _add_catalog(db, company, user, data, InventoryWarehouse, "inventory.warehouse_created")


def summary(db: Session, company: str, user: m.User) -> dict:
    ability = capabilities(db, company, user)
    balances: dict[tuple[str, str], tuple[int, Decimal]] = {}
    recent = deque(maxlen=MOVEMENT_LIMIT)
    movement_count = 0
    with localcontext() as context:
        context.prec = 60
        rows = db.execute(
            select(
                InventoryMovement.id,
                InventoryMovement.item_id,
                InventoryMovement.warehouse_id,
                InventoryMovement.journal_id,
                InventoryMovement.operation_id,
                InventoryMovement.kind,
                InventoryMovement.date,
                InventoryMovement.quantity,
                InventoryMovement.value_irr,
            )
            .where(InventoryMovement.company_id == company)
            .order_by(InventoryMovement.sequence)
            .execution_options(yield_per=500)
        ).mappings()
        for row in rows:
            bucket = (row["item_id"], row["warehouse_id"])
            quantity, value = balances.get(bucket, (0, Decimal(0)))
            balances[bucket] = (quantity + row["quantity"], value + Decimal(row["value_irr"]))
            recent.append(dict(row))
            movement_count += 1
    return {
        "items": [
            serialize_fact(row)
            for row in db.scalars(
                select(InventoryItem).where(InventoryItem.company_id == company).order_by(InventoryItem.code)
            )
        ],
        "warehouses": [
            serialize_fact(row)
            for row in db.scalars(
                select(InventoryWarehouse)
                .where(InventoryWarehouse.company_id == company)
                .order_by(InventoryWarehouse.code)
            )
        ],
        "balances": [
            {
                "item_id": item,
                "warehouse_id": warehouse,
                "quantity": quantity,
                "value_irr": aggregate_money(value),
            }
            for (item, warehouse), (quantity, value) in balances.items()
        ],
        "movements": list(reversed(recent)),
        "movements_truncated": movement_count > MOVEMENT_LIMIT,
        "can_prepare": ability["can_prepare"] and ability["posting_available"],
        "can_manage_catalog": ability["can_manage_accounts"] and ability["posting_available"],
        "purchase_enabled": module_state(db, company, "payables", set())["enabled"],
        "sale_enabled": module_state(db, company, "receivables", set())["enabled"],
    }


def _stock_money(value: str | Decimal | int) -> str:
    try:
        return canonical_money(value)
    except ValueError as error:
        raise DomainError(
            "invalid_amount", "مبلغ عملیات کالا معتبر نیست یا از محدوده مجاز بزرگ‌تر است."
        ) from error


def _stock_date(db: Session, company: str, movement_date: date, latest: date | None) -> None:
    today = datetime.now(ZoneInfo(db.get(m.Company, company).timezone)).date()
    require(movement_date <= today, "inventory_future_date", "تاریخ گردش کالا در آینده است.", 409)
    require(
        latest is None or latest <= movement_date,
        "inventory_date_order",
        "تاریخ گردش نمی‌تواند پیش از آخرین گردش این کالا در انبار باشد.",
        409,
    )


def _lots(db: Session, company: str, item_id: str, warehouse_id: str) -> tuple[dict[str, Lot], date | None]:
    lots: dict[str, Lot] = {}
    latest = None
    for row in db.scalars(
        select(InventoryMovement)
        .where(
            InventoryMovement.company_id == company,
            InventoryMovement.item_id == item_id,
            InventoryMovement.warehouse_id == warehouse_id,
        )
        .order_by(InventoryMovement.sequence)
        .execution_options(yield_per=500)
    ):
        latest = row.date
        if row.kind == "purchase_goods":
            lots[row.journal_id] = Lot(row.quantity, row.evidence["unit_price_irr"])
        elif row.kind == "reversal" and row.evidence["reversed_kind"] == "purchase_goods":
            del lots[row.evidence["reversal_of"]]
        else:
            sign = 1 if row.kind == "reversal" else -1
            for layer in row.evidence["cost_layers"]:
                lots[layer["journal_id"]].remaining += sign * layer["quantity"]
    return lots, latest


def _fifo(lots: dict[str, Lot], quantity: int) -> tuple[list[dict], Decimal]:
    remaining = quantity
    total = Decimal(0)
    layers = []
    for journal_id, lot in lots.items():
        take = min(remaining, lot.remaining)
        if not take:
            continue
        layers.append({"journal_id": journal_id, "quantity": take, "unit_cost_irr": lot.unit_cost_irr})
        total += Decimal(lot.unit_cost_irr) * take
        remaining -= take
        if not remaining:
            break
    require(not remaining, "inventory_insufficient", "موجودی ثبت‌شده برای این فروش کافی نیست.", 409)
    return layers, total


def _stock_and_lines(
    db: Session, company: str, data: dict, operation_id: str
) -> tuple[dict, list[dict], dict[str, str], str]:
    kind = data["kind"]
    purchase = kind == "purchase_goods"
    require_module(db, company, MODULES[kind], ready=False)
    item = get_entity(db, InventoryItem, company, data["item_id"])
    warehouse = get_entity(db, InventoryWarehouse, company, data["warehouse_id"])
    if purchase:
        require(
            data["revenue_account_id"] is None and data["cost_account_id"] is None,
            "inventory_unexpected_account",
            "حساب درآمد و بهای فروش برای خرید کالا کاربرد ندارند.",
        )
        roles = {"other_asset": item.inventory_account_id, "trade_payable": data["counterparty_account_id"]}
    else:
        require(
            bool(data["revenue_account_id"] and data["cost_account_id"]),
            "inventory_sale_accounts_required",
            "حساب درآمد فروش و بهای تمام‌شده را انتخاب کنید.",
        )
        roles = {
            "trade_receivable": data["counterparty_account_id"],
            "revenue": data["revenue_account_id"],
            "expense": data["cost_account_id"],
            "other_asset": item.inventory_account_id,
        }
    require(
        len(set(roles.values())) == len(roles),
        "inventory_accounts_overlap",
        "حساب‌های گردش کالا باید متفاوت باشند.",
    )
    for role, account_id in roles.items():
        _require_account(db, company, account_id, role)

    quantity = data["quantity"]
    lots, latest = _lots(db, company, item.id, warehouse.id)
    _stock_date(db, company, data["date"], latest)
    price = Decimal(_stock_money(data["unit_price"]))
    require(
        price > 0 and price == price.to_integral_value(),
        "inventory_invalid_unit_price",
        "قیمت واحد باید یک عدد صحیح مثبت باشد.",
    )
    factor = 10 if data["unit"] == "TOMAN" else 1
    with localcontext() as context:
        context.prec = 60
        amount = _stock_money(price * quantity)
        unit_price_irr = _stock_money(price * factor)
        amount_irr = _stock_money(Decimal(unit_price_irr) * quantity)
        if purchase:
            _check_capacity(lots, quantity)
            layers, value_irr = [], amount_irr
            values = [amount, amount]
        else:
            layers, cost_irr = _fifo(lots, quantity)
            value_irr = _stock_money(-cost_irr)
            cost = _stock_money(cost_irr / factor)
            values = [amount, amount, cost, cost]
    lines = [
        {
            "account_id": account_id,
            "party_id": data["party_id"] if role in ("trade_receivable", "trade_payable", "revenue") else "",
            "debit": value if index % 2 == 0 else "0",
            "credit": value if index % 2 == 1 else "0",
        }
        for index, ((role, account_id), value) in enumerate(zip(roles.items(), values, strict=True))
    ]
    return (
        {
            "kind": kind,
            "item_id": item.id,
            "item_code": item.code,
            "item_name": item.name,
            "warehouse_id": warehouse.id,
            "warehouse_code": warehouse.code,
            "warehouse_name": warehouse.name,
            "operation_id": operation_id,
            "source_reference": data["source_reference"],
            "quantity": quantity if purchase else -quantity,
            "unit_price": _stock_money(price),
            "unit_price_irr": unit_price_irr,
            "amount_irr": amount_irr,
            "value_irr": value_irr,
            "cost_layers": layers,
            "policy_version": STOCK_POLICY,
        },
        lines,
        roles,
        amount,
    )


def _check_capacity(lots: dict[str, Lot], delta: int) -> None:
    require(
        sum(lot.remaining for lot in lots.values()) + delta <= MAX_STOCK_QUANTITY,
        "inventory_quantity_limit",
        "تعداد موجودی از محدوده مجاز بیشتر است.",
        409,
    )


def _require_unused_reference(db: Session, company: str, data: dict) -> None:
    journal = aliased(NativeJournal)
    reversal = aliased(NativeJournal)
    duplicate = db.scalar(
        select(OperationDraft.id)
        .join(Draft, and_(Draft.company_id == company, Draft.id == OperationDraft.draft_id))
        .outerjoin(journal, and_(journal.company_id == company, journal.draft_id == Draft.id))
        .outerjoin(reversal, and_(reversal.company_id == company, reversal.reversal_of == journal.id))
        .where(
            OperationDraft.company_id == company,
            OperationDraft.kind == data["kind"],
            OperationDraft.payload["source_reference"].as_string() == data["source_reference"],
            Draft.state != "discarded",
            reversal.id.is_(None),
        )
        .limit(1)
    )
    require(not duplicate, "operation_duplicate", "این مرجع عملیات کالا قبلاً استفاده شده است.", 409)


def create_draft(db: Session, company: str, user: m.User, data: dict) -> dict:
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه تهیه سند ندارید.", 403)
    require(
        ability["posting_available"], "primary_accounting_required", "کاربرد حسابداری اصلی لازم است.", 409
    )
    _require_unused_reference(db, company, data)
    identifier = m.uid()
    stock, lines, accounts, amount = _stock_and_lines(db, company, data, identifier)
    result = save_draft(db, company, user, data | {"lines": lines})
    origin = OperationDraft(
        id=identifier,
        company_id=company,
        draft_id=result["id"],
        kind=data["kind"],
        source_reference="inventory:" + identifier,
        payload=jsonable_encoder(
            data | {"amounts": {"amount": amount}, "accounts": accounts, "lines": lines, "stock": stock}
        ),
        actor_id=user.id,
        policy_version=POLICY,
    )
    db.add(origin)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "inventory.operation_prepared",
        identifier,
        {"draft_id": result["id"], "kind": origin.kind, "policy_version": STOCK_POLICY},
    )
    return {"operation_id": identifier, "draft": result, "financial_effect": False, "policy_version": POLICY}


def _reversal_stock(db: Session, company: str, draft: Draft, correction: dict) -> dict | None:
    original = get_entity(db, NativeJournal, company, correction["original_journal_id"])
    stock = original.snapshot.get("inventory")
    if not stock:
        return None
    require(
        correction["kind"] == "reversal",
        "inventory_replacement_required",
        "برای جایگزینی سند کالا، پس از برگشت عملیات جدید کالا بسازید.",
        409,
    )
    lots, latest = _lots(db, company, stock["item_id"], stock["warehouse_id"])
    _stock_date(db, company, draft.date, latest)
    if stock["kind"] == "purchase_goods":
        lot = lots.get(original.id)
        require(
            lot is not None and lot.remaining == stock["quantity"],
            "inventory_purchase_consumed",
            "بخشی از این خرید مصرف شده است؛ ابتدا فروش‌های وابسته را برگشت دهید.",
            409,
        )
    else:
        _check_capacity(lots, -stock["quantity"])
    return stock | {
        "kind": "reversal",
        "reversed_kind": stock["kind"],
        "reversal_of": original.id,
        "quantity": -stock["quantity"],
        "value_irr": _stock_money(Decimal(stock["value_irr"]).copy_negate()),
    }


def validate_posting(db: Session, company: str, draft: Draft, correction: dict | None) -> dict | None:
    if correction:
        return _reversal_stock(db, company, draft, correction)
    origin = db.scalar(
        select(OperationDraft).where(
            OperationDraft.company_id == company,
            OperationDraft.draft_id == draft.id,
            OperationDraft.kind.in_(GOODS_KINDS),
        )
    )
    if origin is None:
        return None
    data = origin.payload | {"date": date.fromisoformat(origin.payload["date"])}
    expected = validate_lines(db, company, {"unit": data["unit"], "lines": data["lines"]})
    require(
        draft.lines == expected
        and draft.date == data["date"]
        and draft.period_id == data["period_id"]
        and draft.original_unit == data["unit"]
        and draft.description == data["description"],
        "inventory_draft_changed",
        "پیش‌نویس با عملیات کالا یکسان نیست؛ از مسیر کالا پیش‌نویس تازه بسازید.",
        409,
    )
    stock, _lines, _accounts, _amount = _stock_and_lines(db, company, data, origin.id)
    require(
        stock == data["stock"],
        "inventory_cost_changed",
        "مبنای بهای کالا تغییر کرده است؛ پیش‌نویس را کنار بگذارید و دوباره بسازید.",
        409,
    )
    return stock


def add_posted_movement(db: Session, company: str, journal: NativeJournal, stock: dict) -> None:
    db.add(
        InventoryMovement(
            company_id=company,
            journal_id=journal.id,
            date=journal.date,
            sequence=journal.sequence,
            item_id=stock["item_id"],
            warehouse_id=stock["warehouse_id"],
            operation_id=stock["operation_id"],
            kind=stock["kind"],
            quantity=stock["quantity"],
            value_irr=stock["value_irr"],
            evidence=stock,
        )
    )
    db.flush()
