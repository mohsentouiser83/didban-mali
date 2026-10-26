from __future__ import annotations
from dataclasses import dataclass


@dataclass(frozen=True)
class PreparedFile:
    key: str
    sha256: str
    byte_size: int
    original_name: str
    format: str


class PreparationFailure(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


class DependencyUnavailable(PreparationFailure):
    pass


class EncodingQuestion(Exception):
    pass


DEPENDENCY_LABELS = {
    "scanner_unavailable": "اسکنر موقتاً در دسترس نیست.",
    "storage_unavailable": "فضای فایل موقتاً در دسترس نیست.",
    "permission_revoked": "دسترسی ایجادکننده بسته لغو شده است.",
}
FILE_ERRORS = {
    "malware_detected": "فایل در بررسی امنیتی رد شد.",
    "invalid_workbook": "ساختار فایل Excel معتبر نیست.",
    "invalid_csv": "ساختار فایل CSV معتبر نیست.",
    "empty_table": "فایل جدول قابل خواندن ندارد.",
    "row_limit": "تعداد ردیف‌های بسته از سقف مجاز بیشتر است.",
    "expanded_limit": "حجم بازشده فایل از سقف مجاز بیشتر است.",
    "column_limit": "تعداد ستون‌های فایل بیش از حد مجاز است.",
    "unsafe_workbook": "فایل دارای محتوای فعال یا پیوند بیرونی است.",
    "cell_limit": "اندازه یکی از سلول‌ها بیش از حد مجاز است.",
    "invalid_encoding": "کدگذاری انتخاب‌شده با فایل سازگار نیست.",
}
