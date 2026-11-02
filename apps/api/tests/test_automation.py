"""Rules and learned mappings cannot create financial facts or bypass controls."""

from datetime import date

import pytest
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session

from didban import models as m
from didban.automation_models import AutomationRun, LearningPattern
from didban.automation_schemas import RuleDefinition
from didban.automation_service import execute, on_manifest, preview, save_preview, save_rule
from didban.errors import DomainError
from didban.ingestion import Sheet
from didban.learning_service import candidates, remember, reuse, update


@pytest.fixture
def workspace():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    m.Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        owner = m.User(id="u", email="u@example.test", name="مالک", password_hash="unused")
        viewer = m.User(id="v", email="v@example.test", name="بیننده", password_hash="unused")
        db.add_all([owner, viewer, m.Company(id="c", name="شرکت"), m.Company(id="other", name="دیگر")])
        db.flush()
        db.add_all(
            [
                m.Membership(company_id="c", user_id="u", role="owner"),
                m.Membership(company_id="c", user_id="v", role="viewer"),
                m.Period(id="p", company_id="c", name="دوره", start=date(2026, 1, 1), end=date(2026, 12, 31)),
            ]
        )
        db.flush()
        session = m.ProcessingSession(id="s", company_id="c", period_id="p", actor_id="u", state="completed")
        db.add(session)
        db.flush()
        result = m.ResultManifest(
            id="r",
            company_id="c",
            session_id="s",
            period_id="p",
            digest="test",
            selection={},
            metrics=[
                {
                    "metric_key": "ar_invoice",
                    "label": "مطالبات فاکتوری",
                    "value": "90071992547409931234567890123",
                    "basis": "invoice",
                    "status": "available",
                }
            ],
            details={},
        )
        db.add(result)
        db.flush()
        yield db, owner, viewer, result


def definition(**changes):
    return {
        "scope": "metric",
        "metric_key": "ar_invoice",
        "conditions": [{"field": "value", "op": "gt", "value": "90071992547409931234567890122"}],
        "action": "notify",
        **changes,
    }


def enabled_rule(db, user, **changes):
    spec = definition(**changes)
    receipt = save_preview(db, "c", user, "r", spec)
    return save_rule(
        db,
        "c",
        user,
        {"name": "پیگیری", "enabled": True, "definition": spec, "preview_id": receipt["preview_id"]},
    )


def test_exact_preview_then_execute_once_no_financial_effect(workspace):
    db, user, _, manifest = workspace
    result = enabled_rule(db, user)
    assert db.scalar(select(func.count()).select_from(m.Notification)) == 0
    from didban.automation_models import AutomationRule

    rule = db.get(AutomationRule, result["id"])
    first = execute(db, "c", rule, manifest)
    assert first["result"]["match_count"] == 1 and first["result"]["action_count"] == 1
    assert execute(db, "c", rule, manifest)["id"] == first["id"]
    on_manifest(db, "c", manifest)
    assert db.scalar(select(func.count()).select_from(m.Notification)) == 1
    assert db.scalar(select(func.count()).select_from(AutomationRun)) == 1
    assert db.scalar(select(m.JournalLine.id)) is None
    assert db.scalar(select(m.Allocation.id)) is None


def test_null_is_unavailable_not_zero(workspace):
    db, user, _, manifest = workspace
    manifest.metrics = [{"metric_key": "ar_invoice", "value": None, "status": "unavailable"}]
    result = preview(db, "c", "r", definition())
    assert result["match_count"] == 0 and result["unavailable_count"] == 1


def test_enable_requires_matching_preview_actor_company_and_conditions(workspace):
    db, user, viewer, _ = workspace
    with pytest.raises(DomainError) as error:
        save_rule(db, "c", user, {"name": "قاعده", "enabled": True, "definition": definition()})
    assert error.value.code == "rule_preview_required"
    checked = save_preview(db, "c", viewer, "r", definition())
    with pytest.raises(DomainError) as error:
        save_rule(
            db,
            "c",
            user,
            {
                "name": "قاعده",
                "enabled": True,
                "definition": definition(),
                "preview_id": checked["preview_id"],
            },
        )
    assert error.value.code == "rule_preview_mismatch"
    checked = save_preview(db, "c", user, "r", definition())
    wrong = definition()
    wrong["conditions"][0]["value"] = "1"
    with pytest.raises(DomainError):
        save_rule(
            db,
            "c",
            user,
            {"name": "قاعده", "enabled": True, "definition": wrong, "preview_id": checked["preview_id"]},
        )
    with pytest.raises(DomainError):
        save_rule(db, "c", viewer, {"name": "قاعده", "enabled": False, "definition": definition()})
    with pytest.raises(DomainError):
        preview(db, "other", "r", definition())


