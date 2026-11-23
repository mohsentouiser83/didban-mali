"""Commercial operations: counterparties, credit controls, proforma lifecycle and printing."""

import io
from datetime import datetime
from decimal import Decimal, localcontext
from zoneinfo import ZoneInfo

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Spacer
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, aliased

from . import models as m
from .accounting_models import Draft
from .accounting_service import capabilities, validate_lines
from .commercial_models import CommercialCounterparty, ProformaInvoice
from .errors import DomainError, require
from .exports import FONT_MEDIUM, MUTED, RTLText, _table, display_date, localized, register_fonts
from .inventory_models import InventoryItem
from .inventory_service import create_draft
from .money_type import aggregate_money, canonical_money
from .native_invoice_models import NativeInvoice, NativeInvoiceSourceRevision
from .operation_models import OperationDraft
from .posting_models import NativeJournal
from .security import membership
from .services import check_version, get_entity
from .workflow import audit, serialize_fact


def add_counterparty(db: Session, company: str, user: m.User, data: dict) -> dict:
    ability = capabilities(db, company, user)
    require(ability["can_manage_accounts"], "permission_denied", "اجازه مدیریت طرف حساب‌ها ندارید.", 403)
    require(
        not db.scalar(
            select(CommercialCounterparty.id).where(
                CommercialCounterparty.company_id == company,
                CommercialCounterparty.code == data["code"],
            )
        ),
        "duplicate_counterparty_code",
        "این شناسه طرف حساب قبلاً ثبت شده است.",
        409,
    )
    limit = canonical_money(data["credit_limit_irr"]) if data.get("credit_limit_irr") else None
    row = CommercialCounterparty(
        company_id=company,
        code=data["code"],
        name=data["name"],
        national_id=data.get("national_id"),
        economic_code=data.get("economic_code"),
        phone=data.get("phone"),
        address=data.get("address"),
        credit_limit_irr=limit,
        active=data.get("active", True),
    )
    db.add(row)
    db.flush()
    audit(db, company, user.id, "commercial.counterparty_created", row.id)
    return serialize_fact(row)


def update_counterparty(
    db: Session, company: str, user: m.User, counterparty_id: str, data: dict, version: int | None = None
) -> dict:
    ability = capabilities(db, company, user)
    require(ability["can_manage_accounts"], "permission_denied", "اجازه مدیریت طرف حساب‌ها ندارید.", 403)
    cp = get_entity(db, CommercialCounterparty, company, counterparty_id)
    if version is not None:
        check_version(cp, version)
    if "code" in data and data["code"] != cp.code:
        for model, party_field in (
            (ProformaInvoice, ProformaInvoice.party_id),
            (OperationDraft, OperationDraft.payload["party_id"].as_string()),
            (m.Invoice, m.Invoice.party_id),
            (m.JournalLine, m.JournalLine.party_id),
        ):
            require(
                not db.scalar(select(model.id).where(model.company_id == company, party_field == cp.code).limit(1)),
                "counterparty_code_in_use",
                "شناسهٔ طرف‌حساب در سوابق مالی استفاده شده و قابل تغییر نیست.",
                409,
            )
        duplicate = db.scalar(
            select(CommercialCounterparty.id).where(
                CommercialCounterparty.company_id == company,
                CommercialCounterparty.code == data["code"],
                CommercialCounterparty.id != counterparty_id,
            )
        )
        require(not duplicate, "duplicate_counterparty_code", "این شناسه طرف حساب قبلاً ثبت شده است.", 409)
        cp.code = data["code"]
    if data.get("name") is not None:
        cp.name = data["name"]
    for field in ("national_id", "economic_code", "phone", "address"):
        if field in data:
            setattr(cp, field, data[field])
    if "credit_limit_irr" in data:
        cp.credit_limit_irr = (
            canonical_money(data["credit_limit_irr"]) if data["credit_limit_irr"] is not None else None
        )
    if "active" in data and data["active"] is not None:
        cp.active = bool(data["active"])
    cp.version += 1
    db.flush()
    audit(db, company, user.id, "commercial.counterparty_updated", cp.id)
    return serialize_fact(cp)


