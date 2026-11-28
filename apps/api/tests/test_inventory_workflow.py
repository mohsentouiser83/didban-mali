"""Stock changes and COGS use the exact approved native journal."""

from test_api_delivery import scenario

SETUP = r"""
from didban.accounting_models import Account
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.native_reporting_models import NativeAccountRole

owner = client_for("owner")
manager = client_for("finance_manager")
advisor = client_for("advisor")
viewer = client_for("viewer")
outsider = client_for("outsider")
book = base + "/accounting"
stock = book + "/inventory"
invoices = book + "/native-invoices"
role_map = {
    "stock": "other_asset", "ar": "trade_receivable", "ap": "trade_payable",
    "revenue": "revenue", "cogs": "expense", "bank": "bank", "ar_other": "trade_receivable",
}
with transaction("company-a") as db:
    db.add(CompanyAccountingSetup(company_id="company-a", mode="primary"))
    db.add_all([Account(id=key, company_id="company-a", code=key, name=key) for key in role_map])
    db.flush()
    db.add_all([
        NativeAccountRole(company_id="company-a", account_id=key, role=role, actor_id=users["owner"])
        for key, role in role_map.items()
    ])
with transaction("company-b") as db:
    db.add(CompanyAccountingSetup(company_id="company-b", mode="primary"))
    foreign_period = m.Period(
        company_id="company-b", name="شهریور", start=date(2026, 9, 1), end=date(2026, 9, 30),
    )
    db.add(foreign_period)
    db.flush()
    foreign_period_id = foreign_period.id

def checked(response, status=200):
    assert response.status_code == status, response.text
    return response.json()

def rejected(response, status, code):
    assert checked(response, status)["code"] == code, response.text

item_input = {"name": "کالای آزمون"}
item = checked(command(owner, "POST", stock + "/items", item_input), 201)
assert item["inventory_account_id"] == "stock", item
assert command(owner, "POST", stock + "/items", item_input | {"inventory_account_id": "ar"}).status_code == 422
assert command(owner, "PATCH", stock + "/items/" + item["id"], {"inventory_account_id": "ar"}).status_code == 422
warehouse = checked(command(owner, "POST", stock + "/warehouses", {"code": "MAIN", "name": "انبار اصلی"}), 201)

def goods_input(kind, ref, qty, unit_price, day, unit="IRR", **extra):
    sale = kind == "sale_goods"
    return {
        "kind": kind, "item_id": item["id"], "warehouse_id": warehouse["id"],
        "quantity": qty, "unit_price": unit_price, "unit": unit, "period_id": period_id,
        "date": day, "description": ref, "source_reference": ref,
        "party_id": "buyer" if sale else "supplier",
        "counterparty_account_id": "ar" if sale else "ap",
        **({"revenue_account_id": "revenue", "cost_account_id": "cogs"} if sale else {}),
        **extra,
    }

def goods(kind, ref, qty, unit_price, day, unit="IRR"):
    payload = goods_input(kind, ref, qty, unit_price, day, unit)
    return checked(command(advisor, "POST", stock + "/drafts", payload), 201)

def preview(draft_id):
    return manager.get(book + f"/drafts/{draft_id}/posting-preview")

def approval(draft_id):
    proposal = checked(preview(draft_id))
    return {key: proposal[key] for key in ("draft_id", "expected_version", "digest")}

def post(proposal, client=manager, key=None):
    return command(client, "POST", book + "/postings", {"items": [proposal]}, key=key)

def post_draft(draft_id):
    return checked(post(approval(draft_id)), 201)["items"][0]

def reversal(journal_id, day):
    return command(manager, "POST", book + f"/journals/{journal_id}/reversal-draft", {
        "period_id": period_id, "date": day, "reason": "اصلاح گردش انبار",
    })

def positions():
    snapshot = checked(viewer.get(stock))
    return {
        (row["item_id"], row["warehouse_id"]): (row["quantity"], row["value_irr"])
        for row in snapshot["balances"]
    }

bucket = (item["id"], warehouse["id"])
"""