def test_automated_effect_rechecks_rule_actor_access(workspace):
    db, user, _, manifest = workspace
    saved = enabled_rule(db, user)
    user.active = False
    from didban.automation_models import AutomationRule

    result = execute(db, "c", db.get(AutomationRule, saved["id"]), manifest)
    assert result["result"]["action_state"] == "actor_access_revoked"
    assert result["result"]["action_count"] == 0
    assert db.scalar(select(m.Notification.id)) is None


@pytest.mark.parametrize("value", ["NaN", "Infinity", "1e9", "0.0000001", "1" + "0" * 32])
def test_invalid_thresholds_rejected(value):
    spec = definition()
    spec["conditions"][0]["value"] = value
    with pytest.raises(ValueError):
        RuleDefinition.model_validate(spec)


def test_no_executable_predicate_or_numeric_contains():
    spec = definition()
    spec["conditions"][0]["field"] = "__sql__"
    with pytest.raises(ValueError):
        RuleDefinition.model_validate(spec)
    spec = definition()
    spec["conditions"][0]["op"] = "contains"
    with pytest.raises(ValueError):
        RuleDefinition.model_validate(spec)


def memory_source(db, manifest):
    source = m.SourceFile(
        id="f",
        company_id="c",
        session_id="s",
        name="test.csv",
        sha256="x",
        size=10,
        storage_key="x",
        row_count=1,
        scan_status="test",
    )
    db.add(source)
    db.flush()
    item = m.Interpretation(
        id="i",
        company_id="c",
        file_id="f",
        sheet="bank",
        family="bank",
        mapping={"date": "d", "amount": "a", "reference": "r"},
        unit="TOMAN",
        calendar="gregorian",
        provenance="human",
        evidence={"headers": ["d", "a", "r"]},
    )
    db.add(item)
    db.flush()
    manifest.selection = {"interpretation_ids": ["i"]}
    return item


def test_memory_only_committed_human_correction_and_company_local(workspace):
    db, user, _, manifest = workspace
    memory_source(db, manifest)
    assert candidates(db, "c")["items"][0]["id"] == "i"
    learned = remember(db, "c", user, {"interpretation_id": "i", "name": "الگوی بانک"})
    sheet = Sheet("bank", ["d", "a", "r"], [(2, {"d": "2026-11-01", "a": "12", "r": "REF"})])
    initial = {
        "family": "unknown",
        "mapping": {},
        "unit": None,
        "calendar": "gregorian",
        "evidence": {"headers": sheet.headers},
    }
    result = reuse(db, "c", sheet, initial)
    assert result["family"] == "bank" and result["unit"] == "TOMAN"
    assert result["evidence"]["learning_pattern"]["interpretation_id"] == "i"
    assert reuse(db, "other", sheet, initial) == initial
    assert initial["mapping"] == {}
    assert reuse(db, "c", sheet, initial | {"unit": "unsupported"})["unit"] == "unsupported"
    assert reuse(db, "c", Sheet("other", sheet.headers, sheet.rows), initial) == initial
    update(db, "c", user, learned["id"], {"name": "الگوی بانک", "enabled": False}, learned["version"])
    assert reuse(db, "c", sheet, initial) == initial
    with pytest.raises(DomainError):
        update(db, "c", user, learned["id"], {"name": "قدیمی", "enabled": True}, learned["version"])
    assert db.scalar(select(m.JournalLine.id)) is None


