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
    latest = latest_decisions(db, run.company_id)
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
        candidates.append(value)
    return result | {"candidates": candidates}


def _capacity(db, company, bank_id, ledger_ids, latest):
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
    )
    db.add(run)
    db.flush()
    prior = latest_decisions(db, company)
    for candidate in candidates:
        previous = prior.get(candidate["bank_id"])
        # Re-running automation never replaces an existing human decision.
        if previous or candidate["status"] != "exact_proposal":
            continue
        _capacity(db, company, candidate["bank_id"], candidate["ledger_ids"], prior)
        controls = {
            "same_company": True,
            "mapped_account": True,
            "equal_signed_amount": True,
            "shared_reference": True,
            "same_date": True,
            "unique_candidate": True,
        }
        decision = ReconciliationDecision(
            company_id=company,
            run_id=run.id,
            proposal_id=candidate["id"],
            bank_id=candidate["bank_id"],
            ledger_ids=candidate["ledger_ids"],
            decision="accepted",
            version=1,
            reason="مرجع، حساب، مبلغ و تاریخ یکسان؛ نامزد یکتا",
            actor_id=None,
            provenance="validated_automatic",
            controls=controls,
        )
        db.add(decision)
        prior[candidate["bank_id"]] = decision
        audit(
            db,
            company,
            None,
            "reconciliation.accepted_automatically",
            candidate["id"],
            {
                "run_id": run.id,
                "controls": controls,
                "evidence_refs": candidate["evidence_refs"],
                "policy_version": run.policy_version,
            },
        )
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
        require(len(ids) == 1, "ambiguous_reconciliation", "نامزد تطبیق یکتا نیست.", 409)
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
        with localcontext() as context:
            context.prec = 50
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
