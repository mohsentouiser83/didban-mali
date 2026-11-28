"""Warehouse receipts and issues use the native draft and FIFO stock workflow."""

from decimal import Decimal, localcontext

from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .account_catalogue_service import non_postable_account_ids
from .accounting_models import Account, Draft
from .accounting_service import capabilities, save_draft
from .errors import require
from .http import paginate
from .inventory_models import InventoryItem, InventoryWarehouse
from .inventory_service import STOCK_POLICY, _check_capacity, _fifo, _lots, _stock_date, _stock_money
from .operation_models import OperationDraft
from .operation_numbering import allocate_reference
from .operation_service import POLICY
from .posting_models import NativeJournal
from .security import membership, module_override
from .services import get_entity
from .workflow import audit

VOUCHER_LABELS = {"warehouse_receipt": "رسید انبار", "warehouse_issue": "خروج انبار"}
DIRECTION_KINDS = {"receipts": "warehouse_receipt", "issues": "warehouse_issue"}
CREATE_SCOPE = ("inventory", "create")


def voucher_options(db: Session, company: str, user: m.User, member: m.Membership) -> dict:
    ability = capabilities(db, company, user)
    grant = module_override(member, CREATE_SCOPE)
    if not ability["posting_available"] or grant is False or (grant is None and not ability["can_prepare"]):
        return {"can_create": False, "items": [], "warehouses": [], "accounts": []}

    goods = list(db.scalars(
        select(InventoryItem)
        .where(InventoryItem.company_id == company, InventoryItem.item_kind == "goods")
        .order_by(InventoryItem.code)
    ))
    warehouses = db.scalars(
        select(InventoryWarehouse)
        .where(InventoryWarehouse.company_id == company, InventoryWarehouse.active.is_(True))
        .order_by(InventoryWarehouse.code)
    )
    accounts = db.scalars(
        select(Account).where(Account.company_id == company, Account.active.is_(True)).order_by(Account.code)
    )
    blocked = non_postable_account_ids(db, company) | {item.inventory_account_id for item in goods}
    return {
        "can_create": True,
        "items": [
            {"value": item.id, "label": f"{item.code} · {item.name}", "unit": item.base_unit}
            for item in goods if item.active
        ],
        "warehouses": [{"value": warehouse.id, "label": warehouse.name} for warehouse in warehouses],
        "accounts": [
            {"value": account.id, "label": f"{account.code} · {account.name}"}
            for account in accounts if account.id not in blocked
        ],
    }


def list_vouchers(db: Session, company: str, direction: str, limit: int, cursor: str | None) -> dict:
    page = paginate(
        db, OperationDraft, company, limit, cursor,
        filters=[OperationDraft.kind == DIRECTION_KINDS[direction]],
        transform=lambda operation: operation,
    )
    operations = page["items"]
    draft_ids = [operation.draft_id for operation in operations]
    if not draft_ids:
        return page
    states = dict(db.execute(
        select(Draft.id, Draft.state).where(Draft.company_id == company, Draft.id.in_(draft_ids))
    ).tuples().all())
    reversal = NativeJournal.__table__.alias("voucher_reversals")
    reversed_drafts = set(db.scalars(
        select(NativeJournal.draft_id)
        .join(reversal, (reversal.c.company_id == company) & (reversal.c.reversal_of == NativeJournal.id))
        .where(NativeJournal.company_id == company, NativeJournal.draft_id.in_(draft_ids))
    ))
    return page | {
        "items": [
            {
                "id": operation.id,
                "draft_id": operation.draft_id,
                "source_reference": operation.source_reference,
                "date": operation.payload["date"],
                "warehouse_name": operation.payload["stock"]["warehouse_name"],
                "item_count": len(operation.payload["items"]),
                "reference": operation.payload["reference"],
                "description": operation.payload["description"],
                "state": "reversed" if operation.draft_id in reversed_drafts else states[operation.draft_id],
            }
            for operation in operations
        ],
    }