def test_warehouse_catalog_links_are_scoped_idempotent_and_separate_from_stock(tmp_path):
    scenario(
        tmp_path,
        SETUP
        + r"""
path = stock + f"/items/{item['id']}/warehouses"
payload = {"warehouse_id": warehouse["id"]}
assert checked(owner.get(path)) == {"warehouse_ids": [], "can_link": True}
assert checked(viewer.get(path)) == {"warehouse_ids": [], "can_link": False}
rejected(command(viewer, "POST", path, payload), 403, "permission_denied")
rejected(command(outsider, "POST", path, payload), 404, "not_found")
with transaction("company-b") as db:
    from didban.inventory_models import InventoryWarehouse
    db.add(InventoryWarehouse(id="foreign-warehouse", company_id="company-b", code="001", name="انبار شرکت دیگر"))
rejected(command(owner, "POST", path, {"warehouse_id": "foreign-warehouse"}), 404, "not_found")
service = checked(command(owner, "POST", stock + "/items", {"name": "خدمت", "item_kind": "service"}), 201)
service_path = stock + f"/items/{service['id']}/warehouses"
assert checked(owner.get(service_path))["can_link"] is False
rejected(command(owner, "POST", service_path, payload), 409, "invalid_warehouse_item")
assert checked(command(advisor, "POST", path, payload)) == payload
assert checked(command(advisor, "POST", path, payload)) == payload
assert checked(viewer.get(path)) == {"warehouse_ids": [warehouse["id"]], "can_link": False}
assert not positions()
assert checked(viewer.get(stock))["movements"] == []
with transaction("company-a") as db:
    events = db.scalars(select(m.AuditEvent).where(m.AuditEvent.action == "inventory.warehouse_item_linked")).all()
    assert len(events) == 1
    assert events[0].entity_id == warehouse["id"] and events[0].details == {"item_id": item["id"]}
""",
    )


