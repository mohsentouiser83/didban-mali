"""Media proposals require editable human review before ordinary CSV ingestion."""

import asyncio
import csv
import io
from hashlib import sha256
from pathlib import Path

from sqlalchemy import select

from . import models as m
from .bot_extraction_models import BotExtractionAttempt, BotExtractionProposal, BotExtractionReview
from .bot_intake_models import BotIntake
from .bot_service import authorized
from .config import settings
from .db import transaction
from .errors import require
from .model_gateway import configured_gateway, validate_proposal
from .security import membership
from .services import check_version, get_entity
from .workflow import audit, serialize_fact

MIMES = {".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4"}


def own(db, company, user, item_id):
    membership(db, company, user, "write")
    item = get_entity(db, BotIntake, company, item_id)
    require(item.actor_id == user.id, "not_found", "فایل پیدا نشد.", 404)
    connection = db.get(m.BotConnection, item.connection_id)
    authorized(db, connection)
    require(
        connection.company_ref == company and connection.user_id == user.id,
        "not_found",
        "فایل پیدا نشد.",
        404,
    )
    return item


async def extract(company, actor_id, item_id, version, key, *, gateway=None, transcriber=None):
    require(
        settings.media_extraction_enabled,
        "media_extraction_disabled",
        "استخراج رسانه در سرور فعال نشده است.",
        503,
    )
    request_key = sha256((actor_id + ":" + item_id + ":" + key).encode()).hexdigest()
    with transaction(company) as db:
        user = db.get(m.User, actor_id)
        require(user and user.active, "access_revoked", "دسترسی غیرفعال است.", 403)
        item = own(db, company, user, item_id)
        previous = db.scalar(
            select(BotExtractionAttempt).where(
                BotExtractionAttempt.company_id == company, BotExtractionAttempt.request_key == request_key
            )
        )
        if previous:
            proposal = db.scalar(
                select(BotExtractionProposal).where(
                    BotExtractionProposal.company_id == company,
                    BotExtractionProposal.attempt_id == previous.id,
                )
            )
            require(
                proposal is not None,
                "extraction_unconfirmed",
                "نتیجه تلاش قبلی مشخص نیست؛ وضعیت را بررسی کنید.",
                409,
            )
            return serialize_fact(proposal)
        check_version(item, version)
        require(
            item.state in ("pending_extraction", "awaiting_review"),
            "extraction_unavailable",
            "این فایل نیازمند استخراج نیست.",
            409,
        )
        attempt = BotExtractionAttempt(
            company_id=company, intake_id=item.id, actor_id=user.id, request_key=request_key
        )
        db.add(attempt)
        db.flush()
        attempt_id = attempt.id
        file_sha = item.sha256
        path = settings.storage / item.storage_key
        name = item.name
        connection_version = db.get(m.BotConnection, item.connection_id).version
    try:
        require(
            path.is_file() and sha256(path.read_bytes()).hexdigest() == file_sha,
            "source_changed",
            "اصل فایل تغییر کرده است.",
            409,
        )
        suffix = Path(name).suffix.lower()
        model_id = None
        if suffix in MIMES:
            from .voice_service import transcribe

            result = await (transcriber or transcribe)(path.read_bytes(), MIMES[suffix])
            proposal = {
                "text": result["text"],
                "rows": [],
                "family": "unknown",
                "unit": "unknown",
                "calendar": "unknown",
                "unresolved_fields": ["متن ویس باید به ردیف‌های مالی تبدیل و بازبینی شود."],
                "evidence_refs": ["intake:" + item_id],
            }
            method = "voice"
        else:
            from .media_adapter import rasterize

            images = await asyncio.to_thread(rasterize, path, name)
            refs = [f"intake:{item_id}:page:{index + 1}" for index in range(len(images))]
            result = await (gateway or configured_gateway()).invoke(
                company_id=company,
                actor_id=actor_id,
                purpose="extract_document",
                evidence={"source_refs": refs, "source_sha256": file_sha, "page_count": len(images)},
                request_key="extract:" + request_key,
                media_inputs=images,
            )
            require(
                result["state"] == "completed",
                "extraction_dependency",
                "نتیجه استخراج آماده نیست؛ وضعیت مدل و هزینه را بررسی کنید.",
                503,
            )
            proposal = validate_proposal("extract_document", result["proposal"], {"source_refs": refs})
            model_id = result.get("request_id")
            method = "vision"
        with transaction(company) as db:
            user = db.get(m.User, actor_id)
            require(user and user.active, "access_revoked", "دسترسی غیرفعال است.", 403)
            item = own(db, company, user, item_id)
            check_version(item, version)
            require(
                db.get(m.BotConnection, item.connection_id).version == connection_version,
                "bot_disconnected",
                "اتصال تغییر کرده است.",
                403,
            )
            output = BotExtractionProposal(
                company_id=company,
                attempt_id=attempt_id,
                intake_id=item.id,
                actor_id=user.id,
                source_sha256=file_sha,
                model_request_id=model_id,
                method=method,
                proposal=proposal,
            )
            db.add(output)
            db.flush()
            db.get(BotExtractionAttempt, attempt_id).state = "completed"
            item.state = "awaiting_review"
            item.version += 1
            audit(
                db,
                company,
                user.id,
                "bot.extraction_proposed",
                output.id,
                {"intake_id": item.id, "method": method, "model_request_id": model_id},
            )
            return serialize_fact(output)
    except Exception:
        with transaction(company) as db:
            db.get(BotExtractionAttempt, attempt_id).state = "unconfirmed"
        raise