def list_counterparties(
    db: Session,
    company: str,
    user: m.User,
    limit: int = 50,
    offset: int = 0,
    search: str | None = None,
    active_only: bool = False,
) -> dict:
    membership(db, company, user)
    stmt = select(CommercialCounterparty).where(CommercialCounterparty.company_id == company)
    if active_only:
        stmt = stmt.where(CommercialCounterparty.active.is_(True))
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(CommercialCounterparty.name.ilike(term), CommercialCounterparty.code.ilike(term))
        )
    total = len(list(db.scalars(stmt)))
    rows = list(db.scalars(stmt.order_by(CommercialCounterparty.code).offset(offset).limit(limit)))
    return {
        "total": total,
        "items": [serialize_fact(row) for row in rows],
    }


def get_counterparty(db: Session, company: str, counterparty_id: str) -> CommercialCounterparty:
    return get_entity(db, CommercialCounterparty, company, counterparty_id)


def resolve_counterparty(db: Session, company: str, party_id: str) -> CommercialCounterparty | None:
    cp = db.scalar(
        select(CommercialCounterparty).where(
            CommercialCounterparty.company_id == company,
            or_(CommercialCounterparty.code == party_id, CommercialCounterparty.id == party_id),
        )
    )
    if cp:
        require(cp.active, "inactive_counterparty", "طرف‌حساب غیرفعال است.", 409)
    return cp


def sale_credit_amount(data: dict, amount: str) -> str:
    settlement_type = data.get("settlement_type", "on_account")
    if settlement_type == "cash":
        return "0"
    if settlement_type == "mixed":
        amount = data.get("on_account_amount")
        if amount is None:
            amount = data.get("amounts", {}).get("on_account_amount", "0")
    with localcontext() as context:
        context.prec = 60
        return canonical_money(Decimal(canonical_money(amount)) * (10 if data.get("unit") == "TOMAN" else 1))


def check_credit_limit(
    db: Session,
    company: str,
    user: m.User,
    party_id: str,
    additional_amount_irr: str,
    *,
    allow_override: bool = False,
    override_reason: str = "",
    audit_override: bool = True,
) -> None:
    cp = resolve_counterparty(db, company, party_id)
    if cp is None or cp.credit_limit_irr is None or Decimal(canonical_money(additional_amount_irr)) == 0:
        return

    # Calculate current unpaid exposure for this party from native invoices
    from .native_invoice_evidence import _today
    from .native_invoice_service import current as current_invoices

    today = _today(db, company)
    invoices_data = current_invoices(db, company, user, as_of=today, direction="sale")
    party_identifiers = (cp.code, cp.id)
    previous_reversal = aliased(NativeJournal)
    unlinked = db.scalars(
        select(OperationDraft)
        .join(NativeJournal, (NativeJournal.company_id == company) & (NativeJournal.draft_id == OperationDraft.draft_id))
        .where(
            OperationDraft.company_id == company,
            OperationDraft.kind.in_(("sale_goods", "sale_service")),
            OperationDraft.payload["party_id"].as_string().in_(party_identifiers),
            NativeJournal.date <= today,
            ~select(NativeInvoice.id).where(
                NativeInvoice.company_id == company, NativeInvoice.operation_id == OperationDraft.id
            ).exists(),
            ~select(NativeInvoiceSourceRevision.id).where(
                NativeInvoiceSourceRevision.company_id == company,
                NativeInvoiceSourceRevision.journal_id == NativeJournal.id,
                NativeInvoiceSourceRevision.effective_date <= today,
            ).exists(),
            ~select(previous_reversal.id).where(
                previous_reversal.company_id == company,
                previous_reversal.reversal_of == NativeJournal.id,
                previous_reversal.date <= today,
            ).exists(),
        )
    )
    with localcontext() as context:
        context.prec = 60
        current_exposure = sum(
            (Decimal(inv["remaining"] if inv["remaining"] is not None else inv["amount"])
             for inv in invoices_data.get("items", [])
             if inv.get("party_id") in party_identifiers and inv.get("reason") != "native_invoice_source_reversed"),
            Decimal(0),
        )
        current_exposure += sum(
            (Decimal(sale_credit_amount(origin.payload, origin.payload["amounts"]["amount"])) for origin in unlinked),
            Decimal(0),
        )
        projected = current_exposure + Decimal(canonical_money(additional_amount_irr))
        max_allowed = Decimal(cp.credit_limit_irr)

    if projected > max_allowed:
        if allow_override and bool(override_reason.strip()) and capabilities(db, company, user)["can_post"]:
            if audit_override:
                audit(
                    db,
                    company,
                    user.id,
                    "commercial.credit_limit_overridden",
                    cp.id,
                    {
                        "credit_limit_irr": cp.credit_limit_irr,
                        "current_exposure_irr": str(current_exposure),
                        "projected_exposure_irr": str(projected),
                        "override_reason": override_reason,
                    },
                )
            return
        raise DomainError(
            "credit_limit_exceeded",
            f"مجموع مطالبات از سقف اعتباری مشتری ({aggregate_money(max_allowed)} ریال) بیشتر می‌شود.",
            409,
        )


