"""Configurable numbering system service with default 001 starting values and deletion restrictions."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .errors import require
from .numbering_models import NumberingSystem
from .security import membership
from .services import check_version, get_entity
from .workflow import audit, serialize_fact

DEFAULT_NUMBERING_ENTITIES = [
    {
        "entity_type": "journal_entry",
        "entity_title": "اسناد حسابداری",
        "description": "شماره‌گذاری اسناد حسابداری و دفاتر مالی",
    },
    {
        "entity_type": "sales_invoice",
        "entity_title": "فاکتور فروش",
        "description": "شماره سریال فاکتورهای فروش کالا و خدمات",
    },
    {
        "entity_type": "purchase_invoice",
        "entity_title": "فاکتور خرید",
        "description": "شماره سریال فاکتورهای خرید کالا و خدمات",
    },
    {
        "entity_type": "proforma_invoice",
        "entity_title": "پیش‌فاکتور",
        "description": "شماره سریال پیش‌فاکتورهای تجاری",
    },
    {
        "entity_type": "counterparty",
        "entity_title": "طرف حساب تجاری",
        "description": "کدگذاری تفصیلی مشتریان، تأمین‌کنندگان و طرف‌های حساب",
    },
    {
        "entity_type": "cheque",
        "entity_title": "چک و اسناد تجاری",
        "description": "سریال برگه‌های چک و اسناد دریافتنی/پرداختنی",
    },
    {
        "entity_type": "inventory_item",
        "entity_title": "کالای انبار",
        "description": "کد شناسایی کالاها و خدمات انبار",
    },
    {
        "entity_type": "inventory_warehouse",
        "entity_title": "انبار",
        "description": "کد شناسایی انبارهای فیزیکی شرکت",
    },
    {
        "entity_type": "inventory_movement",
        "entity_title": "حواله و رسید انبار",
        "description": "شماره رسید، حواله خروج و انتقال انبار",
    },
    {
        "entity_type": "dimension",
        "entity_title": "پروژه و مرکز هزینه",
        "description": "کد تفصیلی پروژه‌ها، شعبه‌ها و مراکز هزینه",
    },
    {
        "entity_type": "personnel",
        "entity_title": "کارکنان و پرسنل",
        "description": "کد پرسنلی کارکنان شرکت",
    },
]


def ensure_defaults(db: Session, company_id: str) -> None:
    """Ensure all default numbering entities exist for the company starting with 001."""
    existing = set(
        db.scalars(select(NumberingSystem.entity_type).where(NumberingSystem.company_id == company_id)).all()
    )
    created = False
    for item in DEFAULT_NUMBERING_ENTITIES:
        if item["entity_type"] not in existing:
            rule = NumberingSystem(
                company_id=company_id,
                entity_type=item["entity_type"],
                entity_title=item["entity_title"],
                prefix="",
                start_number=1,
                current_number=1,
                padding=3,
                suffix="",
                description=item["description"],
                is_system=True,
                active=True,
            )
            db.add(rule)
            created = True
    if created:
        db.flush()


def _serialize_rule(rule: NumberingSystem) -> dict:
    data = serialize_fact(rule)
    data["sample"] = rule.sample
    return data


def list_rules(db: Session, company_id: str, user: m.User) -> list[dict]:
    membership(db, company_id, user, "read")
    ensure_defaults(db, company_id)
    rules = db.scalars(select(NumberingSystem).where(NumberingSystem.company_id == company_id)).all()
    # Order rules matching default entities order first
    order_map = {item["entity_type"]: i for i, item in enumerate(DEFAULT_NUMBERING_ENTITIES)}
    sorted_rules = sorted(rules, key=lambda r: order_map.get(r.entity_type, 999))
    return [_serialize_rule(r) for r in sorted_rules]


def create_rule(
    db: Session,
    company_id: str,
    user: m.User,
    data: dict,
) -> dict:
    membership(db, company_id, user, "write")
    ensure_defaults(db, company_id)

    entity_type = (data.get("entity_type") or "").strip().lower()
    entity_title = (data.get("entity_title") or "").strip()

    require(bool(entity_type), "entity_type_required", "شناسه انگلیسی موجودیت الزامی است.", 422)
    require(bool(entity_title), "entity_title_required", "عنوان موجودیت الزامی است.", 422)

    existing = db.scalar(
        select(NumberingSystem).where(
            NumberingSystem.company_id == company_id,
            NumberingSystem.entity_type == entity_type,
        )
    )
    require(
        existing is None,
        "duplicate_entity_type",
        "قاعده شماره‌گذاری برای این موجودیت قبلاً تعریف شده است.",
        409,
    )

    padding = int(data.get("padding", 3))
    require(1 <= padding <= 10, "invalid_padding", "تعداد ارقام باید بین ۱ تا ۱۰ باشد.", 422)

    start_number = int(data.get("start_number", 1))
    require(start_number >= 1, "invalid_start_number", "شماره شروع باید بزرگتر یا مساوی ۱ باشد.", 422)

    current_number = int(data.get("current_number", start_number))
    require(current_number >= 1, "invalid_current_number", "شماره جاری باید بزرگتر یا مساوی ۱ باشد.", 422)

    rule = NumberingSystem(
        company_id=company_id,
        entity_type=entity_type,
        entity_title=entity_title,
        prefix=str(data.get("prefix") or ""),
        start_number=start_number,
        current_number=current_number,
        padding=padding,
        suffix=str(data.get("suffix") or ""),
        description=data.get("description"),
        is_system=False,
        active=bool(data.get("active", True)),
    )
    db.add(rule)
    db.flush()

    audit(
        db,
        company_id,
        user.id,
        "numbering_system.created",
        rule.id,
        {
            "entity_type": rule.entity_type,
            "entity_title": rule.entity_title,
            "sample": rule.sample,
            "current_number": rule.current_number,
        },
    )
    return _serialize_rule(rule)


def get_rule(db: Session, company_id: str, user: m.User, rule_id: str) -> dict:
    membership(db, company_id, user, "read")
    rule = get_entity(db, NumberingSystem, company_id, rule_id)
    return _serialize_rule(rule)


def update_rule(
    db: Session,
    company_id: str,
    user: m.User,
    rule_id: str,
    data: dict,
    version: int | None = None,
) -> dict:
    membership(db, company_id, user, "write")
    rule = get_entity(db, NumberingSystem, company_id, rule_id)
    check_version(rule, version)

    for field in ("entity_title", "prefix", "suffix", "description", "active"):
        if field in data and data[field] is not None:
            setattr(rule, field, data[field])

    if "padding" in data and data["padding"] is not None:
        require(1 <= int(data["padding"]) <= 10, "invalid_padding", "تعداد ارقام باید بین ۱ تا ۱۰ باشد.", 422)
        rule.padding = int(data["padding"])

    if "start_number" in data and data["start_number"] is not None:
        require(
            int(data["start_number"]) >= 1,
            "invalid_start_number",
            "شماره شروع باید بزرگتر یا مساوی ۱ باشد.",
            422,
        )
        rule.start_number = int(data["start_number"])

    if "current_number" in data and data["current_number"] is not None:
        require(
            int(data["current_number"]) >= 1,
            "invalid_current_number",
            "شماره جاری باید بزرگتر یا مساوی ۱ باشد.",
            422,
        )
        rule.current_number = int(data["current_number"])

    rule.version += 1
    db.add(rule)
    db.flush()

    audit(
        db,
        company_id,
        user.id,
        "numbering_system.updated",
        rule.id,
        {
            "entity_type": rule.entity_type,
            "version": rule.version,
            "sample": rule.sample,
            "current_number": rule.current_number,
        },
    )
    return _serialize_rule(rule)


def delete_rule(db: Session, company_id: str, user: m.User, rule_id: str) -> None:
    """Predefined numbering rules cannot be deleted; custom rules can be deleted."""
    membership(db, company_id, user, "write")
    rule = get_entity(db, NumberingSystem, company_id, rule_id)
    require(
        not rule.is_system,
        "cannot_delete_numbering_system",
        "امکان حذف سیستم شماره‌گذاری پیش‌فرض وجود ندارد. شما فقط می‌توانید آن را ویرایش کنید.",
        400,
    )
    entity_type = rule.entity_type
    db.delete(rule)
    db.flush()

    audit(
        db,
        company_id,
        user.id,
        "numbering_system.deleted",
        rule_id,
        {"entity_type": entity_type},
    )


def generate_next_number(
    db: Session,
    company_id: str,
    user: m.User,
    entity_type: str,
    consume: bool = False,
) -> dict:
    membership(db, company_id, user, "write" if consume else "read")
    ensure_defaults(db, company_id)
    rule = db.scalar(
        select(NumberingSystem).where(
            NumberingSystem.company_id == company_id,
            NumberingSystem.entity_type == entity_type,
        )
    )
    require(
        rule is not None, "entity_numbering_not_found", "سیستم شماره‌گذاری برای این موجودیت یافت نشد.", 404
    )
    formatted = rule.sample
    if consume:
        rule.current_number += 1
        rule.version += 1
        db.add(rule)
        db.flush()
    return {
        "entity_type": entity_type,
        "number": formatted,
        "current_number": rule.current_number,
    }
