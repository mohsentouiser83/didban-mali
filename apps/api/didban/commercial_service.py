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
from .commercial_models import CommercialCounterparty, CommercialCounterpartyRole, ProformaInvoice
from .errors import DomainError, require
from .exports import FONT_MEDIUM, MUTED, RTLText, _table, display_date, localized, register_fonts
from .inventory_models import InventoryItem
from .money_type import aggregate_money, canonical_money
from .native_invoice_models import NativeInvoice, NativeInvoiceSourceRevision
from .numbering_service import allocate_number
from .operation_models import OperationDraft
from .posting_models import NativeJournal
from .security import membership
from .services import check_version, get_entity
from .workflow import audit, serialize_fact


def _normalize_roles(data: dict, fallback: str = "other") -> tuple[list[str], str]:
    valid_roles = {"supplier", "customer", "employee", "other"}
    raw_roles = data.get("roles")
    if raw_roles is not None:
        roles = []
        for r in raw_roles:
            require(r in valid_roles, "invalid_counterparty_type", "نقش طرف‌حساب معتبر نیست.")
            if r not in roles:
                roles.append(r)
        require(bool(roles), "invalid_counterparty_type", "حداقل یک نقش برای طرف‌حساب انتخاب کنید.")
    else:
        t = data.get("type") or fallback
        require(t in valid_roles, "invalid_counterparty_type", "نوع طرف‌حساب معتبر نیست.")
        roles = [t]
    primary_type = data.get("type") if data.get("type") in valid_roles else (roles[0] if len(roles) == 1 else "other")
    return roles, primary_type


def _sync_counterparty_roles(db: Session, company: str, cp: CommercialCounterparty, roles: list[str]) -> None:
    existing = list(
        db.scalars(
            select(CommercialCounterpartyRole).where(
                CommercialCounterpartyRole.company_id == company,
                CommercialCounterpartyRole.counterparty_id == cp.id,
            )
        )
    )
    existing_map = {row.role: row for row in existing}
    for role in list(existing_map):
        if role not in roles:
            db.delete(existing_map[role])
    for role in roles:
        if role not in existing_map:
            db.add(CommercialCounterpartyRole(company_id=company, counterparty_id=cp.id, role=role))
    db.flush()


def _validate_identity_fields(data: dict) -> None:
    if data.get("national_id"):
        nid = str(data["national_id"]).strip()
        require(nid.isascii() and nid.isdigit() and 8 <= len(nid) <= 12, "invalid_national_id", "شناسه/کد ملی باید عددی و بین ۸ تا ۱۲ رقم باشد.")
    if data.get("economic_code"):
        ec = str(data["economic_code"]).strip()
        require(ec.isascii() and ec.isdigit() and 8 <= len(ec) <= 16, "invalid_economic_code", "کد اقتصادی باید عددی باشد.")
    if data.get("postal_code"):
        pc = str(data["postal_code"]).strip()
        require(pc.isascii() and pc.isdigit() and len(pc) == 10, "invalid_postal_code", "کد پستی باید ۱۰ رقم باشد.")


def _serialize_counterparty(cp: CommercialCounterparty) -> dict:
    data = serialize_fact(cp)
    data["roles"] = list(cp.roles) if cp.roles else [cp.type]
    return data


def add_counterparty(db: Session, company: str, user: m.User, data: dict) -> dict:
    ability = capabilities(db, company, user)
    require(ability["can_manage_accounts"], "permission_denied", "اجازه مدیریت طرف حساب‌ها ندارید.", 403)
    roles, primary_type = _normalize_roles(data)
    entity_kind = data.get("entity_kind") or "other"
    require(entity_kind in {"natural_person", "legal_entity", "other"}, "invalid_entity_kind", "نوع شخصیت معتبر نیست.")
    _validate_identity_fields(data)
    limit = canonical_money(data["credit_limit_irr"]) if data.get("credit_limit_irr") else None
    row = CommercialCounterparty(
        company_id=company,
        code=allocate_number(db, company, "counterparty", CommercialCounterparty, "code"),
        name=data["name"],
        type=primary_type,
        entity_kind=entity_kind,
        roles=roles,
        national_id=data.get("national_id"),
        economic_code=data.get("economic_code"),
        registration_number=data.get("registration_number"),
        postal_code=data.get("postal_code"),
        email=data.get("email"),
        phone=data.get("phone"),
        address=data.get("address"),
        credit_limit_irr=limit,
        active=data.get("active", True),
    )
    db.add(row)
    db.flush()
    _sync_counterparty_roles(db, company, row, roles)
    audit(db, company, user.id, "commercial.counterparty_created", row.id)
    return _serialize_counterparty(row)


