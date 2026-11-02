"""Evidence-linked collaboration with no mutation of financial source facts."""

from datetime import date
from decimal import Decimal, localcontext
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .control_models import ControlActivity, ControlCase
from .errors import DomainError, require
from .finance import SALES_DIRECTIONS
from .http import paginate
from .module_service import require_module
from .money_type import canonical_money
from .security import membership
from .services import check_version, get_entity
from .workflow import audit, serialize_fact

PRIORITY_FORMULA = (
    "مانده معتبر بیشتر، سپس روزهای تأخیر بیشتر؛ مبنا تاریخ گزارش است. مانده ناموجود رتبه نمی‌گیرد."
)
ERROR_CODES = frozenset(
    {
        "journal_unbalanced",
        "ledger_unbalanced",
        "unbalanced_journal",
        "moadian_amount_mismatch",
        "moadian_tax_mismatch",
        "moadian_date_mismatch",
        "moadian_party_mismatch",
    }
)


def classification(code: str) -> dict[str, str]:
    if code in ERROR_CODES:
        return {"kind": "control_error", "label": "مغایرت قطعی"}
    if (
        code.endswith("_missing")
        or code.endswith("_incomplete")
        or code in {"incomplete_scope", "forecast_unavailable", "payment_dates_missing"}
    ):
        return {"kind": "data_limitation", "label": "داده ناکافی"}
    return {"kind": "needs_review", "label": "نیازمند بررسی"}


def latest_manifest(db: Session, company: str) -> m.ResultManifest | None:
    return db.scalar(
        select(m.ResultManifest)
        .where(m.ResultManifest.company_id == company)
        .order_by(m.ResultManifest.created_at.desc(), m.ResultManifest.id.desc())
        .limit(1)
    )


def finding_source(db: Session, company: str, identifier: str) -> dict[str, Any]:
    finding = get_entity(db, m.Finding, company, identifier)
    manifest = get_entity(db, m.ResultManifest, company, finding.manifest_id)
    # A metric value with a limitation does not quantify this finding's exposure.
    # Keep the affected amount unknown until an explicit finding calculation exists.
    return {
        "kind": "finding",
        "id": finding.id,
        "title": finding.title,
        "code": finding.code,
        "classification": classification(finding.code),
        "evidence_refs": finding.evidence,
        "amount": None,
        "manifest_id": manifest.id,
        "as_of_date": manifest.details.get("as_of_date"),
        "financial_state": finding.state,
    }


def invoice_source(db: Session, company: str, identifier: str) -> dict[str, Any]:
    require_module(db, company, "receivables", ready=False)
    invoice = get_entity(db, m.Invoice, company, identifier)
    require(
        invoice.direction in SALES_DIRECTIONS, "not_sales_invoice", "پیگیری وصول فقط برای فاکتور فروش است."
    )
    manifest = latest_manifest(db, company)
    rows = manifest.details.get("invoices", []) if manifest else []
    detail = next(
        (row for row in rows if row.get("id") == invoice.id and row.get("direction") == "sales"), None
    )
    require(
        detail is not None,
        "invoice_not_in_current_report",
        "فاکتور در آخرین گزارش شرکت نیست؛ از فهرست همان گزارش انتخاب کنید.",
        409,
    )
    return {
        "kind": "invoice",
        "id": invoice.id,
        "title": "فاکتور " + invoice.reference,
        "reference": invoice.reference,
        "party_id": invoice.party_id,
        "amount": str(invoice.amount),
        "remaining": detail.get("remaining"),
        "due_date": detail.get("due_date"),
        "evidence_refs": detail.get("evidence_refs", []),
        "manifest_id": manifest.id,
        "as_of_date": manifest.details.get("as_of_date"),
        "reason_codes": detail.get("reason_codes", []),
    }


def assignees(db: Session, company: str, user: m.User) -> dict[str, Any]:
    membership(db, company, user)
    rows = db.execute(
        select(m.Membership, m.User)
        .join(m.User, m.User.id == m.Membership.user_id)
        .where(
            m.Membership.company_id == company,
            m.Membership.active.is_(True),
            m.User.active.is_(True),
            m.Membership.role.in_(("owner", "finance_manager", "advisor")),
        )
        .order_by(m.User.name, m.Membership.id)
    )
    return {"items": [{"membership_id": member.id, "name": person.name} for member, person in rows]}


def validate_assignee(db: Session, company: str, identifier: str | None) -> None:
    if identifier is None:
        return
    member = get_entity(db, m.Membership, company, identifier)
    person = db.get(m.User, member.user_id)
    require(
        member.active and member.role in ("owner", "finance_manager", "advisor") and person and person.active,
        "invalid_assignee",
        "مسئول باید عضو فعال دارای اختیار عملیاتی شرکت باشد.",
    )