def validate_posting_credit(db: Session, company: str, user: m.User, drafts: list[Draft]) -> None:
    draft_ids = [draft.id for draft in drafts]
    sales = {
        sale.draft_id: sale
        for sale in db.scalars(
            select(OperationDraft).where(
                OperationDraft.company_id == company,
                OperationDraft.draft_id.in_(draft_ids),
                OperationDraft.kind.in_(("sale_goods", "sale_service")),
            )
        )
    }
    batch_amounts: dict[str, Decimal] = {}
    with localcontext() as context:
        context.prec = 60
        for draft in drafts:
            sale = sales.get(draft.id)
            if not sale:
                continue
            payload = sale.payload
            party_id = payload.get("party_id")
            if not party_id:
                # Earlier operation records may lack the structured party and amounts.
                line_parties = {line["party_id"] for line in draft.lines if line.get("party_id")}
                for line_party in line_parties:
                    registered = resolve_counterparty(db, company, line_party)
                    require(
                        registered is None or registered.credit_limit_irr is None,
                        "sale_credit_evidence_missing",
                        "برای کنترل سقف اعتبار، پیش‌نویس فروش را از عملیات فروش دوباره تهیه کنید.",
                        409,
                    )
                continue
            party = resolve_counterparty(db, company, party_id)
            if party is None or party.credit_limit_irr is None:
                continue
            require(
                payload.get("amounts", {}).get("amount") is not None and payload.get("unit"),
                "sale_credit_evidence_missing",
                "برای کنترل سقف اعتبار، پیش‌نویس فروش را از عملیات فروش دوباره تهیه کنید.",
                409,
            )
            if sale.kind == "sale_service":
                from .operation_service import build

                expected = validate_lines(db, company, {"unit": payload["unit"], "lines": build(payload)})
                require(draft.lines == expected, "sale_draft_changed", "محتوای سند با عملیات فروش یکسان نیست.", 409)
            addition = Decimal(sale_credit_amount(payload, payload["amounts"]["amount"]))
            if not addition:
                continue
            total = batch_amounts.get(party.id, Decimal(0)) + addition
            override_reason = payload.get("credit_override_reason", "")
            check_credit_limit(
                db, company, user, party.id, aggregate_money(total),
                allow_override=bool(override_reason), override_reason=override_reason, audit_override=False,
            )
            batch_amounts[party.id] = total


def _process_lines(lines_in: list[dict], currency: str) -> tuple[list[dict], str, str]:
    factor = 10 if currency == "TOMAN" else 1
    total = Decimal(0)
    total_irr = Decimal(0)
    processed = []
    with localcontext() as context:
        context.prec = 60
        for idx, line in enumerate(lines_in):
            qty = line["quantity"]
            price = Decimal(canonical_money(line["unit_price"]))
            discount = Decimal(canonical_money(line.get("discount", 0)))
            require(price > 0, "invalid_proforma_price", "قیمت واحد باید مثبت باشد.", 422)
            require(discount >= 0, "invalid_proforma_discount", "تخفیف نمی‌تواند منفی باشد.", 422)
            line_total = (price * qty) - discount
            require(line_total >= 0, "negative_line_total", "مبلغ ردیف نمی‌تواند منفی باشد.", 422)
            unit_price_irr = price * factor
            line_total_irr = line_total * factor
            total += line_total
            total_irr += line_total_irr
            processed.append(
                {
                    "line_id": str(idx + 1),
                    "item_id": line.get("item_id"),
                    "description": line["description"],
                    "quantity": qty,
                    "unit_price": canonical_money(price),
                    "unit_price_irr": canonical_money(unit_price_irr),
                    "discount": canonical_money(discount),
                    "total": canonical_money(line_total),
                    "total_irr": canonical_money(line_total_irr),
                }
            )
    return processed, canonical_money(total), canonical_money(total_irr)


