"""Company mode configuration and chart import preserve independent posting authority."""

import io
import json
from hashlib import sha256
from pathlib import Path
from typing import Any

import openpyxl
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_models import Account
from .accounting_service import capabilities, save_account
from .accounting_setup_models import AccountImportPreview, CompanyAccountingSetup
from .errors import require
from .ingestion import read_file, scan
from .security import membership
from .services import check_version, get_entity
from .workflow import audit

TEMPLATE = [
    {"code": "1101", "name": "بانک", "active": True},
    {"code": "1201", "name": "مطالبات تجاری", "active": True},
    {"code": "2101", "name": "بدهی تجاری", "active": True},
    {"code": "4101", "name": "درآمد خدمات", "active": True},
    {"code": "5101", "name": "هزینه خدمات", "active": True},
]


def setup(db: Session, company: str, user: m.User) -> dict[str, Any]:
    member = membership(db, company, user)
    item = db.get(CompanyAccountingSetup, company)
    return {
        "mode": item.mode if item else "analysis",
        "version": item.version if item else 1,
        "can_manage": member.role == "owner",
        "posting_available": capabilities(db, company, user)["posting_available"],
        "posting_reason": capabilities(db, company, user)["posting_reason"],
        "connector_mode": "read_only",
        "connector_available": False,
    }


def update_mode(db: Session, company: str, user: m.User, mode: str, version: int) -> dict:
    membership(db, company, user, "owner")
    require(mode in ("analysis", "primary"), "invalid_accounting_mode", "کاربرد حسابداری معتبر انتخاب کنید.")
    item = db.get(CompanyAccountingSetup, company)
    before = item.mode if item else "analysis"
    if item:
        check_version(item, version)
        item.version += 1
    else:
        require(version == 1, "version_conflict", "تنظیم تغییر کرده است.", 409)
        item = CompanyAccountingSetup(company_id=company, version=2)
        db.add(item)
    item.mode = mode
    db.flush()
    audit(
        db,
        company,
        user.id,
        "accounting.mode_changed",
        company,
        {"before": before, "after": mode, "version": item.version, "financial_effect": False},
    )
    return setup(db, company, user)


def _digest(db: Session, company: str) -> str:
    rows = [
        (a.id, a.version, a.code, a.name, a.active)
        for a in db.scalars(select(Account).where(Account.company_id == company).order_by(Account.id))
    ]
    return sha256(json.dumps(rows, ensure_ascii=False).encode()).hexdigest()


def preview_chart(db: Session, company: str, user: m.User, rows: list[dict]) -> dict:
    require(
        capabilities(db, company, user)["can_manage_accounts"],
        "permission_denied",
        "اجازه مدیریت حساب‌ها ندارید.",
        403,
    )
    require(0 < len(rows) <= 20000, "chart_row_limit", "بین ۱ تا ۲۰ هزار حساب وارد کنید.")
    codes = [row["code"] for row in rows]
    require(len(set(codes)) == len(codes), "duplicate_account_code", "کد حساب در فایل تکرار شده است.", 409)
    existing = set(db.scalars(select(Account.code).where(Account.company_id == company)))
    require(
        not (existing & set(codes)),
        "account_code_conflict",
        "کد حساب موجود است؛ واردسازی حساب‌های موجود را تغییر نمی‌دهد.",
        409,
    )
    item = AccountImportPreview(
        company_id=company, actor_id=user.id, catalog_digest=_digest(db, company), rows=rows
    )
    db.add(item)
    db.flush()
    return {"preview_id": item.id, "rows": rows, "row_count": len(rows), "financial_effect": False}


def import_chart(db: Session, company: str, user: m.User, preview_id: str) -> dict:
    require(
        capabilities(db, company, user)["can_manage_accounts"],
        "permission_denied",
        "اجازه مدیریت حساب‌ها ندارید.",
        403,
    )
    checked = get_entity(db, AccountImportPreview, company, preview_id)
    require(checked.actor_id == user.id, "preview_owner_mismatch", "پیش‌نمایش متعلق به این کاربر نیست.", 403)
    require(
        checked.catalog_digest == _digest(db, company),
        "chart_changed",
        "کدینگ تغییر کرده؛ پیش‌نمایش را تکرار کنید.",
        409,
    )
    for row in checked.rows:
        save_account(db, company, user, row)
    audit(
        db,
        company,
        user.id,
        "accounting.chart_imported",
        checked.id,
        {"count": len(checked.rows), "financial_effect": False},
    )
    return {"created_count": len(checked.rows), "financial_effect": False}


def parse_chart(name: str, content: bytes) -> dict:
    suffix = Path(name).suffix.lower()
    require(suffix in (".csv", ".xlsx"), "unsupported_chart_file", "فایل CSV یا XLSX لازم است.", 415)
    scan(content)
    sheets = read_file(name, content)
    require(len(sheets) == 1, "chart_sheet_count", "کدینگ را در یک شیت ارسال کنید.")
    sheet = sheets[0]
    code = next((h for h in sheet.headers if h in ("code", "کد حساب")), None)
    title = next((h for h in sheet.headers if h in ("name", "نام حساب")), None)
    require(bool(code and title), "chart_headers", "ستون‌های code و name یا کد حساب و نام حساب لازم است.")
    if suffix == ".xlsx":
        workbook = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=False)
        try:
            column = sheet.headers.index(code)
            for row in workbook.worksheets[0].iter_rows(min_row=2):
                require(
                    not any(cell.data_type == "f" for cell in row),
                    "chart_formula_rejected",
                    "کدینگ باید مقدار ثابت داشته باشد؛ فرمول مجاز نیست.",
                )
                if row[column].value is not None:
                    require(
                        isinstance(row[column].value, str),
                        "account_code_text_required",
                        "کد حساب در Excel باید متن باشد تا صفرهای آغازین حفظ شوند.",
                    )
        finally:
            workbook.close()
    rows = []
    for _, row in sheet.rows:
        active = row.get("active", "true").strip().lower()
        require(
            active in ("true", "false", "1", "0"), "invalid_account_active", "active باید true یا false باشد."
        )
        rows.append({"code": row[code], "name": row[title], "active": active in ("true", "1")})
    from .accounting_setup_schemas import ChartPreviewInput

    parsed = ChartPreviewInput.model_validate({"rows": rows})
    return {"rows": [r.model_dump() for r in parsed.rows], "row_count": len(rows), "financial_effect": False}
