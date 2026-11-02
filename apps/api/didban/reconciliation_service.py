"""Versioned bank/ledger matches retain independent evidence and human decisions."""

from decimal import Decimal, localcontext

from sqlalchemy import select

from .errors import require
from .models import BankMovement, JournalLine, ReconciliationDecision, ReconciliationRun, ResultManifest
from .reconciliation import propose
from .services import get_entity
from .workflow import audit, records_for, serialize_fact


def latest_decisions(db, company):
    decisions = db.scalars(
        select(ReconciliationDecision)
        .where(ReconciliationDecision.company_id == company)
        .order_by(ReconciliationDecision.created_at, ReconciliationDecision.id)
    )
    latest = {}
    for decision in decisions:
        latest[decision.bank_id] = decision
    return latest


def options(db, company):
    manifest = db.scalar(
        select(ResultManifest)
        .where(ResultManifest.company_id == company)
        .order_by(ResultManifest.created_at.desc(), ResultManifest.id.desc())
        .limit(1)
    )
    require(manifest is not None, "no_result", "ابتدا اسناد را پردازش کنید.", 404)
    records = records_for(db, company, manifest.selection["row_ids"])
    return {
        "manifest_id": manifest.id,
        "bank_accounts": sorted({r["account"] for r in records["bank"]}),
        "ledger_accounts": [
            {"account": account, "role": role}
            for account, role in sorted(
                {
                    (r["account"], r["role"])
                    for r in records["ledger"]
                    if r["role"] == "bank" or r["role"].startswith("bank_")
                }
            )
        ],
    }


def public_run(db, run):
    from .group_match_service import latest as latest_groups

    latest = latest_decisions(db, run.company_id)
    grouped_banks = {
        bank_id: decision
        for decision in latest_groups(db, run.company_id).values()
        if decision.decision == "accepted"
        for bank_id in decision.bank_ids
    }
    result = serialize_fact(run)
    candidates = []
    for candidate in run.candidates:
        decision = latest.get(candidate["bank_id"])
        value = {**candidate, "version": decision.version + 1 if decision else 1}
        if decision and decision.proposal_id == candidate["id"]:
            value.update(
                status=decision.decision,
                version=decision.version + 1,
                provenance=decision.provenance,
                reason=decision.reason,
            )
        group = grouped_banks.get(candidate["bank_id"])
        if group:
            value.update(
                single_status=value["status"],
                status="accepted_in_group",
                group_state="accepted",
                group_decision_id=group.id,
                group_candidate_key=group.candidate_key,
                group_version=group.version,
                group_basis=group.snapshot.get("basis", "imported_ledger"),
                group_ledger_account=group.snapshot.get("ledger_account"),
                group_native_statement_id=group.snapshot.get("native_statement_id"),
            )
        candidates.append(value)
    return result | {"candidates": candidates}


def _capacity(db, company, bank_id, ledger_ids, latest):
    from .group_match_service import check_group_capacity

    check_group_capacity(db, company, [bank_id], ledger_ids)
    for decision in latest.values():
        if decision.decision == "accepted" and decision.bank_id != bank_id:
            require(
                not set(decision.ledger_ids) & set(ledger_ids),
                "reconciliation_capacity",
                "ثبت دفتر قبلاً به تراکنش دیگری مرتبط شده است.",
                409,
            )


def create_run(db, company, user, manifest_id, mapping):
    current = options(db, company)
    require(
        manifest_id == current["manifest_id"],
        "stale_manifest",
        "نسخه داده تغییر کرده؛ صفحه را تازه کنید.",
        409,
    )
    allowed_bank = set(current["bank_accounts"])
    allowed_ledger = {row["account"] for row in current["ledger_accounts"]}
    require(
        bool(mapping) and set(mapping) <= allowed_bank and all(v in allowed_ledger for v in mapping.values()),
        "invalid_bank_ledger_mapping",
        "حساب‌های متناظر معتبر انتخاب کنید.",
    )
    manifest = get_entity(db, ResultManifest, company, manifest_id)
    records = records_for(db, company, manifest.selection["row_ids"])
    candidates = propose(records["ledger"], records["bank"], {"bank_to_ledger": mapping})
    run = ReconciliationRun(
        company_id=company,
        actor_id=user.id,
        manifest_id=manifest_id,
        bank_to_ledger=mapping,
        candidates=candidates,
        policy_version="reconciliation-human-reference-2",
    )
    db.add(run)
    db.flush()
    # P14 requires human acceptance, including exact one-to-one matches.
    # Existing immutable automatic/human decisions remain historical evidence;
    # rerunning proposals never manufactures a new acceptance.
    audit(
        db,
        company,
        user.id,
        "reconciliation.run_created",
        run.id,
        {"manifest_id": manifest_id, "bank_to_ledger": mapping},
    )
    db.flush()
    return public_run(db, run)