def test_uncommitted_and_model_only_interpretations_are_not_learning_evidence(workspace):
    db, user, _, manifest = workspace
    item = memory_source(db, manifest)
    manifest.selection = {}
    with pytest.raises(DomainError):
        remember(db, "c", user, {"interpretation_id": "i", "name": "الگو"})
    manifest.selection = {"interpretation_ids": ["i"]}
    item.provenance = "model"
    with pytest.raises(DomainError):
        remember(db, "c", user, {"interpretation_id": "i", "name": "الگو"})
    assert db.scalar(select(LearningPattern.id)) is None


def invoice_template_source(db, manifest, **changes):
    from didban.accounting_models import Account
    from didban.accounting_setup_models import CompanyAccountingSetup

    db.add(CompanyAccountingSetup(company_id="c", mode="primary"))
    db.add_all(
        [
            Account(id="ar", company_id="c", code="1101", name="مطالبات"),
            Account(id="rev", company_id="c", code="4101", name="درآمد"),
        ]
    )
    db.add(
        m.SourceFile(
            id="invoice-file",
            company_id="c",
            session_id="s",
            name="invoice.csv",
            sha256="test",
            size=1,
            storage_key="unused",
            row_count=1,
            scan_status="test",
        )
    )
    db.flush()
    db.add(
        m.SourceRow(
            id="invoice-row",
            company_id="c",
            file_id="invoice-file",
            sheet="sales",
            row_number=2,
            values={"amount": "9007199254740993"},
        )
    )
    db.flush()
    invoice = m.Invoice(
        id="invoice",
        company_id="c",
        source_row_id="invoice-row",
        session_id="s",
        original_unit="TOMAN",
        original_amount="9007199254740993",
        reference="S001",
        party_id="customer",
        date=date(2026, 11, 1),
        amount="90071992547409930",
        direction="sales",
        tax="0",
        **changes,
    )
    db.add(invoice)
    db.flush()
    manifest.selection = {"row_ids": ["invoice-row"]}
    manifest.details = {
        "invoices": [
            {
                "id": invoice.id,
                "reference": invoice.reference,
                "amount": invoice.amount,
                "remaining": "0",
                "direction": "sales",
                "party_id": invoice.party_id,
            }
        ]
    }
    db.flush()
    return invoice


def draft_definition():
    return definition(
        scope="invoice",
        metric_key="",
        conditions=[{"field": "amount", "op": "gt", "value": "0"}],
        action="prepare_draft",
        draft_template={
            "kind": "sale_service",
            "accounts": {"trade_receivable": "ar", "service_revenue": "rev"},
        },
    )


def test_automatic_draft_has_explicit_preview_original_evidence_and_cross_manifest_dedupe(workspace):
    from didban.accounting_models import Draft
    from didban.automation_models import AutomationRule
    from didban.operation_models import OperationDraft
    from didban.posting_models import NativeJournal

    db, user, _, manifest = workspace
    invoice = invoice_template_source(db, manifest)
    spec = draft_definition()
    checked = save_preview(db, "c", user, manifest.id, spec)
    assert checked["matches"][0]["draft_eligible"] is True
    assert checked["matches"][0]["value"] == invoice.amount
    assert db.scalar(select(Draft.id)) is None
    saved = save_rule(
        db,
        "c",
        user,
        {"name": "خدمات", "enabled": True, "definition": spec, "preview_id": checked["preview_id"]},
    )
    result = execute(db, "c", db.get(AutomationRule, saved["id"]), manifest)
    assert result["result"]["action_count"] == 1
    draft = db.scalar(select(Draft))
    origin = db.scalar(select(OperationDraft))
    assert draft.lines[0]["debit"] == "90071992547409930" and draft.state == "draft"
    assert origin.payload["automation_origin"]["original_unit"] == "TOMAN"
    assert origin.payload["automation_origin"]["invoice_id"] == invoice.id
    assert db.scalar(select(NativeJournal.id)) is None
    db.add(m.ProcessingSession(id="s2", company_id="c", period_id="p", actor_id="u", state="completed"))
    db.flush()
    newer = m.ResultManifest(
        company_id="c",
        session_id="s2",
        period_id="p",
        digest="next",
        selection=manifest.selection,
        metrics=manifest.metrics,
        details=manifest.details,
    )
    db.add(newer)
    db.flush()
    result = execute(db, "c", db.get(AutomationRule, saved["id"]), newer)
    assert result["result"]["action_count"] == 0
    assert result["result"]["matches"][0]["blocked_reason"] == "operation_duplicate"
    assert db.scalar(select(func.count()).select_from(Draft)) == 1
    assert db.get(m.Invoice, "invoice").amount == invoice.amount