def test_stock_purchase_sale_journal_and_invoice_settlement(tmp_path):
    scenario(
        tmp_path,
        SETUP
        + r"""
def candidates(kind):
    return checked(advisor.get(invoices + "/candidates", params={"kind": kind}))["items"]

def create_invoice(source):
    return checked(command(advisor, "POST", invoices, {
        "operation_id": source["operation_id"], "journal_digest": source["journal_digest"],
        "reference": source["reference"], "due_date": "2026-09-20",
        "due_unknown": False, "expected_date": None, "expected_unknown": True,
    }), 201)

def settle(invoice, kind, ref, amount, party, account=None):
    roles = {"trade_payable": account or "ap"} if kind == "payment" else {"trade_receivable": account or "ar"}
    origin = checked(command(advisor, "POST", book + "/operations", {
        "kind": kind, "period_id": period_id, "date": "2026-09-14", "description": ref,
        "source_reference": ref, "unit": "IRR", "party_id": party,
        "accounts": {"bank_a": "bank", **roles}, "amounts": {"amount": amount},
    }), 201)
    journal = post_draft(origin["draft"]["id"])
    return command(advisor, "POST", invoices + f"/{invoice['id']}/allocations", {
        "operation_id": origin["operation_id"], "journal_digest": journal["digest"], "amount": amount,
    }, version=invoice["version"])

purchase = goods("purchase_goods", "BUY-1", 5, "100", "2026-09-01", "TOMAN")
assert purchase["financial_effect"] is False
assert positions().get(bucket, (0, "0")) == (0, "0")
assert checked(viewer.get(stock))["movements"] == []
assert candidates("purchase") == []
rejected(command(advisor, "POST", stock + "/drafts", goods_input(
    "sale_goods", "EARLY", 1, "1800", "2026-09-02"
)), 409, "inventory_insufficient")

purchase_approval = approval(purchase["draft"]["id"])
rejected(post(purchase_approval, owner), 403, "posting_permission_required")
rejected(post(purchase_approval | {"digest": "a" * 64}), 409, "posting_preview_changed")
first_result = checked(post(purchase_approval, key="post-purchase"), 201)
assert checked(post(purchase_approval, key="post-purchase"), 201) == first_result
assert post(purchase_approval).status_code == 409
first = first_result["items"][0]
assert first["snapshot"]["original_unit"] == "TOMAN"
assert {line["account_id"]: (line["debit"], line["credit"]) for line in first["snapshot"]["lines"]} == {
    "stock": ("5000", "0"), "ap": ("0", "5000"),
}
assert positions()[bucket] == (5, "5000")
assert len(checked(viewer.get(stock))["movements"]) == 1

second = goods("purchase_goods", "BUY-2", 4, "1300", "2026-09-03")
post_draft(second["draft"]["id"])
assert positions()[bucket] == (9, "10200")
sale = goods("sale_goods", "SELL-1", 6, "1800", "2026-09-06")
assert positions()[bucket] == (9, "10200")
sold = post_draft(sale["draft"]["id"])
assert {line["account_id"]: (line["debit"], line["credit"]) for line in sold["snapshot"]["lines"]} == {
    "ar": ("10800", "0"), "revenue": ("0", "10800"),
    "cogs": ("6300", "0"), "stock": ("0", "6300"),
}
assert positions()[bucket] == (3, "3900")
movement = next(row for row in checked(viewer.get(stock))["movements"] if row["kind"] == "sale_goods")
assert (movement["quantity"], movement["value_irr"], movement["journal_id"]) == (-6, "-6300", sold["id"])

assert candidates("sale_service") == []
sale_source = candidates("sale")[0]
assert sale_source["kind"] == "sale_goods" and sale_source["operation_id"] == sale["operation_id"]
purchase_source = next(source for source in candidates("purchase") if source["operation_id"] == purchase["operation_id"])
assert purchase_source["journal_digest"] == first["digest"]
sale_invoice = create_invoice(sale_source)
purchase_invoice = create_invoice(purchase_source)
assert (sale_invoice["direction"], sale_invoice["remaining"]) == ("sale", "10800")
assert (purchase_invoice["direction"], purchase_invoice["remaining"]) == ("purchase", "5000")
sale_invoice = checked(settle(sale_invoice, "receipt", "RECEIPT", "4000", "buyer"), 201)
purchase_invoice = checked(settle(purchase_invoice, "payment", "PAYMENT", "3000", "supplier"), 201)
assert (sale_invoice["remaining"], purchase_invoice["remaining"]) == ("6800", "2000")
assert positions()[bucket] == (3, "3900")
assert len(checked(viewer.get(stock))["movements"]) == 3

trial = checked(viewer.get(book + "/trial-balance", params={"period_id": period_id}))
totals = {}
for line in trial["items"]:
    code = line["code"]
    totals[code] = totals.get(code, 0) + int(line["balance"])
assert totals == {"stock": 3900, "ap": -7200, "ar": 6800, "revenue": -10800, "cogs": 6300, "bank": 1000}
assert trial["total_debit"] == trial["total_credit"]
assert len(checked(viewer.get(book + "/journals"))["items"]) == 5

blocked = reversal(sold["id"], "2026-09-15")
if blocked.status_code == 201:
    blocked = preview(blocked.json()["id"])
rejected(blocked, 409, "native_invoice_release_old_allocations")
rejected(
    settle(sale_invoice, "receipt", "RECEIPT-OTHER-ACCOUNT", "500", "buyer", account="ar_other"),
    409, "native_invoice_allocation_account",
)
assert checked(advisor.get(invoices + f"/{sale_invoice['id']}"))["remaining"] == "6800"
assert positions()[bucket] == (3, "3900")
""",
    )