def decide(db, company, user, proposal_id, data):
    run = get_entity(db, ReconciliationRun, company, data["run_id"])
    current = options(db, company)
    require(
        run.manifest_id == current["manifest_id"],
        "stale_manifest",
        "نسخه داده تغییر کرده؛ تطبیق را دوباره اجرا کنید.",
        409,
    )
    candidate = next((row for row in run.candidates if row["id"] == proposal_id), None)
    require(candidate is not None, "not_found", "پیشنهاد پیدا نشد.", 404)
    previous = latest_decisions(db, company)
    latest = previous.get(candidate["bank_id"])
    version = latest.version + 1 if latest else 1
    require(
        data["expected_version"] == version, "version_conflict", "تصمیم تغییر کرده؛ صفحه را تازه کنید.", 409
    )
    ids = candidate["ledger_ids"]
    if data["decision"] == "accepted":
        require(
            bool(ids) and bool(candidate.get("ledger_account")),
            "missing_reconciliation_evidence",
            "ثبت دفتر متناظر مشخص نیست.",
            409,
        )
        require(
            len(ids) == len(set(ids))
            and (len(ids) == 1 or candidate.get("match_kind") == "reference_aggregate")
            and "multiple_ledger_candidates" not in candidate.get("reason_codes", []),
            "ambiguous_reconciliation",
            "نامزد تطبیق یکتا نیست.",
            409,
        )
        _capacity(db, company, candidate["bank_id"], ids, previous)
        manifest = get_entity(db, ResultManifest, company, run.manifest_id)
        rows = set(manifest.selection["row_ids"])
        bank = get_entity(db, BankMovement, company, candidate["bank_id"])
        ledger = [get_entity(db, JournalLine, company, identifier) for identifier in ids]
        require(
            bank.source_row_id in rows and all(row.source_row_id in rows for row in ledger),
            "inactive_record",
            "ثبت در نسخه فعال نیست.",
            409,
        )
        require(
            all(row.account == run.bank_to_ledger.get(bank.account) for row in ledger),
            "reconciliation_account",
            "حساب‌های متناظر تغییر کرده‌اند.",
            409,
        )
        require(
            bool(bank.reference) and all(row.reference == bank.reference for row in ledger),
            "reconciliation_reference",
            "مرجع مشترک ثبت‌ها معتبر نیست.",
            409,
        )
        with localcontext() as context:
            context.prec = 50
            if len(ids) > 1:
                require(
                    all(
                        (Decimal(row.debit) - Decimal(row.credit)) * Decimal(bank.amount) > 0
                        for row in ledger
                    ),
                    "reconciliation_direction",
                    "جهت ثبت‌های تجمیعی یکسان نیست.",
                    409,
                )
            total = sum((Decimal(row.debit) - Decimal(row.credit) for row in ledger), Decimal(0))
            require(
                total == Decimal(bank.amount), "reconciliation_amount", "مبلغ و جهت ثبت‌ها برابر نیست.", 409
            )
    decision = ReconciliationDecision(
        company_id=company,
        run_id=run.id,
        proposal_id=proposal_id,
        bank_id=candidate["bank_id"],
        ledger_ids=ids,
        decision=data["decision"],
        version=version,
        reason=data["reason"],
        actor_id=user.id,
        provenance="human",
        controls={
            "version_valid": True,
            "capacity_checked": data["decision"] == "accepted",
            "evidence_refs": candidate["evidence_refs"],
        },
    )
    db.add(decision)
    db.flush()
    audit(
        db,
        company,
        user.id,
        "reconciliation.decided",
        proposal_id,
        {"run_id": run.id, "decision": data["decision"], "reason": data["reason"], "version": version},
    )
    return {
        "id": decision.id,
        "proposal_id": proposal_id,
        "status": decision.decision,
        "version": version + 1,
    }
