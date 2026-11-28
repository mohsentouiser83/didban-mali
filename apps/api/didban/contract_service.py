"""Service layer for B2B client contracts, milestone billing, and statutory retentions."""

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .commercial_doc_models import CommercialDocument
from .commercial_models import CommercialCounterparty
from .contract_models import ClientContract, ClientContractMilestone
from .dimensions_models import Dimension
from .errors import require
from .money_type import canonical_money
from .services import check_version, get_entity
from .workflow import audit

ZERO = Decimal("0")
HUNDRED = Decimal("100")


def _dec(val: Any) -> Decimal:
    if val is None or val == "":
        return ZERO
    return Decimal(str(val))


def _round_irr(val: Decimal) -> Decimal:
    return val.quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def _validate_rate(val: Any, label: str) -> str:
    rate = _dec(val)
    require(ZERO <= rate <= HUNDRED, "invalid_retention_rate", f"نرخ {label} باید بین ۰ تا ۱۰۰ باشد.", 422)
    return canonical_money(rate)


def _validate_dimension(db: Session, company: str, dimension_id: str | None) -> Dimension | None:
    if not dimension_id:
        return None
    dim = db.scalar(
        select(Dimension).where(
            Dimension.company_id == company,
            Dimension.id == dimension_id,
            Dimension.active.is_(True),
        )
    )
    require(dim is not None, "dimension_not_found", "پروژه انتخاب‌شده معتبر نیست.", 404)
    return dim


def _serialize_milestone(ms: ClientContractMilestone) -> dict[str, Any]:
    return {
        "id": ms.id,
        "contract_id": ms.contract_id,
        "sequence": ms.sequence,
        "title": ms.title,
        "due_date": str(ms.due_date) if ms.due_date else None,
        "amount_irr": ms.amount_irr,
        "status": ms.status,
        "commercial_document_id": ms.commercial_document_id,
        "invoiced_amount_irr": ms.invoiced_amount_irr,
        "collected_cash_irr": ms.collected_cash_irr,
        "insurance_retained_irr": ms.insurance_retained_irr,
        "performance_retained_irr": ms.performance_retained_irr,
        "withholding_tax_irr": ms.withholding_tax_irr,
        "retention_released": ms.retention_released,
        "notes": ms.notes,
        "version": ms.version,
    }


def _contract_summary(contract: ClientContract, milestones: list[ClientContractMilestone]) -> dict[str, Any]:
    invoiced = sum((_dec(ms.invoiced_amount_irr) for ms in milestones), ZERO)
    collected = sum((_dec(ms.collected_cash_irr) for ms in milestones), ZERO)
    ins_ret = sum((_dec(ms.insurance_retained_irr) for ms in milestones), ZERO)
    perf_ret = sum((_dec(ms.performance_retained_irr) for ms in milestones), ZERO)
    wht = sum((_dec(ms.withholding_tax_irr) for ms in milestones), ZERO)
    unreleased_ret = sum(
        (_dec(ms.insurance_retained_irr) + _dec(ms.performance_retained_irr) for ms in milestones if not ms.retention_released),
        ZERO,
    )
    total_amount = _dec(contract.total_amount_irr)
    return {
        "invoiced_total_irr": canonical_money(invoiced),
        "collected_cash_irr": canonical_money(collected),
        "insurance_retained_irr": canonical_money(ins_ret),
        "performance_retained_irr": canonical_money(perf_ret),
        "withholding_tax_irr": canonical_money(wht),
        "unreleased_retention_irr": canonical_money(unreleased_ret),
        "remaining_to_invoice_irr": canonical_money(max(ZERO, total_amount - invoiced)),
        "remaining_to_collect_irr": canonical_money(max(ZERO, invoiced - (collected + ins_ret + perf_ret + wht))),
    }


def _serialize_contract(
    contract: ClientContract,
    milestones: list[ClientContractMilestone] | None = None,
    counterparty: CommercialCounterparty | None = None,
    dimension: Dimension | None = None,
) -> dict[str, Any]:
    ms_list = milestones or []
    res: dict[str, Any] = {
        "id": contract.id,
        "company_id": contract.company_id,
        "contract_number": contract.contract_number,
        "title": contract.title,
        "counterparty_id": contract.counterparty_id,
        "counterparty_name": counterparty.name if counterparty else None,
        "dimension_id": contract.dimension_id,
        "dimension_name": dimension.name if dimension else None,
        "contract_kind": contract.contract_kind,
        "status": contract.status,
        "start_date": str(contract.start_date),
        "end_date": str(contract.end_date) if contract.end_date else None,
        "total_amount_irr": contract.total_amount_irr,
        "advance_payment_irr": contract.advance_payment_irr,
        "insurance_retention_rate": contract.insurance_retention_rate,
        "performance_retention_rate": contract.performance_retention_rate,
        "withholding_tax_rate": contract.withholding_tax_rate,
        "notes": contract.notes,
        "version": contract.version,
        "summary": _contract_summary(contract, ms_list),
    }
    if milestones is not None:
        res["milestones"] = [_serialize_milestone(ms) for ms in ms_list]
    return res