def voucher_stock_and_lines(db: Session, company: str, data: dict, operation_id: str) -> tuple[dict, list[dict]]:
    warehouse = get_entity(db, InventoryWarehouse, company, data["warehouse_id"])
    require(warehouse.active, "inactive_warehouse", "انبار انتخاب‌شده غیرفعال است.", 409)
    offset_account = get_entity(db, Account, company, data["offset_account_id"])
    offset_is_inventory = db.scalar(select(InventoryItem.id).where(
        InventoryItem.company_id == company,
        InventoryItem.item_kind == "goods",
        InventoryItem.inventory_account_id == offset_account.id,
    ).limit(1))
    require(not offset_is_inventory, "inventory_offset_account", "حساب مقابل باید خارج از حساب‌های موجودی کالا باشد.")

    kind = data["kind"]
    receipt = kind == "warehouse_receipt"
    require(
        len({row["item_id"] for row in data["items"]}) == len(data["items"]),
        "duplicate_voucher_item", "هر کالا را یک‌بار در سند وارد کنید.",
    )
    movements: list[dict] = []
    lines: list[dict] = []
    with localcontext() as context:
        context.prec = 60
        for index, row in enumerate(data["items"]):
            item = get_entity(db, InventoryItem, company, row["item_id"])
            require(item.active and item.item_kind == "goods", "invalid_voucher_item", "کالای انباری فعال انتخاب کنید.", 409)
            require(item.inventory_account_id, "inventory_account_required", "حساب موجودی کالا تعریف نشده است.", 409)
            lots, latest = _lots(db, company, item.id, warehouse.id)
            _stock_date(db, company, data["date"], latest)
            quantity = row["quantity"]
            movement = {
                "kind": "adjustment",
                "voucher_kind": kind,
                "line_index": index,
                "item_id": item.id,
                "item_code": item.code,
                "item_name": item.name,
                "base_unit": item.base_unit,
                "warehouse_id": warehouse.id,
                "warehouse_code": warehouse.code,
                "warehouse_name": warehouse.name,
                "operation_id": operation_id,
                "source_reference": data["source_reference"],
                "policy_version": STOCK_POLICY,
            }
            if receipt:
                _check_capacity(lots, quantity)
                price = Decimal(_stock_money(row["unit_price_irr"]))
                require(price > 0, "inventory_invalid_unit_price", "بهای واحد باید عدد صحیح مثبت باشد.")
                cost = price * quantity
                movement.update(unit_price_irr=_stock_money(price), quantity=quantity, value_irr=_stock_money(cost))
                debit_id, credit_id = item.inventory_account_id, offset_account.id
            else:
                layers, cost = _fifo(lots, quantity)
                movement.update(cost_layers=layers, quantity=-quantity, value_irr=_stock_money(-cost))
                debit_id, credit_id = offset_account.id, item.inventory_account_id
            value = _stock_money(cost)
            lines.extend([
                {"account_id": debit_id, "party_id": "", "debit": value, "credit": "0"},
                {"account_id": credit_id, "party_id": "", "debit": "0", "credit": value},
            ])
            movements.append(movement)
    return {
        "kind": kind,
        "operation_id": operation_id,
        "warehouse_name": warehouse.name,
        "movements": movements,
    }, lines


def create_voucher(db: Session, company: str, user: m.User, kind: str, data: dict) -> dict:
    membership(db, company, user, "write", scope=CREATE_SCOPE)
    require(
        capabilities(db, company, user)["posting_available"],
        "primary_accounting_required", "کاربرد حسابداری اصلی لازم است.", 409,
    )
    identifier = m.uid()
    data = data | {
        "kind": kind,
        "unit": "IRR",
        "description": data["description"].strip() or VOUCHER_LABELS[kind],
        "reference": data["reference"].strip(),
        "source_reference": allocate_reference(db, company, kind),
    }
    stock, lines = voucher_stock_and_lines(db, company, data, identifier)
    payload = data | {"stock": stock, "lines": lines}
    draft = save_draft(db, company, user, payload, scope=CREATE_SCOPE)
    db.add(OperationDraft(
        id=identifier,
        company_id=company,
        draft_id=draft["id"],
        kind=kind,
        source_reference=data["source_reference"],
        payload=jsonable_encoder(payload),
        actor_id=user.id,
        policy_version=POLICY,
    ))
    db.flush()
    audit(db, company, user.id, "inventory.operation_prepared", identifier, {
        "draft_id": draft["id"], "kind": kind, "policy_version": STOCK_POLICY,
    })
    return {"operation_id": identifier, "draft": draft, "source_reference": data["source_reference"], "financial_effect": False}


def reverse_voucher(db: Session, company: str, draft: Draft, original: NativeJournal, stock: dict) -> dict:
    movements = []
    for movement in stock["movements"]:
        lots, latest = _lots(db, company, movement["item_id"], movement["warehouse_id"])
        _stock_date(db, company, draft.date, latest)
        quantity = movement["quantity"]
        if quantity > 0:
            lot = lots.get(original.id)
            require(
                lot is not None and lot.remaining == quantity,
                "inventory_receipt_consumed", "ابتدا گردش‌های مصرف‌کنندهٔ این رسید را برگشت دهید.", 409,
            )
        else:
            _check_capacity(lots, -quantity)
        movements.append(movement | {
            "kind": "reversal", "reversed_kind": movement["kind"], "reversal_of": original.id,
            "quantity": -quantity, "value_irr": _stock_money(Decimal(movement["value_irr"]).copy_negate()),
        })
    return stock | {"kind": "reversal", "movements": movements}
