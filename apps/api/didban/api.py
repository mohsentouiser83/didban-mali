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
    bot_extraction,
    bot_intake,
    bots,
    cheques,
    closing,
    collection_assistant,
    commercial,
    commercial_docs,
    companies,
    contracts,
    control,
    counterparty_reconciliation,
    dimensions,
    document_archive,
    document_threads,
    electronic_ledgers,
    financial_operations,
    group_matches,
    inventory,
    manual_groups,
    moadian_transmissions,
    model_admin,
    native_bank_matches,
    native_forecasts,
    native_invoices,
    native_reporting,
    numbering,
    operations,
    payroll_routes,
    period_locks,
    periods,
    personnel,
    petty_cash,
    posting,
    processing,
    project_profitability,
    reconciliation,
    report_builder,
    report_studio,
    reporting,
    scenarios,
    sources,
    treasury,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize()
    stop = threading.Event()
    if not settings.production and settings.embedded_worker:
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
    manual_groups,
    native_reporting,
    native_invoices,
    numbering,
    moadian_transmissions,
    native_forecasts,
    native_bank_matches,
    closing,
    posting,
    commercial,
    commercial_docs,
    counterparty_reconciliation,
    accounting_operations,
    inventory,
    cheques,
    bot_extraction,
    period_locks,
    bot_intake,
    dimensions,
    document_archive,
    document_threads,
    electronic_ledgers,
    accounting_setup,
    group_matches,
    control,
    report_builder,
    report_studio,
    accounting,
    auth,
    bots,
    companies,
    contracts,
    periods,
    processing,
    sources,
    reporting,
    financial_operations,
    operations,
    model_admin,
    personnel,
    petty_cash,
    project_profitability,
    payroll_routes,
    scenarios,
    treasury,
):
    app.include_router(router_module.router)


app.include_router(reconciliation.router)