def test_inventory_fifo_staleness_reversals_and_company_boundary(tmp_path):
    scenario(
        tmp_path,
        SETUP
        + r"""
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy.exc import DBAPIError

from didban.inventory_models import InventoryMovement

other_stock = stock.replace("company-a", "company-b")
assert outsider.get(stock).status_code == 404
assert checked(outsider.get(other_stock))["items"] == []
assert command(outsider, "POST", stock + "/items", item_input).status_code == 404
rejected(command(outsider, "POST", other_stock + "/items", item_input), 422, "inventory_account_required")
assert command(viewer, "POST", stock + "/items", item_input).status_code == 403

purchase = goods("purchase_goods", "BUY-1", 4, "1000", "2026-09-01")
first = post_draft(purchase["draft"]["id"])
second = goods("purchase_goods", "BUY-2", 4, "1300", "2026-09-02")
post_draft(second["draft"]["id"])
older = goods("sale_goods", "SELL-PENDING", 3, "1800", "2026-09-04")
stale = approval(older["draft"]["id"])
other = goods("sale_goods", "SELL-POSTED", 3, "1800", "2026-09-04")
assert command(outsider, "POST", other_stock + "/drafts", goods_input(
    "sale_goods", "CROSS-COMPANY", 1, "1000", "2026-09-04", period_id=foreign_period_id,
)).status_code == 404
sold = post_draft(other["draft"]["id"])
assert positions()[bucket] == (5, "6200")
rejected(post(stale), 409, "inventory_cost_changed")
rejected(preview(older["draft"]["id"]), 409, "inventory_cost_changed")
rejected(command(advisor, "POST", stock + "/drafts", goods_input(
    "sale_goods", "SELL-TOO-MANY", 6, "1800", "2026-09-04"
)), 409, "inventory_insufficient")

blocked = reversal(first["id"], "2026-09-05")
if blocked.status_code == 201:
    blocked = preview(blocked.json()["id"])
rejected(blocked, 409, "inventory_purchase_consumed")
assert positions()[bucket] == (5, "6200")

restore = checked(reversal(sold["id"], "2026-09-05"), 201)
assert positions()[bucket] == (5, "6200")
reversed_sale = post_draft(restore["id"])
assert reversed_sale["reversal_of"] == sold["id"]
assert positions()[bucket] == (8, "9200")
remove_purchase = checked(reversal(first["id"], "2026-09-06"), 201)
reversed_buy = post_draft(remove_purchase["id"])
assert reversed_buy["reversal_of"] == first["id"]
assert positions()[bucket] == (4, "5200")
movements = checked(viewer.get(stock))["movements"]
restored = next(row for row in movements if row["journal_id"] == reversed_sale["id"])
removed = next(row for row in movements if row["journal_id"] == reversed_buy["id"])
assert (restored["kind"], restored["quantity"], restored["value_irr"]) == ("reversal", 3, "3000")
assert (removed["kind"], removed["quantity"], removed["value_irr"]) == ("reversal", -4, "-4000")
assert len(movements) == 5
assert checked(manager.get(book + f"/journals/{sold['id']}"))["snapshot"] == sold["snapshot"]
try:
    with transaction("company-a") as db:
        db.execute(update(InventoryMovement).where(InventoryMovement.id == restored["id"]).values(quantity=7))
except DBAPIError as error:
    assert "immutable fact" in str(error.orig)
else:
    raise AssertionError("Final stock movement evidence must be immutable")

proposals = []
for reference in ("SELL-CONCURRENT-A", "SELL-CONCURRENT-B"):
    draft = goods("sale_goods", reference, 3, "1800", "2026-09-07")
    proposals.append(approval(draft["draft"]["id"]))
rejected(command(manager, "POST", book + "/postings", {"items": proposals}), 409, "inventory_batch_overlap")
assert positions()[bucket] == (4, "5200")
with ThreadPoolExecutor(max_workers=2) as executor:
    outcomes = list(executor.map(post, proposals))
assert sorted(response.status_code for response in outcomes) == [201, 409]
rejected(next(response for response in outcomes if response.status_code == 409), 409, "inventory_insufficient")
assert positions()[bucket] == (1, "1300")
assert len(checked(viewer.get(stock))["movements"]) == 6
""",
    )


