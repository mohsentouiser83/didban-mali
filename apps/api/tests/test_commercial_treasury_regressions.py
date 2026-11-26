"""HTTP regression tests for multi-line commercial document drafts and treasury allocation reversals."""


def test_commercial_document_draft_combinations_and_treasury_reversal_http(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.accounting_setup_models import CompanyAccountingSetup

owner = client_for("owner")
manager = client_for("finance_manager")
with transaction("company-a") as db:
    db.add(CompanyAccountingSetup(company_id="company-a", mode="primary"))

# 4-level chart of accounts
g1 = command(owner, "POST", base + "/accounting/accounts", {"code": "11", "name": "دارایی جاری", "level": "group"}).json()
gen1 = command(owner, "POST", base + "/accounting/accounts", {"code": "1101", "name": "نقد و مطالبات", "level": "general", "parent_id": g1["id"]}).json()
sub1 = command(owner, "POST", base + "/accounting/accounts", {"code": "110101", "name": "حساب‌های بانکی", "level": "subsidiary", "parent_id": gen1["id"]}).json()
acc_bank = command(owner, "POST", base + "/accounting/accounts", {"code": "11010101", "name": "بانک سامان", "level": "detail", "parent_id": sub1["id"], "role": "bank"}).json()
sub_ar = command(owner, "POST", base + "/accounting/accounts", {"code": "110102", "name": "مطالبات تجاری", "level": "subsidiary", "parent_id": gen1["id"]}).json()
acc_ar = command(owner, "POST", base + "/accounting/accounts", {"code": "11010201", "name": "حساب دریافتنی تجاری", "level": "detail", "parent_id": sub_ar["id"], "role": "trade_receivable"}).json()
sub_inv = command(owner, "POST", base + "/accounting/accounts", {"code": "110103", "name": "موجودی و اسناد", "level": "subsidiary", "parent_id": gen1["id"]}).json()
acc_inv = command(owner, "POST", base + "/accounting/accounts", {"code": "11010301", "name": "موجودی کالا", "level": "detail", "parent_id": sub_inv["id"], "role": "other_asset"}).json()
acc_chq = command(owner, "POST", base + "/accounting/accounts", {"code": "11010302", "name": "اسناد دریافتنی", "level": "detail", "parent_id": sub_inv["id"], "role": "other_asset"}).json()

g2 = command(owner, "POST", base + "/accounting/accounts", {"code": "21", "name": "بدهی", "level": "group"}).json()
gen2 = command(owner, "POST", base + "/accounting/accounts", {"code": "2101", "name": "بدهی تجاری", "level": "general", "parent_id": g2["id"]}).json()
sub_ap = command(owner, "POST", base + "/accounting/accounts", {"code": "210101", "name": "پرداختنی", "level": "subsidiary", "parent_id": gen2["id"]}).json()
acc_ap = command(owner, "POST", base + "/accounting/accounts", {"code": "21010101", "name": "حساب پرداختنی تجاری", "level": "detail", "parent_id": sub_ap["id"], "role": "trade_payable"}).json()

g3 = command(owner, "POST", base + "/accounting/accounts", {"code": "31", "name": "سرمایه", "level": "group"}).json()
gen3 = command(owner, "POST", base + "/accounting/accounts", {"code": "3101", "name": "حقوق مالکانه", "level": "general", "parent_id": g3["id"]}).json()
sub_eq = command(owner, "POST", base + "/accounting/accounts", {"code": "310101", "name": "سرمایه", "level": "subsidiary", "parent_id": gen3["id"]}).json()
acc_eq = command(owner, "POST", base + "/accounting/accounts", {"code": "31010101", "name": "سرمایه اولیه", "level": "detail", "parent_id": sub_eq["id"], "role": "equity"}).json()

g4 = command(owner, "POST", base + "/accounting/accounts", {"code": "41", "name": "درآمد", "level": "group"}).json()
gen4 = command(owner, "POST", base + "/accounting/accounts", {"code": "4101", "name": "درآمد فروش و خدمات", "level": "general", "parent_id": g4["id"]}).json()
sub_rev = command(owner, "POST", base + "/accounting/accounts", {"code": "410101", "name": "فروش", "level": "subsidiary", "parent_id": gen4["id"]}).json()
acc_rev = command(owner, "POST", base + "/accounting/accounts", {"code": "41010101", "name": "فروش کالا", "level": "detail", "parent_id": sub_rev["id"], "role": "revenue"}).json()
acc_srv_rev = command(owner, "POST", base + "/accounting/accounts", {"code": "41010102", "name": "درآمد خدمات", "level": "detail", "parent_id": sub_rev["id"], "role": "revenue"}).json()

g5 = command(owner, "POST", base + "/accounting/accounts", {"code": "51", "name": "هزینه", "level": "group"}).json()
gen5 = command(owner, "POST", base + "/accounting/accounts", {"code": "5101", "name": "بهای تمام‌شده و هزینه", "level": "general", "parent_id": g5["id"]}).json()
sub_exp = command(owner, "POST", base + "/accounting/accounts", {"code": "510101", "name": "هزینه‌ها", "level": "subsidiary", "parent_id": gen5["id"]}).json()
acc_cogs = command(owner, "POST", base + "/accounting/accounts", {"code": "51010101", "name": "بهای تمام‌شده", "level": "detail", "parent_id": sub_exp["id"], "role": "expense"}).json()
acc_srv_exp = command(owner, "POST", base + "/accounting/accounts", {"code": "51010102", "name": "هزینه خدمات", "level": "detail", "parent_id": sub_exp["id"], "role": "expense"}).json()

cust = command(owner, "POST", base + "/commercial/counterparties", {"name": "مشتری الف", "type": "customer", "entity_kind": "legal_entity", "roles": ["customer"]}).json()
supp = command(owner, "POST", base + "/commercial/counterparties", {"name": "تأمین‌کننده ب", "type": "supplier", "entity_kind": "legal_entity", "roles": ["supplier"]}).json()
wh = command(owner, "POST", base + "/accounting/inventory/warehouses", {"name": "انبار مرکزی"}).json()
item = command(owner, "POST", base + "/accounting/inventory/items", {"name": "کالای نمونه", "inventory_account_id": acc_inv["id"], "base_unit": "عدد"}).json()

# Seed opening stock so FIFO sale succeeds
open_op = command(manager, "POST", base + "/accounting/inventory/opening-drafts", {
    "item_id": item["id"],
    "warehouse_id": wh["id"],
    "quantity": 10,
    "unit_price": "50000",
    "unit": "IRR",
    "period_id": period_id,
    "date": "2026-09-01",
    "description": "موجودی اول دوره",
    "equity_account_id": acc_eq["id"],
})
assert open_op.status_code == 201, open_op.text
open_draft_id = open_op.json()["draft"]["id"]
open_prev = manager.get(base + "/accounting/drafts/" + open_draft_id + "/posting-preview").json()
command(manager, "POST", base + "/accounting/postings", {
    "items": [{"draft_id": open_draft_id, "expected_version": open_prev["expected_version"], "digest": open_prev["digest"]}]
})

# 1. Service sale (on_account) -> creates draft only and retains exact wire amounts.
large_amount = "9007199254740993"
srv_sale = command(manager, "POST", base + "/commercial/documents", {
    "direction": "sale",
    "period_id": period_id,
    "issue_date": "2026-09-05",
    "party_id": cust["id"],
    "warehouse_id": None,
    "currency": "IRR",
    "invoice_discount": "0",
    "settlement_type": "on_account",
    "counterparty_account_id": acc_ar["id"],
    "service_revenue_account_id": acc_srv_rev["id"],
    "lines": [{"line_kind": "service", "item_id": None, "description": "خدمات مشاوره", "quantity": 1, "unit_price": large_amount, "line_discount": "0"}],
})
assert srv_sale.status_code == 201, srv_sale.text
assert srv_sale.json()["financial_effect"] is False
commercial_doc = srv_sale.json()["document"]
assert commercial_doc["status"] == "draft"
assert commercial_doc["net_amount_irr"] == large_amount
assert commercial_doc["lines"][0]["net_before_inv_disc_irr"] == large_amount
assert commercial_doc["party_snapshot"]["id"] == cust["id"]
assert srv_sale.json()["draft"]["lines"][0]["debit"] == large_amount

commercial_detail = manager.get(base + "/commercial/documents/" + commercial_doc["id"])
assert commercial_detail.status_code == 200, commercial_detail.text
assert commercial_detail.json()["id"] == commercial_doc["id"]
assert commercial_detail.json()["net_amount_irr"] == large_amount
assert commercial_detail.json()["lines"][0]["net_amount_irr"] == large_amount
commercial_list = manager.get(base + "/commercial/documents", params={"counterparty_id": cust["id"]})
assert commercial_list.status_code == 200, commercial_list.text
assert commercial_list.json() == {"total": 1, "items": [commercial_detail.json()]}

# 2. Service purchase (cash) -> creates draft only
srv_pur = command(manager, "POST", base + "/commercial/documents", {
    "direction": "purchase",
    "period_id": period_id,
    "issue_date": "2026-09-06",
    "party_id": supp["id"],
    "warehouse_id": None,
    "currency": "IRR",
    "invoice_discount": "0",
    "settlement_type": "cash",
    "cash_account_id": acc_bank["id"],
    "expense_account_id": acc_srv_exp["id"],
    "lines": [{"line_kind": "service", "item_id": None, "description": "خدمات حمل", "quantity": 1, "unit_price": "150000", "line_discount": "0"}],
})
assert srv_pur.status_code == 201, srv_pur.text
assert srv_pur.json()["financial_effect"] is False
assert srv_pur.json()["document"]["status"] == "draft"

# 3. Goods sale with mixed settlement -> creates draft only
goods_mixed = command(manager, "POST", base + "/commercial/documents", {
    "direction": "sale",
    "period_id": period_id,
    "issue_date": "2026-09-07",
    "party_id": cust["id"],
    "warehouse_id": wh["id"],
    "currency": "IRR",
    "invoice_discount": "0",
    "settlement_type": "mixed",
    "cash_amount": "100000",
    "cheque_amount": "100000",
    "on_account_amount": "100000",
    "cash_account_id": acc_bank["id"],
    "cheque_account_id": acc_chq["id"],
    "cheque_number": "CHK-101",
    "cheque_due_date": "2026-09-25",
    "counterparty_account_id": acc_ar["id"],
    "revenue_account_id": acc_rev["id"],
    "cost_account_id": acc_cogs["id"],
    "lines": [{"line_kind": "goods", "item_id": item["id"], "description": "فروش کالا", "quantity": 3, "unit_price": "100000", "line_discount": "0"}],
})
assert goods_mixed.status_code == 201, goods_mixed.text
assert goods_mixed.json()["financial_effect"] is False
assert goods_mixed.json()["document"]["status"] == "draft"

# 4. Treasury allocation reversal HTTP contract: parent version in If-Match + 409 on stale version
ta = command(owner, "POST", base + "/treasury/accounts", {"kind": "bank", "name": "خزانه سامان", "account_id": acc_bank["id"]}).json()
sale_op = command(manager, "POST", base + "/accounting/operations", {
    "kind": "sale_service",
    "period_id": period_id,
    "date": "2026-09-03",
    "description": "فروش بابت تخصیص خزانه",
    "unit": "IRR",
    "party_id": cust["code"],
    "source_reference": "S-TR-REG-1",
    "amounts": {"amount": "400000"},
    "accounts": {"trade_receivable": acc_ar["id"], "service_revenue": acc_srv_rev["id"]},
}).json()
sprev = manager.get(base + "/accounting/drafts/" + sale_op["draft"]["id"] + "/posting-preview").json()
spost = command(manager, "POST", base + "/accounting/postings", {
    "items": [{"draft_id": sale_op["draft"]["id"], "expected_version": sprev["expected_version"], "digest": sprev["digest"]}]
}).json()
inv = command(manager, "POST", base + "/accounting/native-invoices", {
    "operation_id": sale_op["operation_id"],
    "journal_digest": spost["items"][0]["digest"],
    "due_date": "2026-09-28",
    "due_unknown": False,
    "expected_unknown": False,
}).json()
tdoc = command(manager, "POST", base + "/treasury/documents", {
    "direction": "receipt",
    "date": "2026-09-08",
    "period_id": period_id,
    "party_id": cust["id"],
    "unit": "IRR",
    "description": "رسید آزمایشی",
    "tools": [{"tool_kind": "bank_transfer", "treasury_account_id": ta["id"], "amount": "400000"}],
    "allocations": [{"tool_line_index": 0, "invoice_id": inv["id"], "amount": "200000"}],
}).json()
alloc = tdoc["allocations"][0]
assert "version" not in alloc
assert tdoc["version"] == 1
assert tdoc["total_amount"] == "400000"
assert tdoc["tools"][0]["remaining_amount"] == "200000"
treasury_list = manager.get(base + "/treasury/documents")
assert treasury_list.status_code == 200, treasury_list.text
listed_tdoc, = treasury_list.json()["items"]
assert listed_tdoc["id"] == tdoc["id"]
assert listed_tdoc["total_amount"] == "400000"
assert listed_tdoc["tools"][0]["remaining_amount"] == "200000"
assert listed_tdoc["allocations"][0]["amount"] == "200000"

# Stale version rejected with 409 version_conflict
stale_rev = command(manager, "POST", base + "/treasury/allocations/" + alloc["id"] + "/reverse", {"reason": "نسخه کهنه"}, version=99)
assert stale_rev.status_code == 409, stale_rev.text
assert stale_rev.json()["code"] == "version_conflict"

# Valid parent version succeeds and bumps parent version to 2
ok_rev = command(manager, "POST", base + "/treasury/allocations/" + alloc["id"] + "/reverse", {"reason": "اصلاح تخصیص"}, version=tdoc["version"])
assert ok_rev.status_code == 200, ok_rev.text
assert ok_rev.json()["version"] == 2
assert ok_rev.json()["allocations"][0]["reversed_at"] is not None
reallocated = command(
    manager, "POST", base + "/treasury/documents/" + tdoc["id"] + "/allocations",
    {"tool_line_id": tdoc["tools"][0]["id"], "invoice_id": inv["id"], "amount": "150000"}, version=2,
)
assert reallocated.status_code == 201, reallocated.text
assert reallocated.json()["allocated_amount"] == "150000"
prepared = command(
    manager, "POST", base + "/treasury/documents/" + tdoc["id"] + "/prepare-draft",
    {"counterparty_account_id": acc_ar["id"]}, version=reallocated.json()["version"],
)
assert prepared.status_code == 201, prepared.text
payload = prepared.json()
assert payload["document"]["operation_id"] == payload["operation_id"]
assert payload["draft"]["state"] == "draft"
assert payload["draft"]["posting_available"] is True
assert payload["draft"]["lines"][0]["debit"] == "400000"
""",
    )
