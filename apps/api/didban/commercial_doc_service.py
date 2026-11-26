"""Multi-line commercial invoices, D24–D34 discounts, partial returns, FIFO/quarantine, and counterparty credits."""

from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal, localcontext
from zoneinfo import ZoneInfo

from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_models import Draft
from .accounting_service import capabilities, save_draft, validate_lines
from .commercial_doc_models import (
    CommercialDocument,
    CommercialDocumentLine,
    CommercialReturn,
    CommercialReturnLine,
    CounterpartyCredit,
    CounterpartyCreditApplication,
)
from .commercial_models import ProformaInvoice
from .commercial_service import (
    check_credit_limit,
    counterparty_snapshot,
    resolve_counterparty,
)
from .errors import require
from .inventory_models import InventoryItem, InventoryMovement, InventoryWarehouse
from .inventory_service import (
    _check_capacity,
    _fifo,
    _lots,
    _require_account,
    _stock_date,
    _stock_money,
)
from .money_type import aggregate_money
from .native_invoice_models import NativeInvoice, NativeInvoiceTerms
from .numbering_service import allocate_number
from .operation_models import OperationDraft
from .operation_numbering import allocate_reference
from .operation_service import POLICY, validate_and_build_settlement_lines
from .period_lock_service import require_open_period
from .posting_models import NativeJournal
from .security import membership
from .services import get_entity
from .workflow import audit, serialize_fact


def _unit_money(total: Decimal, qty: int) -> str:
    if qty <= 0:
        return "0"
    return _stock_money((total / qty).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP))

COMMERCIAL_OPERATION_KINDS = frozenset(
    {
        "commercial_sale",
        "commercial_purchase",
        "commercial_sale_return",
        "commercial_purchase_return",
        "commercial_quarantine_restock",
    }
)