def public_case(db: Session, company: str, case: ControlCase) -> dict[str, Any]:
    value = serialize_fact(case)
    assignee = db.get(m.Membership, case.assignee_membership_id) if case.assignee_membership_id else None
    person = db.get(m.User, assignee.user_id) if assignee else None
    value["assignee_name"] = person.name if person else None
    value["assignee_active"] = bool(
        assignee and assignee.active and person and person.active and assignee.role != "viewer"
    )
    return value


def add_activity(
    db: Session, company: str, user: m.User, case: ControlCase, kind: str, message: str, data: dict[str, Any]
) -> None:
    db.add(
        ControlActivity(
            company_id=company, case_id=case.id, actor_id=user.id, kind=kind, message=message, data=data
        )
    )
    audit(db, company, user.id, "control." + kind, case.id, {"case_version": case.version})


def create_case(db: Session, company: str, user: m.User, data: dict[str, Any]) -> dict[str, Any]:
    membership(db, company, user, "write")
    require(
        data.get("kind") in ("finding", "invoice"), "invalid_subject_kind", "نوع موضوع پیگیری معتبر نیست."
    )
    validate_assignee(db, company, data.get("assignee_membership_id"))
    source = (
        finding_source(db, company, data["subject_id"])
        if data["kind"] == "finding"
        else invoice_source(db, company, data["subject_id"])
    )
    field = ControlCase.finding_id if data["kind"] == "finding" else ControlCase.invoice_id
    existing = db.scalar(
        select(ControlCase).where(ControlCase.company_id == company, field == data["subject_id"])
    )
    require(existing is None, "case_exists", "برای این مورد پروندهٔ پیگیری وجود دارد؛ آن را باز کنید.", 409)
    case = ControlCase(
        company_id=company,
        finding_id=data["subject_id"] if data["kind"] == "finding" else None,
        invoice_id=data["subject_id"] if data["kind"] == "invoice" else None,
        assignee_membership_id=data.get("assignee_membership_id"),
        due_date=data.get("due_date"),
        next_action=data.get("next_action", ""),
        source_snapshot=source,
        actor_id=user.id,
    )
    db.add(case)
    db.flush()
    add_activity(db, company, user, case, "created", "پروندهٔ پیگیری ایجاد شد.", {})
    return public_case(db, company, case)


def update_case(
    db: Session, company: str, user: m.User, identifier: str, data: dict[str, Any], version: int
) -> dict[str, Any]:
    membership(db, company, user, "write")
    case = get_entity(db, ControlCase, company, identifier)
    check_version(case, version)
    if case.invoice_id:
        require_module(db, company, "receivables", ready=False)
    require(
        data.get("state") in ("open", "in_progress", "resolved", "accepted"),
        "invalid_case_state",
        "وضعیت پیگیری معتبر نیست.",
    )
    validate_assignee(db, company, data.get("assignee_membership_id"))
    require(bool(data.get("reason", "").strip()), "reason_required", "دلیل تغییر را وارد کنید.")
    before = {
        key: str(getattr(case, key)) if key == "due_date" and getattr(case, key) else getattr(case, key)
        for key in ("assignee_membership_id", "due_date", "state", "next_action")
    }
    for key in ("assignee_membership_id", "due_date", "state", "next_action"):
        setattr(case, key, data[key])
    case.resolution_reason = data["reason"] if data["state"] in ("resolved", "accepted") else None
    case.version += 1
    after = {
        key: str(getattr(case, key)) if key == "due_date" and getattr(case, key) else getattr(case, key)
        for key in before
    }
    add_activity(db, company, user, case, "updated", data["reason"], {"before": before, "after": after})
    db.flush()
    return public_case(db, company, case)


