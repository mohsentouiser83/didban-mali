"""Company mode configuration and chart import preserve independent posting authority."""

import io
import json
from collections import Counter
from hashlib import sha256
from pathlib import Path
from typing import Any

import openpyxl
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .account_catalogue_service import PARENT_LEVEL, validate_code_pattern
from .accounting_models import Account, AccountHierarchy
from .accounting_service import capabilities, save_account
from .accounting_setup_models import AccountImportPreview, CompanyAccountingSetup
from .errors import DomainError, require
from .ingestion import read_file, scan
from .security import membership
from .services import check_version, get_entity
from .workflow import audit

TEMPLATE = [
    {"code": "11", "name": "وجوه نقد", "nature": "debit", "active": True, "level": "group"},
    {"code": "12", "name": "حساب‌های دریافتنی", "nature": "debit", "active": True, "level": "group"},
    {"code": "21", "name": "حساب‌های پرداختنی", "nature": "credit", "active": True, "level": "group"},
    {"code": "41", "name": "درآمدها", "nature": "credit", "active": True, "level": "group"},
    {"code": "51", "name": "هزینه‌ها", "nature": "debit", "active": True, "level": "group"},
    {"code": "1101", "name": "بانک و صندوق", "nature": "debit", "active": True, "level": "general", "parent_code": "11"},
    {"code": "1201", "name": "مطالبات", "nature": "debit", "active": True, "level": "general", "parent_code": "12"},
    {"code": "2101", "name": "بدهی‌ها", "nature": "credit", "active": True, "level": "general", "parent_code": "21"},
    {"code": "4101", "name": "درآمدهای عملیاتی", "nature": "credit", "active": True, "level": "general", "parent_code": "41"},
    {"code": "5101", "name": "هزینه‌های عملیاتی", "nature": "debit", "active": True, "level": "general", "parent_code": "51"},
    {"code": "110101", "name": "بانک", "nature": "debit", "active": True, "level": "subsidiary", "parent_code": "1101"},
    {"code": "120101", "name": "مطالبات تجاری", "nature": "debit", "active": True, "level": "subsidiary", "parent_code": "1201"},
    {"code": "210101", "name": "بدهی تجاری", "nature": "credit", "active": True, "level": "subsidiary", "parent_code": "2101"},
    {"code": "410101", "name": "درآمد خدمات", "nature": "credit", "active": True, "level": "subsidiary", "parent_code": "4101"},
    {"code": "510101", "name": "هزینه خدمات", "nature": "debit", "active": True, "level": "subsidiary", "parent_code": "5101"},
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
        (a.id, a.version, a.code, a.name, a.nature, a.active)
        for a in db.scalars(select(Account).where(Account.company_id == company).order_by(Account.id))
    ]
    structure = list(db.execute(select(AccountHierarchy.account_id, AccountHierarchy.level, AccountHierarchy.parent_id)
                                .where(AccountHierarchy.company_id == company).order_by(AccountHierarchy.account_id)))
    return sha256(json.dumps([rows, [list(row) for row in structure]], ensure_ascii=False).encode()).hexdigest()


def validate_chart_hierarchy(db: Session, company: str, rows: list[dict]) -> None:
    existing = {a.id: a for a in db.scalars(select(Account).where(Account.company_id == company))}
    structures = {h.account_id: h for h in db.scalars(select(AccountHierarchy).where(AccountHierarchy.company_id == company))}
    levels = {a.code: structures[a.id].level if a.id in structures else None for a in existing.values()}
    levels.update({row["code"]: row.get("level") for row in rows})
    failures = {}
    first_error = None
    for index, row in enumerate(rows):
        try:
            require(bool(row.get("code")), "account_code_required", "کد حساب را وارد کنید.")
            parent_code = row.get("parent_code")
            parent_id = row.get("parent_id")
            require(not (parent_code and parent_id), "ambiguous_account_parent", "فقط یک حساب بالادست تعیین کنید.")
            if parent_id:
                require(parent_id in existing, "not_found", "حساب بالادست یافت نشد.", 404)
                parent_code = existing[parent_id].code
            level = row.get("level")
            if level in (None, "group"):
                require(not parent_code, "invalid_account_parent", "حساب گروه بالادست ندارد.")
            else:
                require(bool(parent_code), "account_parent_required", "کد حساب بالادست را وارد کنید.")
                require(parent_code in levels and levels[parent_code] == PARENT_LEVEL.get(level),
                        "invalid_account_parent_level", "سطح حساب بالادست سازگار نیست.")
            validate_code_pattern(row["code"], level, parent_code)
        except DomainError as exc:
            first_error = first_error or exc
            failures[f"chart-row-{index}"] = exc.message
    if first_error:
        raise DomainError(first_error.code, first_error.message, first_error.status, failures)


