"""Explicit role mapping for account-only edits that a human actually posted."""

from datetime import date
from decimal import Decimal, localcontext

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .accounting_models import Account, Draft
from .errors import DomainError, require
from .money_type import canonical_money
from .operation_learning_models import OperationLearningCorrection
from .operation_learning_service import SUPPORTED_KINDS, _active_accounts, _authority, _proof
from .operation_models import OperationDraft
from .operation_service import LABELS, POLICY, ROLE_LABELS, build
from .posting_models import NativeJournal
from .services import get_entity
from .workflow import audit


def _candidate(db: Session, company: str, origin: OperationDraft) -> dict:
    require(
        origin.kind in SUPPORTED_KINDS and origin.policy_version == POLICY,
        "operation_learning_unsupported",
        "این عملیات برای یادگیری اصلاح حساب قابل استفاده نیست.",
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
    data = dict(origin.payload)
    data["date"] = date.fromisoformat(data["date"])
    require(
        draft.state == "posted"
        and journal.snapshot.get("period_id") == data["period_id"]
        and journal.snapshot.get("date") == data["date"].isoformat()
        and journal.snapshot.get("original_unit") == data["unit"],
        "operation_learning_content_changed",
        "تاریخ، دوره یا واحد سند با عملیات برابر نیست.",
        409,
    )
    with localcontext() as context:
        context.prec = 60
        factor = 10 if data["unit"] == "TOMAN" else 1
        expected = [
            (
                row["party_id"],
                canonical_money(Decimal(row["debit"]) * factor),
                canonical_money(Decimal(row["credit"]) * factor),
            )
            for row in build(data)
        ]
    actual = [(row.get("party_id", ""), row["debit"], row["credit"]) for row in journal.snapshot["lines"]]
    require(
        actual == expected,
        "operation_learning_amount_changed",
        "اصلاح فقط باید انتخاب حساب‌ها را عوض کرده باشد؛ مبلغ و طرف حساب برابر نیستند.",
        409,
    )
    choices = {}
    for row in journal.snapshot["lines"]:
        account = get_entity(db, Account, company, row["account_id"])
        require(
            account.active and account.version == row.get("account_version"),
            "operation_learning_account_changed",
            "حساب سند مرجع تغییر کرده یا غیرفعال شده است.",
            409,
        )
        side = "debit" if Decimal(row["debit"]) > 0 else "credit"
        require(
            account.id not in choices or choices[account.id]["side"] == side,
            "operation_learning_accounts_overlap",
            "سند اصلاحی از یک حساب در دو سوی عملیات استفاده کرده است.",
            409,
        )
        choices[account.id] = {
            "id": account.id,
            "code": account.code,
            "name": account.name,
            "side": side,
        }
    return {
        "operation_id": origin.id,
        "kind": origin.kind,
        "title": LABELS[origin.kind],
        "journal_id": journal.id,
        "journal_digest": journal.digest,
        "journal_sequence": journal.sequence,
        "approved_draft_version": journal.draft_version,
        "roles": [{"key": key, "label": ROLE_LABELS[key]} for key in _active_accounts(data)],
        "account_choices": list(choices.values()),
    }


def candidates(
    db: Session,
    company: str,
    user: m.User,
    kind: str,
    party_id: str,
    limit: int = 25,
    cursor: str | None = None,
) -> dict:
    from .http import paginate

    _authority(db, company, user)
    require(
        kind in SUPPORTED_KINDS,
        "operation_learning_unsupported",
        "برای این نوع عملیات یادگیری اصلاح ارائه نمی‌شود.",
    )
    require(len(party_id) <= 100 and party_id == party_id.strip(), "invalid_party", "طرف حساب معتبر نیست.")

    def public(origin):
        try:
            _proof(db, company, origin)
            return None
        except DomainError:
            try:
                return _candidate(db, company, origin)
            except DomainError:
                return None

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
    page["items"] = [row for row in page["items"] if row is not None]
    return page | {"financial_effect": False}


def adopt(db: Session, company: str, user: m.User, operation_id: str, data: dict) -> dict:
    _authority(db, company, user)
    origin = get_entity(db, OperationDraft, company, operation_id)
    checked = _candidate(db, company, origin)
    require(
        checked["journal_id"] == data["journal_id"]
        and checked["journal_digest"] == data["journal_digest"]
        and checked["approved_draft_version"] == data["approved_draft_version"],
        "operation_learning_source_changed",
        "نسخه سند تأییدشده تغییر کرده است.",
        409,
    )
    require(
        set(data["accounts"]) == set(_active_accounts(origin.payload)),
        "operation_learning_roles_changed",
        "نقش‌های حساب باید با عملیات مرجع برابر باشند.",
    )
    require(
        data["accounts"] != _active_accounts(origin.payload),
        "operation_learning_no_correction",
        "انتخاب حساب‌ها نسبت به عملیات مرجع اصلاح نشده است.",
    )
    require(bool(data["reason"].strip()), "reason_required", "دلیل تأیید اصلاح حساب‌ها لازم است.")
    require(
        not db.scalar(
            select(OperationLearningCorrection.id).where(
                OperationLearningCorrection.company_id == company,
                OperationLearningCorrection.operation_id == origin.id,
                OperationLearningCorrection.journal_id == data["journal_id"],
            )
        ),
        "operation_learning_correction_exists",
        "اصلاح حساب‌های این سند قبلاً برای یادگیری تأیید شده است.",
        409,
    )
    proof = _proof(db, company, origin, reviewed_accounts=data["accounts"])
    item = OperationLearningCorrection(
        company_id=company,
        operation_id=origin.id,
        journal_id=data["journal_id"],
        journal_digest=data["journal_digest"],
        approved_draft_version=data["approved_draft_version"],
        accounts=data["accounts"],
        actor_id=user.id,
        reason=data["reason"].strip(),
    )
    db.add(item)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "accounting.operation_learning_correction_adopted",
        item.id,
        {
            "operation_id": origin.id,
            "journal_id": item.journal_id,
            "journal_digest": item.journal_digest,
            "accounts": item.accounts,
            "reason": item.reason,
        },
    )
    return proof | {"correction_id": item.id, "financial_effect": False}