def _validate_proforma(db: Session, company: str, data: dict) -> None:
    require(data.get("direction", "sale") == "sale", "proforma_sale_only", "صدور پیش‌فاکتور فقط برای فروش است.", 422)
    expiry = data.get("expiry_date")
    require(not expiry or expiry >= data["date"], "invalid_proforma_expiry", "اعتبار پیش‌فاکتور نباید قبل از تاریخ صدور باشد.", 422)
    require(
        resolve_counterparty(db, company, data["party_id"]) is not None,
        "proforma_counterparty_required",
        "طرف‌حساب معتبر را انتخاب کنید.",
        422,
    )

    item_ids = {line["item_id"] for line in data.get("lines", []) if line.get("item_id")}
    if item_ids:
        active_items = set(db.scalars(
            select(InventoryItem.id).where(
                InventoryItem.company_id == company, InventoryItem.id.in_(item_ids), InventoryItem.active.is_(True)
            )
        ))
        require(active_items == item_ids, "invalid_proforma_item", "کالای معتبر و فعال را انتخاب کنید.", 422)


def create_proforma(db: Session, company: str, user: m.User, data: dict) -> dict:
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه صدور پیش‌فاکتور ندارید.", 403)
    require(
        not db.scalar(
            select(ProformaInvoice.id).where(
                ProformaInvoice.company_id == company,
                ProformaInvoice.number == data["number"],
            )
        ),
        "duplicate_proforma_number",
        "این شماره پیش‌فاکتور قبلاً ثبت شده است.",
        409,
    )
    _validate_proforma(db, company, data)
    currency = data.get("currency", "IRR")
    lines, total, total_irr = _process_lines(data["lines"], currency)
    row = ProformaInvoice(
        company_id=company,
        number=data["number"],
        direction="sale",
        date=data["date"],
        expiry_date=data.get("expiry_date"),
        party_id=data["party_id"],
        currency=currency,
        lines=lines,
        total_amount=total,
        total_amount_irr=total_irr,
        terms=data.get("terms"),
        status="issued",
        actor_id=user.id,
    )
    db.add(row)
    db.flush()
    audit(db, company, user.id, "commercial.proforma_created", row.id)
    return serialize_fact(row)


def update_proforma(
    db: Session, company: str, user: m.User, proforma_id: str, data: dict, version: int | None = None
) -> dict:
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه تغییر پیش‌فاکتور ندارید.", 403)
    pf = get_entity(db, ProformaInvoice, company, proforma_id)
    if version is not None:
        check_version(pf, version)
    require(pf.status in ("draft", "issued"), "proforma_not_editable", "پیش‌فاکتور قابل ویرایش نیست.", 409)
    require(pf.direction == "sale", "proforma_sale_only", "پیش‌فاکتور خرید فقط قابل مشاهده است.", 409)
    _validate_proforma(
        db,
        company,
        {"direction": pf.direction, "date": pf.date, "expiry_date": pf.expiry_date, "party_id": pf.party_id} | data,
    )
    if "number" in data and data["number"] != pf.number:
        duplicate = db.scalar(
            select(ProformaInvoice.id).where(
                ProformaInvoice.company_id == company,
                ProformaInvoice.number == data["number"],
                ProformaInvoice.id != proforma_id,
            )
        )
        require(not duplicate, "duplicate_proforma_number", "این شماره پیش‌فاکتور قبلاً ثبت شده است.", 409)
        pf.number = data["number"]
    if "lines" in data:
        lines, total, total_irr = _process_lines(data["lines"], pf.currency)
        pf.lines = lines
        pf.total_amount = total
        pf.total_amount_irr = total_irr
    if "date" in data:
        pf.date = data["date"]
    if "expiry_date" in data:
        pf.expiry_date = data["expiry_date"]
    if "party_id" in data:
        pf.party_id = data["party_id"]
    if "terms" in data:
        pf.terms = data["terms"]
    pf.version += 1
    db.flush()
    audit(db, company, user.id, "commercial.proforma_updated", pf.id)
    return serialize_fact(pf)