def test_inventory_source_cannot_be_edited_or_posted_after_scope_changes(tmp_path):
    scenario(
        tmp_path,
        SETUP
        + r"""
from didban.period_lock_models import PeriodLock

rejected(command(advisor, "POST", stock + "/drafts", goods_input(
    "purchase_goods", "WRONG-ROLE", 1, "1001", "2026-09-02", counterparty_account_id="revenue",
)), 409, "inventory_account_role")
rejected(command(advisor, "POST", stock + "/drafts", goods_input(
    "purchase_goods", "FUTURE", 1, "1001", "2100-09-02",
)), 409, "inventory_future_date")

purchase = goods("purchase_goods", "BUY-1", 2, "1001", "2026-09-02")
post_draft(purchase["draft"]["id"])
rejected(command(advisor, "POST", stock + "/drafts", goods_input(
    "purchase_goods", "BACKDATED", 1, "1001", "2026-09-01",
)), 409, "inventory_date_order")

sale_payload = goods_input("sale_goods", "SELL-1", 1, "150", "2026-09-03", "TOMAN")
created = checked(command(advisor, "POST", stock + "/drafts", sale_payload), 201)["draft"]
checked_sale = approval(created["id"])
repeat_key = str(uuid4())
first_repeat = command(advisor, "POST", stock + "/drafts", sale_payload, key=repeat_key)
assert command(advisor, "POST", stock + "/drafts", sale_payload, key=repeat_key).json() == first_repeat.json()

lines = [
    {"account_id": line["account_id"], "party_id": line["party_id"],
     "debit": line["original_debit"], "credit": line["original_credit"]}
    for line in created["lines"]
]
edit = command(advisor, "PATCH", book + f"/drafts/{created['id']}", {
    "period_id": period_id, "date": "2026-09-03", "description": "تغییر منشأ پیش‌نویس", "unit": "TOMAN",
    "lines": lines,
}, version=created["version"])
rejected(edit, 409, "inventory_draft_changed")
assert approval(created["id"]) == checked_sale
checked(command(advisor, "POST", book + f"/drafts/{created['id']}/discard", {
    "reason": "تهیه نسخهٔ جدید از عملیات انبار",
}, version=created["version"]))
fresh = checked(command(advisor, "POST", stock + "/drafts", sale_payload), 201)["draft"]
fresh_approval = approval(fresh["id"])

approved = checked(post(fresh_approval), 201)["items"][0]
cogs = next(line for line in approved["snapshot"]["lines"] if line["account_id"] == "cogs")
assert cogs["original_debit"] == "100.1" and cogs["debit"] == "1001"

awaiting = goods("sale_goods", "SELL-2", 1, "150", "2026-09-04", "TOMAN")
awaiting_approval = approval(awaiting["draft"]["id"])
with transaction("company-a") as db:
    db.add(PeriodLock(company_id="company-a", period_id=period_id, closed=True))
rejected(post(awaiting_approval), 409, "period_closed")
assert positions()[bucket] == (1, "1001")
assert len(checked(viewer.get(stock))["movements"]) == 2
""",
    )


def test_catalogue_http_upgrades_legacy_guards_and_preserves_movements(tmp_path):
    scenario(
        tmp_path,
        SETUP
        + r"""
from sqlalchemy import text
from didban.db import engine, migrate_schema

with engine.begin() as conn:
    conn.exec_driver_sql("UPDATE didban_schema_version SET version = 1")
    for table in ("inventory_items", "inventory_warehouses"):
        for operation in ("UPDATE", "DELETE"):
            conn.exec_driver_sql(
                f"CREATE TRIGGER immutable_{table}_{operation} BEFORE {operation} ON {table} "
                "BEGIN SELECT RAISE(ABORT, 'immutable fact'); END"
            )
migrate_schema()
initialize()

for entity, row in (("items", item), ("warehouses", warehouse)):
    path = stock + f"/{entity}/" + row["id"]
    rejected(command(viewer, "PATCH", path, {"name": "آزمون"}, version=row["version"]), 403, "permission_denied")
    revised = checked(command(owner, "PATCH", path, {"name": "ویرایش", "active": False}, version=row["version"]))
    assert revised["name"] == "ویرایش" and revised["active"] is False
    rejected(command(owner, "DELETE", path, version=row["version"]), 409, "version_conflict")
    checked(command(owner, "PATCH", path, {"active": True}, version=revised["version"]))
    assert any(value["id"] == row["id"] for value in checked(owner.get(stock))[entity])

unused_item = checked(command(owner, "POST", stock + "/items", item_input | {"code": "UNUSED"}), 201)
unused_warehouse = checked(command(owner, "POST", stock + "/warehouses", {"code": "UNUSED", "name": "آزمون"}), 201)
for entity, row in (("items", unused_item), ("warehouses", unused_warehouse)):
    path = stock + f"/{entity}/" + row["id"]
    key = str(uuid4())
    result = checked(command(owner, "DELETE", path, version=row["version"], key=key))
    assert result["deleted"] and result == checked(command(owner, "DELETE", path, version=row["version"], key=key))
    assert not any(value["id"] == row["id"] for value in checked(owner.get(stock))[entity])

draft = goods("purchase_goods", "catalogue-dependency", 2, "50", "2026-09-10")
for entity, row, code in (
    ("items", item, "inventory_item_draft_referenced"),
    ("warehouses", warehouse, "inventory_warehouse_draft_referenced"),
):
    rejected(command(owner, "DELETE", stock + f"/{entity}/" + row["id"], version=row["version"] + 2), 409, code)
post_draft(draft["draft"]["id"])
for entity, row, code in (
    ("items", item, "inventory_item_referenced"),
    ("warehouses", warehouse, "inventory_warehouse_referenced"),
):
    rejected(command(owner, "DELETE", stock + f"/{entity}/" + row["id"], version=row["version"] + 2), 409, code)

try:
    with transaction("company-a") as db:
        db.execute(text("DELETE FROM inventory_movements"))
except IntegrityError:
    pass
else:
    raise AssertionError("Posted inventory movements must remain immutable")
""",
    )


