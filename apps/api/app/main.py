from collections.abc import Awaitable, Callable
from uuid import uuid4

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.ai.routes import router as ai_router
from app.analysis.routes import router as analysis_router
from app.api.routes.health import router as health_router
from app.companies.routes import router as companies_router
from app.core.config import settings
from app.core.logging import install_log_redaction
from app.dashboard.routes import router as dashboard_router
from app.financial.routes import router as financial_router
from app.findings.routes import router as findings_router
from app.identity.routes import router as identity_router
from app.imports.routes import router as imports_router
from app.readiness.routes import router as readiness_router
from app.reconciliation.routes import router as reconciliation_router
from app.reports.routes import router as reports_router
from app.reviews.routes import router as reviews_router

install_log_redaction()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="زیرساخت API پلتفرم دیدبان مالی",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Idempotency-Key", "X-CSRF-Token", "X-Request-ID"],
)
app.include_router(health_router, prefix=settings.api_prefix)
app.include_router(identity_router, prefix=settings.api_prefix)
app.include_router(companies_router, prefix=settings.api_prefix)
app.include_router(imports_router, prefix=settings.api_prefix)
app.include_router(financial_router, prefix=settings.api_prefix)
app.include_router(analysis_router, prefix=settings.api_prefix)
app.include_router(reconciliation_router, prefix=settings.api_prefix)
app.include_router(findings_router, prefix=settings.api_prefix)
app.include_router(dashboard_router, prefix=settings.api_prefix)
app.include_router(reviews_router, prefix=settings.api_prefix)
app.include_router(reports_router, prefix=settings.api_prefix)
app.include_router(ai_router, prefix=settings.api_prefix)
app.include_router(readiness_router, prefix=settings.api_prefix)


@app.middleware("http")
async def request_id_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    request_id = request.headers.get("X-Request-ID") or str(uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    return response


@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    return {"service": settings.app_name, "docs": "/docs"}
