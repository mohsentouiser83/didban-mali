"""Operations HTTP routes."""

from fastapi import APIRouter, Request
from sqlalchemy import func, or_

from .. import models as m
from .. import schemas as s
from .. import services as service
from ..errors import require
from ..http import C, access, expected, mutate, paginate
from ..model_admin_service import company_usage
from ..model_gateway import exact, usd
from ..workflow import (
    audit,
    serialize_fact,
)

router = APIRouter()


@router.get(C + "/assistant/voice-status")
def voice_status(company_id: str, request: Request):
    from ..voice_service import voice_available

    with access(request, company_id):
        return {"enabled": voice_available()}


@router.post(
    C + "/assistant/transcriptions",
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "multipart/form-data": {
                    "schema": {
                        "type": "object",
                        "required": ["file"],
                        "properties": {"file": {"type": "string", "format": "binary"}},
                    }
                }
            },
        }
    },
)
async def voice_transcription(company_id: str, request: Request):
    from starlette.datastructures import UploadFile
    from starlette.formparsers import MultiPartException, MultiPartParser

    from ..config import settings
    from ..voice_service import transcribe, voice_available

    with access(request, company_id) as (_db, user, _member):
        actor_id = user.id
    require(voice_available(), "voice_unconfigured", "تبدیل ویس در سرور فعال نشده است.", 503)
    # Authenticate before parsing multipart data; reject declared oversize bodies
    # before a temporary upload can be spooled. Bound the file read separately.
    length = request.headers.get("content-length")
    if length is not None:
        require(
            length.isdecimal() and int(length) <= settings.voice_max_bytes + 16384,
            "voice_size_invalid",
            "ویس باید کمتر از ۱۰ مگابایت باشد.",
            413,
        )

    async def bounded_stream():
        received = 0
        async for chunk in request.stream():
            received += len(chunk)
            if received > settings.voice_max_bytes + 16384:
                # MultiPartParser closes temporary files on this exception.
                raise MultiPartException("voice_upload_limit")
            yield chunk

    require(
        request.headers.get("content-type", "").startswith("multipart/form-data"),
        "voice_file_required",
        "فایل ویس لازم است.",
    )
    try:
        form = await MultiPartParser(request.headers, bounded_stream(), max_files=1, max_fields=0).parse()
    except MultiPartException as error:
        from ..errors import DomainError

        raise DomainError(
            "voice_upload_invalid", "فایل ویس معتبر و کمتر از ۱۰ مگابایت لازم است.", 413
        ) from error
    try:
        file = form.get("file")
        require(isinstance(file, UploadFile), "voice_file_required", "فایل ویس لازم است.")
        content = await file.read(settings.voice_max_bytes + 1)
        result = await transcribe(content, file.content_type or "")
    finally:
        await form.close()
    # Discard output if membership/session was revoked during the provider call.
    with access(request, company_id) as (_db, current_user, _member):
        require(current_user.id == actor_id, "session_changed", "نشست تغییر کرده؛ دوباره وارد شوید.", 401)
    return result


@router.get(C + "/usage")
def usage(company_id: str, request: Request):
    with access(request, company_id) as (db, _user, _member):
        return company_usage(db, company_id, _user)


@router.post(C + "/budget-policy")
def budget(company_id: str, data: s.BudgetInput, request: Request):
    def apply(db, user):
        require(user.installation_admin, "permission_denied", "تنظیم بودجه با مدیر نصب است.", 403)
        value = exact(usd(data.cap))
        policy = m.BudgetPolicy(
            company_id=company_id, actor_id=user.id, cap=value, period=data.period, currency="USD"
        )
        db.add(policy)
        db.flush()
        audit(
            db,
            company_id,
            user.id,
            "budget.policy_created",
            policy.id,
            {"cap": value, "currency": "USD", "period": data.period},
        )
        return serialize_fact(policy)

    return mutate(request, company_id, data.model_dump(), "write", apply)


