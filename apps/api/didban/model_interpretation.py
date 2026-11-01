"""Worker bridge: model proposals become mappings only after independent controls."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal, localcontext
from hashlib import sha256

from sqlalchemy import select

from .config import settings
from .db import transaction
from .errors import DomainError
from .ingestion import FAMILY_LABELS, REQUIRED, Sheet, interpret, normalized
from .model_gateway import ModelGateway, configured_gateway, validate_proposal
from .models import (
    Interpretation,
    Job,
    JournalLine,
    ModelRequest,
    Notification,
    ProcessingSession,
    SourceFile,
    SourceRow,
    User,
    now,
)
from .normalization import normalize
from .security import membership
from .workflow import audit, issue, latest_interpretations, open_issues, question_code


def _current(db, company_id: str, job_id: str, fence: int):
    job = db.scalar(select(Job).where(Job.company_id == company_id, Job.id == job_id))
    if not job or job.fence != fence or job.state != "running" or not job.leased_until or job.leased_until.replace(tzinfo=timezone.utc) <= now():
        return None, None
    session = db.get(ProcessingSession, job.session_id)
    if not session or session.state not in ("sealed", "processing", "waiting_dependency") or session.result_id:
        return None, None
    actor = db.get(User, session.actor_id)
    if not actor or not actor.active:
        return None, None
    try:
        membership(db, company_id, actor, "write")
    except DomainError:
        return None, None
    return job, session


def _park(company_id: str, job_id: str, fence: int, result: dict) -> None:
    with transaction(company_id) as db:
        job, session = _current(db, company_id, job_id, fence)
        if not job or open_issues(db, session):
            return
        code = result.get("reason_code") or "model_unavailable"
        if session.error_code != code:
            db.add(Notification(company_id=company_id, title="پردازش در انتظار بودجه مدل است." if code in ("budget_exhausted", "model_budget_not_configured") else "تفسیر فایل در انتظار سرویس مدل است.", href=f"/uploads/{session.id}"))
        session.state, session.error_code = "waiting_dependency", code
        session.error_message = "بودجه یا تعرفه مدل را بررسی کنید." if code in ("budget_exhausted", "model_budget_not_configured") else "سرویس تفسیر فایل آماده نیست."
        if result.get("state") == "failed":
            session.state, job.state = "failed", "failed"
        elif result.get("state") == "waiting_reconciliation":
            job.state = "waiting"
            session.error_message = "مصرف درخواست مدل نیازمند بررسی مدیر نصب است."
        else:
            job.state = "pending"
            stamp = result.get("next_attempt_at")
            job.leased_until = datetime.fromisoformat(stamp).replace(tzinfo=timezone.utc) if stamp else now() + timedelta(seconds=30)


def _family_control(family: str, source: SourceFile, interpretation: Interpretation, records: list) -> bool:
    label = normalized(source.name + " " + interpretation.sheet)
    if family == "ledger":
        if not records or not all(isinstance(item, JournalLine) for item in records):
            return False
        balances = {}
        with localcontext() as context:
            context.prec = 50
            for line in records:
                key = (line.entry_id, line.date)
                balances[key] = balances.get(key, Decimal(0)) + Decimal(line.debit) - Decimal(line.credit)
        return all(value == 0 for value in balances.values())
    if family == "bank":
        labelled = any(word in label for word in ("bank", "بانک", "گردش"))
        return bool(records) and (labelled or any(item.balance is not None for item in records))
    if family in ("sales", "purchases", "moadian_sales", "moadian_purchases"):
        direction = "purchases" if family.endswith("purchases") else "sales"
        words = ("خرید", "purchase") if direction == "purchases" else ("فروش", "sales")
        if not any(word in label for word in words):
            return False
        if family.startswith("moadian_"):
            return bool(records) and all(item.tax_id and item.state == "original" for item in records)
        return bool(records)
    # Direction and confirmed values are explicitly validated by normalization.
    return family in ("settlements", "plans") and bool(records)


def _candidate_interpretation(source: SourceFile, current: Interpretation, rows: list[SourceRow], proposal: dict, request_id: str, session: ProcessingSession) -> tuple[Interpretation, dict]:
    mapping = {item["field"]: item["header"] for item in proposal["mapping"]}
    projected = Sheet(current.sheet, list(mapping), [(row.row_number, {key: row.values.get(header, "") for key, header in mapping.items()}) for row in rows])
    inferred = interpret(projected, source.name)
    # Values in source columns supply unit/calendar evidence. Model assertions do not.
    unit = current.unit if current.unit in ("IRR", "TOMAN", "per_row", "unsupported") else inferred["unit"]
    calendar = current.calendar or inferred["calendar"]
    candidate = Interpretation(company_id=source.company_id, file_id=source.id, sheet=current.sheet, family=proposal["family"],
                               mapping=mapping, unit=unit, calendar=calendar, provenance="model_proposal",
                               evidence={**current.evidence, "model_request_id": request_id, "model": "gpt-5.6-luna",
                                         "policy_version": session.policy_version, "source_interpretation_id": current.id})
    controls = {"all_rows_valid": False, "source_family_evidence": False,
                "unit_from_source": unit in ("IRR", "TOMAN", "per_row"), "calendar_from_source": bool(calendar), "row_count": len(rows)}
    if candidate.family not in REQUIRED or not set(REQUIRED.get(candidate.family, [])) <= set(mapping) or not unit or unit == "unsupported" or not calendar:
        return candidate, controls
    try:
        records = [normalize(row, candidate, session.id) for row in rows]
        controls["all_rows_valid"] = True
        controls["source_family_evidence"] = _family_control(candidate.family, source, candidate, [item for item in records if item is not None])
    except DomainError as error:
        controls["reason_code"] = error.code
    return candidate, controls


async def prepare_model_interpretations(company_id: str, job_id: str, fence: int, gateway: ModelGateway | None = None) -> bool:
    """Return True when the deterministic workflow may run, False when parked."""
    if not settings.model_enabled and gateway is None:
        return True
    supplied_gateway = gateway is not None
    gateway = gateway or configured_gateway()
    while True:
        with transaction(company_id) as db:
            job, session = _current(db, company_id, job_id, fence)
            if not job or open_issues(db, session):
                return True  # The normal workflow handles terminal state/barrier.
            # Ask for the financial period before spending on interpretation.
            if not session.period_id:
                return True
            candidate = None
            files = db.scalars(select(SourceFile).where(SourceFile.company_id == company_id, SourceFile.session_id == session.id, SourceFile.state != "excluded_overlap").order_by(SourceFile.created_at, SourceFile.id))
            for source in files:
                for interpretation in latest_interpretations(db, company_id, source.id):
                    if interpretation.family in REQUIRED and set(REQUIRED[interpretation.family]) <= set(interpretation.mapping):
                        continue
                    candidate = (source, interpretation)
                    break
                if candidate:
                    break
            if not candidate:
                return True
            source, current = candidate
            rows = list(db.scalars(select(SourceRow).where(SourceRow.company_id == company_id, SourceRow.file_id == source.id, SourceRow.sheet == current.sheet).order_by(SourceRow.row_number, SourceRow.id)))
            prefix = f"interpret:{job.id}:{source.id}:{sha256(current.sheet.encode()).hexdigest()[:12]}:"
            prior = db.scalars(select(ModelRequest).where(ModelRequest.company_id == company_id, ModelRequest.job_id == job.id, ModelRequest.request_key.startswith(prefix)))
            attempts = sum(request.attempts for request in prior)
            if attempts >= 3:
                parked = {"state": "failed", "reason_code": "model_retry_exhausted"}
                evidence = None
            else:
                parked = None
                if not supplied_gateway:
                    from .model_admin_service import model_status
                    status = model_status(db, company_id)
                    if not status["configured"]:
                        parked = {"state": "waiting_dependency", "reason_code": "model_unconfigured" if not status["key_configured"] else "model_budget_not_configured"}
                evidence = {"headers": current.evidence.get("headers", list(rows[0].values) if rows else []),
                            "source_refs": [row.id for row in rows[:3]], "sample": [row.values for row in rows[:3]],
                            "filename": source.name, "sheet": current.sheet, "known_unit": current.unit, "known_calendar": current.calendar}
            actor_id, session_id, version = session.actor_id, session.id, session.version
            current_id, source_id = current.id, source.id
            job.leased_until = now() + timedelta(minutes=2)
        if parked:
            _park(company_id, job_id, fence, parked)
            return False
        result = await gateway.invoke(company_id=company_id, actor_id=actor_id, purpose="propose_interpretation", evidence=evidence,
                                      request_key=prefix + f"f{fence}", session_id=session_id, session_version=version, job_id=job_id, fence=fence)
        if result["state"] in ("waiting_dependency", "waiting_reconciliation", "failed", "dispatched"):
            _park(company_id, job_id, fence, result)
            return False
        with transaction(company_id) as db:
            job, session = _current(db, company_id, job_id, fence)
            if not job or session.version != version or open_issues(db, session):
                return False
            source = db.get(SourceFile, source_id)
            current = next(item for item in latest_interpretations(db, company_id, source_id) if item.sheet == current.sheet)
            if current.id != current_id:
                continue
            rows = list(db.scalars(select(SourceRow).where(SourceRow.company_id == company_id, SourceRow.file_id == source_id, SourceRow.sheet == current.sheet).order_by(SourceRow.row_number, SourceRow.id)))
            if result["state"] == "completed":
                try:
                    proposal = validate_proposal("propose_interpretation", result["proposal"], evidence)
                    interpreted, controls = _candidate_interpretation(source, current, rows, proposal, result["request_id"], session)
                except DomainError:
                    interpreted, controls = None, {"all_rows_valid": False, "source_family_evidence": False}
                if interpreted:
                    automatic = all(controls.get(key) is True for key in ("all_rows_valid", "source_family_evidence", "unit_from_source", "calendar_from_source"))
                    interpreted.provenance = "validated_automatic" if automatic else "model_proposal"
                    interpreted.evidence = {**interpreted.evidence, "controls": controls}
                    db.add(interpreted)
                    audit(db, company_id, None, "interpretation.model_validated" if automatic else "interpretation.model_proposed", source_id,
                          {"model_request_id": result["request_id"], "sheet": current.sheet, "controls": controls, "policy_version": session.policy_version})
                    if automatic:
                        session.version += 1
                        session.error_code, session.error_message = None, None
                        continue
                    question_evidence = {**interpreted.evidence, "family": interpreted.family, "mapping": interpreted.mapping}
                else:
                    question_evidence = dict(current.evidence)
            else:
                question_evidence = dict(current.evidence)
            question_evidence.update(filename=source.name, sheet=current.sheet, required_by_family=REQUIRED)
            issue(db, session, question_code("mapping", current.sheet), "نوع و ستون‌های این شیت را بررسی کنید.",
                  [{"value": key, "label": label} for key, label in FAMILY_LABELS.items()], question_evidence, source_id)
            job.state = "done"
            return False