def test_company_inventory_units_are_selectable_after_upgrade(tmp_path):
    scenario(tmp_path, SETUP + r"""
from didban.db import engine, migrate_schema

legacy = checked(command(owner, "POST", stock + "/items", {"name": "کالای قدیمی", "base_unit": "بسته"}), 201)
with engine.begin() as conn:
    conn.exec_driver_sql("DROP TABLE inventory_units")
    conn.exec_driver_sql("UPDATE didban_schema_version SET version = 3")
migrate_schema()
initialize()

units = stock + "/units"
assert checked(owner.get(units)) == {"items": ["بسته", "عدد"], "can_create": True}
assert checked(viewer.get(units))["can_create"] is False
rejected(command(viewer, "POST", units, {"name": "متر"}), 403, "permission_denied")
assert outsider.get(units).status_code == 404
assert checked(outsider.get(units.replace("company-a", "company-b")))["items"] == ["عدد"]
rejected(command(owner, "POST", units, {"name": "بسته"}), 409, "inventory_unit_exists")

key = str(uuid4())
payload = {"name": "متر"}
assert checked(command(owner, "POST", units, payload | {"name": "  متر  "}, key=key), 201) == payload
assert checked(command(owner, "POST", units, payload, key=key), 201) == payload
rejected(command(owner, "POST", units, payload), 409, "inventory_unit_exists")
assert checked(owner.get(units))["items"] == ["بسته", "عدد", "متر"]
assert checked(outsider.get(units.replace("company-a", "company-b")))["items"] == ["عدد"]

created = checked(command(owner, "POST", stock + "/items", {"name": "پارچه", "base_unit": "متر"}), 201)
assert created["base_unit"] == "متر" and created["inventory_account_id"] == "stock"
assert any(row["id"] == legacy["id"] and row["base_unit"] == "بسته" for row in checked(owner.get(stock))["items"])
""")


def test_cardex_uses_requested_date_and_rejects_inventory_movement_for_services(tmp_path):
    scenario(tmp_path, SETUP + r"""
service = checked(command(owner, "POST", stock + "/items", {
    "name": "خدمت آزمایشی", "item_kind": "service",
}), 201)
payload = goods_input("purchase_goods", "SERVICE", 1, "100", "2026-09-10", item_id=service["id"])
rejected(command(manager, "POST", stock + "/drafts", payload), 422, "item_not_goods")

first = goods("purchase_goods", "A", 3, "100", "2026-09-11")
post_draft(first["draft"]["id"])
second = goods("purchase_goods", "B", 2, "200", "2026-09-20")
second_journal = post_draft(second["draft"]["id"])
balance = checked(viewer.get(stock + "?as_of=2026-09-15"))
assert balance["as_of"] == "2026-09-15"
assert balance["balances"][0]["quantity"] == 3
cardex = checked(viewer.get(stock + "/cardex", params={
    "item_id": item["id"], "warehouse_id": warehouse["id"], "from_date": "2026-09-15",
}))
assert cardex["opening_quantity"] == 3
assert cardex["rows"][0]["in_quantity"] == 2
assert cardex["rows"][0]["balance_quantity"] == 5
assert cardex["rows"][0]["journal_id"] == second_journal["id"]
assert cardex["rows"][0]["operation_id"] == second["operation_id"]
""")