def allocate_invoice_discount(line_nets: list[Decimal], invoice_discount: Decimal) -> list[Decimal]:
    """Allocate invoice-level discount proportionally using largest-remainder integer IRR (D24 & D27)."""
    require(invoice_discount >= 0, "invalid_discount", "تخفیف کل نمی‌تواند منفی باشد.")
    total = sum(line_nets, Decimal(0))
    if invoice_discount == 0 or not line_nets:
        return [Decimal(0)] * len(line_nets)
    require(
        total > 0 and invoice_discount <= total,
        "invoice_discount_exceeds_total",
        "تخفیف کل نمی‌تواند از جمع خالص ردیف‌ها بیشتر باشد.",
    )
    d_int = int(invoice_discount)
    total_int = int(total)
    floors: list[int] = []
    remainders: list[tuple[int, int]] = []
    for idx, net in enumerate(line_nets):
        n_int = int(net)
        num = d_int * n_int
        floors.append(num // total_int)
        remainders.append((num % total_int, idx))
    rem_units = d_int - sum(floors)
    if rem_units > 0:
        # Largest remainder first; exact ties break by earlier line_index (D27).
        for _rem, idx in sorted(remainders, key=lambda pair: (-pair[0], pair[1]))[:rem_units]:
            floors[idx] += 1
    return [Decimal(val) for val in floors]


def _serialize_document(db: Session, doc: CommercialDocument) -> dict:
    lines = list(
        db.scalars(
            select(CommercialDocumentLine)
            .where(CommercialDocumentLine.company_id == doc.company_id, CommercialDocumentLine.document_id == doc.id)
            .order_by(CommercialDocumentLine.line_index)
        )
    )
    payload = serialize_fact(doc)
    warehouse_name = None
    if doc.warehouse_id:
        wh = db.get(InventoryWarehouse, doc.warehouse_id)
        if wh and wh.company_id == doc.company_id:
            warehouse_name = wh.name
    open_balance_irr = (
        _stock_money(_open_invoice_balance(db, doc.company_id, doc))
        if doc.status in ("posted", "partially_returned", "fully_returned")
        else None
    )
    payload["party_name"] = (doc.party_snapshot or {}).get("name")
    payload["warehouse_name"] = warehouse_name
    payload["open_balance_irr"] = open_balance_irr
    payload["lines"] = [
        serialize_fact(line)
        | {
            "remaining_returnable_qty": max(
                0, line.quantity - (line.returned_healthy_qty or 0) - (line.returned_defective_qty or 0)
            )
        }
        for line in lines
    ]
    return payload


def _serialize_return(db: Session, ret: CommercialReturn) -> dict:
    lines = list(
        db.scalars(
            select(CommercialReturnLine)
            .where(CommercialReturnLine.company_id == ret.company_id, CommercialReturnLine.return_id == ret.id)
            .order_by(CommercialReturnLine.line_index)
        )
    )
    payload = serialize_fact(ret)
    payload["lines"] = [serialize_fact(line) for line in lines]
    return payload


def list_documents(
    db: Session,
    company: str,
    user: m.User,
    *,
    direction: str | None = None,
    counterparty_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    membership(db, company, user)
    stmt = select(CommercialDocument).where(CommercialDocument.company_id == company)
    if direction:
        stmt = stmt.where(CommercialDocument.direction == direction)
    if counterparty_id:
        stmt = stmt.where(CommercialDocument.counterparty_id == counterparty_id)
    rows = list(
        db.scalars(
            stmt.order_by(CommercialDocument.issue_date.desc(), CommercialDocument.id.desc())
            .offset(offset)
            .limit(limit)
        )
    )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    return {"total": total, "items": [_serialize_document(db, row) for row in rows]}


def get_document(db: Session, company: str, user: m.User, document_id: str) -> dict:
    membership(db, company, user)
    doc = get_entity(db, CommercialDocument, company, document_id)
    return _serialize_document(db, doc)


def list_credits(
    db: Session,
    company: str,
    user: m.User,
    *,
    counterparty_id: str | None = None,
    status: str | None = None,
) -> dict:
    membership(db, company, user)
    stmt = select(CounterpartyCredit).where(CounterpartyCredit.company_id == company)
    if counterparty_id:
        stmt = stmt.where(CounterpartyCredit.counterparty_id == counterparty_id)
    if status:
        stmt = stmt.where(CounterpartyCredit.status == status)
    rows = list(db.scalars(stmt.order_by(CounterpartyCredit.created_at.desc())))
    items = []
    for r in rows:
        cp = resolve_counterparty(db, company, r.counterparty_id, require_active=False)
        src_doc = db.get(CommercialDocument, r.document_id)
        src_ret = db.get(CommercialReturn, r.return_id)
        apps = list(
            db.scalars(
                select(CounterpartyCreditApplication)
                .where(
                    CounterpartyCreditApplication.company_id == company,
                    CounterpartyCreditApplication.credit_id == r.id,
                )
                .order_by(CounterpartyCreditApplication.date.desc(), CounterpartyCreditApplication.created_at.desc())
            )
        )
        app_rows = []
        for a in apps:
            t_doc = db.get(CommercialDocument, a.target_document_id)
            app_rows.append(
                serialize_fact(a)
                | {"target_document_number": t_doc.number if t_doc and t_doc.company_id == company else None}
            )
        consumed = max(Decimal(0), Decimal(r.original_amount_irr) - Decimal(r.remaining_amount_irr))
        items.append(
            serialize_fact(r)
            | {
                "counterparty_name": cp.name if cp else None,
                "counterparty_code": cp.code if cp else None,
                "document_number": src_doc.number if src_doc and src_doc.company_id == company else None,
                "return_number": src_ret.number if src_ret and src_ret.company_id == company else None,
                "consumed_amount_irr": _stock_money(consumed),
                "applications": app_rows,
            }
        )
    return {"items": items}


def list_quarantine(db: Session, company: str, user: m.User) -> dict:
    membership(db, company, user)
    rows = db.execute(
        select(CommercialReturnLine, CommercialReturn, CommercialDocumentLine, CommercialDocument)
        .join(
            CommercialReturn,
            (CommercialReturn.company_id == CommercialReturnLine.company_id)
            & (CommercialReturn.id == CommercialReturnLine.return_id),
        )
        .join(
            CommercialDocumentLine,
            (CommercialDocumentLine.company_id == CommercialReturnLine.company_id)
            & (CommercialDocumentLine.id == CommercialReturnLine.document_line_id),
        )
        .join(
            CommercialDocument,
            (CommercialDocument.company_id == CommercialReturn.company_id)
            & (CommercialDocument.id == CommercialReturn.document_id),
        )
        .where(
            CommercialReturnLine.company_id == company,
            CommercialReturnLine.condition == "defective",
            CommercialReturn.status == "posted",
        )
        .order_by(CommercialReturnLine.created_at.desc())
    ).all()
    items = []
    for rl, ret, dl, doc in rows:
        wh = db.get(InventoryWarehouse, doc.warehouse_id) if doc.warehouse_id else None
        items.append(
            serialize_fact(rl)
            | {
                "return_number": ret.number,
                "return_date": ret.date.isoformat(),
                "document_id": ret.document_id,
                "document_number": doc.number,
                "counterparty_id": doc.counterparty_id,
                "warehouse_id": doc.warehouse_id,
                "warehouse_name": wh.name if wh and wh.company_id == company else None,
                "item_id": dl.item_id,
                "description": dl.description,
                "unit": dl.unit,
            }
        )
    return {"items": items}


def create_commercial_document_draft(
    db: Session,
    company: str,
    user: m.User,
    data: dict,
    *,
    proforma: ProformaInvoice | None = None,
    allow_credit_override: bool | None = None,
    credit_override_reason: str | None = None,
) -> dict:
    """Create a multi-line commercial sale or purchase invoice draft (goods & services) with D24/D27/D32/D33."""
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه تهیه سند ندارید.", 403)
    require(
        ability["posting_available"], "primary_accounting_required", "کاربرد حسابداری اصلی لازم است.", 409
    )

    direction = data["direction"]
    sale = direction == "sale"
    require(direction in ("sale", "purchase"), "invalid_direction", "نوع فاکتور معتبر نیست.")
    period = get_entity(db, m.Period, company, data["period_id"])
    require_open_period(db, company, period.id)
    issue_date: date = data["issue_date"]
    today = datetime.now(ZoneInfo(db.get(m.Company, company).timezone)).date()
    require(issue_date <= today, "future_invoice_date", "تاریخ فاکتور نمی‌تواند در آینده باشد.", 409)
    require(period.start <= issue_date <= period.end, "date_outside_period", "تاریخ فاکتور خارج از دوره مالی است.")
    due_date = data.get("due_date")
    if due_date is not None:
        require(due_date >= issue_date, "invalid_due_date", "سررسید نمی‌تواند پیش از تاریخ صدور باشد.")

    cp = resolve_counterparty(db, company, data["party_id"], require_active=True)
    require(cp is not None, "counterparty_not_found", "طرف‌حساب انتخاب‌شده معتبر نیست.")
    snapshot_party = counterparty_snapshot(cp)

    currency = data.get("currency", "IRR")
    require(currency in ("IRR", "TOMAN"), "invalid_unit", "واحد مالی باید ریال یا تومان باشد.")
    factor = 10 if currency == "TOMAN" else 1

    raw_lines = data["lines"]
    require(1 <= len(raw_lines) <= 100, "invalid_line_count", "تعداد ردیف‌های فاکتور معتبر نیست.")

    has_goods = any(line.get("line_kind", "goods") == "goods" for line in raw_lines)
    warehouse = None
    if has_goods:
        wh_id = data.get("warehouse_id")
        require(bool(wh_id), "warehouse_required", "برای فاکتور دارای کالای انباری، انتخاب یک انبار الزامی است (D33).")
        warehouse = get_entity(db, InventoryWarehouse, company, wh_id)
        require(warehouse.active, "inactive_warehouse", "انبار انتخاب‌شده غیرفعال است.", 409)

    settlement_type = data.get("settlement_type", "on_account")
    require(settlement_type in ("on_account", "cash", "mixed"), "invalid_settlement_type", "نوع تسویه معتبر نیست.")

    # Validate account IDs upfront
    counterparty_account_id = data.get("counterparty_account_id")
    revenue_account_id = data.get("revenue_account_id")
    service_revenue_account_id = data.get("service_revenue_account_id") or revenue_account_id
    expense_account_id = data.get("expense_account_id")
    discount_account_id = data.get("discount_account_id")
    cost_account_id = data.get("cost_account_id")
    cash_account_id = data.get("cash_account_id")
    cheque_account_id = data.get("cheque_account_id")

    if sale:
        has_service = any(line.get("line_kind", "goods") == "service" for line in raw_lines)
        if has_goods:
            require(
                bool(revenue_account_id and cost_account_id),
                "inventory_sale_accounts_required",
                "حساب درآمد فروش و بهای تمام‌شده را انتخاب کنید.",
            )
            _require_account(db, company, revenue_account_id, "revenue")
            _require_account(db, company, cost_account_id, "expense")
        if has_service:
            require(bool(service_revenue_account_id), "revenue_account_required", "حساب درآمد خدمات را انتخاب کنید.")
            _require_account(db, company, service_revenue_account_id, "revenue")
        if discount_account_id:
            _require_account(db, company, discount_account_id, "revenue")
    else:
        has_service = any(line.get("line_kind", "goods") == "service" for line in raw_lines)
        if has_service:
            require(bool(expense_account_id), "expense_account_required", "حساب هزینه خدمات را انتخاب کنید.")
            _require_account(db, company, expense_account_id, "expense")

    # Compute exact line pricing & D24+D27 invoice discount allocation
    with localcontext() as context:
        context.prec = 60
        prepared_lines: list[dict] = []
        line_nets_orig: list[Decimal] = []
        line_nets_irr: list[Decimal] = []
        gross_total_irr = Decimal(0)
        line_discount_total_irr = Decimal(0)

        for idx, line_in in enumerate(raw_lines):
            l_kind = line_in.get("line_kind", "goods")
            qty = line_in["quantity"]
            require(isinstance(qty, int) and qty >= 1, "invalid_quantity", "تعداد کالا باید عدد صحیح مثبت باشد (D32).")
            price = Decimal(_stock_money(line_in["unit_price"]))
            require(price > 0 and price == price.to_integral_value(), "invalid_unit_price", "قیمت واحد باید عدد صحیح مثبت باشد.")
            l_disc = Decimal(_stock_money(line_in.get("line_discount", 0)))
            require(l_disc >= 0 and l_disc == l_disc.to_integral_value(), "invalid_discount", "تخفیف ردیف باید عدد صحیح نامنفی باشد.")

            gross_orig = price * qty
            require(l_disc <= gross_orig, "line_discount_exceeds_gross", "تخفیف ردیف نمی‌تواند از مبلغ کل ردیف بیشتر باشد.")
            net_before_orig = gross_orig - l_disc

            price_irr = price * factor
            gross_irr = gross_orig * factor
            l_disc_irr = l_disc * factor
            net_before_irr = net_before_orig * factor

            item = None
            unit_label = line_in.get("unit") or "عدد"
            if l_kind == "goods":
                item_id = line_in.get("item_id")
                require(bool(item_id), "item_required", "برای ردیف کالایی انتخاب کالا الزامی است.")
                item = get_entity(db, InventoryItem, company, item_id)
                require(item.active, "inactive_item", f"کالای «{item.name}» غیرفعال است.", 409)
                require(item.item_kind == "goods", "item_not_goods", f"قلم «{item.name}» از نوع کالای انباری نیست.")
                _require_account(db, company, item.inventory_account_id, "other_asset")
                unit_label = item.base_unit
            elif line_in.get("item_id"):
                item = get_entity(db, InventoryItem, company, line_in["item_id"])
                unit_label = line_in.get("unit") or item.base_unit

            line_nets_orig.append(net_before_orig)
            line_nets_irr.append(net_before_irr)
            gross_total_irr += gross_irr
            line_discount_total_irr += l_disc_irr
            prepared_lines.append(
                {
                    "line_index": idx,
                    "line_kind": l_kind,
                    "item": item,
                    "item_id": item.id if item else None,
                    "description": line_in["description"].strip(),
                    "unit": unit_label,
                    "quantity": qty,
                    "unit_price": price,
                    "unit_price_irr": _stock_money(price_irr),
                    "gross_amount_irr": _stock_money(gross_irr),
                    "line_discount_irr": _stock_money(l_disc_irr),
                    "net_before_irr": net_before_irr,
                    "net_before_orig": net_before_orig,
                }
            )

        inv_disc_orig = Decimal(_stock_money(data.get("invoice_discount", 0)))
        require(
            inv_disc_orig >= 0 and inv_disc_orig == inv_disc_orig.to_integral_value(),
            "invalid_discount",
            "تخفیف کل باید عدد صحیح نامنفی باشد.",
        )
        inv_disc_irr = inv_disc_orig * factor
        # Allocate directly in IRR so integer IRR allocation (D27) is exact, or in TOMAN->IRR:
        if factor == 1:
            alloc_irr_list = allocate_invoice_discount(line_nets_irr, inv_disc_irr)
            alloc_orig_list = alloc_irr_list
        else:
            alloc_orig_list = allocate_invoice_discount(line_nets_orig, inv_disc_orig)
            alloc_irr_list = [val * factor for val in alloc_orig_list]

        net_total_irr = sum(line_nets_irr, Decimal(0)) - inv_disc_irr
        require(net_total_irr >= 0, "negative_invoice_total", "جمع خالص فاکتور نمی‌تواند منفی باشد.")

        # Validate FIFO & warehouse stock capacity cumulatively across lines for goods lines
        virtual_lots: dict[str, dict] = {}
        latest_dates: dict[str, date | None] = {}
        operation_id = m.uid()
        op_kind = f"commercial_{direction}"
        source_reference = allocate_reference(
            db, company, "sale_goods" if sale else "purchase_goods"
        )
        doc_number = allocate_number(
            db,
            company,
            "sales_invoice" if sale else "purchase_invoice",
            CommercialDocument,
            "number",
        )

        # Persist parent document and lines first to obtain stable line IDs
        doc = CommercialDocument(
            company_id=company,
            number=doc_number,
            direction=direction,
            status="draft",
            issue_date=issue_date,
            due_date=due_date,
            period_id=period.id,
            counterparty_id=cp.id,
            party_snapshot=snapshot_party,
            warehouse_id=warehouse.id if warehouse else None,
            proforma_id=proforma.id if proforma else None,
            currency=currency,
            gross_amount_irr=_stock_money(gross_total_irr),
            line_discount_total_irr=_stock_money(line_discount_total_irr),
            invoice_discount_irr=_stock_money(inv_disc_irr),
            net_amount_irr=_stock_money(net_total_irr),
            settlement_type=settlement_type,
            vendor_reference=data.get("vendor_reference"),
            description=(data.get("description") or f"فاکتور {'فروش' if sale else 'خرید'} {doc_number}")[:500],
            operation_id=operation_id,
            accounts={
                k: data.get(k)
                for k in (
                    "counterparty_account_id",
                    "revenue_account_id",
                    "service_revenue_account_id",
                    "expense_account_id",
                    "discount_account_id",
                    "cost_account_id",
                    "cash_account_id",
                    "cheque_account_id",
                )
            },
            actor_id=user.id,
        )
        db.add(doc)
        db.flush()

        stock_movements: list[dict] = []
        journal_lines: list[dict] = []
        total_cogs_irr = Decimal(0)

        for idx, pl in enumerate(prepared_lines):
            alloc_irr = alloc_irr_list[idx]
            net_line_irr = pl["net_before_irr"] - alloc_irr
            cost_layers: list[dict] = []
            line_cost_irr = Decimal(0)

            doc_line = CommercialDocumentLine(
                company_id=company,
                document_id=doc.id,
                line_index=idx,
                line_kind=pl["line_kind"],
                item_id=pl["item_id"],
                description=pl["description"],
                unit=pl["unit"],
                quantity=pl["quantity"],
                unit_price_irr=pl["unit_price_irr"],
                gross_amount_irr=pl["gross_amount_irr"],
                line_discount_irr=pl["line_discount_irr"],
                net_before_inv_disc_irr=_stock_money(pl["net_before_irr"]),
                allocated_invoice_discount_irr=_stock_money(alloc_irr),
                net_amount_irr=_stock_money(net_line_irr),
                cost_irr="0",
                cost_layers=[],
            )
            db.add(doc_line)
            db.flush()

            if pl["line_kind"] == "goods":
                item: InventoryItem = pl["item"]
                if item.id not in virtual_lots:
                    lots, latest = _lots(db, company, item.id, warehouse.id)
                    _stock_date(db, company, issue_date, latest)
                    virtual_lots[item.id] = lots
                    latest_dates[item.id] = latest
                lots = virtual_lots[item.id]
                qty = pl["quantity"]
                if sale:
                    layers, c_irr = _fifo(lots, qty)
                    # Deduct sequentially so subsequent lines of same item consume next FIFO layers
                    for layer in layers:
                        lots[layer["journal_id"]].remaining -= layer["quantity"]
                    cost_layers = layers
                    line_cost_irr = c_irr
                    total_cogs_irr += c_irr
                    val_irr_str = _stock_money(-c_irr)
                else:
                    _check_capacity(lots, qty)
                    line_cost_irr = net_line_irr
                    val_irr_str = _stock_money(net_line_irr)
                    # Effective net unit price for purchase FIFO layer
                    eff_unit_cost = _unit_money(net_line_irr, qty)
                    lots[f"pending:{doc_line.id}"] = type(
                        "_PendingLot", (), {"remaining": qty, "unit_cost_irr": eff_unit_cost}
                    )()

                doc_line.cost_irr = _stock_money(line_cost_irr)
                doc_line.cost_layers = cost_layers
                eff_unit_irr = _unit_money(net_line_irr, qty) if sale else _unit_money(line_cost_irr, qty)
                stock_movements.append(
                    {
                        "kind": "sale_goods" if sale else "purchase_goods",
                        "item_id": item.id,
                        "item_code": item.code,
                        "item_name": item.name,
                        "warehouse_id": warehouse.id,
                        "warehouse_code": warehouse.code,
                        "warehouse_name": warehouse.name,
                        "operation_id": operation_id,
                        "document_line_id": doc_line.id,
                        "line_index": len(stock_movements),
                        "source_reference": source_reference,
                        "quantity": -qty if sale else qty,
                        "unit_price_irr": eff_unit_irr,
                        "amount_irr": _stock_money(net_line_irr),
                        "value_irr": val_irr_str,
                        "cost_layers": cost_layers,
                        "policy_version": "perpetual-fifo-v1",
                    }
                )
            pl["doc_line"] = doc_line
            pl["net_line_irr"] = net_line_irr
            pl["cost_irr"] = line_cost_irr

        # Settlement lines in canonical IRR
        if settlement_type in ("cash", "mixed"):
            cash_irr = (
                Decimal(_stock_money(data.get("cash_amount") or 0)) * factor
                if settlement_type == "mixed"
                else net_total_irr
            )
            cheque_irr = Decimal(_stock_money(data.get("cheque_amount") or 0)) * factor if settlement_type == "mixed" else Decimal(0)
            on_acct_irr = Decimal(_stock_money(data.get("on_account_amount") or 0)) * factor if settlement_type == "mixed" else Decimal(0)
            settle_lines = validate_and_build_settlement_lines(
                direction=direction,
                total_amount=_stock_money(net_total_irr),
                settlement_type=settlement_type,
                cash_amount=_stock_money(cash_irr),
                cheque_amount=_stock_money(cheque_irr),
                on_account_amount=_stock_money(on_acct_irr),
                cash_account_id=cash_account_id,
                cheque_account_id=cheque_account_id,
                counterparty_account_id=counterparty_account_id,
                party_id=cp.id,
                cheque_number=data.get("cheque_number"),
                cheque_due_date=str(data.get("cheque_due_date")) if data.get("cheque_due_date") else None,
                db=db,
                company=company,
            )
        else:
            cash_irr = Decimal(0)
            cheque_irr = Decimal(0)
            on_acct_irr = net_total_irr
            require(bool(counterparty_account_id), "counterparty_account_required", "حساب طرف‌حساب را انتخاب کنید.")
            _require_account(db, company, counterparty_account_id, "trade_receivable" if sale else "trade_payable")
            settle_lines = [
                {
                    "account_id": counterparty_account_id,
                    "party_id": cp.id,
                    "counterparty_id": cp.id,
                    "debit": _stock_money(net_total_irr) if sale else "0",
                    "credit": "0" if sale else _stock_money(net_total_irr),
                }
            ]

        doc.cash_amount_irr = _stock_money(cash_irr)
        doc.cheque_amount_irr = _stock_money(cheque_irr)
        doc.on_account_amount_irr = _stock_money(on_acct_irr)

        # Credit limit check on sale on_account portion
        if sale and on_acct_irr > 0:
            check_credit_limit(
                db,
                company,
                user,
                cp.id,
                _stock_money(on_acct_irr),
                allow_override=bool(
                    allow_credit_override if allow_credit_override is not None else data.get("allow_credit_override", False)
                ),
                override_reason=(
                    credit_override_reason
                    if credit_override_reason is not None
                    else data.get("credit_override_reason", "")
                ),
            )

        if sale:
            journal_lines.extend(settle_lines)
            for pl in prepared_lines:
                dl: CommercialDocumentLine = pl["doc_line"]
                rev_acc = revenue_account_id if pl["line_kind"] == "goods" else service_revenue_account_id
                if discount_account_id and (Decimal(dl.line_discount_irr) + Decimal(dl.allocated_invoice_discount_irr)) > 0:
                    disc_sum = Decimal(dl.line_discount_irr) + Decimal(dl.allocated_invoice_discount_irr)
                    journal_lines.append(
                        {
                            "account_id": discount_account_id,
                            "party_id": cp.id,
                            "counterparty_id": cp.id,
                            "debit": _stock_money(disc_sum),
                            "credit": "0",
                            "description": f"تخفیف {dl.description}"[:500],
                            "reference_kind": "commercial_document_line",
                            "reference_id": dl.id,
                        }
                    )
                    rev_credit = dl.gross_amount_irr
                else:
                    rev_credit = dl.net_amount_irr
                journal_lines.append(
                    {
                        "account_id": rev_acc,
                        "party_id": cp.id,
                        "counterparty_id": cp.id,
                        "debit": "0",
                        "credit": rev_credit,
                        "description": dl.description[:500],
                        "reference_kind": "commercial_document_line",
                        "reference_id": dl.id,
                    }
                )
                if pl["line_kind"] == "goods" and Decimal(dl.cost_irr) > 0:
                    journal_lines.append(
                        {
                            "account_id": cost_account_id,
                            "party_id": "",
                            "debit": dl.cost_irr,
                            "credit": "0",
                            "description": f"بهای تمام‌شده {dl.description}"[:500],
                            "reference_kind": "commercial_document_line",
                            "reference_id": dl.id,
                        }
                    )
                    journal_lines.append(
                        {
                            "account_id": pl["item"].inventory_account_id,
                            "party_id": "",
                            "debit": "0",
                            "credit": dl.cost_irr,
                            "description": f"کاهش موجودی {dl.description}"[:500],
                            "reference_kind": "commercial_document_line",
                            "reference_id": dl.id,
                        }
                    )
        else:
            for pl in prepared_lines:
                dl = pl["doc_line"]
                target_acc = pl["item"].inventory_account_id if pl["line_kind"] == "goods" else expense_account_id
                journal_lines.append(
                    {
                        "account_id": target_acc,
                        "party_id": "",
                        "debit": dl.net_amount_irr,
                        "credit": "0",
                        "description": dl.description[:500],
                        "reference_kind": "commercial_document_line",
                        "reference_id": dl.id,
                    }
                )
            journal_lines.extend(settle_lines)

        draft_res = save_draft(
            db,
            company,
            user,
            {
                "period_id": period.id,
                "date": issue_date,
                "description": doc.description,
                "unit": "IRR",
                "lines": journal_lines,
            },
        )
        stock_payload = (
            {
                "kind": f"commercial_{direction}",
                "operation_id": operation_id,
                "document_id": doc.id,
                "warehouse_id": warehouse.id,
                "movements": stock_movements,
            }
            if stock_movements
            else None
        )
        origin = OperationDraft(
            id=operation_id,
            company_id=company,
            draft_id=draft_res["id"],
            kind=op_kind,
            source_reference=source_reference,
            payload=jsonable_encoder(
                {
                    "kind": op_kind,
                    "document_id": doc.id,
                    "proforma_id": proforma.id if proforma else None,
                    "period_id": period.id,
                    "date": issue_date.isoformat(),
                    "description": doc.description,
                    "unit": "IRR",
                    "original_currency": currency,
                    "party_id": cp.id,
                    "counterparty_account_id": counterparty_account_id,
                    "warehouse_id": warehouse.id if warehouse else None,
                    "amounts": {
                        "amount": _stock_money(net_total_irr),
                        "gross_amount_irr": _stock_money(gross_total_irr),
                        "invoice_discount_irr": _stock_money(inv_disc_irr),
                        "net_amount_irr": _stock_money(net_total_irr),
                        "on_account_amount_irr": _stock_money(on_acct_irr),
                    },
                    "lines": journal_lines,
                    "stock": stock_payload,
                }
            ),
            actor_id=user.id,
            policy_version=POLICY,
        )
        db.add(origin)
        doc.draft_id = draft_res["id"]
        db.flush()
        audit(
            db,
            company,
            user.id,
            "commercial.document_prepared",
            doc.id,
            {"draft_id": draft_res["id"], "direction": direction, "number": doc.number},
        )
        return {
            "document": _serialize_document(db, doc),
            "operation_id": operation_id,
            "draft": draft_res,
            "source_reference": source_reference,
            "financial_effect": False,
        }


def _open_invoice_balance(db: Session, company: str, doc: CommercialDocument) -> Decimal:
    """Compute remaining unpaid receivable/payable IRR balance on a commercial document (D25/D26/D29)."""
    from .native_invoice_models import NativeInvoiceAllocation, NativeInvoiceAllocationReversal

    base = Decimal(doc.on_account_amount_irr)
    # Subtract posted commercial return balance reductions
    prior_reduced = sum(
        (
            Decimal(r.invoice_balance_reduced_irr)
            for r in db.scalars(
                select(CommercialReturn).where(
                    CommercialReturn.company_id == company,
                    CommercialReturn.document_id == doc.id,
                    CommercialReturn.status == "posted",
                )
            )
        ),
        Decimal(0),
    )
    # Subtract credit notes applied to this document
    credits_applied = sum(
        (
            Decimal(app.amount_irr)
            for app in db.scalars(
                select(CounterpartyCreditApplication).where(
                    CounterpartyCreditApplication.company_id == company,
                    CounterpartyCreditApplication.target_document_id == doc.id,
                )
            )
        ),
        Decimal(0),
    )
    paid = Decimal(0)
    if doc.native_invoice_id:
        for alloc in db.scalars(
            select(NativeInvoiceAllocation).where(
                NativeInvoiceAllocation.company_id == company,
                NativeInvoiceAllocation.invoice_id == doc.native_invoice_id,
            )
        ):
            rev = db.scalar(
                select(NativeInvoiceAllocationReversal.id).where(
                    NativeInvoiceAllocationReversal.company_id == company,
                    NativeInvoiceAllocationReversal.allocation_id == alloc.id,
                )
            )
            if not rev:
                paid += Decimal(alloc.amount)
        from .treasury_service import effective_treasury_paid_for_invoice

        paid += effective_treasury_paid_for_invoice(db, company, doc.native_invoice_id)
    return max(Decimal(0), base - prior_reduced - credits_applied - paid)


def _proportional_return_net(line: CommercialDocumentLine, qty: int, already_returned_qty: int, prior_net_sum: Decimal) -> Decimal:
    """Exact remaining proportional net IRR return amount so 100% return equals line.net_amount_irr."""
    remaining_qty = line.quantity - already_returned_qty
    remaining_net = Decimal(line.net_amount_irr) - prior_net_sum
    if qty == remaining_qty:
        return remaining_net
    return (remaining_net * qty) // remaining_qty


def _restore_fifo_layers(orig_layers: list[dict], qty: int, prior_restored: dict[str, int]) -> tuple[list[dict], Decimal]:
    """Restore FIFO layers strictly in original sale consumption order (D30)."""
    remaining = qty
    restored: list[dict] = []
    cost_irr = Decimal(0)
    with localcontext() as ctx:
        ctx.prec = 60
        for layer in orig_layers:
            j_id = layer["journal_id"]
            avail = layer["quantity"] - prior_restored.get(j_id, 0)
            if avail <= 0:
                continue
            take = min(remaining, avail)
            restored.append({"journal_id": j_id, "quantity": take, "unit_cost_irr": layer["unit_cost_irr"]})
            cost_irr += Decimal(layer["unit_cost_irr"]) * take
            prior_restored[j_id] = prior_restored.get(j_id, 0) + take
            remaining -= take
            if remaining == 0:
                break
    return restored, cost_irr


def create_commercial_return_draft(
    db: Session, company: str, user: m.User, document_id: str, data: dict
) -> dict:
    """Prepare a partial or full sales/purchase return draft enforcing D25–D31."""
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه تهیه سند ندارید.", 403)
    require(ability["posting_available"], "primary_accounting_required", "کاربرد حسابداری اصلی لازم است.", 409)

    doc = get_entity(db, CommercialDocument, company, document_id)
    require(
        doc.status in ("posted", "partially_returned"),
        "document_not_returnable",
        "فقط فاکتور ثبت‌شده یا نیمه‌مرجوعی قابل برگشت است.",
        409,
    )
    period = get_entity(db, m.Period, company, data["period_id"])
    require_open_period(db, company, period.id)
    ret_date: date = data["date"]
    today = datetime.now(ZoneInfo(db.get(m.Company, company).timezone)).date()
    require(ret_date <= today, "future_return_date", "تاریخ برگشت نمی‌تواند در آینده باشد.", 409)
    require(period.start <= ret_date <= period.end, "date_outside_period", "تاریخ برگشت خارج از دوره است.")
    require(ret_date >= doc.issue_date, "return_before_invoice", "تاریخ برگشت نمی‌تواند پیش از فاکتور باشد.")

    req_lines = data["lines"]
    line_ids = [item["document_line_id"] for item in req_lines]
    require(len(line_ids) == len(set(line_ids)), "duplicate_return_line", "هر ردیف فاکتور در برگشت فقط یک‌بار می‌آید.")

    # Reject if another unposted draft return exists on this document to keep returnable quantities deterministic
    pending_draft = db.scalar(
        select(CommercialReturn.id).where(
            CommercialReturn.company_id == company,
            CommercialReturn.document_id == doc.id,
            CommercialReturn.status == "draft",
        )
    )
    require(pending_draft is None, "pending_return_draft_exists", "پیش‌نویس برگشت باز دیگری برای این فاکتور وجود دارد.", 409)

    is_sale_ret = doc.direction == "sale"
    ret_dir = "sale_return" if is_sale_ret else "purchase_return"
    return_account_id = (
        data.get("return_account_id")
        or doc.accounts.get("revenue_account_id")
        or doc.accounts.get("service_revenue_account_id")
        or doc.accounts.get("expense_account_id")
    )
    counterparty_account_id = data.get("counterparty_account_id") or doc.accounts.get("counterparty_account_id")
    cost_account_id = data.get("cost_account_id") or doc.accounts.get("cost_account_id")

    require(bool(counterparty_account_id), "counterparty_account_required", "حساب طرف‌حساب لازم است.")
    _require_account(
        db,
        company,
        counterparty_account_id,
        "trade_receivable" if is_sale_ret else "trade_payable",
    )
    if return_account_id:
        _require_account(db, company, return_account_id, "revenue" if is_sale_ret else "expense")

    for item_in in req_lines:
        orig_line = get_entity(db, CommercialDocumentLine, company, item_in["document_line_id"])
        require(
            orig_line.document_id == doc.id,
            "return_line_mismatch",
            "ردیف انتخاب‌شده متعلق به این فاکتور نیست.",
        )
        already_qty = (orig_line.returned_healthy_qty or 0) + (orig_line.returned_defective_qty or 0)
        remaining_qty = orig_line.quantity - already_qty
        qty = item_in["quantity"]
        require(
            1 <= qty <= remaining_qty,
            "return_quantity_exceeded",
            f"تعداد برگشتی ردیف «{orig_line.description}» بیش از مانده قابل برگشت ({remaining_qty}) است.",
            409,
        )

    operation_id = m.uid()
    ret_number = allocate_number(
        db,
        company,
        "sales_invoice" if is_sale_ret else "purchase_invoice",
        CommercialReturn,
        "number",
    )
    ret = CommercialReturn(
        company_id=company,
        number=ret_number,
        document_id=doc.id,
        direction=ret_dir,
        status="draft",
        date=ret_date,
        period_id=period.id,
        reason=data["reason"].strip(),
        operation_id=operation_id,
        accounts={
            "return_account_id": return_account_id,
            "counterparty_account_id": counterparty_account_id,
            "cost_account_id": cost_account_id,
        },
        actor_id=user.id,
    )
    db.add(ret)
    db.flush()

    stock_movements: list[dict] = []
    journal_lines: list[dict] = []
    total_ret_irr = Decimal(0)

    with localcontext() as ctx:
        ctx.prec = 60
        for idx, item_in in enumerate(req_lines):
            orig_line = get_entity(db, CommercialDocumentLine, company, item_in["document_line_id"])
            require(
                orig_line.document_id == doc.id,
                "return_line_mismatch",
                "ردیف انتخاب‌شده متعلق به این فاکتور نیست.",
            )
            already_qty = (orig_line.returned_healthy_qty or 0) + (orig_line.returned_defective_qty or 0)
            remaining_qty = orig_line.quantity - already_qty
            qty = item_in["quantity"]
            require(
                1 <= qty <= remaining_qty,
                "return_quantity_exceeded",
                f"تعداد برگشتی ردیف «{orig_line.description}» بیش از مانده قابل برگشت ({remaining_qty}) است.",
                409,
            )
            # Prior posted return lines on this document line
            prior_ret_lines = list(
                db.scalars(
                    select(CommercialReturnLine)
                    .join(
                        CommercialReturn,
                        (CommercialReturn.company_id == CommercialReturnLine.company_id)
                        & (CommercialReturn.id == CommercialReturnLine.return_id),
                    )
                    .where(
                        CommercialReturnLine.company_id == company,
                        CommercialReturnLine.document_line_id == orig_line.id,
                        CommercialReturn.status == "posted",
                    )
                )
            )
            prior_net_sum = sum((Decimal(p.return_net_amount_irr) for p in prior_ret_lines), Decimal(0))
            ret_net_irr = _proportional_return_net(orig_line, qty, already_qty, prior_net_sum)
            total_ret_irr += ret_net_irr

            condition = item_in.get("condition", "healthy")
            ret_cost_irr = Decimal(0)
            restored_layers: list[dict] = []
            quarantine_status = "none"

            if orig_line.line_kind == "goods":
                inv_item = get_entity(db, InventoryItem, company, orig_line.item_id)
                wh = get_entity(db, InventoryWarehouse, company, doc.warehouse_id)
                lots, latest = _lots(db, company, inv_item.id, wh.id)
                _stock_date(db, company, ret_date, latest)

                if is_sale_ret:
                    prior_restored: dict[str, int] = {}
                    for pl in prior_ret_lines:
                        if pl.condition == "healthy" or pl.quarantine_status == "restocked":
                            for lyr in pl.restored_cost_layers or []:
                                prior_restored[lyr["journal_id"]] = (
                                    prior_restored.get(lyr["journal_id"], 0) + lyr["quantity"]
                                )
                    restored_layers, ret_cost_irr = _restore_fifo_layers(orig_line.cost_layers or [], qty, prior_restored)
                    if condition == "healthy":
                        require(bool(cost_account_id), "cost_account_required", "حساب بهای تمام‌شده برای برگشت کالای سالم لازم است.")
                        _require_account(db, company, cost_account_id, "expense")
                        _check_capacity(lots, qty)
                        stock_movements.append(
                            {
                                "kind": "sale_return",
                                "item_id": inv_item.id,
                                "item_code": inv_item.code,
                                "item_name": inv_item.name,
                                "warehouse_id": wh.id,
                                "warehouse_code": wh.code,
                                "warehouse_name": wh.name,
                                "operation_id": operation_id,
                                "document_line_id": orig_line.id,
                                "line_index": len(stock_movements),
                                "source_reference": ret.number,
                                "quantity": qty,
                                "unit_price_irr": _unit_money(ret_cost_irr, qty),
                                "amount_irr": _stock_money(ret_net_irr),
                                "value_irr": _stock_money(ret_cost_irr),
                                "cost_layers": restored_layers,
                                "policy_version": "perpetual-fifo-v1",
                            }
                        )
                        journal_lines.append(
                            {
                                "account_id": inv_item.inventory_account_id,
                                "party_id": "",
                                "debit": _stock_money(ret_cost_irr),
                                "credit": "0",
                                "description": f"برگشت سالم {orig_line.description}"[:500],
                                "reference_kind": "commercial_document_line",
                                "reference_id": orig_line.id,
                            }
                        )
                        journal_lines.append(
                            {
                                "account_id": cost_account_id,
                                "party_id": "",
                                "debit": "0",
                                "credit": _stock_money(ret_cost_irr),
                                "description": f"کاهش بهای تمام‌شده {orig_line.description}"[:500],
                                "reference_kind": "commercial_document_line",
                                "reference_id": orig_line.id,
                            }
                        )
                    else:
                        # D31: Defective sales return stays in quarantine, NOT added to salable stock.
                        quarantine_status = "pending_inspection"
                else:
                    # D29: Purchase return deducts remaining lot from original purchase journal
                    lot = lots.get(doc.journal_id)
                    require(
                        lot is not None and lot.remaining >= qty,
                        "purchase_return_lot_consumed",
                        f"موجودی باقیمانده از خرید «{orig_line.description}» برای مرجوعی کافی نیست.",
                        409,
                    )
                    ret_cost_irr = ret_net_irr
                    restored_layers = [
                        {"journal_id": doc.journal_id, "quantity": qty, "unit_cost_irr": lot.unit_cost_irr}
                    ]
                    stock_movements.append(
                        {
                            "kind": "purchase_return",
                            "item_id": inv_item.id,
                            "item_code": inv_item.code,
                            "item_name": inv_item.name,
                            "warehouse_id": wh.id,
                            "warehouse_code": wh.code,
                            "warehouse_name": wh.name,
                            "operation_id": operation_id,
                            "document_line_id": orig_line.id,
                            "line_index": len(stock_movements),
                            "source_reference": ret.number,
                            "quantity": -qty,
                            "unit_price_irr": _unit_money(ret_cost_irr, qty),
                            "amount_irr": _stock_money(ret_net_irr),
                            "value_irr": _stock_money(-ret_cost_irr),
                            "cost_layers": restored_layers,
                            "policy_version": "perpetual-fifo-v1",
                        }
                    )
                    journal_lines.append(
                        {
                            "account_id": inv_item.inventory_account_id,
                            "party_id": "",
                            "debit": "0",
                            "credit": _stock_money(ret_net_irr),
                            "description": f"برگشت از خرید {orig_line.description}"[:500],
                            "reference_kind": "commercial_document_line",
                            "reference_id": orig_line.id,
                        }
                    )
            else:
                if not is_sale_ret:
                    require(bool(return_account_id), "return_account_required", "حساب برگشت خرید خدمات را انتخاب کنید.")
                    journal_lines.append(
                        {
                            "account_id": return_account_id,
                            "party_id": "",
                            "debit": "0",
                            "credit": _stock_money(ret_net_irr),
                            "description": f"برگشت خدمت {orig_line.description}"[:500],
                            "reference_kind": "commercial_document_line",
                            "reference_id": orig_line.id,
                        }
                    )

            if is_sale_ret:
                require(bool(return_account_id), "return_account_required", "حساب برگشت از فروش را انتخاب کنید.")
                journal_lines.append(
                    {
                        "account_id": return_account_id,
                        "party_id": doc.counterparty_id,
                        "counterparty_id": doc.counterparty_id,
                        "debit": _stock_money(ret_net_irr),
                        "credit": "0",
                        "description": f"برگشت از فروش {orig_line.description}"[:500],
                        "reference_kind": "commercial_document_line",
                        "reference_id": orig_line.id,
                    }
                )

            db.add(
                CommercialReturnLine(
                    company_id=company,
                    return_id=ret.id,
                    document_line_id=orig_line.id,
                    line_index=idx,
                    condition=condition,
                    quantity=qty,
                    return_net_amount_irr=_stock_money(ret_net_irr),
                    return_cost_irr=_stock_money(ret_cost_irr),
                    restored_cost_layers=restored_layers,
                    quarantine_status=quarantine_status,
                )
            )

        # Counterparty entry (D25/D26/D29: reduces AR/AP first; excess creates credit/supplier receivable; zero cash!)
        journal_lines.append(
            {
                "account_id": counterparty_account_id,
                "party_id": doc.counterparty_id,
                "counterparty_id": doc.counterparty_id,
                "debit": "0" if is_sale_ret else _stock_money(total_ret_irr),
                "credit": _stock_money(total_ret_irr) if is_sale_ret else "0",
                "description": f"تسویه حساب برگشتی {ret.number}"[:500],
            }
        )
        ret.total_return_amount_irr = _stock_money(total_ret_irr)

    draft_res = save_draft(
        db,
        company,
        user,
        {
            "period_id": period.id,
            "date": ret_date,
            "description": f"برگشت {'از فروش' if is_sale_ret else 'از خرید'} {doc.number}: {data['reason']}"[:500],
            "unit": "IRR",
            "lines": journal_lines,
        },
    )
    stock_payload = (
        {
            "kind": ret_dir,
            "operation_id": operation_id,
            "return_id": ret.id,
            "warehouse_id": doc.warehouse_id,
            "movements": stock_movements,
        }
        if stock_movements
        else None
    )
    op_kind = f"commercial_{ret_dir}"
    origin = OperationDraft(
        id=operation_id,
        company_id=company,
        draft_id=draft_res["id"],
        kind=op_kind,
        source_reference=ret.number,
        payload=jsonable_encoder(
            {
                "kind": op_kind,
                "return_id": ret.id,
                "document_id": doc.id,
                "period_id": period.id,
                "date": ret_date.isoformat(),
                "description": draft_res["description"],
                "unit": "IRR",
                "lines": journal_lines,
                "stock": stock_payload,
            }
        ),
        actor_id=user.id,
        policy_version=POLICY,
    )
    db.add(origin)
    ret.draft_id = draft_res["id"]
    db.flush()
    audit(db, company, user.id, "commercial.return_prepared", ret.id, {"document_id": doc.id, "draft_id": draft_res["id"]})
    return {"return": _serialize_return(db, ret), "operation_id": operation_id, "draft": draft_res, "financial_effect": False}


def decide_quarantine_draft(
    db: Session, company: str, user: m.User, return_line_id: str, data: dict
) -> dict:
    """Resolve a pending_inspection defective sale return line (restock into FIFO vs repair/scrap) (D31)."""
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه تصمیم‌گیری قرنطینه ندارید.", 403)
    require(ability["posting_available"], "primary_accounting_required", "کاربرد حسابداری اصلی لازم است.", 409)

    rl = get_entity(db, CommercialReturnLine, company, return_line_id)
    ret = get_entity(db, CommercialReturn, company, rl.return_id)
    require(ret.status == "posted", "return_not_posted", "ابتدا برگشت مربوطه باید ثبت نهایی شود.", 409)
    require(
        rl.condition == "defective" and rl.quarantine_status == "pending_inspection",
        "quarantine_not_pending",
        "این ردیف در انتظار بررسی نیست یا قبلاً تعیین تکلیف شده است.",
        409,
    )

    decision = data["decision"]
    require(decision in ("restocked", "repaired", "scrapped"), "invalid_decision", "تصمیم قرنطینه معتبر نیست.")
    doc = get_entity(db, CommercialDocument, company, ret.document_id)
    orig_line = get_entity(db, CommercialDocumentLine, company, rl.document_line_id)
    inv_item = get_entity(db, InventoryItem, company, orig_line.item_id)

    if decision != "restocked":
        rl.quarantine_status = decision
        rl.quarantine_decision_note = data["note"].strip()
        rl.quarantine_decided_at = datetime.now(timezone.utc)
        db.flush()
        audit(db, company, user.id, "commercial.quarantine_decided", rl.id, {"decision": decision})
        return {"return_line": serialize_fact(rl), "financial_effect": False}

    # Restock requires explicit journal draft + posting
    period = get_entity(db, m.Period, company, data["period_id"])
    require_open_period(db, company, period.id)
    cost_acc = data.get("cost_account_id") or ret.accounts.get("cost_account_id") or doc.accounts.get("cost_account_id")
    require(bool(cost_acc), "cost_account_required", "حساب بهای تمام‌شده برای بازگشت به انبار لازم است.")
    _require_account(db, company, cost_acc, "expense")

    wh = get_entity(db, InventoryWarehouse, company, doc.warehouse_id)
    lots, latest = _lots(db, company, inv_item.id, wh.id)
    _stock_date(db, company, data["date"], latest)
    _check_capacity(lots, rl.quantity)

    cost_irr = rl.return_cost_irr
    operation_id = m.uid()
    journal_lines = [
        {
            "account_id": inv_item.inventory_account_id,
            "party_id": "",
            "debit": cost_irr,
            "credit": "0",
            "description": f"بازگشت از قرنطینه به موجودی سالم: {inv_item.name}"[:500],
        },
        {
            "account_id": cost_acc,
            "party_id": "",
            "debit": "0",
            "credit": cost_irr,
            "description": f"اصلاح بهای تمام‌شده قرنطینه: {inv_item.name}"[:500],
        },
    ]
    draft_res = save_draft(
        db,
        company,
        user,
        {
            "period_id": period.id,
            "date": data["date"],
            "description": f"بازگشت از قرنطینه {inv_item.name}: {data['note']}"[:500],
            "unit": "IRR",
            "lines": journal_lines,
        },
    )
    stock_payload = {
        "kind": "restock",
        "item_id": inv_item.id,
        "item_code": inv_item.code,
        "item_name": inv_item.name,
        "warehouse_id": wh.id,
        "warehouse_code": wh.code,
        "warehouse_name": wh.name,
        "operation_id": operation_id,
        "document_line_id": orig_line.id,
        "return_line_id": rl.id,
        "line_index": 0,
        "source_reference": ret.number,
        "quantity": rl.quantity,
        "unit_price_irr": _unit_money(Decimal(cost_irr), rl.quantity),
        "value_irr": cost_irr,
        "cost_layers": rl.restored_cost_layers,
        "policy_version": "perpetual-fifo-v1",
    }
    origin = OperationDraft(
        id=operation_id,
        company_id=company,
        draft_id=draft_res["id"],
        kind="commercial_quarantine_restock",
        source_reference=f"QR-{rl.id[:8]}",
        payload=jsonable_encoder(
            {
                "kind": "commercial_quarantine_restock",
                "return_line_id": rl.id,
                "note": data["note"].strip(),
                "period_id": period.id,
                "date": data["date"].isoformat(),
                "description": draft_res["description"],
                "unit": "IRR",
                "lines": journal_lines,
                "stock": stock_payload,
            }
        ),
        actor_id=user.id,
        policy_version=POLICY,
    )
    db.add(origin)
    db.flush()
    return {"return_line": serialize_fact(rl), "operation_id": operation_id, "draft": draft_res, "financial_effect": False}


def apply_credit_to_document(
    db: Session, company: str, user: m.User, credit_id: str, data: dict
) -> dict:
    """Apply an open customer credit or supplier receivable to another posted invoice of the same counterparty (D25/D26/D29)."""
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه اعمال اعتبار ندارید.", 403)
    credit = get_entity(db, CounterpartyCredit, company, credit_id)
    require(
        credit.status in ("open", "partially_used") and Decimal(credit.remaining_amount_irr) > 0,
        "credit_unavailable",
        "این اعتبار ماندهٔ قابل استفاده ندارد.",
        409,
    )
    target = get_entity(db, CommercialDocument, company, data["target_document_id"])
    require(target.counterparty_id == credit.counterparty_id, "credit_party_mismatch", "اعتبار فقط برای همان طرف‌حساب قابل اعمال است.")
    expected_dir = "sale" if credit.credit_kind == "customer_credit" else "purchase"
    require(target.direction == expected_dir, "credit_direction_mismatch", "نوع فاکتور مقصد با نوع اعتبار سازگار نیست.")
    require(target.status in ("posted", "partially_returned"), "target_not_posted", "فاکتور مقصد باید ثبت‌شده باشد.", 409)

    amt = Decimal(_stock_money(data["amount_irr"]))
    require(amt > 0 and amt == amt.to_integral_value(), "invalid_amount", "مبلغ اعمال اعتبار باید مثبت باشد.")
    require(amt <= Decimal(credit.remaining_amount_irr), "credit_exceeded", "مبلغ از مانده اعتبار بیشتر است.", 409)
    open_bal = _open_invoice_balance(db, company, target)
    require(amt <= open_bal, "invoice_balance_exceeded", "مبلغ از مانده باز فاکتور بیشتر است.", 409)

    app = CounterpartyCreditApplication(
        company_id=company,
        credit_id=credit.id,
        target_document_id=target.id,
        amount_irr=_stock_money(amt),
        date=data["date"],
        actor_id=user.id,
    )
    db.add(app)
    new_rem = Decimal(credit.remaining_amount_irr) - amt
    credit.remaining_amount_irr = _stock_money(new_rem)
    credit.status = "consumed" if new_rem == 0 else "partially_used"
    credit.version += 1
    db.flush()
    audit(db, company, user.id, "commercial.credit_applied", credit.id, {"target_document_id": target.id, "amount_irr": app.amount_irr})
    return {
        "credit": serialize_fact(credit),
        "application": serialize_fact(app),
        "target_open_balance_irr": aggregate_money(_open_invoice_balance(db, company, target)),
    }


def create_credit_refund_draft(
    db: Session, company: str, user: m.User, credit_id: str, data: dict
) -> dict:
    """Prepare an independent approved payment/receipt draft to refund an open counterparty credit (D25/D26/D29)."""
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه تهیه سند بازپرداخت ندارید.", 403)
    require(ability["posting_available"], "primary_accounting_required", "کاربرد حسابداری اصلی لازم است.", 409)

    credit = get_entity(db, CounterpartyCredit, company, credit_id)
    require(
        credit.status in ("open", "partially_used") and Decimal(credit.remaining_amount_irr) > 0,
        "credit_unavailable",
        "این اعتبار قابل بازپرداخت نیست.",
        409,
    )
    amt = Decimal(_stock_money(data["amount_irr"]))
    require(amt > 0 and amt <= Decimal(credit.remaining_amount_irr), "credit_exceeded", "مبلغ از مانده اعتبار بیشتر است.", 409)

    period = get_entity(db, m.Period, company, data["period_id"])
    require_open_period(db, company, period.id)
    _require_account(db, company, data["cash_account_id"], "bank")
    is_customer = credit.credit_kind == "customer_credit"
    _require_account(
        db,
        company,
        data["counterparty_account_id"],
        "trade_receivable" if is_customer else "trade_payable",
    )

    operation_id = m.uid()
    amt_str = _stock_money(amt)
    lines = (
        [
            {"account_id": data["counterparty_account_id"], "party_id": credit.counterparty_id, "counterparty_id": credit.counterparty_id, "debit": amt_str, "credit": "0"},
            {"account_id": data["cash_account_id"], "party_id": "", "debit": "0", "credit": amt_str},
        ]
        if is_customer
        else [
            {"account_id": data["cash_account_id"], "party_id": "", "debit": amt_str, "credit": "0"},
            {"account_id": data["counterparty_account_id"], "party_id": credit.counterparty_id, "counterparty_id": credit.counterparty_id, "debit": "0", "credit": amt_str},
        ]
    )
    draft_res = save_draft(
        db,
        company,
        user,
        {
            "period_id": period.id,
            "date": data["date"],
            "description": f"{'بازپرداخت اعتبار مشتری' if is_customer else 'دریافت بستانکاری تأمین‌کننده'}: {data['reason']}"[:500],
            "unit": "IRR",
            "lines": lines,
        },
    )
    origin = OperationDraft(
        id=operation_id,
        company_id=company,
        draft_id=draft_res["id"],
        kind="commercial_credit_refund",
        source_reference=f"CR-{credit.id[:8]}",
        payload=jsonable_encoder(
            {
                "kind": "commercial_credit_refund",
                "credit_id": credit.id,
                "amount_irr": amt_str,
                "period_id": period.id,
                "date": data["date"].isoformat(),
                "unit": "IRR",
                "lines": lines,
            }
        ),
        actor_id=user.id,
        policy_version=POLICY,
    )
    db.add(origin)
    db.flush()
    return {"credit_id": credit.id, "operation_id": operation_id, "draft": draft_res, "financial_effect": False}


def validate_posting(db: Session, company: str, draft: Draft, correction: dict | None) -> dict | None:
    """Validate commercial multi-line invoice/return/quarantine drafts right before posting (D34)."""
    if correction:
        return None
    origin = db.scalar(
        select(OperationDraft).where(
            OperationDraft.company_id == company,
            OperationDraft.draft_id == draft.id,
            OperationDraft.kind.in_(COMMERCIAL_OPERATION_KINDS),
        )
    )
    if origin is None:
        return None
    data = origin.payload
    expected = validate_lines(db, company, {"unit": "IRR", "lines": data["lines"]})
    require(
        draft.lines == expected and draft.date == date.fromisoformat(data["date"]) and draft.period_id == data["period_id"],
        "commercial_draft_changed",
        "محتوای پیش‌نویس تجاری تغییر کرده است؛ پیش‌نویس جدید تهیه کنید.",
        409,
    )
    return data.get("stock")


def on_commercial_journal_posted(
    db: Session,
    company: str,
    user: m.User,
    draft: Draft,
    journal: NativeJournal,
    created_journal_lines: list,
    created_movements: list[InventoryMovement],
) -> None:
    """Atomically finalize CommercialDocument, NativeInvoice, ProformaInvoice, CommercialReturn, Credit or Quarantine after journal insert (D34)."""
    origin = db.scalar(
        select(OperationDraft).where(
            OperationDraft.company_id == company,
            OperationDraft.draft_id == draft.id,
        )
    )
    if origin is None:
        return

    mov_by_line = {mov.document_line_id: mov for mov in created_movements if mov.document_line_id}
    jl_by_ref = {jl.reference_id: jl for jl in created_journal_lines if jl.reference_kind == "commercial_document_line" and jl.reference_id}

    if origin.kind in ("commercial_sale", "commercial_purchase"):
        doc = get_entity(db, CommercialDocument, company, origin.payload["document_id"])
        doc.status = "posted"
        doc.posting_date = journal.date
        doc.journal_id = journal.id
        doc.version += 1

        for dl in db.scalars(
            select(CommercialDocumentLine).where(
                CommercialDocumentLine.company_id == company, CommercialDocumentLine.document_id == doc.id
            )
        ):
            if dl.id in jl_by_ref:
                dl.journal_line_id = jl_by_ref[dl.id].id
            if dl.id in mov_by_line:
                dl.inventory_movement_id = mov_by_line[dl.id].id

        # Create NativeInvoice for AR/AP tracking using canonical proof matching native_invoice_evidence
        if not doc.native_invoice_id:
            from .native_invoice_evidence import _proof as native_proof

            source_payload = native_proof(db, company, origin.id, journal.date, journal.id)
            ni = NativeInvoice(
                company_id=company,
                operation_id=origin.id,
                direction=doc.direction,
                source=source_payload,
                actor_id=user.id,
            )
            db.add(ni)
            db.flush()
            db.add(
                NativeInvoiceTerms(
                    company_id=company,
                    invoice_id=ni.id,
                    version=1,
                    effective_date=doc.issue_date,
                    payload={
                        "due_date": doc.due_date.isoformat() if doc.due_date else None,
                        "due_unknown": doc.due_date is None,
                        "expected_date": doc.due_date.isoformat() if doc.due_date else None,
                        "expected_unknown": doc.due_date is None,
                    },
                    reason="ایجاد خودکار شرایط از فاکتور تجاری",
                    actor_id=user.id,
                )
            )
            doc.native_invoice_id = ni.id

        # Complete proforma conversion lifecycle cleanly
        if doc.proforma_id:
            pf = get_entity(db, ProformaInvoice, company, doc.proforma_id)
            if pf.status == "conversion_pending":
                pf.status = "converted"
                pf.version += 1
        db.flush()

    elif origin.kind in ("commercial_sale_return", "commercial_purchase_return"):
        ret = get_entity(db, CommercialReturn, company, origin.payload["return_id"])
        doc = get_entity(db, CommercialDocument, company, ret.document_id)
        open_before = _open_invoice_balance(db, company, doc)
        total_ret = Decimal(ret.total_return_amount_irr)
        reduced = min(total_ret, open_before)
        credit_amt = total_ret - reduced

        ret.status = "posted"
        ret.journal_id = journal.id
        ret.invoice_balance_reduced_irr = _stock_money(reduced)
        ret.credit_created_irr = _stock_money(credit_amt)
        ret.version += 1

        for rl in db.scalars(
            select(CommercialReturnLine).where(
                CommercialReturnLine.company_id == company, CommercialReturnLine.return_id == ret.id
            )
        ):
            orig_line = get_entity(db, CommercialDocumentLine, company, rl.document_line_id)
            if rl.condition == "healthy":
                orig_line.returned_healthy_qty = (orig_line.returned_healthy_qty or 0) + rl.quantity
            else:
                orig_line.returned_defective_qty = (orig_line.returned_defective_qty or 0) + rl.quantity

        all_doc_lines = list(
            db.scalars(
                select(CommercialDocumentLine).where(
                    CommercialDocumentLine.company_id == company, CommercialDocumentLine.document_id == doc.id
                )
            )
        )
        fully_returned = all(
            (dl.returned_healthy_qty or 0) + (dl.returned_defective_qty or 0) >= dl.quantity
            for dl in all_doc_lines
        )
        doc.status = "fully_returned" if fully_returned else "partially_returned"
        doc.version += 1

        if credit_amt > 0:
            db.add(
                CounterpartyCredit(
                    company_id=company,
                    counterparty_id=doc.counterparty_id,
                    return_id=ret.id,
                    document_id=doc.id,
                    credit_kind="customer_credit" if ret.direction == "sale_return" else "supplier_receivable",
                    original_amount_irr=_stock_money(credit_amt),
                    remaining_amount_irr=_stock_money(credit_amt),
                    status="open",
                    actor_id=user.id,
                )
            )
        db.flush()

    elif origin.kind == "commercial_quarantine_restock":
        rl = get_entity(db, CommercialReturnLine, company, origin.payload["return_line_id"])
        rl.quarantine_status = "restocked"
        rl.quarantine_decision_note = origin.payload.get("note")
        rl.quarantine_decided_at = datetime.now(timezone.utc)
        rl.quarantine_journal_id = journal.id
        db.flush()

    elif origin.kind == "commercial_credit_refund":
        credit = get_entity(db, CounterpartyCredit, company, origin.payload["credit_id"])
        amt = Decimal(origin.payload["amount_irr"])
        rem = max(Decimal(0), Decimal(credit.remaining_amount_irr) - amt)
        credit.remaining_amount_irr = _stock_money(rem)
        credit.status = "refunded" if rem == 0 else "partially_used"
        credit.refund_operation_id = origin.id
        credit.version += 1
        db.flush()


def on_commercial_draft_discarded(db: Session, company: str, user: m.User, draft: Draft) -> None:
    """Restore ProformaInvoice from conversion_pending -> issued and mark draft commercial docs discarded."""
    origin = db.scalar(
        select(OperationDraft).where(OperationDraft.company_id == company, OperationDraft.draft_id == draft.id)
    )
    if origin is None:
        return
    if origin.kind in ("commercial_sale", "commercial_purchase"):
        doc_id = origin.payload.get("document_id")
        if doc_id:
            doc = get_entity(db, CommercialDocument, company, doc_id)
            if doc.status == "draft":
                doc.status = "discarded"
                doc.version += 1
        pf_id = origin.payload.get("proforma_id")
        if pf_id:
            pf = get_entity(db, ProformaInvoice, company, pf_id)
            if pf.status == "conversion_pending":
                pf.status = "issued"
                pf.converted_operation_id = None
                pf.version += 1
                audit(
                    db,
                    company,
                    user.id,
                    "commercial.proforma_conversion_discarded",
                    pf.id,
                    {"draft_id": draft.id},
                )
    elif origin.kind in ("commercial_sale_return", "commercial_purchase_return"):
        ret_id = origin.payload.get("return_id")
        if ret_id:
            ret = get_entity(db, CommercialReturn, company, ret_id)
            if ret.status == "draft":
                ret.status = "discarded"
                ret.version += 1
    # Also check legacy conversion by converted_operation_id
    for pf in db.scalars(
        select(ProformaInvoice).where(
            ProformaInvoice.company_id == company,
            ProformaInvoice.converted_operation_id == origin.id,
            ProformaInvoice.status == "conversion_pending",
        )
    ):
        pf.status = "issued"
        pf.converted_operation_id = None
        pf.version += 1
