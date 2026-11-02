"""Application lifecycle, cross-cutting HTTP behavior and router composition."""

import threading
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from .bot_logging import protect_webhook_access_logs
from .config import settings
from .db import initialize
from .errors import DomainError
from .http import error_body
from .routes import (
    accounting,
    accounting_operations,
    accounting_setup,
    auth,
    automation,
    bot_extraction,
    bot_intake,
    bot_notifications,
    bots,
    cheques,
    closing,
    collection_assistant,
    companies,
    company_group,
    consolidation,
    consolidation_approval,
    control,
    dimensions,
    document_threads,
    expense_review,
    financial_operations,
    group_matches,
    manual_groups,
    model_admin,
    modules,
    native_automation,
    native_bank_matches,
    native_controls,
    native_forecasts,
    native_invoices,
    native_reporting,
    operation_learning,
    operations,
    period_locks,
    periods,
    personnel,
    posting,
    processing,
    reconciliation,
    report_builder,
    reporting,
    scenarios,
    sources,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize()
    stop = threading.Event()
    if not settings.production:
        from .worker import run

        thread = threading.Thread(target=run, args=(stop,), daemon=True, name="didban-worker")
        thread.start()
    yield
    stop.set()


app = FastAPI(title="Didban Mali Fresh API", version="1.0.0", lifespan=lifespan)
protect_webhook_access_logs()


@app.middleware("http")
async def request_id(request: Request, call_next):
    request.state.request_id = str(uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.exception_handler(DomainError)
async def domain_error(request: Request, error: DomainError):
    return JSONResponse(
        error_body(request, error.code, error.message, error.fields), status_code=error.status
    )


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, error: RequestValidationError):
    fields = {str(err["loc"][-1]): "مقدار معتبر وارد کنید." for err in error.errors()}
    return JSONResponse(
        error_body(request, "validation_error", "اطلاعات فرم را بررسی کنید.", fields), status_code=422
    )


@app.exception_handler(IntegrityError)
async def integrity_error(request: Request, _error: IntegrityError):
    return JSONResponse(
        error_body(request, "conflicting_record", "اطلاعات تکراری یا وابسته است؛ صفحه را تازه کنید."),
        status_code=409,
    )


for router_module in (
    collection_assistant,
    operation_learning,
    manual_groups,
    native_reporting,
    native_controls,
    native_invoices,
    native_forecasts,
    native_bank_matches,
    native_automation,
    consolidation_approval,
    closing,
    posting,
    accounting_operations,
    consolidation,
    cheques,
    bot_extraction,
    expense_review,
    bot_notifications,
    period_locks,
    bot_intake,
    dimensions,
    document_threads,
    company_group,
    accounting_setup,
    group_matches,
    automation,
    control,
    report_builder,
    accounting,
    auth,
    bots,
    companies,
    periods,
    processing,
    sources,
    reporting,
    financial_operations,
    operations,
    model_admin,
    modules,
    personnel,
    scenarios,
):
    app.include_router(router_module.router)


app.include_router(reconciliation.router)