def record_activity(
    db: Session, company: str, user: m.User, identifier: str, data: dict[str, Any], version: int
) -> dict[str, Any]:
    membership(db, company, user, "write")
    case = get_entity(db, ControlCase, company, identifier)
    check_version(case, version)
    if case.invoice_id:
        require_module(db, company, "receivables", ready=False)
    require(
        data.get("kind") in ("comment", "contact", "promise", "document_request"),
        "invalid_activity_kind",
        "نوع فعالیت معتبر نیست.",
    )
    require(bool(data.get("message", "").strip()), "message_required", "شرح فعالیت را وارد کنید.")
    require(data.get("unit") in ("IRR", "TOMAN"), "invalid_unit", "واحد مبلغ معتبر نیست.")
    detail: dict[str, Any] = {}
    if data["kind"] == "promise":
        require(
            case.invoice_id is not None, "promise_requires_invoice", "وعدهٔ پرداخت فقط برای پیگیری فاکتور است."
        )
        require(data.get("promise_date") is not None, "promise_date_required", "تاریخ وعده را وارد کنید.")
        detail["promise_date"] = data["promise_date"].isoformat()
        if data.get("promise_amount") is not None:
            try:
                with localcontext() as context:
                    context.prec = 50
                    value = Decimal(canonical_money(data["promise_amount"]))
                    converted = canonical_money(value * (10 if data["unit"] == "TOMAN" else 1))
            except (ValueError, TypeError) as error:
                raise DomainError("invalid_amount", "مبلغ وعده معتبر نیست.") from error
            require(value > 0, "promise_amount_invalid", "مبلغ وعده باید مثبت باشد.")
            detail.update(
                amount=converted, original_amount=data["promise_amount"], original_unit=data["unit"]
            )
    else:
        require(
            data.get("promise_date") is None and data.get("promise_amount") is None,
            "unexpected_promise_fields",
            "اطلاعات وعده فقط در ثبت وعدهٔ پرداخت مجاز است.",
        )
    case.version += 1
    add_activity(db, company, user, case, data["kind"], data["message"], detail)
    db.flush()
    return public_case(db, company, case)


def activities(
    db: Session, company: str, user: m.User, identifier: str, limit: int, cursor: str | None
) -> dict[str, Any]:
    membership(db, company, user)
    get_entity(db, ControlCase, company, identifier)

    def transform(item: ControlActivity) -> dict[str, Any]:
        person = db.get(m.User, item.actor_id)
        return serialize_fact(item) | {"actor_name": person.name if person else "کاربر"}

    return paginate(
        db, ControlActivity, company, limit, cursor, [ControlActivity.case_id == identifier], transform
    )


def findings(db: Session, company: str, user: m.User, limit: int, cursor: str | None) -> dict[str, Any]:
    membership(db, company, user)
    manifest = latest_manifest(db, company)

    def transform(item: m.Finding) -> dict[str, Any]:
        case = db.scalar(
            select(ControlCase).where(ControlCase.company_id == company, ControlCase.finding_id == item.id)
        )
        return serialize_fact(item) | {
            "source": finding_source(db, company, item.id),
            "case": public_case(db, company, case) if case else None,
        }

    return paginate(
        db,
        m.Finding,
        company,
        limit,
        cursor,
        [m.Finding.manifest_id == (manifest.id if manifest else None)],
        transform,
    )


def collection(
    db: Session, company: str, user: m.User, page: int, q: str, priority: str = "amount"
) -> dict[str, Any]:
    membership(db, company, user)
    require_module(db, company, "receivables", ready=False)
    require(page >= 0 and len(q) <= 100, "invalid_query", "جستجو یا صفحه معتبر نیست.")
    require(priority in ("amount", "history"), "invalid_priority", "ترتیب پیگیری معتبر نیست.")
    manifest = latest_manifest(db, company)
    basis = manifest.details.get("as_of_date") if manifest else None
    rows = []
    for item in manifest.details.get("invoices", []) if manifest else []:
        if item.get("direction") != "sales" or not item.get("id"):
            continue
        if (
            q
            and q.casefold()
            not in (str(item.get("reference", "")) + " " + str(item.get("party_id", ""))).casefold()
        ):
            continue
        remaining = item.get("remaining")
        if remaining is not None and Decimal(remaining) <= 0:
            continue
        due = item.get("due_date")
        overdue = (
            max((date.fromisoformat(basis) - date.fromisoformat(due)).days, 0) if basis and due else None
        )
        rows.append(dict(item) | {"overdue_days": overdue, "ranked": remaining is not None})
    if priority == "history":
        from .collection_assistant_service import HISTORY_FORMULA, history_sort_key, history_statistics

        stats = history_statistics(db, company, manifest, rows)
        rows = [item | stats[str(item.get("party_id") or "")] for item in rows]
        rows.sort(key=history_sort_key, reverse=True)
    else:
        rows.sort(
            key=lambda item: (
                item["remaining"] is not None,
                Decimal(item["remaining"] or "0"),
                item["overdue_days"] if item["overdue_days"] is not None else -1,
                str(item["id"]),
            ),
            reverse=True,
        )
    for item in rows[page * 25 : (page + 1) * 25]:
        case = db.scalar(
            select(ControlCase).where(ControlCase.company_id == company, ControlCase.invoice_id == item["id"])
        )
        item["case"] = public_case(db, company, case) if case else None
    return {
        "items": rows[page * 25 : (page + 1) * 25],
        "total": len(rows),
        "page": page,
        "page_size": 25,
        "manifest_id": manifest.id if manifest else None,
        "as_of_date": basis,
        "priority_formula": HISTORY_FORMULA if priority == "history" else PRIORITY_FORMULA,
        "priority": priority,
    }