def list_contracts(
    db: Session,
    company: str,
    *,
    status: str | None = None,
    dimension_id: str | None = None,
) -> dict[str, Any]:
    stmt = select(ClientContract).where(ClientContract.company_id == company)
    if status:
        stmt = stmt.where(ClientContract.status == status)
    if dimension_id:
        stmt = stmt.where(ClientContract.dimension_id == dimension_id)
    contracts = db.scalars(stmt.order_by(ClientContract.start_date.desc(), ClientContract.contract_number)).all()
    if not contracts:
        return {"items": []}
    contract_ids = [c.id for c in contracts]
    milestones = db.scalars(
        select(ClientContractMilestone)
        .where(ClientContractMilestone.company_id == company, ClientContractMilestone.contract_id.in_(contract_ids))
        .order_by(ClientContractMilestone.sequence)
    ).all()
    ms_by_contract: dict[str, list[ClientContractMilestone]] = {cid: [] for cid in contract_ids}
    for ms in milestones:
        ms_by_contract.setdefault(ms.contract_id, []).append(ms)

    cp_ids = {c.counterparty_id for c in contracts}
    cps = {
        cp.id: cp
        for cp in db.scalars(
            select(CommercialCounterparty).where(
                CommercialCounterparty.company_id == company, CommercialCounterparty.id.in_(cp_ids)
            )
        )
    }
    dim_ids = {c.dimension_id for c in contracts if c.dimension_id}
    dims = {
        dim.id: dim
        for dim in db.scalars(
            select(Dimension).where(Dimension.company_id == company, Dimension.id.in_(dim_ids))
        )
    }
    return {
        "items": [
            _serialize_contract(
                c,
                ms_by_contract.get(c.id, []),
                cps.get(c.counterparty_id),
                dims.get(c.dimension_id) if c.dimension_id else None,
            )
            for c in contracts
        ]
    }


def create_contract(db: Session, company: str, user: Any, data: dict[str, Any]) -> dict[str, Any]:
    cp = db.scalar(
        select(CommercialCounterparty).where(
            CommercialCounterparty.company_id == company,
            CommercialCounterparty.id == data["counterparty_id"],
            CommercialCounterparty.active.is_(True),
        )
    )
    require(cp is not None, "counterparty_not_found", "طرف‌حساب کارفرما معتبر نیست.", 404)
    dim = _validate_dimension(db, company, data.get("dimension_id"))
    existing = db.scalar(
        select(ClientContract).where(
            ClientContract.company_id == company,
            ClientContract.contract_number == data["contract_number"],
        )
    )
    require(existing is None, "duplicate_contract_number", "شماره قرارداد تکراری است.", 409)
    total_amount = _dec(data["total_amount_irr"])
    require(total_amount >= ZERO, "invalid_amount", "مبلغ قرارداد نمی‌تواند منفی باشد.", 422)

    contract = ClientContract(
        company_id=company,
        contract_number=data["contract_number"],
        title=data["title"],
        counterparty_id=cp.id,
        dimension_id=dim.id if dim else None,
        contract_kind=data.get("contract_kind", "fixed_project"),
        status=data.get("status", "active"),
        start_date=data["start_date"],
        end_date=data.get("end_date"),
        total_amount_irr=canonical_money(total_amount),
        advance_payment_irr=canonical_money(_dec(data.get("advance_payment_irr", "0"))),
        insurance_retention_rate=_validate_rate(data.get("insurance_retention_rate", "5"), "سپرده بیمه"),
        performance_retention_rate=_validate_rate(data.get("performance_retention_rate", "10"), "حسن انجام کار"),
        withholding_tax_rate=_validate_rate(data.get("withholding_tax_rate", "0"), "مالیات تکلیفی"),
        notes=data.get("notes"),
    )
    db.add(contract)
    db.flush()

    ms_rows: list[ClientContractMilestone] = []
    for ms_data in data.get("milestones", []):
        ms_amount = _dec(ms_data["amount_irr"])
        require(ms_amount >= ZERO, "invalid_amount", "مبلغ مرحله نمی‌تواند منفی باشد.", 422)
        ms = ClientContractMilestone(
            company_id=company,
            contract_id=contract.id,
            sequence=ms_data["sequence"],
            title=ms_data["title"],
            due_date=ms_data.get("due_date"),
            amount_irr=canonical_money(ms_amount),
            notes=ms_data.get("notes"),
        )
        db.add(ms)
        ms_rows.append(ms)
    db.flush()
    audit(db, company, user.id, "client_contract.created", contract.id, {"contract_number": contract.contract_number})
    return _serialize_contract(contract, ms_rows, cp, dim)


