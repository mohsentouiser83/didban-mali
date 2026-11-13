"""Perpetual stock movements backed by exact, human-approved journal versions."""

from collections import deque
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, localcontext
from zoneinfo import ZoneInfo

from fastapi.encoders import jsonable_encoder
from sqlalchemy import and_, func, select
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
from .security import membership
from .services import check_version, get_entity
from .workflow import audit, serialize_fact

MODULES = {"purchase_goods": "payables", "sale_goods": "receivables"}
GOODS_KINDS = frozenset(MODULES)
INVENTORY_OPERATION_KINDS = GOODS_KINDS | {"opening_stock", "transfer_goods", "stock_adjustment"}
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


def update_item(
    db: Session, company: str, user: m.User, item_id: str, data: dict, version: int | None = None
) -> dict:
    _require_catalog_permission(db, company, user)
    item = get_entity(db, InventoryItem, company, item_id)
    if version is not None:
        check_version(item, version)
    if "code" in data and data["code"] is not None and data["code"] != item.code:
        duplicate = db.scalar(
            select(InventoryItem.id).where(
                InventoryItem.company_id == company,
                InventoryItem.code == data["code"],
                InventoryItem.id != item_id,
            )
        )
        require(not duplicate, "inventory_duplicate_code", "این کد قبلاً ثبت شده است.", 409)
        item.code = data["code"]
    if "name" in data and data["name"] is not None:
        item.name = data["name"]
    if "active" in data and data["active"] is not None:
        item.active = bool(data["active"])
    if "inventory_account_id" in data and data["inventory_account_id"] != item.inventory_account_id:
        has_movements = db.scalar(
            select(InventoryMovement.id)
            .where(InventoryMovement.company_id == company, InventoryMovement.item_id == item_id)
            .limit(1)
        )
        require(
            not has_movements,
            "inventory_account_locked",
            "حساب معین کالایی که گردش دارد قابل تغییر نیست.",
            409,
        )
        _require_account(db, company, data["inventory_account_id"], "other_asset")
        item.inventory_account_id = data["inventory_account_id"]
    item.version += 1
    db.flush()
    audit(db, company, user.id, "inventory.item_updated", item.id)
    return serialize_fact(item)


def update_warehouse(
    db: Session, company: str, user: m.User, warehouse_id: str, data: dict, version: int | None = None
) -> dict:
    _require_catalog_permission(db, company, user)
    wh = get_entity(db, InventoryWarehouse, company, warehouse_id)
    if version is not None:
        check_version(wh, version)
    if "code" in data and data["code"] is not None and data["code"] != wh.code:
        duplicate = db.scalar(
            select(InventoryWarehouse.id).where(
                InventoryWarehouse.company_id == company,
                InventoryWarehouse.code == data["code"],
                InventoryWarehouse.id != warehouse_id,
            )
        )
        require(not duplicate, "inventory_duplicate_code", "این کد قبلاً ثبت شده است.", 409)
        wh.code = data["code"]
    if "name" in data and data["name"] is not None:
        wh.name = data["name"]
    if "active" in data and data["active"] is not None:
        wh.active = bool(data["active"])
    wh.version += 1
    db.flush()
    audit(db, company, user.id, "inventory.warehouse_updated", wh.id)
    return serialize_fact(wh)


def delete_item(db: Session, company: str, user: m.User, item_id: str) -> dict:
    _require_catalog_permission(db, company, user)
    item = get_entity(db, InventoryItem, company, item_id)
    has_movements = db.scalar(
        select(InventoryMovement.id)
        .where(InventoryMovement.company_id == company, InventoryMovement.item_id == item_id)
        .limit(1)
    )
    require(
        not has_movements,
        "inventory_item_referenced",
        "این کالا دارای گردش انبار است و قابل حذف نیست؛ می‌توانید آن را غیرفعال کنید.",
        409,
    )
    db.delete(item)
    db.flush()
    audit(db, company, user.id, "inventory.item_deleted", item_id)
    return {"deleted": True, "id": item_id}


