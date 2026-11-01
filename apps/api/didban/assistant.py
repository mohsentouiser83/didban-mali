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


def answer_from_manifest(manifest: dict, question: str) -> dict:
    text = normalized(question)
    if any(command in text for command in MUTATIONS):
        return {
            "manifest_id": manifest["id"],
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
    keys = keys or DEFAULT_KEYS
    facts = [dict(item) for item in manifest["metrics"] if item["metric_key"] in keys]
    return {
        "manifest_id": manifest["id"],
        "mode": "facts",
        "answer": "اطلاعات ثبت‌شده در این نسخه گزارش:",
        "facts": facts,
        "evidence_refs": list(dict.fromkeys(ref for item in facts for ref in item.get("evidence_refs", []))),
        "as_of_date": manifest.get("details", {}).get("as_of_date"),
    }
