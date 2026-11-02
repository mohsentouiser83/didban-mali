"""Explicit invoice-to-draft preparation; never posts or alters imported facts."""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_models import Account
from .accounting_service import validate_lines
from .accounting_setup_models import CompanyAccountingSetup
from .errors import require
from .operation_models import OperationDraft
from .operation_service import build, create
from .period_lock_service import require_open_period
from .services import get_entity


def validate_template(db: Session, company: str, spec: dict) -> None:
    setup = db.get(CompanyAccountingSetup, company)
    require(
        setup is not None and setup.mode == "primary",
        "primary_accounting_required",
        "ساخت خودکار پیش‌نویس فقط در حالت حسابداری اصلی فعال است.",
        409,
    )
    for account_id in spec["draft_template"]["accounts"].values():
        account = get_entity(db, Account, company, account_id)
        require(account.active, "inactive_account", "حساب انتخاب‌شده غیرفعال است.", 409)


def candidate(db: Session, company: str, manifest: m.ResultManifest, spec: dict, subject_id: str) -> dict:
    validate_template(db, company, spec)
    invoice = get_entity(db, m.Invoice, company, subject_id)
    require(
        invoice.source_row_id in manifest.selection.get("row_ids", []),
        "invoice_source_not_selected",
        "فاکتور در منابع این نسخه نیست.",
        409,
    )
    expected_direction = "sales" if spec["draft_template"]["kind"] == "sale_service" else "purchases"
    require(
        invoice.direction == expected_direction,
        "invoice_template_direction",
        "جهت فاکتور با الگوی سند برابر نیست.",
        409,
    )
    require(
        bool(invoice.party_id and invoice.party_id.strip()),
        "invoice_party_unknown",
        "طرف حساب فاکتور مشخص نیست.",
        409,
    )
    require(invoice.original_unit in ("IRR", "TOMAN"), "invoice_unit_unknown", "واحد فاکتور معتبر نیست.", 409)
    require(
        invoice.tax is not None and Decimal(invoice.tax) == 0,
        "invoice_tax_review_required",
        "مالیات فاکتور نامشخص یا غیرصفر است؛ سند را جدا بررسی کنید.",
        409,
    )
    require(
        Decimal(invoice.amount) > 0,
        "invoice_amount_not_positive",
        "برای فاکتور اصلاحی یا منفی سند را جدا بررسی کنید.",
        409,
    )
    period = get_entity(db, m.Period, company, manifest.period_id)
    require(
        period.start <= invoice.date <= period.end,
        "invoice_outside_period",
        "تاریخ فاکتور خارج از دوره این نسخه است.",
        409,
    )
    require_open_period(db, company, period.id)
    source_reference = "automation:invoice-row:" + invoice.source_row_id
    require(
        not db.scalar(
            select(OperationDraft.id).where(
                OperationDraft.company_id == company, OperationDraft.source_reference == source_reference
            )
        ),
        "operation_duplicate",
        "برای این فاکتور قبلاً پیش‌نویس ساخته شده است.",
        409,
    )
    data = {
        "kind": spec["draft_template"]["kind"],
        "period_id": period.id,
        "date": invoice.date,
        "description": ("فروش خدمات " if expected_direction == "sales" else "خرید خدمات ")
        + invoice.reference,
        "source_reference": source_reference,
        "unit": "IRR",
        "party_id": invoice.party_id,
        "accounts": spec["draft_template"]["accounts"],
        "amounts": {"amount": invoice.amount},
        "automation_origin": {
            "invoice_id": invoice.id,
            "source_row_id": invoice.source_row_id,
            "source_session_id": invoice.session_id,
            "manifest_id": manifest.id,
            "original_amount": invoice.original_amount,
            "original_unit": invoice.original_unit,
        },
    }
    validate_lines(db, company, {"unit": "IRR", "lines": build(data)})
    return data


def prepare(
    db: Session,
    company: str,
    user: m.User,
    manifest: m.ResultManifest,
    spec: dict,
    subject_id: str,
    rule_id: str,
    rule_version: int,
) -> dict:
    data = candidate(db, company, manifest, spec, subject_id)
    data["automation_origin"] |= {"rule_id": rule_id, "rule_version": rule_version}
    return create(db, company, user, data)
