"""Field registry and security boundary for custom reports in Didban-Mali.

Defines allowable filterable, selectable, and groupable fields for each entity source.
User-supplied queries are validated strictly against this registry before execution.
"""

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class FieldDef:
    key: str
    label_fa: str
    field_type: str  # string | number | date | select | boolean
    choices: list[tuple[str, str]] | None = None
    group: str = "general"
    supported_operators: tuple[str, ...] = (
        "=",
        "!=",
        ">",
        "<",
        ">=",
        "<=",
        "contains",
        "in",
        "between",
        "today",
        "this_month",
        "is_null",
        "is_not_null",
    )


@dataclass(frozen=True)
class EntityRegistry:
    entity_type: str
    title_fa: str
    filterable: list[FieldDef] = field(default_factory=list)
    selectable: list[FieldDef] = field(default_factory=list)
    groupable: list[FieldDef] = field(default_factory=list)

    def get_filterable(self, key: str) -> FieldDef | None:
        return next((f for f in self.filterable if f.key == key), None)

    def get_selectable(self, key: str) -> FieldDef | None:
        return next((f for f in self.selectable if f.key == key), None)

    def get_groupable(self, key: str) -> FieldDef | None:
        fields = self.groupable or self.filterable
        return next((f for f in fields if f.key == key), None)


ENTRY_TYPE_CHOICES = [
    ("normal", "سند عادی"),
    ("opening", "افتتاحیه"),
    ("closing", "اختتامیه"),
    ("adjustment", "تعدیلی"),
    ("correction", "اصلاحی"),
]

NATURE_CHOICES = [
    ("debit", "بدهکار"),
    ("credit", "بستانکار"),
]

INVOICE_DIRECTION_CHOICES = [
    ("sales", "فروش"),
    ("purchases", "خرید"),
]

INVOICE_STATUS_CHOICES = [
    ("paid", "تسویه‌شده"),
    ("unpaid", "پرداخت‌نشده"),
    ("partially_paid", "تسویه بخشی"),
    ("overdue", "سررسیدگذشته"),
]

CHEQUE_DIRECTION_CHOICES = [
    ("receivable", "دریافتی"),
    ("payable", "پرداختی"),
]

CHEQUE_STATE_CHOICES = [
    ("normal", "عادی / در جریان"),
    ("in_clearance", "در حال وصول"),
    ("cleared", "پاس‌شده / وصول‌شده"),
    ("rejected", "برگشتی"),
    ("endorsed", "خرج‌شده"),
]

BANK_KIND_CHOICES = [
    ("deposit", "واریز"),
    ("withdrawal", "برداشت"),
    ("opening", "افتتاحیه"),
    ("balance_anchor", "مانده مبنا"),
]

STOCK_KIND_CHOICES = [
    ("receipt", "رسید ورود"),
    ("issue", "حواله خروج"),
    ("purchase", "خرید"),
    ("sale", "فروش"),
    ("adjustment", "تعدیل انبار"),
]

PERSONNEL_KIND_CHOICES = [
    ("salary", "ناخالص حقوق و دستمزد"),
    ("deductions", "کسورات قانونی"),
    ("insurance", "حق بیمه تأمین اجتماعی"),
    ("tax", "مالیات بر حقوق"),
]

DIMENSION_KIND_CHOICES = [
    ("cost_center", "مرکز هزینه"),
    ("project", "پروژه"),
    ("department", "دپارتمان / واحد سازمانی"),
    ("branch", "شعبه"),
]

PARTY_STATUS_CHOICES = [
    ("debtor", "بدهکار"),
    ("creditor", "بستانکار"),
    ("settled", "تسویه‌شده / بی‌حساب"),
]


