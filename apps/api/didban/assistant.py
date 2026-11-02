"""Read-only, deterministic fact lookup bound to one immutable manifest."""

from .ingestion import normalized

GROUPS = [
    (("نقد", "موجودی", "بانک"), ("cash", "cash_subset")),
    (("درآمد",), ("revenue",)),
    (("هزینه",), ("expense",)),
    (("سود", "زیان"), ("net_profit", "pre_tax_profit")),
    (("مطالبات", "دریافتنی", "وصول"), ("ar_ledger", "ar_invoice", "ar_difference")),
    (("بدهی", "پرداختنی", "بدهکار"), ("debt_total_ledger", "ap_trade_ledger", "ap_invoice", "ap_difference")),
]
DEFAULT_KEYS = {"revenue", "expense", "net_profit", "cash", "ar_invoice", "ap_invoice"}
MUTATIONS = (
    "حذف کن",
    "پاک کن",
    "ثبت کن",
    "ویرایش کن",
    "تغییر بده",
    "تایید کن",
    "تأیید کن",
    "انتقال بده",
    "پرداخت کن",
)


def context_identity(manifest: dict | None) -> dict:
    if manifest and manifest.get("context_type") == "native_statement":
        return {
            "manifest_id": None,
            "native_statement_id": manifest["native_statement_id"],
            "context_type": "native_statement",
        }
    return {"manifest_id": manifest["id"] if manifest else None}


def answer_from_manifest(manifest: dict, question: str) -> dict:
    text = normalized(question)
    if any(command in text for command in MUTATIONS):
        return {
            **context_identity(manifest),
            "mode": "facts",
            "answer": "برای تغییر داده از بخش مربوط استفاده کنید.",
            "facts": [],
            "evidence_refs": [],
        }
    keys = {key for words, group in GROUPS if any(word in text for word in words) for key in group}
    if "فاکتور" in text:
        keys.update(
            ("ap_invoice",)
            if "خرید" in text
            else ("ar_invoice",)
            if "فروش" in text
            else ("ar_invoice", "ap_invoice")
        )
    keys = keys or (
        {"cash", "revenue", "expense", "pre_tax_profit", "ar_ledger", "ap_trade_ledger"}
        if manifest.get("context_type") == "native_statement"
        else DEFAULT_KEYS
    )
    facts = [dict(item) for item in manifest["metrics"] if item["metric_key"] in keys]
    answer = "اطلاعات ثبت‌شده در این نسخه گزارش:"
    if manifest.get("context_type") == "native_statement" and "فاکتور" in text:
        answer = "ماندهٔ فاکتوری در این گزارش موجود نیست؛ ارقام موجود، مبنای دفتر اصلی دارند."
    return {
        **context_identity(manifest),
        "mode": "facts",
        "answer": answer,
        "facts": facts,
        "evidence_refs": list(dict.fromkeys(ref for item in facts for ref in item.get("evidence_refs", []))),
        "as_of_date": manifest.get("details", {}).get("as_of_date"),
    }
