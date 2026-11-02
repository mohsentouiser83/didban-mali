"""Evidence-backed account proposals from exact, approved company-local operations."""

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_models import Account, Draft
from .accounting_service import validate_lines
from .errors import DomainError, require
from .native_reporting_models import NativeAccountRole
from .operation_learning_models import (
    OperationLearningCorrection,
    OperationLearningEvent,
    OperationLearningPattern,
)
from .operation_models import OperationDraft
from .operation_service import LABELS, POLICY, build
from .posting_models import NativeJournal
from .security import membership
from .services import check_version, get_entity
from .workflow import audit

# Payroll must remain in the personnel workspace. Endorsement has two parties;
# the original-customer-only lookup must not learn the creditor's account choice.
SUPPORTED_KINDS = frozenset(LABELS) - {"payroll", "payroll_payment", "cheque_endorsed"}
LINE_KEYS = ("account_id", "party_id", "debit", "credit", "original_debit", "original_credit")
ACCOUNT_ROLES = {
    "trade_receivable": "trade_receivable",
    "trade_payable": "trade_payable",
    "service_revenue": "revenue",
    "service_expense": "expense",
    "bank_a": "bank",
    "bank_b": "bank",
    "bank_fee_expense": "expense",
    "notes_receivable": "other_asset",
    "notes_payable": "other_liability",
}


def _authority(db: Session, company: str, user: m.User) -> bool:
    require(user.active, "permission_denied", "حساب کاربری غیرفعال است.", 403)
    member = membership(db, company, user, "write")
    return member.role in ("owner", "finance_manager")


def _active_accounts(data: dict) -> dict:
    return {
        role: account
        for role, account in data["accounts"].items()
        if not (
            data["kind"] == "transfer" and role == "bank_fee_expense" and Decimal(data["amounts"]["fee"]) == 0
        )
    }


def _proof(db: Session, company: str, origin: OperationDraft, reviewed_accounts: dict | None = None) -> dict:
    require(
        origin.kind in SUPPORTED_KINDS and origin.policy_version == POLICY,
        "operation_learning_unsupported",
        "این عملیات برای پیشنهاد حساب قابل استفاده نیست.",
        409,
    )
    journal = db.scalar(
        select(NativeJournal).where(
            NativeJournal.company_id == company, NativeJournal.draft_id == origin.draft_id
        )
    )
    require(
        journal is not None and not journal.reversal_of,
        "operation_not_approved",
        "عملیات ثبت نهایی نشده است.",
        409,
    )
    require(
        not db.scalar(
            select(NativeJournal.id).where(
                NativeJournal.company_id == company, NativeJournal.reversal_of == journal.id
            )
        ),
        "operation_source_reversed",
        "سند مرجع برگشت شده است.",
        409,
    )
    draft = get_entity(db, Draft, company, origin.draft_id)
    require(draft.state == "posted", "operation_not_approved", "عملیات ثبت نهایی نشده است.", 409)
    data = dict(origin.payload)
    correction = db.scalar(
        select(OperationLearningCorrection).where(
            OperationLearningCorrection.company_id == company,
            OperationLearningCorrection.operation_id == origin.id,
            OperationLearningCorrection.journal_id == journal.id,
        )
    )
    if reviewed_accounts is not None:
        data["accounts"] = reviewed_accounts
    elif correction:
        require(
            correction.journal_digest == journal.digest
            and correction.approved_draft_version == journal.draft_version,
            "operation_learning_source_changed",
            "نسخه سند مرجع با اصلاح حساب‌ها یکسان نیست.",
            409,
        )
        data["accounts"] = correction.accounts
    data["date"] = date.fromisoformat(data["date"])
    expected = validate_lines(db, company, {"unit": data["unit"], "lines": build(data)})
    snapshot = journal.snapshot
    require(
        snapshot.get("original_unit") == data["unit"]
        and snapshot.get("period_id") == data["period_id"]
        and snapshot.get("date") == data["date"].isoformat()
        and snapshot.get("draft_version") == journal.draft_version
        and snapshot.get("draft_id") == origin.draft_id
        and [{key: line.get(key) for key in LINE_KEYS} for line in snapshot.get("lines", [])]
        == [{key: line.get(key) for key in LINE_KEYS} for line in expected]
        and draft.lines == expected,
        "operation_learning_content_changed",
        "ردیف‌های سند با الگوی عملیات برابر نیستند.",
        409,
    )
    accounts = {}
    for role, account_id in _active_accounts(data).items():
        approved_lines = [line for line in snapshot["lines"] if line["account_id"] == account_id]
        if not approved_lines:
            continue
        account = get_entity(db, Account, company, account_id)
        require(account.active, "inactive_account", "حساب پیشنهادشده غیرفعال است.", 409)
        require(
            all(line.get("account_version") == account.version for line in approved_lines),
            "operation_learning_account_changed",
            "حساب مرجع پس از تأیید تغییر کرده است.",
            409,
        )
        assignment = db.scalar(
            select(NativeAccountRole).where(
                NativeAccountRole.company_id == company, NativeAccountRole.account_id == account.id
            )
        )
        require(
            not assignment or assignment.role == ACCOUNT_ROLES[role],
            "operation_learning_role_changed",
            "نقش جاری حساب با عملیات مرجع یکسان نیست.",
            409,
        )
        accounts[role] = {
            "id": account.id,
            "code": account.code,
            "name": account.name,
            "version": account.version,
            "role_assignment_version": assignment.version if assignment else None,
        }
    return {
        "operation_id": origin.id,
        "kind": origin.kind,
        "journal_id": journal.id,
        "journal_sequence": journal.sequence,
        "journal_digest": journal.digest,
        "approved_draft_version": journal.draft_version,
        "policy_version": origin.policy_version,
        "accounts": accounts,
        "learning_basis": "human_corrected_accounts"
        if correction or reviewed_accounts is not None
        else "posted_operation",
        "correction_id": correction.id if correction else None,
    }