REGISTRY: dict[str, EntityRegistry] = {
    # 1. ریز اسناد حسابداری و دفتر روزنامه
    "journal_lines": EntityRegistry(
        entity_type="journal_lines",
        title_fa="ریز اسناد حسابداری و دفتر روزنامه",
        filterable=[
            FieldDef("entry_id", "شماره / شناسه سند", "string"),
            FieldDef("date", "تاریخ سند", "date"),
            FieldDef("account", "کد حساب معین / کل", "string"),
            FieldDef("party_id", "شناسه طرف حساب", "string"),
            FieldDef("debit", "مبلغ بدهکار (ریال)", "number"),
            FieldDef("credit", "مبلغ بستانکار (ریال)", "number"),
            FieldDef("entry_type", "نوع سند", "select", choices=ENTRY_TYPE_CHOICES),
            FieldDef("reference", "عطف / شرح ردیف", "string"),
        ],
        selectable=[
            FieldDef("date", "تاریخ سند", "date"),
            FieldDef("entry_id", "شماره سند", "string"),
            FieldDef("account", "کد حساب", "string"),
            FieldDef("party_id", "طرف حساب", "string"),
            FieldDef("debit", "بدهکار", "number"),
            FieldDef("credit", "بستانکار", "number"),
            FieldDef("entry_type", "نوع سند", "select", choices=ENTRY_TYPE_CHOICES),
            FieldDef("reference", "شرح ردیف", "string"),
        ],
        groupable=[
            FieldDef("account", "کد حساب", "string"),
            FieldDef("party_id", "طرف حساب", "string"),
            FieldDef("entry_type", "نوع سند", "select", choices=ENTRY_TYPE_CHOICES),
            FieldDef("date", "تاریخ (ماه)", "date"),
        ],
    ),
    # 2. کدینگ و سرفصل‌های حسابداری
    "accounting_accounts": EntityRegistry(
        entity_type="accounting_accounts",
        title_fa="کدینگ و سرفصل‌های حسابداری",
        filterable=[
            FieldDef("code", "کد حساب", "string"),
            FieldDef("name", "نام حساب", "string"),
            FieldDef("nature", "ماهیت حساب", "select", choices=NATURE_CHOICES),
            FieldDef("active", "وضعیت فعال", "boolean"),
        ],
        selectable=[
            FieldDef("code", "کد حساب", "string"),
            FieldDef("name", "نام حساب", "string"),
            FieldDef("nature", "ماهیت حساب", "select", choices=NATURE_CHOICES),
            FieldDef("active", "فعال", "boolean"),
            FieldDef("created_at", "تاریخ ایجاد", "date"),
        ],
        groupable=[
            FieldDef("nature", "ماهیت حساب", "select", choices=NATURE_CHOICES),
            FieldDef("active", "وضعیت فعال", "boolean"),
        ],
    ),
    # 3. فاکتورهای فروش و خرید
    "invoices": EntityRegistry(
        entity_type="invoices",
        title_fa="فاکتورهای فروش و خرید",
        filterable=[
            FieldDef("reference", "شماره فاکتور", "string"),
            FieldDef("direction", "نوع فاکتور", "select", choices=INVOICE_DIRECTION_CHOICES),
            FieldDef("party_id", "طرف حساب / مشتری / فروشنده", "string"),
            FieldDef("date", "تاریخ فاکتور", "date"),
            FieldDef("due_date", "تاریخ سررسید", "date"),
            FieldDef("total", "مبلغ کل فاکتور", "number"),
            FieldDef("paid", "مبلغ تسویه‌شده", "number"),
            FieldDef("remaining", "مانده پرداخت‌نشده", "number"),
            FieldDef("status", "وضعیت فاکتور", "select", choices=INVOICE_STATUS_CHOICES),
            FieldDef("overdue", "سررسید گذشته", "boolean"),
        ],
        selectable=[
            FieldDef("reference", "شماره فاکتور", "string"),
            FieldDef("direction", "نوع فاکتور", "select", choices=INVOICE_DIRECTION_CHOICES),
            FieldDef("party_id", "طرف حساب", "string"),
            FieldDef("date", "تاریخ صدور", "date"),
            FieldDef("due_date", "سررسید", "date"),
            FieldDef("total", "مبلغ کل", "number"),
            FieldDef("paid", "تسویه‌شده", "number"),
            FieldDef("remaining", "مانده", "number"),
            FieldDef("status", "وضعیت", "select", choices=INVOICE_STATUS_CHOICES),
        ],
        groupable=[
            FieldDef("direction", "نوع فاکتور", "select", choices=INVOICE_DIRECTION_CHOICES),
            FieldDef("party_id", "طرف حساب", "string"),
            FieldDef("status", "وضعیت فاکتور", "select", choices=INVOICE_STATUS_CHOICES),
            FieldDef("date", "ماه صدور", "date"),
        ],
    ),
    # 4. اشخاص و طرف‌های حساب
    "parties": EntityRegistry(
        entity_type="parties",
        title_fa="اشخاص و طرف‌های حساب",
        filterable=[
            FieldDef("party_id", "شناسه / کد طرف حساب", "string"),
            FieldDef("name", "نام شخص / شرکت", "string"),
            FieldDef("balance", "مانده کل (ریال)", "number"),
            FieldDef("status", "وضعیت مانده", "select", choices=PARTY_STATUS_CHOICES),
            FieldDef("debit_sum", "مجموع گردش بدهکار", "number"),
            FieldDef("credit_sum", "مجموع گردش بستانکار", "number"),
        ],
        selectable=[
            FieldDef("party_id", "کد طرف حساب", "string"),
            FieldDef("name", "نام طرف حساب", "string"),
            FieldDef("balance", "مانده حساب", "number"),
            FieldDef("status", "وضعیت مانده", "select", choices=PARTY_STATUS_CHOICES),
            FieldDef("debit_sum", "گردش بدهکار", "number"),
            FieldDef("credit_sum", "گردش بستانکار", "number"),
        ],
        groupable=[
            FieldDef("status", "وضعیت مانده", "select", choices=PARTY_STATUS_CHOICES),
        ],
    ),
    # 5. گردش و تراکنش‌های بانکی
    "bank_movements": EntityRegistry(
        entity_type="bank_movements",
        title_fa="گردش و تراکنش‌های بانکی",
        filterable=[
            FieldDef("account", "شماره حساب بانکی", "string"),
            FieldDef("date", "تاریخ تراکنش", "date"),
            FieldDef("kind", "نوع تراکنش", "select", choices=BANK_KIND_CHOICES),
            FieldDef("amount", "مبلغ تراکنش", "number"),
            FieldDef("reference", "شماره پیگیری / عطف", "string"),
            FieldDef("party_id", "طرف تراکنش", "string"),
            FieldDef("balance", "مانده حساب پس از تراکنش", "number"),
        ],
        selectable=[
            FieldDef("date", "تاریخ تراکنش", "date"),
            FieldDef("account", "شماره حساب", "string"),
            FieldDef("kind", "نوع تراکنش", "select", choices=BANK_KIND_CHOICES),
            FieldDef("amount", "مبلغ", "number"),
            FieldDef("reference", "شماره پیگیری", "string"),
            FieldDef("party_id", "طرف تراکنش", "string"),
            FieldDef("balance", "مانده", "number"),
        ],
        groupable=[
            FieldDef("account", "شماره حساب", "string"),
            FieldDef("kind", "نوع تراکنش", "select", choices=BANK_KIND_CHOICES),
            FieldDef("party_id", "طرف تراکنش", "string"),
            FieldDef("date", "ماه تراکنش", "date"),
        ],
    ),
    # 6. چک‌های صیادی (دریافتی و پرداختی)
    "cheques": EntityRegistry(
        entity_type="cheques",
        title_fa="چک‌های صیادی و اسناد تجاری",
        filterable=[
            FieldDef("direction", "جهت چک", "select", choices=CHEQUE_DIRECTION_CHOICES),
            FieldDef("number", "شماره چک / صیادی", "string"),
            FieldDef("bank_name", "نام بانک", "string"),
            FieldDef("bank_account", "شماره حساب چک", "string"),
            FieldDef("party_id", "صادرکننده / گیرنده", "string"),
            FieldDef("amount", "مبلغ چک", "number"),
            FieldDef("issue_date", "تاریخ صدور", "date"),
            FieldDef("due_date", "تاریخ سررسید", "date"),
            FieldDef("state", "وضعیت چک", "select", choices=CHEQUE_STATE_CHOICES),
            FieldDef("endorsed_to", "واگذارشده به", "string"),
        ],
        selectable=[
            FieldDef("direction", "جهت چک", "select", choices=CHEQUE_DIRECTION_CHOICES),
            FieldDef("number", "شماره چک", "string"),
            FieldDef("bank_name", "نام بانک", "string"),
            FieldDef("party_id", "طرف حساب", "string"),
            FieldDef("amount", "مبلغ", "number"),
            FieldDef("due_date", "سررسید", "date"),
            FieldDef("state", "وضعیت", "select", choices=CHEQUE_STATE_CHOICES),
            FieldDef("issue_date", "تاریخ صدور", "date"),
        ],
        groupable=[
            FieldDef("direction", "جهت چک", "select", choices=CHEQUE_DIRECTION_CHOICES),
            FieldDef("state", "وضعیت چک", "select", choices=CHEQUE_STATE_CHOICES),
            FieldDef("bank_name", "نام بانک", "string"),
            FieldDef("due_date", "ماه سررسید", "date"),
        ],
    ),
    # 7. کالاها و خدمات انبار
    "inventory_items": EntityRegistry(
        entity_type="inventory_items",
        title_fa="کالاها و خدمات انبار",
        filterable=[
            FieldDef("code", "کد کالا", "string"),
            FieldDef("name", "نام کالا / خدمت", "string"),
            FieldDef("active", "وضعیت فعال", "boolean"),
            FieldDef("inventory_account_id", "حساب معین انبار", "string"),
        ],
        selectable=[
            FieldDef("code", "کد کالا", "string"),
            FieldDef("name", "نام کالا", "string"),
            FieldDef("active", "وضعیت فعال", "boolean"),
            FieldDef("inventory_account_id", "حساب معین", "string"),
            FieldDef("created_at", "تاریخ تعریف", "date"),
        ],
        groupable=[
            FieldDef("active", "وضعیت فعال", "boolean"),
        ],
    ),
    # 8. کاردکس و گردش موجودی کالا
    "inventory_movements": EntityRegistry(
        entity_type="inventory_movements",
        title_fa="کاردکس و گردش موجودی کالا",
        filterable=[
            FieldDef("item_id", "شناسه / کد کالا", "string"),
            FieldDef("warehouse_id", "شناسه انبار", "string"),
            FieldDef("kind", "نوع گردش انبار", "select", choices=STOCK_KIND_CHOICES),
            FieldDef("date", "تاریخ ورود / خروج", "date"),
            FieldDef("quantity", "تعداد / مقدار", "number"),
            FieldDef("value_irr", "ارزش ریالی گردش", "number"),
        ],
        selectable=[
            FieldDef("date", "تاریخ", "date"),
            FieldDef("item_id", "کد کالا", "string"),
            FieldDef("warehouse_id", "انبار", "string"),
            FieldDef("kind", "نوع گردش", "select", choices=STOCK_KIND_CHOICES),
            FieldDef("quantity", "تعداد", "number"),
            FieldDef("value_irr", "ارزش ریالی", "number"),
        ],
        groupable=[
            FieldDef("kind", "نوع گردش", "select", choices=STOCK_KIND_CHOICES),
            FieldDef("item_id", "کالا", "string"),
            FieldDef("warehouse_id", "انبار", "string"),
            FieldDef("date", "ماه گردش", "date"),
        ],
    ),
    # 9. حقوق، دستمزد، بیمه و مالیات پرسنل
    "personnel_records": EntityRegistry(
        entity_type="personnel_records",
        title_fa="حقوق، دستمزد و پرسنل",
        filterable=[
            FieldDef("employee_id", "کد پرسنلی / کد ملی", "string"),
            FieldDef("employee_name", "نام پرسنل", "string"),
            FieldDef("kind", "نوع آیتم حقوقی", "select", choices=PERSONNEL_KIND_CHOICES),
            FieldDef("date", "تاریخ / ماه کارکرد", "date"),
            FieldDef("amount", "مبلغ (ریال)", "number"),
        ],
        selectable=[
            FieldDef("employee_id", "کد پرسنلی", "string"),
            FieldDef("employee_name", "نام پرسنل", "string"),
            FieldDef("kind", "نوع آیتم", "select", choices=PERSONNEL_KIND_CHOICES),
            FieldDef("date", "تاریخ", "date"),
            FieldDef("amount", "مبلغ", "number"),
        ],
        groupable=[
            FieldDef("kind", "نوع آیتم حقوقی", "select", choices=PERSONNEL_KIND_CHOICES),
            FieldDef("employee_id", "پرسنل", "string"),
            FieldDef("date", "ماه کارکرد", "date"),
        ],
    ),
    # 10. مراکز هزینه و ابعاد تحلیلی
    "dimensions": EntityRegistry(
        entity_type="dimensions",
        title_fa="مراکز هزینه و ابعاد تحلیلی",
        filterable=[
            FieldDef("kind", "نوع بعد تحلیلی", "select", choices=DIMENSION_KIND_CHOICES),
            FieldDef("code", "کد بعد", "string"),
            FieldDef("name", "عنوان بعد", "string"),
            FieldDef("active", "وضعیت فعال", "boolean"),
        ],
        selectable=[
            FieldDef("kind", "نوع بعد", "select", choices=DIMENSION_KIND_CHOICES),
            FieldDef("code", "کد", "string"),
            FieldDef("name", "عنوان", "string"),
            FieldDef("active", "فعال", "boolean"),
            FieldDef("created_at", "تاریخ ایجاد", "date"),
        ],
        groupable=[
            FieldDef("kind", "نوع بعد تحلیلی", "select", choices=DIMENSION_KIND_CHOICES),
            FieldDef("active", "وضعیت فعال", "boolean"),
        ],
    ),
    # 11. سامانه مؤدیان
    "moadian_transmissions": EntityRegistry(
        entity_type="moadian_transmissions",
        title_fa="ارسال‌های سامانه مؤدیان",
        filterable=[
            FieldDef("tax_id", "شماره مالیاتی منحصر به فرد", "string"),
            FieldDef("invoice_reference", "شماره فاکتور داخلی", "string"),
            FieldDef("seller_tax_number", "شناسه فروشنده", "string"),
            FieldDef("created_at", "تاریخ ارسال", "date"),
        ],
        selectable=[
            FieldDef("created_at", "تاریخ ارسال", "date"),
            FieldDef("tax_id", "شماره مالیاتی", "string"),
            FieldDef("invoice_reference", "شماره فاکتور", "string"),
            FieldDef("seller_tax_number", "شناسه فروشنده", "string"),
            FieldDef("uid", "شناسه یکتا", "string"),
        ],
        groupable=[
            FieldDef("seller_tax_number", "فروشنده", "string"),
            FieldDef("created_at", "ماه ارسال", "date"),
        ],
    ),
}


def get_entity_registry(entity_type: str) -> EntityRegistry | None:
    return REGISTRY.get(entity_type)


def serialize_entity_registry(registry: EntityRegistry) -> dict[str, Any]:
    def _field_dict(f: FieldDef) -> dict[str, Any]:
        return {
            "key": f.key,
            "label_fa": f.label_fa,
            "field_type": f.field_type,
            "choices": [{"value": v, "label": lbl} for v, lbl in f.choices] if f.choices else [],
            "group": f.group,
            "supported_operators": list(f.supported_operators),
        }

    return {
        "entity_type": registry.entity_type,
        "title_fa": registry.title_fa,
        "filterable": [_field_dict(f) for f in registry.filterable],
        "selectable": [_field_dict(f) for f in registry.selectable],
        "groupable": [_field_dict(f) for f in registry.groupable],
    }