def update_counterparty(
    db: Session, company: str, user: m.User, counterparty_id: str, data: dict, version: int | None = None
) -> dict:
    ability = capabilities(db, company, user)
    require(ability["can_manage_accounts"], "permission_denied", "اجازه مدیریت طرف حساب‌ها ندارید.", 403)
    cp = get_entity(db, CommercialCounterparty, company, counterparty_id)
    if version is not None:
        check_version(cp, version)
    _validate_identity_fields(data)
    if "roles" in data or "type" in data:
        roles, primary_type = _normalize_roles(data, fallback=cp.type)
        cp.type = primary_type
        cp.roles = roles
        _sync_counterparty_roles(db, company, cp, roles)
    if "entity_kind" in data and data["entity_kind"] is not None:
        require(
            data["entity_kind"] in {"natural_person", "legal_entity", "other"},
            "invalid_entity_kind",
            "نوع شخصیت معتبر نیست.",
        )
        cp.entity_kind = data["entity_kind"]
    if data.get("name") is not None:
        cp.name = data["name"]
    for field in ("national_id", "economic_code", "registration_number", "postal_code", "email", "phone", "address"):
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
    return _serialize_counterparty(cp)


def list_counterparties(
    db: Session,
    company: str,
    user: m.User,
    limit: int = 50,
    offset: int = 0,
    search: str | None = None,
    active_only: bool = False,
    counterparty_type: str | None = None,
) -> dict:
    membership(db, company, user)
    stmt = select(CommercialCounterparty).where(CommercialCounterparty.company_id == company)
    if active_only:
        stmt = stmt.where(CommercialCounterparty.active.is_(True))
    if counterparty_type and counterparty_type != "all":
        stmt = stmt.where(
            or_(
                CommercialCounterparty.type == counterparty_type,
                CommercialCounterparty.id.in_(
                    select(CommercialCounterpartyRole.counterparty_id).where(
                        CommercialCounterpartyRole.company_id == company,
                        CommercialCounterpartyRole.role == counterparty_type,
                    )
                ),
            )
        )
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(CommercialCounterparty.name.ilike(term), CommercialCounterparty.code.ilike(term))
        )
    total = len(list(db.scalars(stmt)))
    rows = list(db.scalars(stmt.order_by(CommercialCounterparty.code).offset(offset).limit(limit)))
    return {
        "total": total,
        "items": [_serialize_counterparty(row) for row in rows],
    }


def get_counterparty(db: Session, company: str, counterparty_id: str) -> dict:
    return _serialize_counterparty(get_entity(db, CommercialCounterparty, company, counterparty_id))


def resolve_counterparty(
    db: Session, company: str, party_id: str, *, require_active: bool = True
) -> CommercialCounterparty | None:
    if not party_id:
        return None
    by_id = db.scalar(
        select(CommercialCounterparty).where(
            CommercialCounterparty.company_id == company,
            CommercialCounterparty.id == party_id,
        )
    )
    by_code = db.scalar(
        select(CommercialCounterparty).where(
            CommercialCounterparty.company_id == company,
            CommercialCounterparty.code == party_id,
        )
    )
    if by_id and by_code and by_id.id != by_code.id:
        raise DomainError(
            "ambiguous_counterparty_reference",
            "شناسه طرف‌حساب مبهم است (تطابق هم‌زمان با کد و شناسه متفاوت).",
            409,
        )
    cp = by_id or by_code
    if cp and require_active:
        require(cp.active, "inactive_counterparty", "طرف‌حساب غیرفعال است.", 409)
    return cp


def resolve_counterparty_id(db: Session, company: str, party_ref: str | None) -> str | None:
    if not party_ref:
        return None
    cp = resolve_counterparty(db, company, party_ref, require_active=False)
    return cp.id if cp else party_ref


def counterparty_snapshot(cp: CommercialCounterparty | None, raw_ref: str = "") -> dict | None:
    if cp is None:
        return {"raw_party_id": raw_ref} if raw_ref else None
    return {
        "id": cp.id,
        "code": cp.code,
        "name": cp.name,
        "type": cp.type,
        "entity_kind": cp.entity_kind,
        "roles": list(cp.roles) if cp.roles else [cp.type],
        "national_id": cp.national_id,
        "economic_code": cp.economic_code,
        "phone": cp.phone,
        "address": cp.address,
        "version": cp.version,
    }


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
                OperationDraft.kind.in_(("sale_goods", "sale_service", "commercial_sale")),
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
            addition = Decimal(
                payload["amounts"].get("on_account_amount_irr")
                if sale.kind == "commercial_sale"
                else sale_credit_amount(payload, payload["amounts"]["amount"])
            )
            if not addition:
                continue
            total = batch_amounts.get(party.id, Decimal(0)) + addition
            override_reason = payload.get("credit_override_reason", "")
            check_credit_limit(
                db, company, user, party.id, aggregate_money(total),
                allow_override=bool(override_reason), override_reason=override_reason, audit_override=False,
            )
            batch_amounts[party.id] = total


