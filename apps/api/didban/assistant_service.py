"""Optional model-guided fact selection with deterministic financial wording."""

from hashlib import sha256

from .assistant import GROUPS, MUTATIONS, answer_from_manifest
from .errors import DomainError
from .ingestion import normalized
from .model_gateway import configured_gateway


def greeting(question: str) -> str | None:
    text = normalized(question).strip(" !؟?،.؛")
    if text in ("سلام", "سلام سلام", "سلام وقت بخیر", "درود", "hello", "hi"):
        return "سلام! چطور می‌توانم کمکتان کنم؟"
    if text in ("ممنون", "مرسی", "متشکرم", "سپاس"):
        return "خواهش می‌کنم."
    return None


async def respond(
    *, manifest: dict | None, question: str, company_id: str, actor_id: str, request_key: str, gateway=None, history: list[dict] | None = None
) -> dict:
    gateway = gateway or configured_gateway()
    base = {"manifest_id": manifest["id"] if manifest else None, "mode": "facts",
            "facts": [], "evidence_refs": []}
    fallback = (answer_from_manifest(manifest, question) if manifest else
                base | {"answer": "هنوز گزارشی برای این شرکت موجود نیست؛ اسناد را بارگذاری کنید."})
    text = normalized(question)
    report_hint = any(word in text for words, _ in GROUPS for word in words) or "فاکتور" in text
    if any(command in text for command in MUTATIONS):
        return base | {"answer": "برای تغییر داده از بخش مربوط استفاده کنید."}

    def unavailable(state: str, reason: str | None) -> dict:
        response = fallback if report_hint else base | {
            "answer": greeting(question) or "پاسخ دریافت نشد؛ اتصال مدل را بررسی کنید."
        }
        return response | {"model_state": state, "model_reason_code": reason}

    if not gateway.config.enabled or not gateway.config.api_key:
        return unavailable("unavailable", "model_unconfigured")
    key = "chat:" + sha256(request_key.encode()).hexdigest()
    try:
        conversation = await gateway.invoke(
            company_id=company_id, actor_id=actor_id, purpose="chat",
            evidence={"question": question, "history": history or [], "source_refs": []},
            request_key=key,
        )
    except DomainError as error:
        return unavailable("unavailable", error.code)
    if conversation["state"] != "completed":
        return unavailable(conversation["state"], conversation.get("reason_code"))
    if conversation["proposal"]["kind"] == "chat":
        return base | {"mode": "chat", "answer": conversation["proposal"]["answer"],
                       "model_state": "completed", "model_request_id": conversation.get("request_id")}
    if not manifest or not fallback["facts"]:
        return fallback
    # A snapshot's explicit unavailable-state record is evidence of the stated
    # limitation; it is never presented as a file row or a fabricated amount.
    facts = {}
    for item in manifest["metrics"]:
        value = dict(item)
        value["evidence_refs"] = item.get("evidence_refs", [])[:8] or ["manifest:" + manifest["id"]]
        facts[item["metric_key"]] = value
    source_refs = list(dict.fromkeys(ref for fact in facts.values() for ref in fact["evidence_refs"]))
    evidence = {
        "question": question,
        "facts": facts,
        "source_refs": source_refs,
        "manifest_id": manifest["id"],
        "as_of_date": manifest.get("details", {}).get("as_of_date"),
    }
    key = "assistant:" + sha256((request_key + manifest["id"]).encode()).hexdigest()
    try:
        result = await gateway.invoke(
            company_id=company_id,
            actor_id=actor_id,
            purpose="summarize_report",
            evidence=evidence,
            request_key=key,
        )
    except DomainError as error:
        # Valid financial facts remain available if model setup or its budget is
        # incomplete; the response never claims the model completed successfully.
        return fallback | {"mode": "facts", "model_state": "unavailable", "model_reason_code": error.code}
    if result["state"] != "completed":
        return fallback | {
            "model_state": result["state"],
            "model_reason_code": result.get("reason_code"),
            "model_request_id": result.get("request_id"),
        }
    sentences = result["proposal"]["sentences"]
    keys = list(dict.fromkeys(sentence["fact_key"] for sentence in sentences))
    selected = [facts[key] for key in keys]
    explanation = "بر اساس اطلاعات همین نسخه گزارش:"
    if any(word in normalized(question) for word in ("چرا", "چطور", "چگونه")) and any(
        f["metric_key"] == "net_profit" and f["value"] is not None for f in selected
    ):
        explanation = "سود خالص، درآمد منهای هزینه‌های ثبت‌شده است؛ مالیات شناسایی‌شده در هزینه‌ها منظور شده است."
    return {
        "manifest_id": manifest["id"],
        "mode": "model_facts",
        "model_state": "completed",
        "model_request_id": result["request_id"],
        "answer": explanation,
        "facts": selected,
        "evidence_refs": list(dict.fromkeys(ref for item in selected for ref in item["evidence_refs"])),
        "as_of_date": manifest.get("details", {}).get("as_of_date"),
    }
