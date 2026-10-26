from __future__ import annotations
import json
import re
from uuid import UUID

from fastapi import FastAPI, Request
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse, Response
from starlette.datastructures import UploadFile
from starlette.exceptions import HTTPException

from ..application.auth import AuthService, response, user_view
from ..application.companies import CompanyService
from ..application.periods import PeriodService
from ..application.intake import IntakeService
from ..application.interpretations import InterpretationService
from ..application.financial import FinancialService
from ..application.cashflow import CashflowService
from ..application.analysis import AnalysisService
from ..application.reconciliation import ReconciliationService
from ..application.settlements import SettlementService
from ..application.forecast import ForecastService
from ..application.assistant import AssistantService
from ..application.budget import BudgetService, ModelService
from ..application.policies import PolicyService
from ..application.reports import ReportService
from ..domain.intake import DependencyUnavailable
from ..config import Settings
from ..db import Database
from ..errors import ApiError
from ..security import Security
from .contracts import DOCUMENT, validate

IMPLEMENTED = {
    "readiness",
    "csrfToken",
    "login",
    "logout",
    "currentUser",
    "acceptInvitation",
    "resetPassword",
    "listCompanies",
    "listUsers",
    "createCompany",
    "createInvitedUser",
    "issuePasswordReset",
    "reissueInvitation",
    "getCompany",
    "getCompanyAccess",
    "updateCompany",
    "listMemberships",
    "addMembership",
    "updateMembership",
    "readApprovalPermission",
    "setApprovalPermission",
    "getReport",
    "approveReport",
}

PERIOD_OPS = {
    "listPeriods",
    "createPeriod",
    "getPeriod",
    "updatePeriod",
    "deletePeriod",
}
INTAKE_OPS = {
    "createProcessingSession",
    "listProcessingSessions",
    "getProcessingSession",
    "uploadFile",
    "listSessionFiles",
    "sealProcessingSession",
    "retryProcessingSession",
    "cancelProcessingSession",
    "listProcessingIssues",
    "answerProcessingIssue",
    "getSourceFile",
    "getOperation",
    "listNotifications",
    "markNotification",
}
INTERPRETATION_OPS = {
    "startSessionInterpretation",
    "getSessionInterpretation",
    "configureSessionInterpretation",
    "listNormalizedRows",
}
FINANCIAL_OPS = {
    "startFinancialCalculation",
    "listResultManifests",
    "getResultManifest",
    "listMetricObservations",
    "getEvidence",
}
ANALYSIS_OPS = {"startBusinessAnalysis"}
CASHFLOW_OPS = {"listCashAccountBalances", "listCashDays"}
RECONCILIATION_OPS = {
    "startReconciliation",
    "listReconciliations",
    "getReconciliation",
    "listReconciliationCandidates",
    "decideReconciliation",
}
SETTLEMENT_OPS = {
    "listReceivables",
    "listPayables",
    "createAllocation",
    "listAllocations",
    "reverseAllocation",
    "listPlannedPayments",
    "createPlannedPayment",
    "getPlannedPayment",
    "revisePlannedPayment",
    "cancelPlannedPayment",
    "getSettlementWorkspace",
    "createSettlementEvent",
    "listRecurrenceProposals",
    "decideRecurrence",
}
FORECAST_OPS = {"getForecast", "createForecast", "getForecastRun", "listForecastRuns"}
ASSISTANT_OPS = {
    "askReadOnlyAssistant",
    "getAssistantAnswer",
    "listAssistantQuestions",
    "retryAssistantQuestion",
}
BUDGET_OPS = {
    "getInstallationBudget",
    "createInstallationBudget",
    "updateInstallationBudget",
    "getInstallationUsage",
    "reconcileModelUsage",
    "companyUsage",
    "listUncertainModelRequests",
}
MODEL_OPS = {"getModelStatus"}
POLICY_OPS = {
    "listPolicies",
    "createPolicyVersion",
    "getUploadPolicy",
    "listSourceFiles",
    "getSourceDeletionImpact",
    "archiveSourceFile",
    "deleteSourceFile",
    "getRetentionPolicy",
    "updateRetentionPolicy",
}
REPORT_OPS = {
    "listReports",
    "getReport",
    "approveReport",
    "generateReport",
    "createExport",
    "getExport",
    "downloadExport",
    "retryExport",
}
IMPLEMENTED.update(
    PERIOD_OPS
    | INTAKE_OPS
    | INTERPRETATION_OPS
    | FINANCIAL_OPS
    | ANALYSIS_OPS
    | CASHFLOW_OPS
    | RECONCILIATION_OPS
    | SETTLEMENT_OPS
    | FORECAST_OPS
    | ASSISTANT_OPS
    | BUDGET_OPS
    | MODEL_OPS
    | POLICY_OPS
    | REPORT_OPS
)


