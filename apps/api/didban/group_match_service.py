"""Whole-reference groups, exact arithmetic and cross-workflow capacity locks."""

import json
from collections import defaultdict
from decimal import Decimal, localcontext
from hashlib import sha256

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .errors import require
from .finance import ANCHOR_KINDS, NON_FLOW_ENTRIES, amount, evidence, text_amount
from .group_match_models import GroupMatchDecision
from .security import membership
from .services import get_entity
from .workflow import audit, records_for, serialize_fact

MAX_GROUP_ROWS = 100
MAX_PROPOSALS = 200


def _build_group_item(
    account: str,
    ledger_account: str,
    reference: str,
    bank: list[dict],
    ledger: list[dict],
    *,
    match_basis: str,
    explanation: str,
    extra_reasons: list[str] | None = None,
) -> dict:
    bank_ids = sorted(row["id"] for row in bank)
    ledger_ids = sorted(row["id"] for row in ledger)
    bank_total = sum((amount(row["amount"]) for row in bank), Decimal(0))
    ledger_total = sum((amount(row["debit"]) - amount(row["credit"]) for row in ledger), Decimal(0))
    valid = (
        bool(ledger)
        and len(bank) <= MAX_GROUP_ROWS
        and len(ledger) <= MAX_GROUP_ROWS
        and bank_total == ledger_total
        and len(set(bank_ids)) == len(bank_ids)
        and len(set(ledger_ids)) == len(ledger_ids)
    )
    dates = sorted({str(row["date"])[:10] for row in [*bank, *ledger]})
    reasons = ([] if valid else ["group_amount_or_evidence_mismatch"]) + (
        ["date_mismatch"] if len(dates) > 1 else []
    )
    for code in extra_reasons or []:
        if code not in reasons:
            reasons.append(code)
    identity = json.dumps([account, ledger_account, reference, bank_ids, ledger_ids], sort_keys=True)
    return {
        "id": sha256(identity.encode()).hexdigest(),
        "bank_ids": bank_ids,
        "ledger_ids": ledger_ids,
        "bank_account": account,
        "ledger_account": ledger_account,
        "reference": reference,
        "bank_total": text_amount(bank_total),
        "ledger_total": text_amount(ledger_total),
        "difference": text_amount(bank_total - ledger_total),
        "dates": dates,
        "can_accept": valid,
        "reason_codes": reasons,
        "match_basis": match_basis,
        "explanation": explanation,
        "evidence_refs": evidence([*bank, *ledger]),
        "requires_human_review": True,
    }


def propose_groups(records: dict, mapping: dict[str, str], *, daily: bool = True) -> list[dict]:
    banks = defaultdict(list)
    ledgers = defaultdict(list)
    party_banks = defaultdict(list)
    party_ledgers = defaultdict(list)
    with localcontext() as context:
        context.prec = 60
        for row in records["bank"]:
            value = amount(row["amount"])
            if (
                row.get("kind", "movement") in ANCHOR_KINDS
                or not value
                or row["account"] not in mapping
            ):
                continue
            if row.get("reference"):
                banks[(row["account"], str(row["reference"]), value > 0)].append(row)
            elif row.get("party_id"):
                party_banks[(row["account"], str(row["party_id"]), str(row["date"])[:10], value > 0)].append(row)
        for row in records["ledger"]:
            value = amount(row["debit"]) - amount(row["credit"])
            if row.get("entry_type", "regular") in NON_FLOW_ENTRIES or not value:
                continue
            if row.get("reference"):
                ledgers[(row["account"], str(row["reference"]), value > 0)].append(row)
            elif row.get("party_id"):
                party_ledgers[(row["account"], str(row["party_id"]), str(row["date"])[:10], value > 0)].append(row)
        result = []
        for (account, reference, positive), bank in banks.items():
            if len(bank) < 2 or len(result) >= MAX_PROPOSALS:
                continue
            ledger = ledgers.get((mapping[account], reference, positive), [])
            result.append(
                _build_group_item(
                    account,
                    mapping[account],
                    reference,
                    bank,
                    ledger,
                    match_basis="shared_reference",
                    explanation="تطبیق گروهی بر اساس شماره مرجع مشترک و جهت یکسان",
                )
            )
        if daily:
            existing = {(tuple(item["bank_ids"]), tuple(item["ledger_ids"])) for item in result}
            for (account, party_id, day_str, positive), bank in party_banks.items():
                if len(result) >= MAX_PROPOSALS:
                    break
                ledger = party_ledgers.get((mapping[account], party_id, day_str, positive), [])
                if not ledger or (len(bank) < 2 and len(ledger) < 2):
                    continue
                item = _build_group_item(
                    account,
                    mapping[account],
                    f"طرف‌حساب {party_id} ({day_str})",
                    bank,
                    ledger,
                    match_basis="same_party_and_date",
                    explanation="تطبیق گروهی بر اساس طرف‌حساب و تاریخ یکسان (بدون مرجع مشترک)",
                    extra_reasons=["shared_reference_missing"],
                )
                key = (tuple(item["bank_ids"]), tuple(item["ledger_ids"]))
                if key not in existing:
                    existing.add(key)
                    result.append(item)
            # Bank references are transaction identities and cannot repeat in a
            # valid import. Daily whole-account groups are review candidates,
            # not proof that same-date transactions are related.
            day_records = {"bank": [], "ledger": []}
            for side in day_records:
                for original in records[side]:
                    row = dict(original)
                    row["reference"] = "day:" + str(row["date"])[:10]
                    day_records[side].append(row)
            for item in propose_groups(day_records, mapping, daily=False):
                if len(result) >= MAX_PROPOSALS:
                    break
                if (tuple(item["bank_ids"]), tuple(item["ledger_ids"])) in existing:
                    continue
                item["reference"] = "جمع روز " + item["reference"].removeprefix("day:")
                item["reason_codes"].append("shared_reference_missing")
                item["match_basis"] = "whole_account_day_review"
                item["explanation"] = "تطبیق کلی روزانه بر اساس حساب و تاریخ یکسان (نیازمند بررسی انسانی)"
                result.append(item)
        return result


