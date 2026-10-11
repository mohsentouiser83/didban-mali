from uuid import UUID

from fastapi import APIRouter, HTTPException
from redis.exceptions import LockError, RedisError

from app.ai.assistant import SUGGESTIONS, AssistantAnswer, AssistantQuestion, answer_question
from app.ai.assistant_provider import get_assistant_planner
from app.ai.conversation import chat_question
from app.audit.service import record_audit_event
from app.companies.dependencies import CurrentCompanyAccess
from app.identity.dependencies import CsrfProtected, DbSession

router = APIRouter(prefix="/companies/{company_id}/assistant", tags=["assistant"])


@router.get("/capabilities")
async def capabilities(company_id: UUID, access: CurrentCompanyAccess) -> dict:
    del access
    return {
        "model_configured": get_assistant_planner(company_id) is not None,
        "suggestions": SUGGESTIONS,
    }


@router.post("/ask", response_model=AssistantAnswer)
async def ask(
    company_id: UUID,
    payload: AssistantQuestion,
    session: DbSession,
    access: CurrentCompanyAccess,
    csrf: CsrfProtected,
) -> AssistantAnswer:
    del csrf
    planner = get_assistant_planner(company_id)
    if planner is not None:
        try:
            answer = await chat_question(session, company_id, access.user_id, payload, planner)
        except LockError:
            raise HTTPException(
                409, "پیام قبلی در حال بررسی است؛ کمی بعد دوباره تلاش کنید."
            ) from None
        except RedisError:
            raise HTTPException(503, "حافظه گفتگو موقتاً در دسترس نیست؛ دوباره تلاش کنید.") from None
    else:
        answer = await answer_question(session, company_id, payload.question)
    record_audit_event(
        session,
        action="assistant.answered",
        entity_type="assistant_request",
        actor_id=access.user_id,
        company_id=company_id,
        entity_id=answer.request_id,
        request_id=str(answer.request_id),
        metadata={
            "intent": answer.intent,
            "mode": answer.mode,
            "status": answer.status,
            "as_of_date": answer.as_of_date.isoformat(),
            "version": "conversation-v2" if answer.conversation_id else "receivables-v1",
            "invoice_ids": [
                str(item.invoice_id) for customer in answer.priorities for item in customer.evidence
            ],
        },
    )
    await session.commit()
    return answer