@pytest.mark.parametrize(
    "reason",
    [
        "period_closed",
        "inactive_account",
        "invoice_party_unknown",
        "invoice_unit_unknown",
        "invoice_tax_review_required",
        "invoice_source_not_selected",
        "invoice_template_direction",
        "primary_accounting_required",
    ],
)
def test_automatic_draft_live_controls_skip_without_rolling_back_manifest(workspace, reason):
    from didban.accounting_models import Account, Draft
    from didban.accounting_setup_models import CompanyAccountingSetup
    from didban.automation_models import AutomationRule
    from didban.period_lock_models import PeriodLock

    db, user, _, manifest = workspace
    invoice = invoice_template_source(db, manifest)
    spec = draft_definition()
    checked = save_preview(db, "c", user, "r", spec)
    saved = save_rule(
        db,
        "c",
        user,
        {"name": "خدمات", "enabled": True, "definition": spec, "preview_id": checked["preview_id"]},
    )
    if reason == "period_closed":
        db.add(PeriodLock(company_id="c", period_id="p", closed=True))
    elif reason == "inactive_account":
        db.get(Account, "rev").active = False
    elif reason == "invoice_party_unknown":
        invoice.party_id = ""
    elif reason == "invoice_unit_unknown":
        invoice.original_unit = "USD"
    elif reason == "invoice_tax_review_required":
        invoice.tax = None
    elif reason == "invoice_source_not_selected":
        manifest.selection = {"row_ids": []}
    elif reason == "invoice_template_direction":
        invoice.direction = "purchases"
    else:
        db.get(CompanyAccountingSetup, "c").mode = "analysis"
    db.flush()
    result = execute(db, "c", db.get(AutomationRule, saved["id"]), manifest)
    assert result["result"]["action_count"] == 0
    assert result["result"]["matches"][0]["blocked_reason"] == reason
    assert db.scalar(select(Draft.id)) is None
    assert db.get(m.ResultManifest, "r") is manifest


def test_draft_template_rejects_missing_same_or_metric_accounts():
    for patch in [
        {"scope": "metric"},
        {"draft_template": None},
        {
            "draft_template": {
                "kind": "sale_service",
                "accounts": {"trade_receivable": "ar", "service_revenue": "ar"},
            }
        },
    ]:
        with pytest.raises(ValueError):
            RuleDefinition.model_validate(draft_definition() | patch)


def test_draft_preview_mapping_changes_and_revoked_actor_do_not_create_drafts(workspace):
    from didban.accounting_models import Account, Draft
    from didban.automation_models import AutomationRule

    db, user, _, manifest = workspace
    invoice_template_source(db, manifest)
    db.add(Account(id="rev2", company_id="c", code="4102", name="درآمد دوم"))
    db.flush()
    spec = draft_definition()
    checked = save_preview(db, "c", user, "r", spec)
    changed = {
        **spec,
        "draft_template": {
            "kind": "sale_service",
            "accounts": {"trade_receivable": "ar", "service_revenue": "rev2"},
        },
    }
    with pytest.raises(DomainError) as error:
        save_rule(
            db,
            "c",
            user,
            {"name": "نادرست", "enabled": True, "definition": changed, "preview_id": checked["preview_id"]},
        )
    assert error.value.code == "rule_preview_mismatch"
    saved = save_rule(
        db,
        "c",
        user,
        {"name": "خدمات", "enabled": True, "definition": spec, "preview_id": checked["preview_id"]},
    )
    member = db.scalar(
        select(m.Membership).where(m.Membership.company_id == "c", m.Membership.user_id == user.id)
    )
    member.role = "viewer"
    db.flush()
    result = execute(db, "c", db.get(AutomationRule, saved["id"]), manifest)
    assert result["result"]["action_state"] == "actor_access_revoked"
    assert db.scalar(select(Draft.id)) is None