def latest(db: Session, company: str) -> dict[str, GroupMatchDecision]:
    result = {}
    for row in db.scalars(
        select(GroupMatchDecision)
        .where(GroupMatchDecision.company_id == company)
        .order_by(GroupMatchDecision.created_at, GroupMatchDecision.id)
    ):
        result[row.candidate_key] = row
    return result


def check_group_capacity(
    db: Session, company: str, bank_ids: list[str], ledger_ids: list[str], ignore_key: str | None = None
) -> None:
    for key, row in latest(db, company).items():
        if row.decision == "accepted" and key != ignore_key:
            require(
                not (set(row.bank_ids) & set(bank_ids) or set(row.ledger_ids) & set(ledger_ids)),
                "reconciliation_capacity",
                "این ردیف‌ها در تطبیق گروهی دیگری استفاده شده‌اند.",
                409,
            )


def proposals(db: Session, company: str, user: m.User, run_id: str) -> dict:
    membership(db, company, user)
    from .reconciliation_service import options

    run = get_entity(db, m.ReconciliationRun, company, run_id)
    require(
        run.manifest_id == options(db, company)["manifest_id"],
        "stale_manifest",
        "نسخه داده تغییر کرده؛ تطبیق را دوباره اجرا کنید.",
        409,
    )
    manifest = get_entity(db, m.ResultManifest, company, run.manifest_id)
    items = propose_groups(records_for(db, company, manifest.selection["row_ids"]), run.bank_to_ledger)
    decisions = latest(db, company)
    for item in items:
        previous = decisions.get(item["id"])
        item["version"] = previous.version + 1 if previous else 1
        item["status"] = previous.decision if previous else "needs_review"
        item["reason"] = previous.reason if previous else None
    return {"run_id": run.id, "manifest_id": manifest.id, "items": items}


def decide(db: Session, company: str, user: m.User, candidate_id: str, data: dict) -> dict:
    membership(db, company, user, "write")
    payload = proposals(db, company, user, data["run_id"])
    candidate = next((item for item in payload["items"] if item["id"] == candidate_id), None)
    require(candidate is not None, "not_found", "گروه تطبیق پیدا نشد.", 404)
    require(
        candidate["version"] == data["expected_version"],
        "version_conflict",
        "تصمیم گروه تغییر کرده است.",
        409,
    )
    if data["decision"] == "accepted":
        require(candidate["can_accept"], "group_mismatch", "مبلغ یا شواهد گروه یکسان نیست.", 409)
        check_group_capacity(db, company, candidate["bank_ids"], candidate["ledger_ids"], candidate_id)
        from .reconciliation_service import latest_decisions

        for old in latest_decisions(db, company).values():
            if old.decision == "accepted":
                require(
                    old.bank_id not in candidate["bank_ids"]
                    and not (set(old.ledger_ids) & set(candidate["ledger_ids"])),
                    "reconciliation_capacity",
                    "ردیف در تطبیق دیگری استفاده شده؛ ابتدا آن تصمیم را برگردانید.",
                    409,
                )
    row = GroupMatchDecision(
        company_id=company,
        candidate_key=candidate_id,
        version=candidate["version"],
        manifest_id=payload["manifest_id"],
        decision=data["decision"],
        bank_ids=candidate["bank_ids"],
        ledger_ids=candidate["ledger_ids"],
        snapshot=candidate,
        actor_id=user.id,
        reason=data["reason"],
    )
    db.add(row)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "reconciliation.group_decided",
        row.id,
        {"candidate_id": candidate_id, "decision": row.decision, "version": row.version},
    )
    return serialize_fact(row)