class Controller:
    def __init__(self, db: Database, settings: Settings):
        self.db, self.settings = db, settings
        self.security = Security(settings.secret, settings.session_seconds)
        self.auth = AuthService(db, settings, self.security)
        self.companies = CompanyService(db, self.security)
        self.periods = PeriodService(db, self.security)
        self.intake = IntakeService(db, self.security, settings)
        self.interpretations = InterpretationService(self.intake)
        self.financial = FinancialService(self.intake)
        self.domain_services = {}
        for operations, service in [
            (PERIOD_OPS, self.periods),
            (INTAKE_OPS, self.intake),
            (INTERPRETATION_OPS, self.interpretations),
            (FINANCIAL_OPS, self.financial),
            (ANALYSIS_OPS, AnalysisService(self.intake)),
            (CASHFLOW_OPS, CashflowService(self.intake)),
            (RECONCILIATION_OPS, ReconciliationService(self.intake)),
            (SETTLEMENT_OPS, SettlementService(self.intake)),
            (FORECAST_OPS, ForecastService(self.intake)),
            (ASSISTANT_OPS, AssistantService(self.intake)),
            (BUDGET_OPS, BudgetService(self.intake)),
            (MODEL_OPS, ModelService(self.intake)),
            (POLICY_OPS, PolicyService(self.intake)),
            (REPORT_OPS, ReportService(self.intake)),
        ]:
            self.domain_services.update(
                {operation: service for operation in operations}
            )

    def execute(
        self,
        operation: str,
        actor: dict | None,
        body: dict,
        ids: dict,
        key: str | None,
        expected: int | None,
        cookies: dict,
        headers: dict,
        ip: str,
        request_id: str,
        limit: int,
        cursor: str | None,
    ) -> dict:
        if operation == "readiness":
            for pool in (self.db.identity, self.db.financial):
                with pool.connection() as conn:
                    conn.execute("SELECT app.runtime_version()")
            return response({"ok": True})
        if operation == "csrfToken":
            return self.auth.csrf(actor, cookies)
        if operation == "currentUser":
            return response(user_view(actor))
        if operation == "login":
            return self.auth.login(body, key, cookies["didban_client"], ip, actor)
        if operation == "logout":
            return self.auth.logout(actor, key)
        if operation in {"acceptInvitation", "resetPassword"}:
            kind = "invitation" if operation == "acceptInvitation" else "password_reset"
            return self.auth.consume(kind, body, key, cookies["didban_client"], ip)
        if operation == "createInvitedUser":
            return self.auth.create_user(actor, body, key)
        if operation == "issuePasswordReset":
            return self.auth.password_reset_token(actor, ids["user_id"], key)
        if operation == "reissueInvitation":
            return self.auth.password_reset_token(
                actor, ids["user_id"], key, invitation=True
            )
        if operation == "listCompanies":
            return self.companies.list(actor, limit, cursor)
        if operation == "listUsers":
            return self.companies.users(actor, limit, cursor)
        if operation == "createCompany":
            return self.companies.create(actor, body, key)
        if operation in self.domain_services:
            service = self.domain_services[operation]
            return service.execute(
                operation,
                actor,
                ids.get("company_id"),
                ids,
                body,
                key,
                expected,
                request_id,
                limit,
                cursor,
            )
        return self.companies.execute(
            operation,
            actor,
            ids["company_id"],
            ids,
            body,
            key=key,
            expected=expected,
            request_id=request_id,
            limit=limit,
            cursor=cursor,
        )


def _json_pairs(pairs: list) -> dict:
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("duplicate JSON key")
        value[key] = item
    return value


def _check_text(value) -> None:
    if isinstance(value, str):
        value.encode("utf-8")
        if "\0" in value:
            raise ValueError("NUL is not a valid text field")
    elif isinstance(value, dict):
        for key, item in value.items():
            _check_text(key)
            _check_text(item)
    elif isinstance(value, list):
        for item in value:
            _check_text(item)