def preview_chart(db: Session, company: str, user: m.User, rows: list[dict]) -> dict:
    require(
        capabilities(db, company, user)["can_manage_accounts"],
        "permission_denied",
        "اجازه مدیریت حساب‌ها ندارید.",
        403,
    )
    require(0 < len(rows) <= 20000, "chart_row_limit", "بین ۱ تا ۲۰ هزار حساب وارد کنید.")
    from .accounting_setup_schemas import ChartPreviewInput

    rows = [row.model_dump() for row in ChartPreviewInput.model_validate({"rows": rows}).rows]
    codes = [row["code"] for row in rows]
    duplicates = {code for code, count in Counter(codes).items() if count > 1}
    if duplicates:
        message = "کد حساب در فایل تکرار شده است."
        raise DomainError("duplicate_account_code", message, 409, {
            f"chart-row-{index}": message for index, code in enumerate(codes) if code in duplicates
        })
    existing = set(db.scalars(select(Account.code).where(Account.company_id == company)))
    conflicts = existing.intersection(codes)
    if conflicts:
        raise DomainError("account_code_conflict", "کد حساب موجود است؛ واردسازی حساب‌های موجود را تغییر نمی‌دهد.", 409, {
            f"chart-row-{index}": "کد حساب از قبل موجود است." for index, code in enumerate(codes) if code in conflicts
        })
    validate_chart_hierarchy(db, company, rows)
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
    validate_chart_hierarchy(db, company, checked.rows)
    accounts = {a.code: a.id for a in db.scalars(select(Account).where(Account.company_id == company))}
    rank = {None: 0, "group": 0, "general": 1, "subsidiary": 2, "detail": 3}
    for row in sorted(checked.rows, key=lambda row: rank[row.get("level")]):
        data = {key: value for key, value in row.items() if key != "parent_code"}
        if row.get("parent_code"):
            data["parent_id"] = accounts[row["parent_code"]]
        result = save_account(db, company, user, data, imported_code=row["code"])
        accounts[result["code"]] = result["id"]
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
    parent_header = next((h for h in sheet.headers if h in ("parent_code", "کد بالادست", "کد حساب بالادست")), None)
    if suffix == ".xlsx":
        workbook = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=False)
        try:
            code_columns = [sheet.headers.index(header) for header in (code, parent_header) if header]
            for row in workbook.worksheets[0].iter_rows(min_row=2):
                require(
                    not any(cell.data_type == "f" for cell in row),
                    "chart_formula_rejected",
                    "کدینگ باید مقدار ثابت داشته باشد؛ فرمول مجاز نیست.",
                )
                for column in code_columns:
                    if row[column].value is not None:
                        require(
                            isinstance(row[column].value, str),
                            "account_code_text_required",
                            "کد حساب و بالادست در Excel باید متن باشند تا صفرهای آغازین حفظ شوند.",
                        )
        finally:
            workbook.close()
    nature_header = next((h for h in sheet.headers if h in ("nature", "ماهیت", "ماهیت حساب")), None)
    level_header = next((h for h in sheet.headers if h in ("level", "سطح", "سطح حساب")), None)
    rows = []
    for _, row in sheet.rows:
        active = row.get("active", "true").strip().lower()
        require(
            active in ("true", "false", "1", "0"), "invalid_account_active", "active باید true یا false باشد."
        )
        item: dict[str, Any] = {"code": row[code], "name": row[title], "active": active in ("true", "1")}
        if nature_header and row.get(nature_header):
            item["nature"] = row[nature_header]
        if level_header and row.get(level_header):
            item["level"] = row[level_header]
        if parent_header and row.get(parent_header):
            item["parent_code"] = row[parent_header]
        rows.append(item)
    from .accounting_setup_schemas import ChartPreviewInput

    parsed = ChartPreviewInput.model_validate({"rows": rows})
    return {"rows": [r.model_dump() for r in parsed.rows], "row_count": len(rows), "financial_effect": False}