def cancel_proforma(
    db: Session, company: str, user: m.User, proforma_id: str, reason: str, version: int | None = None
) -> dict:
    ability = capabilities(db, company, user)
    require(ability["can_prepare"], "permission_denied", "اجازه لغو پیش‌فاکتور ندارید.", 403)
    pf = get_entity(db, ProformaInvoice, company, proforma_id)
    if version is not None:
        check_version(pf, version)
    require(pf.status in ("draft", "issued"), "proforma_not_cancellable", "پیش‌فاکتور قابل لغو نیست.", 409)
    pf.status = "cancelled"
    pf.version += 1
    db.flush()
    audit(db, company, user.id, "commercial.proforma_cancelled", pf.id, {"reason": reason})
    return serialize_fact(pf)


def get_proforma(db: Session, company: str, proforma_id: str) -> dict:
    pf = get_entity(db, ProformaInvoice, company, proforma_id)
    return serialize_fact(pf)


def list_proformas(db: Session, company: str, user: m.User, limit: int = 50, offset: int = 0) -> dict:
    membership(db, company, user)
    stmt = select(ProformaInvoice).where(ProformaInvoice.company_id == company)
    total = len(list(db.scalars(stmt)))
    rows = list(
        db.scalars(
            stmt.order_by(ProformaInvoice.date.desc(), ProformaInvoice.id.desc()).offset(offset).limit(limit)
        )
    )
    return {
        "total": total,
        "items": [serialize_fact(row) for row in rows],
    }


def convert_proforma(
    db: Session,
    company: str,
    user: m.User,
    proforma_id: str,
    expected_version: int,
    data: dict,
) -> dict:
    pf = get_entity(db, ProformaInvoice, company, proforma_id)
    check_version(pf, expected_version)
    require(
        pf.status == "issued", "proforma_not_convertible", "فقط پیش‌فاکتورهای صادرشده قابل تبدیل هستند.", 409
    )
    require(
        pf.converted_operation_id is None,
        "proforma_already_converted",
        "این پیش‌فاکتور قبلاً تبدیل شده است.",
        409,
    )

    today = datetime.now(ZoneInfo(db.get(m.Company, company).timezone)).date()
    if pf.expiry_date and pf.expiry_date < today:
        raise DomainError("proforma_expired", "مهلت اعتبار این پیش‌فاکتور منقضی شده است.", 409)

    settlement_type = data.get("settlement_type", "on_account")
    require(
        settlement_type in ("on_account", "cash", "mixed"),
        "invalid_settlement_type",
        "نوع تسویه باید on_account، cash یا mixed باشد.",
    )

    require(pf.direction == "sale", "proforma_sale_only", "پیش‌فاکتور خرید قابل تبدیل نیست.", 409)
    require(
        len(pf.lines) == 1 and Decimal(pf.lines[0].get("discount", "0")) == 0,
        "proforma_unsupported_conversion",
        "تبدیل فقط برای پیش‌فاکتور تک‌قلم بدون تخفیف در دسترس است.",
        409,
    )
    _validate_proforma(
        db, company, {"direction": pf.direction, "party_id": pf.party_id, "date": pf.date, "expiry_date": pf.expiry_date}
    )
    first_line = pf.lines[0]
    require(first_line.get("item_id"), "item_required", "شناسه کالا در پیش‌فاکتور موجود نیست.", 422)

    draft_data = {
        "kind": "sale_goods",
        "item_id": first_line["item_id"],
        "warehouse_id": data["warehouse_id"],
        "quantity": first_line["quantity"],
        "unit_price": first_line["unit_price"],
        "unit": pf.currency,
        "period_id": data["period_id"],
        "date": data.get("date", today),
        "description": f"تبدیل پیش‌فاکتور {pf.number}",
        "source_reference": data["source_reference"],
        "party_id": pf.party_id,
        "counterparty_account_id": data.get("counterparty_account_id"),
        "revenue_account_id": data.get("revenue_account_id"),
        "cost_account_id": data.get("cost_account_id"),
        "settlement_type": settlement_type,
        "cash_amount": data.get("cash_amount"),
        "cheque_amount": data.get("cheque_amount"),
        "on_account_amount": data.get("on_account_amount"),
        "cash_account_id": data.get("cash_account_id"),
        "cheque_account_id": data.get("cheque_account_id"),
        "cheque_number": data.get("cheque_number"),
        "cheque_due_date": data.get("cheque_due_date"),
    }
    operation = create_draft(
        db,
        company,
        user,
        draft_data,
        allow_credit_override=data.get("allow_credit_override", False),
        credit_override_reason=data.get("credit_override_reason", ""),
    )

    pf.status = "converted"
    pf.converted_operation_id = operation["operation_id"]
    pf.version += 1
    db.flush()
    audit(
        db,
        company,
        user.id,
        "commercial.proforma_converted",
        pf.id,
        {"operation_id": operation["operation_id"], "proforma_number": pf.number},
    )
    return {
        "proforma_id": pf.id,
        "operation_id": operation["operation_id"],
        "draft": operation["draft"],
    }


