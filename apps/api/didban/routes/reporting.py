"""Reporting HTTP routes."""

from hashlib import sha256
from typing import Literal

from fastapi import APIRouter, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import Response
from sqlalchemy import select

from .. import models as m
from .. import schemas as s
from .. import services as service
from ..errors import require
from ..http import C, access, mutate, paginate
from ..workflow import (
    audit,
    serialize_fact,
)

router = APIRouter()


@router.get(C + "/results/latest", responses={204: {"description": "No result exists when allow_missing is true"}})
def latest_result(
    company_id: str,
    request: Request,
    period_id: str | None = None,
    view: Literal["full", "summary", "invoices", "moadian", "forecast"] = "full",
    allow_missing: bool = False,
):
    with access(request, company_id) as (db, _user, _member):
        query = select(m.ResultManifest).where(m.ResultManifest.company_id == company_id)
        if period_id:
            query = query.where(m.ResultManifest.period_id == period_id)
        manifest = db.scalar(
            query.order_by(m.ResultManifest.created_at.desc(), m.ResultManifest.id.desc()).limit(1)
        )
        if manifest is None and allow_missing:
            return Response(status_code=204)
        require(manifest is not None, "no_result", "هنوز نتیجه‌ای برای این دوره تولید نشده است.", 404)
        return project_manifest(manifest, view)


def project_manifest(manifest: m.ResultManifest, view: str) -> dict:
    original = serialize_fact(manifest)
    if view == "full":
        return original
    detail_keys = {
        "bank_balances",
        "cash_movements",
        "cash_movement_status",
        "daily_cash",
        "debt_components",
        "as_of_date",
        "period",
        "coverage",
    }
    if view in ("invoices", "moadian", "forecast"):
        detail_keys.add(view)
    details = {key: value for key, value in manifest.details.items() if key in detail_keys}
    details["bank_balances"] = [
        {key: value for key, value in row.items() if key != "evidence_refs"}
        | {"evidence_count": len(row.get("evidence_refs", []))}
        for row in details.get("bank_balances", [])
    ]
    metrics = [
        {
            **metric,
            "evidence_refs": metric.get("evidence_refs", [])[:10],
            "evidence_count": len(metric.get("evidence_refs", [])),
        }
        for metric in manifest.metrics
    ]
    selection = {
        key: manifest.selection.get(key)
        for key in ("period", "coverage", "policy_version", "parent_id", "comparison_manifest_id")
    }
    selection.update(
        row_count=len(manifest.selection.get("row_ids", [])),
        file_count=len(manifest.selection.get("files", [])),
    )
    return original | {"metrics": metrics, "details": details, "selection": selection}


@router.get(C + "/results/{manifest_id}")
def result_detail(company_id: str, manifest_id: str, request: Request):
    with access(request, company_id) as (db, _user, _member):
        return serialize_fact(service.get_entity(db, m.ResultManifest, company_id, manifest_id))


@router.get(C + "/results/{manifest_id}/metrics")
def result_metrics(company_id: str, manifest_id: str, request: Request):
    with access(request, company_id) as (db, _user, _member):
        return {"items": service.get_entity(db, m.ResultManifest, company_id, manifest_id).metrics}


@router.get(C + "/reports")
def reports(company_id: str, request: Request, limit: int = 50, cursor: str | None = None):
    with access(request, company_id) as (db, _user, _member):

        def transform(report):
            approvals = db.scalars(
                select(m.ReportApproval).where(
                    m.ReportApproval.company_id == company_id, m.ReportApproval.report_id == report.id
                )
            )
            return serialize_fact(report) | {
                "approvals": [serialize_fact(v) for v in approvals],
                "label": "تولیدشده سامانه",
            }

        return paginate(db, m.Report, company_id, limit, cursor, transform=transform)