def _process_lines(
    lines_in: list[dict], currency: str, invoice_discount: str | int | Decimal = 0
) -> tuple[list[dict], str, str, str]:
    factor = 10 if currency == "TOMAN" else 1
    subtotal = Decimal(0)
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
            subtotal += line_total
            processed.append(
                {
                    "line_id": str(idx + 1),
                    "line_kind": line.get("line_kind") or ("goods" if line.get("item_id") else "goods"),
                    "unit": line.get("unit"),
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
        inv_disc = Decimal(canonical_money(invoice_discount or 0))
        require(inv_disc >= 0, "invalid_proforma_discount", "تخفیف کل نمی‌تواند منفی باشد.", 422)
        require(inv_disc <= subtotal, "invoice_discount_exceeds_total", "تخفیف کل از جمع پیش‌فاکتور بیشتر است.", 422)
        total = subtotal - inv_disc
        total_irr = total * factor
    return processed, canonical_money(total), canonical_money(total_irr), canonical_money(inv_disc)


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
    _validate_proforma(db, company, data)
    currency = data.get("currency", "IRR")
    lines, total, total_irr, inv_disc = _process_lines(data["lines"], currency, data.get("invoice_discount", 0))
    row = ProformaInvoice(
        company_id=company,
        number=allocate_number(db, company, "proforma_invoice", ProformaInvoice, "number"),
        direction="sale",
        date=data["date"],
        expiry_date=data.get("expiry_date"),
        party_id=data["party_id"],
        currency=currency,
        lines=lines,
        total_amount=total,
        total_amount_irr=total_irr,
        invoice_discount=inv_disc,
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
    inv_disc_in = data.get("invoice_discount", pf.invoice_discount)
    if "lines" in data or "invoice_discount" in data:
        lines, total, total_irr, inv_disc = _process_lines(data.get("lines", pf.lines), pf.currency, inv_disc_in)
        pf.lines = lines
        pf.total_amount = total
        pf.total_amount_irr = total_irr
        pf.invoice_discount = inv_disc
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
    _validate_proforma(
        db, company, {"direction": pf.direction, "party_id": pf.party_id, "date": pf.date, "expiry_date": pf.expiry_date}
    )

    from .commercial_doc_service import create_commercial_document_draft

    doc_lines = []
    for line in pf.lines:
        l_kind = line.get("line_kind") or ("goods" if line.get("item_id") else "service")
        if l_kind == "goods":
            require(line.get("item_id"), "item_required", "شناسه کالا در پیش‌فاکتور موجود نیست.", 422)
        doc_lines.append(
            {
                "line_kind": l_kind,
                "item_id": line.get("item_id"),
                "description": line["description"],
                "unit": line.get("unit"),
                "quantity": line["quantity"],
                "unit_price": line["unit_price"],
                "line_discount": line.get("discount", "0"),
            }
        )

    doc_payload = {
        "direction": "sale",
        "period_id": data["period_id"],
        "issue_date": data.get("issue_date") or data.get("date") or today,
        "party_id": pf.party_id,
        "warehouse_id": data.get("warehouse_id"),
        "currency": pf.currency,
        "invoice_discount": data.get("invoice_discount") if data.get("invoice_discount") is not None else pf.invoice_discount,
        "lines": doc_lines,
        "description": f"تبدیل پیش‌فاکتور {pf.number}",
        "source_reference": data.get("source_reference") or f"proforma:{pf.id}",
        "settlement_type": settlement_type,
        "cash_amount": data.get("cash_amount"),
        "cheque_amount": data.get("cheque_amount"),
        "on_account_amount": data.get("on_account_amount"),
        "counterparty_account_id": data.get("counterparty_account_id"),
        "revenue_account_id": data.get("revenue_account_id"),
        "service_revenue_account_id": data.get("service_revenue_account_id"),
        "discount_account_id": data.get("discount_account_id"),
        "cost_account_id": data.get("cost_account_id"),
        "cash_account_id": data.get("cash_account_id"),
        "cheque_account_id": data.get("cheque_account_id"),
        "cheque_number": data.get("cheque_number"),
        "cheque_due_date": data.get("cheque_due_date"),
    }
    res = create_commercial_document_draft(
        db,
        company,
        user,
        doc_payload,
        proforma=pf,
        allow_credit_override=data.get("allow_credit_override", False),
        credit_override_reason=data.get("credit_override_reason", ""),
    )

    pf.status = "conversion_pending"
    pf.converted_operation_id = res["operation_id"]
    pf.version += 1
    db.flush()
    audit(
        db,
        company,
        user.id,
        "commercial.proforma_converted",
        pf.id,
        {"operation_id": res["operation_id"], "proforma_number": pf.number, "document_id": res["document"]["id"]},
    )
    return {
        "proforma_id": pf.id,
        "proforma_status": pf.status,
        "operation_id": res["operation_id"],
        "document": res["document"],
        "draft": res["draft"],
        "financial_effect": False,
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