def suggestions(
    db: Session,
    company: str,
    user: m.User,
    kind: str,
    party_id: str,
    limit: int = 25,
    cursor: str | None = None,
) -> dict:
    from .http import paginate

    can_manage = _authority(db, company, user)
    require(
        kind in SUPPORTED_KINDS,
        "operation_learning_unsupported",
        "برای این نوع عملیات پیشنهاد حساب ارائه نمی‌شود.",
        422,
    )
    require(
        len(party_id) <= 100 and party_id == party_id.strip(), "invalid_party", "شناسه طرف حساب معتبر نیست."
    )
    require(bool(party_id) or kind == "transfer", "operation_party_required", "طرف حساب را مشخص کنید.")

    # Paging scans approved sources only; unsupported/changed/inactive sources are
    # filtered with an explicit count so absence never implies an AI confidence.
    def public(origin):
        if origin.payload.get("party_id", "") != party_id:
            return None
        try:
            proof = _proof(db, company, origin)
        except DomainError:
            return None
        pattern = db.scalar(
            select(OperationLearningPattern).where(
                OperationLearningPattern.company_id == company,
                OperationLearningPattern.operation_id == origin.id,
            )
        )
        return proof | {
            "name": pattern.name if pattern else f"{LABELS[kind]} · سند {proof['journal_sequence']}",
            "enabled": pattern.enabled if pattern else True,
            "version": pattern.version if pattern else 1,
        }

    approved = select(NativeJournal.draft_id).where(NativeJournal.company_id == company)
    page = paginate(
        db,
        OperationDraft,
        company,
        limit,
        cursor,
        [
            OperationDraft.kind == kind,
            OperationDraft.payload["party_id"].as_string() == party_id,
            OperationDraft.draft_id.in_(approved),
        ],
        transform=public,
    )
    scanned = len(page["items"])
    page["items"] = [item for item in page["items"] if item is not None]
    return page | {"can_manage": can_manage, "scanned_count": scanned, "financial_effect": False}


def update(db: Session, company: str, user: m.User, operation_id: str, data: dict, version: int) -> dict:
    require(
        _authority(db, company, user),
        "permission_denied",
        "مدیریت پیشنهاد حساب با مالک یا مدیر مالی است.",
        403,
    )
    origin = get_entity(db, OperationDraft, company, operation_id)
    require(
        origin.kind in SUPPORTED_KINDS,
        "operation_learning_unsupported",
        "برای این نوع عملیات پیشنهاد حساب ارائه نمی‌شود.",
        422,
    )
    try:
        proof = _proof(db, company, origin)
    except DomainError as error:
        if data["enabled"]:
            raise
        proof = {"operation_id": origin.id, "kind": origin.kind, "unavailable_reason": error.code}
    pattern = db.scalar(
        select(OperationLearningPattern).where(
            OperationLearningPattern.company_id == company, OperationLearningPattern.operation_id == origin.id
        )
    )
    if pattern:
        check_version(pattern, version)
        before = {"name": pattern.name, "enabled": pattern.enabled, "version": pattern.version}
        pattern.version += 1
    else:
        require(version == 1, "version_conflict", "پیشنهاد تغییر کرده است؛ تازه کنید.", 409)
        before = {"name": None, "enabled": True, "version": 1}
        pattern = OperationLearningPattern(company_id=company, operation_id=origin.id, version=2)
    pattern.name = data["name"]
    pattern.enabled = data["enabled"]
    db.add(pattern)
    db.flush()
    after = {"name": pattern.name, "enabled": pattern.enabled, "version": pattern.version}
    event = OperationLearningEvent(
        company_id=company,
        operation_id=origin.id,
        pattern_id=pattern.id,
        actor_id=user.id,
        before=before,
        after=after,
        source_proof=proof,
    )
    db.add(event)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "accounting.operation_learning_changed",
        pattern.id,
        {"event_id": event.id, "operation_id": origin.id, "before": before, "after": after},
    )
    return {"operation_id": origin.id, **after}


def proposal(db: Session, company: str, user: m.User, operation_id: str, kind: str, party_id: str) -> dict:
    _authority(db, company, user)
    origin = get_entity(db, OperationDraft, company, operation_id)
    require(
        origin.kind == kind and origin.payload.get("party_id", "") == party_id,
        "operation_learning_scope_changed",
        "نوع عملیات یا طرف حساب پیشنهاد یکسان نیست.",
        409,
    )
    pattern = db.scalar(
        select(OperationLearningPattern).where(
            OperationLearningPattern.company_id == company, OperationLearningPattern.operation_id == origin.id
        )
    )
    require(
        not pattern or pattern.enabled, "operation_learning_disabled", "این پیشنهاد غیرفعال شده است.", 409
    )
    return _proof(db, company, origin) | {"financial_effect": False}