def delete_warehouse(db: Session, company: str, user: m.User, warehouse_id: str) -> dict:
    _require_catalog_permission(db, company, user)
    wh = get_entity(db, InventoryWarehouse, company, warehouse_id)
    has_movements = db.scalar(
        select(InventoryMovement.id)
        .where(InventoryMovement.company_id == company, InventoryMovement.warehouse_id == warehouse_id)
        .limit(1)
    )
    require(
        not has_movements,
        "inventory_warehouse_referenced",
        "این انبار دارای گردش است و قابل حذف نیست؛ می‌توانید آن را غیرفعال کنید.",
        409,
    )
    db.delete(wh)
    db.flush()
    audit(db, company, user.id, "inventory.warehouse_deleted", warehouse_id)
    return {"deleted": True, "id": warehouse_id}


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
        if row.kind in ("purchase_goods", "opening_stock", "transfer_in") or (
            row.kind == "adjustment" and row.quantity > 0
        ):
            lots[row.journal_id] = Lot(row.quantity, row.evidence.get("unit_price_irr", "0"))
        elif row.kind == "reversal" and row.evidence.get("reversed_kind") in (
            "purchase_goods",
            "opening_stock",
            "transfer_in",
        ):
            if row.evidence.get("reversal_of") in lots:
                del lots[row.evidence["reversal_of"]]
        else:
            sign = 1 if row.kind == "reversal" else -1
            for layer in row.evidence.get("cost_layers", []):
                if layer["journal_id"] in lots:
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
    require(item.active, "inactive_item", "کالای انتخاب‌شده غیرفعال است.", 409)
    require(warehouse.active, "inactive_warehouse", "انبار انتخاب‌شده غیرفعال است.", 409)
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
    factor = 10 if data.get("unit", "IRR") == "TOMAN" else 1
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


def _opening_stock_and_lines(
    db: Session, company: str, data: dict, operation_id: str
) -> tuple[dict, list[dict], dict[str, str], str]:
    item = get_entity(db, InventoryItem, company, data["item_id"])
    warehouse = get_entity(db, InventoryWarehouse, company, data["warehouse_id"])
    require(item.active, "inactive_item", "کالای انتخاب‌شده غیرفعال است.", 409)
    require(warehouse.active, "inactive_warehouse", "انبار انتخاب‌شده غیرفعال است.", 409)
    _require_account(db, company, data["equity_account_id"], "equity")

    duplicate = db.scalar(
        select(OperationDraft.id)
        .join(Draft, and_(Draft.company_id == company, Draft.id == OperationDraft.draft_id))
        .where(
            OperationDraft.company_id == company,
            OperationDraft.id != operation_id,
            OperationDraft.kind == "opening_stock",
            OperationDraft.payload["item_id"].as_string() == item.id,
            OperationDraft.payload["warehouse_id"].as_string() == warehouse.id,
            OperationDraft.payload["period_id"].as_string() == data["period_id"],
            Draft.state != "discarded",
        )
        .limit(1)
    )
    require(not duplicate, "opening_stock_exists", "موجودی اول دوره این کالا در این انبار قبلاً ثبت شده است.", 409)

    quantity = data["quantity"]
    price = Decimal(_stock_money(data["unit_price"]))
    require(
        price > 0 and price == price.to_integral_value(),
        "inventory_invalid_unit_price",
        "قیمت واحد باید عدد صحیح مثبت باشد.",
    )
    factor = 10 if data.get("unit", "IRR") == "TOMAN" else 1
    with localcontext() as context:
        context.prec = 60
        amount = _stock_money(price * quantity)
        unit_price_irr = _stock_money(price * factor)
        amount_irr = _stock_money(Decimal(unit_price_irr) * quantity)

    roles = {"other_asset": item.inventory_account_id, "equity": data["equity_account_id"]}
    lines = [
        {"account_id": item.inventory_account_id, "party_id": "", "debit": amount, "credit": "0"},
        {"account_id": data["equity_account_id"], "party_id": "", "debit": "0", "credit": amount},
    ]
    stock = {
        "kind": "opening_stock",
        "item_id": item.id,
        "item_code": item.code,
        "item_name": item.name,
        "warehouse_id": warehouse.id,
        "warehouse_code": warehouse.code,
        "warehouse_name": warehouse.name,
        "operation_id": operation_id,
        "source_reference": data["source_reference"],
        "quantity": quantity,
        "unit_price": _stock_money(price),
        "unit_price_irr": unit_price_irr,
        "amount_irr": amount_irr,
        "value_irr": amount_irr,
        "policy_version": STOCK_POLICY,
    }
    return stock, lines, roles, amount