def proposals(db, company, user, item_id):
    own(db, company, user, item_id)
    return {
        "items": [
            serialize_fact(item)
            for item in db.scalars(
                select(BotExtractionProposal)
                .where(
                    BotExtractionProposal.company_id == company, BotExtractionProposal.intake_id == item_id
                )
                .order_by(BotExtractionProposal.created_at.desc())
            )
        ]
    }


def review(db, company, user, proposal_id, data, version):
    proposal = get_entity(db, BotExtractionProposal, company, proposal_id)
    item = own(db, company, user, proposal.intake_id)
    check_version(item, version)
    require(item.state == "awaiting_review", "extraction_review_stale", "وضعیت فایل تغییر کرده است.", 409)
    require(proposal.actor_id == user.id, "not_found", "پیشنهاد پیدا نشد.", 404)
    require(
        all(set(row["evidence_refs"]) <= set(proposal.proposal["evidence_refs"]) for row in data["rows"]),
        "extraction_lineage_invalid",
        "شاهد ردیف باید متعلق به اصل همین سند باشد.",
        409,
    )
    get_entity(db, m.Period, company, data["period_id"])
    original = settings.storage / item.storage_key
    require(
        original.is_file() and sha256(original.read_bytes()).hexdigest() == proposal.source_sha256,
        "source_changed",
        "اصل فایل تغییر کرده است.",
        409,
    )
    out = io.StringIO()
    fields = ["date", "invoice_id", "party_id", "account", "amount", "reference", "currency"]
    writer = csv.DictWriter(out, fieldnames=fields)
    writer.writeheader()
    for row in data["rows"]:
        writer.writerow(
            {
                field: (
                    row.get("reference")
                    if field == "invoice_id"
                    else data["unit"]
                    if field == "currency" and data["unit"] != "unknown"
                    else ""
                    if field == "currency"
                    else row.get(field)
                )
                or ""
                for field in fields
            }
        )
    content = out.getvalue().encode("utf-8")
    from .ingestion import read_file
    from .source_intake import store_source

    session = m.ProcessingSession(
        company_id=company, period_id=data["period_id"], actor_id=user.id, state="receiving"
    )
    db.add(session)
    db.flush()
    source = store_source(
        db,
        company,
        user,
        session.id,
        "reviewed-document.csv",
        content,
        "generated_from_scanned_original",
        read_file("reviewed-document.csv", content),
    )
    mapping = {field: field for field in fields}
    mapping["invoice_id"] = "invoice_id"
    db.add(
        m.Interpretation(
            company_id=company,
            file_id=source.id,
            sheet=next(iter(read_file("reviewed-document.csv", content))).name,
            family=data["family"],
            mapping=mapping,
            unit=None if data["unit"] == "unknown" else data["unit"],
            calendar=None if data["calendar"] == "unknown" else data["calendar"],
            provenance="human",
            evidence={
                "headers": fields,
                "intake_id": item.id,
                "extraction_proposal_id": proposal.id,
                "original_sha256": proposal.source_sha256,
                "actor_id": user.id,
            },
        )
    )
    output = BotExtractionReview(
        company_id=company, proposal_id=proposal.id, actor_id=user.id, source_file_id=source.id, reviewed=data
    )
    db.add(output)
    db.flush()
    item.source_file_id = source.id
    item.state = "imported"
    item.version += 1
    audit(
        db,
        company,
        user.id,
        "bot.extraction_reviewed",
        output.id,
        {"intake_id": item.id, "source_file_id": source.id, "session_id": session.id},
    )
    return {"review_id": output.id, "session_id": session.id, "source_file_id": source.id}
