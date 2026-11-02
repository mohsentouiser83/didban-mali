"""Closing readiness for the native book never borrows imported financial findings."""

from decimal import Decimal, InvalidOperation, localcontext

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .money_type import canonical_money
from .native_reporting_models import NativeStatementApproval, NativeStatementRun
from .native_reporting_reasons import REASONS
from .posting_models import NativeJournal


def _source_signature(snapshot: dict) -> dict:
    return {
        key: snapshot.get(key)
        for key in (
            "journal_ids",
            "role_assignments",
            "opening_evidence",
            "as_of",
            "policy_version",
            "policy_provenance",
            "decision_id",
        )
    }


def _invalid_journals(journals: list[NativeJournal]) -> list[dict]:
    errors = []
    for journal in journals:
        try:
            lines = journal.snapshot["lines"]
            if not isinstance(lines, list) or not 2 <= len(lines) <= 200:
                raise ValueError("lines")
            with localcontext() as context:
                context.prec = 60
                debit = credit = Decimal(0)
                for line in lines:
                    amount_debit = Decimal(canonical_money(line["debit"]))
                    amount_credit = Decimal(canonical_money(line["credit"]))
                    if (
                        amount_debit < 0
                        or amount_credit < 0
                        or not ((amount_debit > 0) != (amount_credit > 0))
                    ):
                        raise ValueError("side")
                    debit += amount_debit
                    credit += amount_credit
                if debit != credit:
                    raise ValueError("balance")
        except (KeyError, TypeError, ValueError, InvalidOperation):
            errors.append(
                {
                    "id": journal.id,
                    "code": "native_journal_invalid",
                    "title": f"سند نهایی {journal.sequence} تراز یا ردیف معتبر ندارد.",
                }
            )
    return errors


def readiness(db: Session, company: str, period: m.Period, user: m.User) -> dict:
    from .closing_service import _active_posted
    from .native_reporting_service import build_statement

    journals = list(
        db.scalars(
            select(NativeJournal)
            .where(NativeJournal.company_id == company, NativeJournal.period_id == period.id)
            .order_by(NativeJournal.sequence)
        )
    )
    report = db.scalar(
        select(NativeStatementRun)
        .where(
            NativeStatementRun.company_id == company,
            NativeStatementRun.snapshot["period_id"].as_string() == period.id,
        )
        .order_by(NativeStatementRun.created_at.desc(), NativeStatementRun.id.desc())
        .limit(1)
    )
    errors = _invalid_journals(journals)
    warnings = []
    live = build_statement(db, company, user, period.id, period.end) if not errors else None
    if report is None:
        warnings.append(
            {
                "id": "native_report_missing",
                "code": "native_period_report_missing",
                "title": "گزارش مالی دفتر اصلی برای این دوره ذخیره نشده است.",
            }
        )
    elif report.snapshot.get("as_of") != period.end.isoformat():
        warnings.append(
            {
                "id": "native_report_cutoff",
                "code": "native_period_report_cutoff",
                "title": "گزارش مالی دفتر اصلی تا پایان دوره نیست.",
            }
        )
    if report and live and _source_signature(report.snapshot) != _source_signature(live):
        warnings.append(
            {
                "id": "native_report_stale",
                "code": "native_period_report_stale",
                "title": "گزارش مالی با اسناد، نقش حساب‌ها یا مبنای افتتاحیهٔ جاری یکسان نیست.",
            }
        )
    approvals = (
        list(
            db.scalars(
                select(NativeStatementApproval).where(
                    NativeStatementApproval.company_id == company, NativeStatementApproval.run_id == report.id
                )
            )
        )
        if report
        else []
    )
    if report and not approvals:
        warnings.append(
            {
                "id": "native_report_unapproved",
                "code": "native_period_report_unapproved",
                "title": "گزارش مالی این دوره تأیید نشده است.",
            }
        )
    if live:
        codes = sorted({code for metric in live["metrics"] for code in metric["reason_codes"]})
        for code in codes:
            warnings.append(
                {
                    "id": "native_" + code,
                    "code": code,
                    "title": REASONS.get(code, "اطلاعات مبنای گزارش مالی کامل نیست."),
                }
            )
        nominal_ids = {
            row["account_id"] for row in live["role_assignments"] if row["role"] in ("revenue", "expense")
        }
        if any(
            row["account_id"] in nominal_ids and Decimal(row["period_movement"]) != 0 for row in live["items"]
        ):
            warnings.append(
                {
                    "id": "native_nominal_unclosed",
                    "code": "native_nominal_unclosed",
                    "title": "حساب‌های درآمد یا هزینه هنوز مانده دارند.",
                }
            )
    controls = None
    if not errors:
        from .native_control_service import build

        controls = build(db, company, user, period.id)
        for finding in controls["findings"]:
            warnings.append(
                {"id": "control:" + finding["id"], "code": finding["code"], "title": finding["title"]}
            )
    return {
        "native_controls": controls,
        "errors": errors,
        "warnings": warnings,
        "manifest_id": None,
        "reporting_basis": "native_book",
        "native_statement_id": report.id if report else None,
        "native_statement_digest": report.digest if report else None,
        "native_report_approval_ids": [item.id for item in approvals],
        "native_journal_ids": [item.id for item in journals],
        "native_source_signature": _source_signature(live) if live else None,
        "closing_journal_present": _active_posted(db, company, "closing", period.id),
    }