@router.post(C + "/assistant/questions")
async def assistant(company_id: str, data: s.AssistantInput, request: Request):
    from ..assistant_service import respond
    from ..native_assistant_service import select_context

    key = request.headers.get("idempotency-key", "")
    require(1 <= len(key) <= 128, "idempotency_key_required", "شناسه درخواست لازم است.", 428)
    with access(request, company_id) as (db, user, _member):
        selected = select_context(
            db,
            company_id,
            user,
            context_type=data.context_type,
            manifest_id=data.manifest_id,
            native_statement_id=data.native_statement_id,
        )
        actor_id = user.id
        from ..analytical_orchestrator import orchestrate_analysis

        analytical_response = orchestrate_analysis(
            db,
            company_id,
            user,
            data.question,
            selected["frozen"],
            history=[message.model_dump() for message in data.history],
        )

    if analytical_response is not None:
        identity = {
            name: selected["descriptor"][name] for name in ("context_type", "manifest_id", "native_statement_id")
        }
        return analytical_response | identity

    # Any external model call is outside the database transaction.
    response = await respond(
        manifest=selected["frozen"],
        question=data.question,
        company_id=company_id,
        actor_id=actor_id,
        request_key=key,
        history=[message.model_dump() for message in data.history],
        missing_answer=selected["missing_answer"],
    )
    with access(request, company_id) as (_db, current_user, _member):
        require(current_user.id == actor_id, "session_changed", "نشست تغییر کرده؛ دوباره وارد شوید.", 401)
    identity = {
        name: selected["descriptor"][name] for name in ("context_type", "manifest_id", "native_statement_id")
    }
    return response | identity


@router.get(C + "/assistant/context")
def assistant_context(company_id: str, request: Request):
    from ..native_assistant_service import default_context_descriptor

    with access(request, company_id) as (db, user, _member):
        return default_context_descriptor(db, company_id, user)


@router.patch(C + "/notifications/{notification_id}")
def notification_update(company_id: str, notification_id: str, data: s.NotificationInput, request: Request):
    def apply(db, _user):
        item = service.get_entity(db, m.Notification, company_id, notification_id)
        service.check_version(item, expected(request))
        item.read, item.version = data.read, item.version + 1
        return serialize_fact(item)

    return mutate(request, company_id, data.model_dump(), "read", apply)


def resource_endpoint(cls, active_only=False):
    def endpoint(
        company_id: str,
        request: Request,
        limit: int = 50,
        cursor: str | None = None,
        direction: str | None = None,
        q: str | None = None,
    ):
        with access(request, company_id) as (db, _user, _member):
            filters = []
            if direction and hasattr(cls, "direction"):
                filters.append(cls.direction == direction)
            if q:
                require(len(q) <= 100, "query_too_long", "جستجو باید کوتاه‌تر از ۱۰۰ نویسه باشد.")
                columns = [
                    getattr(cls, field)
                    for field in ("reference", "account", "party_id", "tax_id")
                    if hasattr(cls, field)
                ]
                if columns:
                    filters.append(
                        or_(
                            *(
                                func.lower(column).contains(q.strip().lower(), autoescape=True)
                                for column in columns
                            )
                        )
                    )
            if active_only:
                selected = service.active_rows(db, company_id)
                filters.append(cls.source_row_id.in_(selected))

            def transform(item):
                value = serialize_fact(item)
                if cls is m.Allocation:
                    bank = service.get_entity(db, m.BankMovement, company_id, item.bank_id)
                    invoice = service.get_entity(db, m.Invoice, company_id, item.invoice_id)
                    value.update(bank_reference=bank.reference, invoice_reference=invoice.reference)
                return value

            return paginate(db, cls, company_id, limit, cursor, filters, transform=transform)

    return endpoint


for path, cls, active in [
    ("invoices", m.Invoice, True),
    ("bank-movements", m.BankMovement, True),
    ("settlements", m.Settlement, True),
    ("allocations", m.Allocation, False),
    ("notifications", m.Notification, False),
    ("audit-events", m.AuditEvent, False),
]:
    router.add_api_route(
        C + "/" + path, resource_endpoint(cls, active), methods=["GET"], name="list_" + path.replace("-", "_")
    )