def install_routes(app: FastAPI, controller: Controller, settings: Settings) -> None:
    def handler_for(operation: dict):
        async def handler(request: Request):
            op = operation["operationId"]
            public = operation.get("security") == []
            actor = await run_in_threadpool(
                controller.auth.authenticate,
                request.cookies.get("didban_session"),
                required=not public,
            )
            mutating = request.method in ("POST", "PUT", "PATCH", "DELETE")
            headers = dict(request.headers)
            key, expected = None, None
            if mutating:
                origin = headers.get("origin")
                if (origin and origin != settings.public_origin) or headers.get(
                    "sec-fetch-site"
                ) == "cross-site":
                    raise ApiError(403, "origin_rejected", "درخواست معتبر نیست.")
                controller.auth.check_csrf(
                    actor,
                    request.cookies.get("didban_csrf"),
                    headers.get("x-csrf-token"),
                )
                if not controller.security.valid_csrf(
                    request.cookies.get("didban_client")
                ):
                    raise ApiError(403, "csrf_failed", "صفحه را تازه کنید.")
            for parameter in operation["parameters"]:
                if parameter["in"] == "header":
                    name = parameter["name"].lower()
                    value = headers.get(name)
                    if value is None:
                        status = 428 if name == "if-match" else 422
                        raise ApiError(
                            status,
                            "precondition_required",
                            "اطلاعات لازم درخواست موجود نیست.",
                        )
                    validate(value, parameter["schema"])
                    if name == "idempotency-key":
                        key = value
                    if name == "if-match":
                        if len(value) > 32:
                            raise ApiError(422, "invalid_version", "نسخه معتبر نیست.")
                        expected = int(value[2:-1])
            ids = {}
            for name, value in request.path_params.items():
                validate(value, {"type": "string", "format": "uuid"})
                ids[name] = str(UUID(value))
            body = {}
            upload_result = None
            if op == "uploadFile":
                if request.query_params:
                    raise ApiError(422, "invalid_query", "پارامتر درخواست معتبر نیست.")
                await run_in_threadpool(
                    controller.intake.upload_preflight,
                    actor,
                    ids["company_id"],
                    ids["session_id"],
                )
                if (
                    headers.get("content-type", "").split(";")[0].strip().lower()
                    != "multipart/form-data"
                ):
                    raise ApiError(
                        415, "multipart_required", "قالب بارگذاری معتبر نیست."
                    )
                original_receive = request.receive
                received = 0

                async def limited_receive():
                    nonlocal received
                    event = await original_receive()
                    received += len(event.get("body", b""))
                    if received > settings.max_file_bytes + 65536:
                        raise ApiError(
                            413, "file_too_large", "حجم فایل بیش از حد مجاز است."
                        )
                    return event

                bounded = Request(request.scope, limited_receive)
                try:
                    async with bounded.form(
                        max_files=1, max_fields=0, max_part_size=1024
                    ) as form:
                        if (
                            list(form.keys()) != ["file"]
                            or len(form.multi_items()) != 1
                            or not isinstance(form["file"], UploadFile)
                        ):
                            raise ApiError(422, "file_required", "یک فایل انتخاب کنید.")
                        file = form["file"]
                        prepared = await run_in_threadpool(
                            controller.intake.storage.store,
                            ids["company_id"],
                            file.filename or "",
                            file.file,
                        )
                        upload_result = await run_in_threadpool(
                            controller.intake.upload,
                            actor,
                            ids["company_id"],
                            ids["session_id"],
                            prepared,
                            key,
                            expected,
                            request.state.request_id,
                        )
                except DependencyUnavailable:
                    raise ApiError(
                        503, "storage_unavailable", "فضای فایل موقتاً در دسترس نیست."
                    ) from None
                except HTTPException:
                    raise ApiError(
                        422, "invalid_multipart", "یک فایل Excel یا CSV انتخاب کنید."
                    ) from None
            elif "requestBody" in operation:
                if (
                    headers.get("content-type", "").split(";")[0].strip().lower()
                    != "application/json"
                ):
                    raise ApiError(415, "json_required", "قالب درخواست معتبر نیست.")
                raw = bytearray()
                async for part in request.stream():
                    raw.extend(part)
                    if len(raw) > settings.max_json_bytes:
                        raise ApiError(
                            413, "request_too_large", "حجم درخواست بیش از حد مجاز است."
                        )
                try:
                    body = json.loads(
                        raw,
                        object_pairs_hook=_json_pairs,
                        parse_constant=lambda _: (_ for _ in ()).throw(ValueError()),
                    )
                    _check_text(body)
                except (ValueError, UnicodeError, RecursionError):
                    raise ApiError(
                        422, "invalid_json", "ساختار درخواست معتبر نیست."
                    ) from None
                validate(
                    body,
                    operation["requestBody"]["content"]["application/json"]["schema"],
                )
            elif mutating and headers.get("content-length") not in (None, "0"):
                raise ApiError(422, "unexpected_body", "این درخواست بدنه ندارد.")
            query = request.query_params
            allowed = {p["name"] for p in operation["parameters"] if p["in"] == "query"}
            if set(query) - allowed or len(query.multi_items()) != len(query):
                raise ApiError(422, "invalid_query", "پارامتر درخواست معتبر نیست.")
            try:
                limit = int(query.get("limit", "25"))
            except ValueError:
                raise ApiError(
                    422, "invalid_limit", "اندازه صفحه معتبر نیست."
                ) from None
            if not 1 <= limit <= 100 or len(query.get("cursor", "")) > 2048:
                raise ApiError(422, "invalid_query", "پارامتر صفحه معتبر نیست.")
            if op == "listProcessingIssues" and "status" in query:
                if query["status"] not in ("open", "resolved", "superseded"):
                    raise ApiError(422, "invalid_query", "وضعیت سؤال معتبر نیست.")
                ids["issue_status"] = query["status"]
            result = upload_result or await run_in_threadpool(
                controller.execute,
                op,
                actor,
                body,
                ids,
                key,
                expected,
                dict(request.cookies),
                headers,
                request.client.host if request.client else "unknown",
                request.state.request_id,
                limit,
                query.get("cursor"),
            )
            status = str(result["status"])
            if status not in operation["responses"]:
                raise RuntimeError("Undeclared response status")
            schema = (
                operation["responses"][status]
                .get("content", {})
                .get("application/json", {})
                .get("schema")
            )
            if schema:
                validate(result["body"], schema, response=True)
            if "content_bytes" in result:
                content = result["content_bytes"]
                media_type = result["media_type"]
                filename = result["filename"]
                if (
                    not isinstance(content, bytes)
                    or not isinstance(filename, str)
                    or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,159}", filename)
                    or media_type
                    not in operation["responses"][status].get("content", {})
                ):
                    raise RuntimeError("Invalid binary export response")
                out = Response(
                    content,
                    status_code=result["status"],
                    media_type=media_type,
                    headers={
                        "Content-Disposition": f'attachment; filename="{filename}"',
                        "Cache-Control": "private, no-store",
                        "X-Content-Type-Options": "nosniff",
                    },
                )
            else:
                out = JSONResponse(result["body"], status_code=result["status"])
            if result.get("etag") is not None:
                out.headers["ETag"] = f'"v{result["etag"]}"'
            for cookie, value in result["cookies"].items():
                if value is None:
                    out.delete_cookie(
                        cookie,
                        path="/",
                        secure=settings.cookie_secure,
                        httponly=True,
                        samesite="lax",
                    )
                else:
                    out.set_cookie(
                        cookie,
                        value,
                        max_age=settings.session_seconds,
                        path="/",
                        secure=settings.cookie_secure,
                        httponly=True,
                        samesite="lax",
                    )
            return out

        return handler

    implemented_paths = {}
    for path, methods in DOCUMENT["paths"].items():
        for method, operation in methods.items():
            if operation["operationId"] not in IMPLEMENTED:
                continue
            app.add_api_route(
                path,
                handler_for(operation),
                methods=[method.upper()],
                operation_id=operation["operationId"],
            )
            implemented_paths.setdefault(path, {})[method] = operation
    runtime_document = dict(DOCUMENT, paths=implemented_paths)
    runtime_document["info"] = DOCUMENT["info"] | {
        "description": "Implemented operations only. Private company-scoped identity, intake, financial snapshots, reconciliation, settlements, cashflow, forecasts and administration. See scoped validation reports for current test and deployment limits."
    }
    runtime_document["x-implementation-status"] = "private_financial_runtime"
    app.openapi = lambda: runtime_document
