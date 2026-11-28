"""Restricted, synthetic-data deployment of the existing FastAPI application."""

import os
import re
from pathlib import Path

from fastapi import Request
from fastapi.responses import JSONResponse

os.environ["DIDBAN_PRODUCTION"] = "true"
os.environ["DIDBAN_EMBEDDED_WORKER"] = "false"
os.environ["DIDBAN_BOTS_ENABLED"] = "false"
os.environ["DIDBAN_MODEL_ENABLED"] = "false"
os.environ["DIDBAN_STORAGE"] = "/tmp/didban-demo-files"
os.environ["DIDBAN_FONTS"] = str(Path(__file__).resolve().parent / "fonts")
if not os.environ.get("DIDBAN_DATABASE_URL") or not os.environ.get("DIDBAN_WEB_ORIGIN"):
    raise RuntimeError("Demo database and web origin must be configured")

from didban.api import app
from didban.http import error_body

PROFORMA_COLLECTION = re.compile(r"/api/v1/companies/[^/]+/commercial/proformas/?")
PROFORMA_ITEM = re.compile(r"/api/v1/companies/[^/]+/commercial/proformas/[^/]+/?")
SESSION_ACTIONS = {"/api/v1/auth/login", "/api/v1/auth/logout"}


@app.middleware("http")
async def demo_actions(request: Request, call_next):
    path = request.url.path
    allowed = (
        request.method in {"GET", "HEAD", "OPTIONS"}
        or request.method == "POST"
        and (path.rstrip("/") in SESSION_ACTIONS or PROFORMA_COLLECTION.fullmatch(path))
        or request.method == "PATCH"
        and PROFORMA_ITEM.fullmatch(path)
    )
    if not allowed:
        return JSONResponse(
            error_body(
                request,
                "demo_action_unavailable",
                "این عملیات در نسخهٔ دمو در دسترس نیست.",
            ),
            status_code=403,
        )
    return await call_next(request)