@router.get(C + "/reports/{report_id}")
def report_detail(company_id: str, report_id: str, request: Request):
    with access(request, company_id) as (db, _user, _member):
        report = service.get_entity(db, m.Report, company_id, report_id)
        manifest = service.get_entity(db, m.ResultManifest, company_id, report.manifest_id)
        approvals = db.scalars(
            select(m.ReportApproval).where(
                m.ReportApproval.company_id == company_id, m.ReportApproval.report_id == report_id
            )
        )
        return serialize_fact(report) | {
            "manifest": serialize_fact(manifest),
            "approvals": [serialize_fact(v) for v in approvals],
        }


@router.post(C + "/reports/{report_id}/approvals", status_code=201)
def approve(company_id: str, report_id: str, data: s.ExpectedVersion, request: Request):
    return mutate(
        request,
        company_id,
        data.model_dump(),
        "approve",
        lambda db, user: service.approve_report(db, company_id, user, report_id, data.expected_version),
    )


@router.get(C + "/reports/{report_id}/export")
def report_export(company_id: str, report_id: str, request: Request, format: str = "pdf"):
    from ..exports import pdf_report, xlsx_report

    require(format in ("pdf", "xlsx"), "invalid_export_format", "قالب خروجی معتبر نیست.")
    with access(request, company_id) as (db, user, _member):
        report = service.get_entity(db, m.Report, company_id, report_id)
        manifest = service.get_entity(db, m.ResultManifest, company_id, report.manifest_id)
        report_data, manifest_data = (
            jsonable_encoder(serialize_fact(report)),
            jsonable_encoder(serialize_fact(manifest)),
        )
        report_data["approvals"] = [
            jsonable_encoder(serialize_fact(a))
            for a in db.scalars(
                select(m.ReportApproval).where(
                    m.ReportApproval.company_id == company_id, m.ReportApproval.report_id == report_id
                )
            )
        ]
        manifest_data["period"] = manifest.selection.get("period", {})
        company_name = db.get(m.Company, company_id).name
        audit(
            db,
            company_id,
            user.id,
            "report.downloaded",
            report_id,
            {"format": format, "manifest_id": manifest.id},
        )
    content = (
        pdf_report(manifest_data, report_data, company_name)
        if format == "pdf"
        else xlsx_report(manifest_data, report_data, company_name)
    )
    media = (
        "application/pdf"
        if format == "pdf"
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    return Response(
        content,
        media_type=media,
        headers={
            "Content-Disposition": f'attachment; filename="didban-{report_id}.{format}"',
            "ETag": sha256(content).hexdigest(),
        },
    )


@router.get(C + "/findings")
def findings(
    company_id: str,
    request: Request,
    limit: int = 50,
    cursor: str | None = None,
    manifest_id: str | None = None,
):
    with access(request, company_id) as (db, _user, _member):
        if not manifest_id:
            manifest_id = db.scalar(
                select(m.ResultManifest.id)
                .where(m.ResultManifest.company_id == company_id)
                .order_by(m.ResultManifest.created_at.desc())
                .limit(1)
            )
        return paginate(db, m.Finding, company_id, limit, cursor, [m.Finding.manifest_id == manifest_id])


@router.get(C + "/findings/{finding_id}")
def finding_detail(company_id: str, finding_id: str, request: Request):
    with access(request, company_id) as (db, _user, _member):
        return serialize_fact(service.get_entity(db, m.Finding, company_id, finding_id))


@router.post(C + "/findings/{finding_id}/decisions")
def finding_decision(company_id: str, finding_id: str, data: s.DecisionInput, request: Request):
    def apply(db, user):
        finding = service.get_entity(db, m.Finding, company_id, finding_id)
        service.check_version(finding, data.expected_version)
        finding.state, finding.decision, finding.version = (
            data.decision,
            {"actor_id": user.id, "reason": data.reason, "time": m.now().isoformat()},
            finding.version + 1,
        )
        audit(db, company_id, user.id, "finding.decided", finding_id, data.model_dump())
        return serialize_fact(finding)

    return mutate(request, company_id, data.model_dump(), "write", apply)