def pdf_commercial_document(document: dict, *, company_name: str, doc_type: str = "پیش‌فاکتور فروش") -> bytes:
    register_fonts()
    output = io.BytesIO()
    doc = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        title=f"{doc_type} {document.get('number', '')}",
        lang="fa-IR",
    )
    width = A4[0] - 40 * mm

    story = [
        RTLText(f"{company_name} — {doc_type}", 16, FONT_MEDIUM),
        Spacer(1, 4 * mm),
        RTLText(f"شماره: {document.get('number', '-')}", 10, FONT_MEDIUM),
        RTLText(f"تاریخ: {display_date(document.get('date'))}", 9),
        RTLText(f"طرف حساب: {document.get('party_id', '-')}", 9),
        RTLText(f"واحد مبالغ: {document.get('currency', 'IRR')}", 9, color=MUTED),
        Spacer(1, 5 * mm),
    ]

    headers = [
        RTLText("جمع ردیف", 9, FONT_MEDIUM),
        RTLText("تخفیف", 9, FONT_MEDIUM),
        RTLText("قیمت واحد", 9, FONT_MEDIUM),
        RTLText("تعداد", 9, FONT_MEDIUM),
        RTLText("شرح کالا / خدمات", 9, FONT_MEDIUM),
        RTLText("ردیف", 9, FONT_MEDIUM),
    ]
    rows = [headers]
    for idx, line in enumerate(document.get("lines", [])):
        rows.append(
            [
                RTLText(localized(line.get("total", 0), amount=True), 8),
                RTLText(localized(line.get("discount", 0), amount=True), 8),
                RTLText(localized(line.get("unit_price", 0), amount=True), 8),
                RTLText(str(line.get("quantity", 0)), 8),
                RTLText(line.get("description", "-"), 8),
                RTLText(str(idx + 1), 8),
            ]
        )

    col_widths = [width * 0.20, width * 0.15, width * 0.20, width * 0.10, width * 0.28, width * 0.07]
    story.append(_table(rows, col_widths))
    story.extend(
        [
            Spacer(1, 4 * mm),
            RTLText(
                f"مبلغ کل: {localized(document.get('total_amount', 0), amount=True)} {document.get('currency', 'IRR')}",
                11,
                FONT_MEDIUM,
            ),
        ]
    )
    if document.get("terms"):
        story.extend(
            [
                Spacer(1, 4 * mm),
                RTLText(f"شرایط و توضیحات: {document['terms']}", 9, color=MUTED),
            ]
        )

    doc.build(story)
    return output.getvalue()