def get_contract(db: Session, company: str, contract_id: str) -> dict[str, Any]:
    contract = get_entity(db, ClientContract, company, contract_id)
    milestones = db.scalars(
        select(ClientContractMilestone)
        .where(ClientContractMilestone.company_id == company, ClientContractMilestone.contract_id == contract.id)
        .order_by(ClientContractMilestone.sequence)
    ).all()
    cp = db.scalar(
        select(CommercialCounterparty).where(
            CommercialCounterparty.company_id == company, CommercialCounterparty.id == contract.counterparty_id
        )
    )
    dim = (
        db.scalar(select(Dimension).where(Dimension.company_id == company, Dimension.id == contract.dimension_id))
        if contract.dimension_id
        else None
    )
    return _serialize_contract(contract, list(milestones), cp, dim)


def update_contract(
    db: Session, company: str, user: Any, contract_id: str, data: dict[str, Any], expected_version: int | None
) -> dict[str, Any]:
    contract = get_entity(db, ClientContract, company, contract_id)
    check_version(contract, expected_version)
    if "dimension_id" in data:
        dim = _validate_dimension(db, company, data["dimension_id"])
        contract.dimension_id = dim.id if dim else None
    if data.get("title") is not None:
        contract.title = data["title"]
    if data.get("status") is not None:
        contract.status = data["status"]
    if "end_date" in data:
        contract.end_date = data["end_date"]
    if data.get("total_amount_irr") is not None:
        contract.total_amount_irr = canonical_money(_dec(data["total_amount_irr"]))
    if data.get("insurance_retention_rate") is not None:
        contract.insurance_retention_rate = _validate_rate(data["insurance_retention_rate"], "سپرده بیمه")
    if data.get("performance_retention_rate") is not None:
        contract.performance_retention_rate = _validate_rate(data["performance_retention_rate"], "حسن انجام کار")
    if data.get("withholding_tax_rate") is not None:
        contract.withholding_tax_rate = _validate_rate(data["withholding_tax_rate"], "مالیات تکلیفی")
    if "notes" in data:
        contract.notes = data["notes"]
    contract.version += 1
    db.flush()
    audit(db, company, user.id, "client_contract.updated", contract.id)
    return get_contract(db, company, contract.id)


def add_milestone(db: Session, company: str, user: Any, contract_id: str, data: dict[str, Any]) -> dict[str, Any]:
    contract = get_entity(db, ClientContract, company, contract_id)
    ms_amount = _dec(data["amount_irr"])
    require(ms_amount >= ZERO, "invalid_amount", "مبلغ مرحله نمی‌تواند منفی باشد.", 422)
    ms = ClientContractMilestone(
        company_id=company,
        contract_id=contract.id,
        sequence=data["sequence"],
        title=data["title"],
        due_date=data.get("due_date"),
        amount_irr=canonical_money(ms_amount),
        notes=data.get("notes"),
    )
    db.add(ms)
    db.flush()
    audit(db, company, user.id, "client_contract.milestone_added", ms.id, {"contract_id": contract.id})
    return _serialize_milestone(ms)


def bill_milestone(
    db: Session, company: str, user: Any, contract_id: str, milestone_id: str, data: dict[str, Any]
) -> dict[str, Any]:
    contract = get_entity(db, ClientContract, company, contract_id)
    ms = get_entity(db, ClientContractMilestone, company, milestone_id)
    require(ms.contract_id == contract.id, "milestone_mismatch", "مرحله متعلق به این قرارداد نیست.", 422)
    require(ms.status == "planned", "milestone_already_billed", "این مرحله قبلاً صورت‌وضعیت شده است.", 409)

    doc_id = data.get("commercial_document_id")
    if doc_id:
        doc = db.scalar(
            select(CommercialDocument).where(CommercialDocument.company_id == company, CommercialDocument.id == doc_id)
        )
        require(doc is not None, "commercial_document_not_found", "فاکتور تجاری انتخاب‌شده پیدا نشد.", 404)
        ms.commercial_document_id = doc.id

    invoiced = _dec(data.get("invoiced_amount_irr")) if data.get("invoiced_amount_irr") is not None else _dec(ms.amount_irr)
    require(invoiced > ZERO, "invalid_amount", "مبلغ صورت‌وضعیت باید بیشتر از صفر باشد.", 422)
    ms.invoiced_amount_irr = canonical_money(invoiced)
    ms.status = "invoiced"
    ms.version += 1
    db.flush()
    audit(db, company, user.id, "client_contract.milestone_billed", ms.id, {"invoiced_amount_irr": ms.invoiced_amount_irr})
    return _serialize_milestone(ms)


