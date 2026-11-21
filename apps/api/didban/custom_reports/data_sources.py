"""Data source catalog for Didban-Mali custom reports.

Lists all available financial and operational entity sources with localized labels and domain groups.
"""

from typing import TypedDict


class DataSourceItem(TypedDict):
    value: str
    label_fa: str
    label_en: str
    group: str
    description_fa: str


DATA_SOURCES: list[DataSourceItem] = [
    {
        "value": "journal_lines",
        "label_fa": "ریز اسناد حسابداری و دفتر روزنامه",
        "label_en": "Journal Lines & General Ledger",
        "group": "accounting",
        "description_fa": "آرتیکل‌های اسناد مالی، بستانکار و بدهکار، شرح سند و کد حساب معین/تفصیلی",
    },
    {
        "value": "accounting_accounts",
        "label_fa": "کدینگ و سرفصل‌های حسابداری",
        "label_en": "Chart of Accounts",
        "group": "accounting",
        "description_fa": "کدینگ حساب‌ها، نام، ماهیت بدهکار/بستانکار و وضعیت فعال بودن",
    },
    {
        "value": "invoices",
        "label_fa": "فاکتورهای فروش و خرید",
        "label_en": "Invoices (Sales & Purchases)",
        "group": "commercial",
        "description_fa": "فاکتورهای تجاری، مبالغ، مالیات، سررسید، مبالغ پرداخت‌شده و مانده‌ها",
    },
    {
        "value": "parties",
        "label_fa": "اشخاص و طرف‌های حساب",
        "label_en": "Parties & Counterparties",
        "group": "commercial",
        "description_fa": "مانده حساب مشتریان و تامین‌کنندگان، گردش بدهکار/بستانکار و وضعیت تسویه",
    },
    {
        "value": "bank_movements",
        "label_fa": "گردش و تراکنش‌های بانکی",
        "label_en": "Bank Transactions & Movements",
        "group": "treasury",
        "description_fa": "تراکنش‌های واریز و برداشت بانکی، شماره پیگیری، تاریخ و مانده‌های لحظه‌ای",
    },
    {
        "value": "cheques",
        "label_fa": "چک‌های صیادی (دریافتی و پرداختی)",
        "label_en": "Cheques (Receivable & Payable)",
        "group": "treasury",
        "description_fa": "چک‌های اسناد تجاری، سررسید، نام بانک، وضعیت وصولی، برگشتی و درجریان",
    },
    {
        "value": "inventory_items",
        "label_fa": "کالاها و خدمات انبار",
        "label_en": "Inventory Items & Products",
        "group": "inventory",
        "description_fa": "فهرست کالاها و خدمات، کدهای کالا و حساب معین موجودی مربوطه",
    },
    {
        "value": "inventory_movements",
        "label_fa": "کاردکس و گردش موجودی کالا",
        "label_en": "Inventory Stock Movements",
        "group": "inventory",
        "description_fa": "ورود و خروج انبار، رسیدها، حواله‌ها، مقادیر تعدادی و ارزش ریالی",
    },
    {
        "value": "personnel_records",
        "label_fa": "حقوق، دستمزد، بیمه و مالیات پرسنل",
        "label_en": "Payroll & Personnel Records",
        "group": "personnel",
        "description_fa": "ریز کارکرد و مبالغ ناخالص حقوق، کسورات قانونی، بیمه تامین اجتماعی و مالیات حقوق",
    },
    {
        "value": "dimensions",
        "label_fa": "مراکز هزینه، پروژه‌ها و ابعاد تحلیلی",
        "label_en": "Dimensions & Cost Centers",
        "group": "accounting",
        "description_fa": "تعاریف ابعاد تحلیلی از قبیل مراکز هزینه، پروژه‌ها، دپارتمان‌ها و شعب",
    },
    {
        "value": "moadian_transmissions",
        "label_fa": "ارسال‌های سامانه مؤدیان",
        "label_en": "Moadian Tax Transmissions",
        "group": "tax",
        "description_fa": "صورتحساب‌های ارسال‌شده به کارپوشه مؤدیان، شماره منحصر به فرد مالیاتی و وضعیت استعلام",
    },
]


def list_data_sources() -> list[DataSourceItem]:
    return DATA_SOURCES