def create_opening_stock_draft(db: Session, company: str, user: m.User, data: dict) -> dict:
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه تهیه سند ندارید.", 403)
    require(
        ability["posting_available"], "primary_accounting_required", "کاربرد حسابداری اصلی لازم است.", 409
    )
    period = get_entity(db, m.Period, company, data["period_id"])
    data = {"date": period.start, "description": "موجودی اول دوره انبار", "unit": "IRR"} | data
    _require_unused_reference(db, company, data | {"kind": "opening_stock"})
    identifier = m.uid()
    stock, lines, accounts, amount = _opening_stock_and_lines(db, company, data, identifier)
    result = save_draft(db, company, user, data | {"lines": lines})
    origin = OperationDraft(
        id=identifier,
        company_id=company,
        draft_id=result["id"],
        kind="opening_stock",
        source_reference="inventory:" + identifier,
        payload=jsonable_encoder(
            data
            | {
                "kind": "opening_stock",
                "amounts": {"amount": amount},
                "accounts": accounts,
                "lines": lines,
                "stock": stock,
            }
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


def _transfer_stock_and_lines(
    db: Session, company: str, data: dict, operation_id: str
) -> tuple[dict, list[dict], dict[str, str], str]:
    item = get_entity(db, InventoryItem, company, data["item_id"])
    src_wh = get_entity(db, InventoryWarehouse, company, data["source_warehouse_id"])
    dst_wh = get_entity(db, InventoryWarehouse, company, data["destination_warehouse_id"])
    require(item.active, "inactive_item", "کالای انتخاب‌شده غیرفعال است.", 409)
    require(src_wh.active, "inactive_warehouse", "انبار مبدأ غیرفعال است.", 409)
    require(dst_wh.active, "inactive_warehouse", "انبار مقصد غیرفعال است.", 409)
    require(src_wh.id != dst_wh.id, "inventory_same_warehouse", "انبار مبدأ و مقصد نمی‌توانند یکسان باشند.", 409)

    quantity = data["quantity"]
    lots, latest = _lots(db, company, item.id, src_wh.id)
    _stock_date(db, company, data["date"], latest)
    layers, cost_irr = _fifo(lots, quantity)

    dst_lots, _ = _lots(db, company, item.id, dst_wh.id)
    _check_capacity(dst_lots, quantity)

    cost_str = _stock_money(cost_irr)
    unit_price_irr = _stock_money(cost_irr / quantity)

    lines = [
        {"account_id": item.inventory_account_id, "party_id": "", "debit": cost_str, "credit": "0"},
        {"account_id": item.inventory_account_id, "party_id": "", "debit": "0", "credit": cost_str},
    ]
    roles = {"other_asset": item.inventory_account_id}
    stock = {
        "kind": "transfer_goods",
        "item_id": item.id,
        "item_code": item.code,
        "item_name": item.name,
        "warehouse_id": src_wh.id,
        "source_warehouse_id": src_wh.id,
        "destination_warehouse_id": dst_wh.id,
        "operation_id": operation_id,
        "quantity": quantity,
        "cost_irr": cost_str,
        "policy_version": STOCK_POLICY,
        "movements": [
            {
                "kind": "transfer_out",
                "item_id": item.id,
                "warehouse_id": src_wh.id,
                "operation_id": operation_id,
                "quantity": -quantity,
                "value_irr": _stock_money(-cost_irr),
                "cost_layers": layers,
                "source_reference": data["source_reference"],
            },
            {
                "kind": "transfer_in",
                "item_id": item.id,
                "warehouse_id": dst_wh.id,
                "operation_id": operation_id,
                "quantity": quantity,
                "value_irr": cost_str,
                "unit_price_irr": unit_price_irr,
                "source_reference": data["source_reference"],
            },
        ],
    }
    return stock, lines, roles, cost_str


def create_transfer_draft(db: Session, company: str, user: m.User, data: dict) -> dict:
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه تهیه سند ندارید.", 403)
    require(
        ability["posting_available"], "primary_accounting_required", "کاربرد حسابداری اصلی لازم است.", 409
    )
    _require_unused_reference(db, company, data | {"kind": "transfer_goods"})
    identifier = m.uid()
    stock, lines, accounts, amount = _transfer_stock_and_lines(db, company, data, identifier)
    result = save_draft(db, company, user, data | {"unit": "IRR", "lines": lines})
    origin = OperationDraft(
        id=identifier,
        company_id=company,
        draft_id=result["id"],
        kind="transfer_goods",
        source_reference="inventory:" + identifier,
        payload=jsonable_encoder(
            data
            | {
                "kind": "transfer_goods",
                "unit": "IRR",
                "amounts": {"amount": amount},
                "accounts": accounts,
                "lines": lines,
                "stock": stock,
            }
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


def _adjustment_stock_and_lines(
    db: Session, company: str, data: dict, operation_id: str
) -> tuple[dict, list[dict], dict[str, str], str]:
    item = get_entity(db, InventoryItem, company, data["item_id"])
    warehouse = get_entity(db, InventoryWarehouse, company, data["warehouse_id"])
    require(item.active, "inactive_item", "کالای انتخاب‌شده غیرفعال است.", 409)
    require(warehouse.active, "inactive_warehouse", "انبار انتخاب‌شده غیرفعال است.", 409)

    lots, latest = _lots(db, company, item.id, warehouse.id)
    _stock_date(db, company, data["date"], latest)

    system_quantity = sum(lot.remaining for lot in lots.values())
    counted_quantity = data["counted_quantity"]
    diff = counted_quantity - system_quantity
    require(
        diff != 0,
        "inventory_no_difference",
        "تعداد شمارش‌شده با موجودی سیستم برابر است و نیازی به تعدیل ندارد.",
        409,
    )

    adj_account = get_entity(db, Account, company, data["adjustment_account_id"])
    require(adj_account.active, "inactive_account", "حساب تعدیل غیرفعال است.")

    if diff < 0:
        abs_diff = abs(diff)
        layers, cost_irr = _fifo(lots, abs_diff)
        cost_str = _stock_money(cost_irr)
        lines = [
            {"account_id": data["adjustment_account_id"], "party_id": "", "debit": cost_str, "credit": "0"},
            {"account_id": item.inventory_account_id, "party_id": "", "debit": "0", "credit": cost_str},
        ]
        stock = {
            "kind": "adjustment",
            "item_id": item.id,
            "item_code": item.code,
            "item_name": item.name,
            "warehouse_id": warehouse.id,
            "warehouse_code": warehouse.code,
            "warehouse_name": warehouse.name,
            "operation_id": operation_id,
            "source_reference": data["source_reference"],
            "quantity": diff,
            "value_irr": _stock_money(-cost_irr),
            "difference": diff,
            "system_quantity": system_quantity,
            "counted_quantity": counted_quantity,
            "cost_layers": layers,
            "policy_version": STOCK_POLICY,
        }
        amount_str = cost_str
    else:
        price_val = data.get("unit_price")
        if not price_val:
            latest_lot = list(lots.values())[-1] if lots else None
            require(
                latest_lot is not None,
                "inventory_valuation_required",
                "برای اضافه انبار قیمت واحد وارد کنید.",
                409,
            )
            unit_price_irr = latest_lot.unit_cost_irr
        else:
            factor = 10 if data.get("unit") == "TOMAN" else 1
            unit_price_irr = _stock_money(Decimal(_stock_money(price_val)) * factor)

        with localcontext() as context:
            context.prec = 60
            val_irr = _stock_money(Decimal(unit_price_irr) * diff)

        lines = [
            {"account_id": item.inventory_account_id, "party_id": "", "debit": val_irr, "credit": "0"},
            {"account_id": data["adjustment_account_id"], "party_id": "", "debit": "0", "credit": val_irr},
        ]
        stock = {
            "kind": "adjustment",
            "item_id": item.id,
            "item_code": item.code,
            "item_name": item.name,
            "warehouse_id": warehouse.id,
            "warehouse_code": warehouse.code,
            "warehouse_name": warehouse.name,
            "operation_id": operation_id,
            "source_reference": data["source_reference"],
            "quantity": diff,
            "value_irr": val_irr,
            "unit_price_irr": unit_price_irr,
            "difference": diff,
            "system_quantity": system_quantity,
            "counted_quantity": counted_quantity,
            "policy_version": STOCK_POLICY,
        }
        amount_str = val_irr

    roles = {"inventory": item.inventory_account_id, "adjustment": data["adjustment_account_id"]}
    return stock, lines, roles, amount_str


def create_adjustment_draft(db: Session, company: str, user: m.User, data: dict) -> dict:
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه تهیه سند ندارید.", 403)
    require(
        ability["posting_available"], "primary_accounting_required", "کاربرد حسابداری اصلی لازم است.", 409
    )
    _require_unused_reference(db, company, data | {"kind": "stock_adjustment"})
    identifier = m.uid()
    stock, lines, accounts, amount = _adjustment_stock_and_lines(db, company, data, identifier)
    unit = data.get("unit", "IRR")
    result = save_draft(db, company, user, data | {"unit": unit, "lines": lines})
    origin = OperationDraft(
        id=identifier,
        company_id=company,
        draft_id=result["id"],
        kind="stock_adjustment",
        source_reference="inventory:" + identifier,
        payload=jsonable_encoder(
            data
            | {
                "kind": "stock_adjustment",
                "unit": unit,
                "amounts": {"amount": amount},
                "accounts": accounts,
                "lines": lines,
                "stock": stock,
            }
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
            OperationDraft.kind.in_(INVENTORY_OPERATION_KINDS),
        )
    )
    if origin is None:
        return None
    data = origin.payload | {"date": date.fromisoformat(origin.payload["date"])}
    expected = validate_lines(db, company, {"unit": data.get("unit", "IRR"), "lines": data["lines"]})
    require(
        draft.lines == expected
        and draft.date == data["date"]
        and draft.period_id == data["period_id"]
        and draft.original_unit == data.get("unit", "IRR")
        and draft.description == data["description"],
        "inventory_draft_changed",
        "پیش‌نویس با عملیات کالا یکسان نیست؛ از مسیر کالا پیش‌نویس تازه بسازید.",
        409,
    )
    if origin.kind in GOODS_KINDS:
        stock, _lines, _accounts, _amount = _stock_and_lines(db, company, data, origin.id)
    elif origin.kind == "opening_stock":
        stock, _lines, _accounts, _amount = _opening_stock_and_lines(db, company, data, origin.id)
    elif origin.kind == "transfer_goods":
        stock, _lines, _accounts, _amount = _transfer_stock_and_lines(db, company, data, origin.id)
    elif origin.kind == "stock_adjustment":
        stock, _lines, _accounts, _amount = _adjustment_stock_and_lines(db, company, data, origin.id)
    else:
        return None
    require(
        stock == data["stock"],
        "inventory_cost_changed",
        "مبنای بهای کالا تغییر کرده است؛ پیش‌نویس را کنار بگذارید و دوباره بسازید.",
        409,
    )
    return stock


def add_posted_movement(db: Session, company: str, journal: NativeJournal, stock: dict) -> None:
    movements = stock.get("movements")
    base_seq = (
        db.scalar(select(func.max(InventoryMovement.sequence)).where(InventoryMovement.company_id == company))
        or 0
    )
    if movements and isinstance(movements, list):
        for m_data in movements:
            base_seq += 1
            db.add(
                InventoryMovement(
                    company_id=company,
                    journal_id=journal.id,
                    date=journal.date,
                    sequence=base_seq,
                    item_id=m_data["item_id"],
                    warehouse_id=m_data["warehouse_id"],
                    operation_id=m_data["operation_id"],
                    kind=m_data["kind"],
                    quantity=m_data["quantity"],
                    value_irr=m_data["value_irr"],
                    evidence=m_data,
                )
            )
    else:
        base_seq += 1
        db.add(
            InventoryMovement(
                company_id=company,
                journal_id=journal.id,
                date=journal.date,
                sequence=base_seq,
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


def cardex(
    db: Session,
    company: str,
    user: m.User,
    *,
    item_id: str | None = None,
    warehouse_id: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    kind: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    membership(db, company, user)
    items = {row.id: row for row in db.scalars(select(InventoryItem).where(InventoryItem.company_id == company))}
    warehouses = {
        row.id: row for row in db.scalars(select(InventoryWarehouse).where(InventoryWarehouse.company_id == company))
    }

    # Opening balance before from_date
    opening_qty = 0
    opening_val = Decimal(0)
    if from_date:
        prior_stmt = select(InventoryMovement).where(
            InventoryMovement.company_id == company,
            InventoryMovement.date < from_date,
        )
        if item_id:
            prior_stmt = prior_stmt.where(InventoryMovement.item_id == item_id)
        if warehouse_id:
            prior_stmt = prior_stmt.where(InventoryMovement.warehouse_id == warehouse_id)

        for pm in db.scalars(prior_stmt):
            opening_qty += pm.quantity
            opening_val += Decimal(pm.value_irr)

    # Movements in range
    stmt = select(InventoryMovement).where(InventoryMovement.company_id == company)
    if item_id:
        stmt = stmt.where(InventoryMovement.item_id == item_id)
    if warehouse_id:
        stmt = stmt.where(InventoryMovement.warehouse_id == warehouse_id)
    if from_date:
        stmt = stmt.where(InventoryMovement.date >= from_date)
    if to_date:
        stmt = stmt.where(InventoryMovement.date <= to_date)
    if kind:
        stmt = stmt.where(InventoryMovement.kind == kind)

    all_movements = list(db.scalars(stmt.order_by(InventoryMovement.sequence)))
    total_records = len(all_movements)

    running_qty = opening_qty
    running_val = opening_val
    total_in_qty = 0
    total_in_val = Decimal(0)
    total_out_qty = 0
    total_out_val = Decimal(0)

    rows = []
    with localcontext() as context:
        context.prec = 60
        for m_row in all_movements:
            qty = m_row.quantity
            val = Decimal(m_row.value_irr)

            if qty > 0:
                in_qty = qty
                in_val = val
                out_qty = 0
                out_val = Decimal(0)
                total_in_qty += in_qty
                total_in_val += in_val
            else:
                in_qty = 0
                in_val = Decimal(0)
                out_qty = abs(qty)
                out_val = abs(val)
                total_out_qty += out_qty
                total_out_val += out_val

            running_qty += qty
            running_val += val

            item_obj = items.get(m_row.item_id)
            wh_obj = warehouses.get(m_row.warehouse_id)
            ev = m_row.evidence or {}

            rows.append({
                "sequence": m_row.sequence,
                "date": m_row.date.isoformat(),
                "kind": m_row.kind,
                "item_id": m_row.item_id,
                "item_code": item_obj.code if item_obj else "",
                "item_name": item_obj.name if item_obj else "",
                "warehouse_id": m_row.warehouse_id,
                "warehouse_name": wh_obj.name if wh_obj else "",
                "source_reference": ev.get("source_reference", ""),
                "journal_id": m_row.journal_id,
                "in_quantity": in_qty,
                "in_value_irr": aggregate_money(in_val),
                "out_quantity": out_qty,
                "out_value_irr": aggregate_money(out_val),
                "balance_quantity": running_qty,
                "balance_value_irr": aggregate_money(running_val),
            })

    paginated_rows = rows[offset : offset + limit]

    return {
        "total_records": total_records,
        "limit": limit,
        "offset": offset,
        "opening_quantity": opening_qty,
        "opening_value_irr": aggregate_money(opening_val),
        "total_in_quantity": total_in_qty,
        "total_in_value_irr": aggregate_money(total_in_val),
        "total_out_quantity": total_out_qty,
        "total_out_value_irr": aggregate_money(total_out_val),
        "closing_quantity": running_qty,
        "closing_value_irr": aggregate_money(running_val),
        "rows": paginated_rows,
    }


def valuation_report(
    db: Session,
    company: str,
    user: m.User,
    *,
    as_of: date | None = None,
) -> dict:
    membership(db, company, user)
    items = {row.id: row for row in db.scalars(select(InventoryItem).where(InventoryItem.company_id == company))}
    warehouses = {
        row.id: row for row in db.scalars(select(InventoryWarehouse).where(InventoryWarehouse.company_id == company))
    }

    stmt = select(InventoryMovement).where(InventoryMovement.company_id == company)
    if as_of:
        stmt = stmt.where(InventoryMovement.date <= as_of)

    movements = list(db.scalars(stmt))
    balances: dict[tuple[str, str], tuple[int, Decimal]] = {}

    with localcontext() as context:
        context.prec = 60
        for m_row in movements:
            bucket = (m_row.item_id, m_row.warehouse_id)
            q, v = balances.get(bucket, (0, Decimal(0)))
            balances[bucket] = (q + m_row.quantity, v + Decimal(m_row.value_irr))

    report_rows = []
    total_val = Decimal(0)
    for (i_id, w_id), (qty, val) in sorted(balances.items()):
        total_val += val
        item_obj = items.get(i_id)
        wh_obj = warehouses.get(w_id)
        unit_cost = (val / qty) if qty > 0 else Decimal(0)
        report_rows.append({
            "item_id": i_id,
            "item_code": item_obj.code if item_obj else "",
            "item_name": item_obj.name if item_obj else "",
            "warehouse_id": w_id,
            "warehouse_name": wh_obj.name if wh_obj else "",
            "quantity": qty,
            "unit_cost_irr": aggregate_money(unit_cost),
            "total_value_irr": aggregate_money(val),
        })

    return {
        "as_of": as_of.isoformat() if as_of else None,
        "total_inventory_value_irr": aggregate_money(total_val),
        "items_count": len(report_rows),
        "rows": report_rows,
    }


def item_profit_report(
    db: Session,
    company: str,
    user: m.User,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
) -> dict:
    membership(db, company, user)
    items = {row.id: row for row in db.scalars(select(InventoryItem).where(InventoryItem.company_id == company))}

    stmt = select(InventoryMovement).where(
        InventoryMovement.company_id == company,
        InventoryMovement.kind == "sale_goods",
    )
    if from_date:
        stmt = stmt.where(InventoryMovement.date >= from_date)
    if to_date:
        stmt = stmt.where(InventoryMovement.date <= to_date)

    sales = list(db.scalars(stmt))
    by_item: dict[str, dict] = {}

    total_revenue = Decimal(0)
    total_cogs = Decimal(0)

    with localcontext() as context:
        context.prec = 60
        for s in sales:
            i_id = s.item_id
            ev = s.evidence or {}
            qty = abs(s.quantity)
            revenue = Decimal(ev.get("amount_irr", "0"))
            cogs = abs(Decimal(s.value_irr))

            total_revenue += revenue
            total_cogs += cogs

            if i_id not in by_item:
                item_obj = items.get(i_id)
                by_item[i_id] = {
                    "item_id": i_id,
                    "item_code": item_obj.code if item_obj else "",
                    "item_name": item_obj.name if item_obj else "",
                    "quantity_sold": 0,
                    "revenue_irr": Decimal(0),
                    "cogs_irr": Decimal(0),
                }

            rec = by_item[i_id]
            rec["quantity_sold"] += qty
            rec["revenue_irr"] += revenue
            rec["cogs_irr"] += cogs

    rows = []
    for i_id, rec in sorted(by_item.items()):
        rev = rec["revenue_irr"]
        cg = rec["cogs_irr"]
        gp = rev - cg
        margin = round(float((gp / rev) * 100), 2) if rev > Decimal(0) else 0.0
        rows.append({
            "item_id": i_id,
            "item_code": rec["item_code"],
            "item_name": rec["item_name"],
            "quantity_sold": rec["quantity_sold"],
            "revenue_irr": aggregate_money(rev),
            "cogs_irr": aggregate_money(cg),
            "gross_profit_irr": aggregate_money(gp),
            "margin_percent": margin,
        })

    total_gp = total_revenue - total_cogs
    overall_margin = round(float((total_gp / total_revenue) * 100), 2) if total_revenue > Decimal(0) else 0.0

    return {
        "from_date": from_date.isoformat() if from_date else None,
        "to_date": to_date.isoformat() if to_date else None,
        "total_revenue_irr": aggregate_money(total_revenue),
        "total_cogs_irr": aggregate_money(total_cogs),
        "total_gross_profit_irr": aggregate_money(total_gp),
        "overall_margin_percent": overall_margin,
        "rows": rows,
    }