def collect_milestone(
    db: Session, company: str, user: Any, contract_id: str, milestone_id: str, data: dict[str, Any]
) -> dict[str, Any]:
    contract = get_entity(db, ClientContract, company, contract_id)
    ms = get_entity(db, ClientContractMilestone, company, milestone_id)
    require(ms.contract_id == contract.id, "milestone_mismatch", "مرحله متعلق به این قرارداد نیست.", 422)
    require(ms.status in ("invoiced", "settled"), "milestone_not_billed", "ابتدا صورت‌وضعیت این مرحله را ثبت کنید.", 409)

    invoiced = _dec(ms.invoiced_amount_irr)
    if data.get("auto_compute_retentions"):
        ins_ret = _round_irr(invoiced * _dec(contract.insurance_retention_rate) / HUNDRED)
        perf_ret = _round_irr(invoiced * _dec(contract.performance_retention_rate) / HUNDRED)
        wht = _round_irr(invoiced * _dec(contract.withholding_tax_rate) / HUNDRED)
        cash = (
            _dec(data["cash_received_irr"])
            if data.get("cash_received_irr") is not None
            else max(ZERO, invoiced - ins_ret - perf_ret - wht)
        )
    else:
        ins_ret = _dec(data.get("insurance_retained_irr", "0"))
        perf_ret = _dec(data.get("performance_retained_irr", "0"))
        wht = _dec(data.get("withholding_tax_irr", "0"))
        cash = _dec(data.get("cash_received_irr", "0"))

    require(
        cash >= ZERO and ins_ret >= ZERO and perf_ret >= ZERO and wht >= ZERO,
        "invalid_amount",
        "مبالغ دریافت و کسورات نمی‌توانند منفی باشند.",
        422,
    )
    new_cash = _dec(ms.collected_cash_irr) + cash
    new_ins = _dec(ms.insurance_retained_irr) + ins_ret
    new_perf = _dec(ms.performance_retained_irr) + perf_ret
    new_wht = _dec(ms.withholding_tax_irr) + wht
    total_accounted = new_cash + new_ins + new_perf + new_wht
    require(
        total_accounted <= invoiced,
        "collection_exceeds_invoiced",
        "جمع دریافت نقدی و کسورات از مبلغ صورت‌وضعیت بیشتر است.",
        422,
    )

    ms.collected_cash_irr = canonical_money(new_cash)
    ms.insurance_retained_irr = canonical_money(new_ins)
    ms.performance_retained_irr = canonical_money(new_perf)
    ms.withholding_tax_irr = canonical_money(new_wht)
    if total_accounted == invoiced:
        ms.status = "settled"
    ms.version += 1
    db.flush()
    audit(
        db,
        company,
        user.id,
        "client_contract.milestone_collected",
        ms.id,
        {
            "cash_received_irr": canonical_money(cash),
            "insurance_retained_irr": canonical_money(ins_ret),
            "performance_retained_irr": canonical_money(perf_ret),
            "withholding_tax_irr": canonical_money(wht),
        },
    )
    return _serialize_milestone(ms)


def release_milestone_retention(
    db: Session, company: str, user: Any, contract_id: str, milestone_id: str
) -> dict[str, Any]:
    contract = get_entity(db, ClientContract, company, contract_id)
    ms = get_entity(db, ClientContractMilestone, company, milestone_id)
    require(ms.contract_id == contract.id, "milestone_mismatch", "مرحله متعلق به این قرارداد نیست.", 422)
    require(not ms.retention_released, "retention_already_released", "سپرده‌های این مرحله قبلاً آزاد شده است.", 409)
    ms.retention_released = True
    ms.version += 1
    db.flush()
    audit(db, company, user.id, "client_contract.retention_released", ms.id)
    return _serialize_milestone(ms)
