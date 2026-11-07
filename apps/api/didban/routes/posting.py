"""Thin adapters for exact human confirmations and native-book reads."""

from datetime import date

from fastapi import APIRouter, Request

from .. import posting_schemas as s
from .. import posting_service as service
from ..http import C, access, expected, mutate, paginate
from ..posting_models import NativeJournal
from ..services import get_entity
from ..workflow import serialize_fact

router = APIRouter()
A = C + "/accounting"


@router.get(A + "/drafts/{draft_id}/posting-preview")
def preview(company_id: str, draft_id: str, request: Request):
    with access(request, company_id) as (db, user, _member):
        return service.preview(db, company_id, user, draft_id)


@router.post(A + "/postings", status_code=201)
def post(company_id: str, data: s.PostingBatch, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "read",
        lambda db, user: service.post_batch(db, company_id, user, [item.model_dump() for item in data.items]),
    )


@router.post(A + "/drafts/{draft_id}/discard")
def discard(company_id: str, draft_id: str, data: s.DiscardInput, request: Request):
    version = expected(request)
    return mutate(
        request,
        company_id,
        data.model_dump() | {"expected_version": version},
        "read",
        lambda db, user: service.discard_draft(db, company_id, user, draft_id, data.reason, version),
    )


@router.get(A + "/journals")
def journals(
    company_id: str,
    request: Request,
    limit: int = 25,
    cursor: str | None = None,
    period_id: str | None = None,
    draft_id: str | None = None,
):
    with access(request, company_id) as (db, _user, _member):
        filters = []
        if draft_id:
            filters.append(NativeJournal.draft_id == draft_id)
        if period_id:
            from ..models import Period

            get_entity(db, Period, company_id, period_id)
            filters.append(NativeJournal.period_id == period_id)
        return paginate(db, NativeJournal, company_id, limit, cursor, filters)


@router.get(A + "/journals/{journal_id}")
def journal(company_id: str, journal_id: str, request: Request):
    with access(request, company_id) as (db, _user, _member):
        return serialize_fact(get_entity(db, NativeJournal, company_id, journal_id))


@router.post(A + "/journals/{journal_id}/reversal-draft", status_code=201)
def reversal(company_id: str, journal_id: str, data: s.ReversalInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "read",
        lambda db, user: service.create_reversal(db, company_id, user, journal_id, data.model_dump()),
    )


@router.post(A + "/journals/{journal_id}/replacement-draft", status_code=201)
def replacement(company_id: str, journal_id: str, data: s.ReplacementInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "read",
        lambda db, user: service.create_replacement(db, company_id, user, journal_id, data.model_dump()),
    )


@router.get(A + "/trial-balance")
def trial_balance(company_id: str, period_id: str, request: Request, as_of: date | None = None):
    with access(request, company_id) as (db, user, _member):
        return service.trial_balance(db, company_id, user, period_id, as_of)


@router.post(A + "/trial-balance/runs", status_code=201)
def save_report(company_id: str, data: s.NativeReportInput, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "write",
        lambda db, user: service.save_report(db, company_id, user, data.period_id, data.as_of),
    )


@router.get(A + "/trial-balance/runs")
def report_runs(company_id: str, request: Request, limit: int = 25, cursor: str | None = None):
    from ..posting_models import NativeBookReportRun

    def summary(row):
        value = serialize_fact(row)
        value["snapshot"] = {
            key: row.snapshot[key] for key in ("period_id", "as_of", "title") if key in row.snapshot
        }
        return value

    with access(request, company_id) as (db, _user, _member):
        return paginate(db, NativeBookReportRun, company_id, limit, cursor, transform=summary)


@router.get(A + "/trial-balance/runs/{run_id}")
def report_run(company_id: str, run_id: str, request: Request):
    from ..posting_models import NativeBookReportRun

    with access(request, company_id) as (db, _user, _member):
        return serialize_fact(get_entity(db, NativeBookReportRun, company_id, run_id))


@router.get(A + "/trial-balance/runs/{run_id}/export")
def export(company_id: str, run_id: str, request: Request, format: str = "pdf"):
    from fastapi import Response

    from ..errors import require
    from ..posting_exports import pdf_run, xlsx_run
    from ..posting_models import NativeBookReportRun
    from ..workflow import audit

    require(format in ("pdf", "xlsx"), "export_format_invalid", "قالب خروجی معتبر نیست.")
    with access(request, company_id) as (db, user, _member):
        run = serialize_fact(get_entity(db, NativeBookReportRun, company_id, run_id))
        audit(
            db,
            company_id,
            user.id,
            "accounting.native_report_downloaded",
            run_id,
            {"format": format, "digest": run["digest"]},
        )
    content = pdf_run(run) if format == "pdf" else xlsx_run(run)
    return Response(
        content,
        media_type="application/pdf"
        if format == "pdf"
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="didban-native-book-{run_id}.{format}"'},
    )
