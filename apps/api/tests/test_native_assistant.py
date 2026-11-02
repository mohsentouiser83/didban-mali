"""Native assistant contexts stay pinned, read-only and separate from imported facts."""

import asyncio
from types import SimpleNamespace

import pytest
from pydantic import ValidationError
from sqlalchemy import select
from test_posting import book as book

from didban import models as m
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.assistant_service import respond
from didban.errors import DomainError
from didban.model_gateway import validate_proposal
from didban.native_assistant_service import native_context, select_context
from didban.native_reporting_models import NativeStatementRun
from didban.schemas import AssistantInput


def native(db, identifier="native-old", revenue="100"):
    values = [
        ("bank_balance", None, ["opening_evidence_missing"]),
        ("revenue", revenue, []),
        ("expense", "40", []),
        ("profit_before_tax", "60", []),
        ("trade_receivable_balance", "200", []),
        ("trade_payable_balance", "80", []),
        ("payroll_payable_balance", "999999", []),
    ]
    row = NativeStatementRun(
        id=identifier,
        company_id="c",
        actor_id="finance_manager",
        digest="a" * 64,
        snapshot={
            "as_of": "2026-11-01",
            "period_id": "p",
            "metrics": [
                {
                    "metric_key": key,
                    "value": value,
                    "status": "unavailable" if value is None else "available",
                    "reason_codes": reasons,
                }
                for key, value, reasons in values
            ],
            "items": [{"party_id": "private-employee"}],
            "employee_name": "private-name",
        },
    )
    db.add(row)
    db.flush()
    return row


def imported(db):
    db.add(
        m.ProcessingSession(
            id="s", company_id="c", period_id="p", actor_id="finance_manager", state="completed"
        )
    )
    db.flush()
    db.add(
        m.ResultManifest(
            id="imported",
            company_id="c",
            session_id="s",
            period_id="p",
            digest="b" * 64,
            selection={},
            metrics=[{"metric_key": "cash", "value": "777", "status": "available"}],
            details={},
        )
    )
    db.flush()


def test_primary_default_is_native_only_and_explicit_old_or_missing_context_does_not_transfer(book):
    db = book
    user = db.get(m.User, "finance_manager")
    imported(db)
    absent = select_context(db, "c", user)
    assert absent["frozen"] is None and absent["descriptor"]["reason_code"] == "native_statement_missing"
    assert "گزارش مالی دفتر اصلی" in absent["missing_answer"]
    old = native(db)
    current = select_context(db, "c", user)
    assert (
        current["descriptor"]["native_statement_id"] == old.id
        and current["descriptor"]["manifest_id"] is None
    )
    native(db, "native-new", "900")
    pinned = select_context(db, "c", user, context_type="native_statement", native_statement_id=old.id)
    assert (
        next(row for row in pinned["frozen"]["metrics"] if row["metric_key"] == "revenue")["value"] == "100"
    )
    missing = select_context(db, "c", user, context_type="native_statement")
    assert missing["frozen"] is None
    db.get(CompanyAccountingSetup, "c").mode = "analysis"
    db.flush()
    assert select_context(db, "c", user)["descriptor"]["manifest_id"] == "imported"
    assert (
        select_context(db, "c", user, context_type="native_statement", native_statement_id=old.id)[
            "descriptor"
        ]["native_statement_id"]
        == old.id
    )


def test_adapter_only_exposes_six_exact_core_metrics_with_native_evidence_and_null_limitations(book):
    frozen = native_context(native(book))
    assert len(frozen["metrics"]) == 6
    assert (
        "private-employee" not in str(frozen)
        and "private-name" not in str(frozen)
        and "999999" not in str(frozen)
    )
    cash = next(row for row in frozen["metrics"] if row["metric_key"] == "cash")
    assert cash["value"] is None and cash["reason_codes"] == ["opening_evidence_missing"]
    assert cash["as_of_date"] == "2026-11-01" and cash["basis"] == "native_book"
    assert all(row["evidence_refs"] == ["native-statement:native-old"] for row in frozen["metrics"])
    assert book.scalar(select(m.SourceRow.id)) is None
    with pytest.raises(ValidationError):
        AssistantInput(question="نقد", manifest_id="m", native_statement_id="n")
    with pytest.raises(ValidationError):
        AssistantInput(question="نقد", manifest_id="m", context_type="native_statement")


def test_current_membership_and_company_are_rechecked_for_native_context(book):
    db = book
    user = db.get(m.User, "finance_manager")
    old = native(db)
    with pytest.raises(DomainError):
        select_context(db, "other", user, context_type="native_statement", native_statement_id=old.id)
    db.get(m.Membership, "finance_manager").active = False
    db.flush()
    with pytest.raises(DomainError):
        select_context(db, "c", user, context_type="native_statement", native_statement_id=old.id)


class Gateway:
    config = SimpleNamespace(enabled=True, api_key="synthetic-no-network")

    def __init__(self):
        self.calls = []

    async def invoke(self, **kwargs):
        self.calls.append(kwargs)
        if kwargs["purpose"] == "chat":
            return {"state": "completed", "proposal": {"kind": "report", "answer": ""}}
        evidence = kwargs["evidence"]
        assert evidence["manifest_id"] is None and evidence["native_statement_id"] == "native-old"
        assert evidence["source_refs"] == ["native-statement:native-old"]
        proposal = validate_proposal(
            "summarize_report",
            {
                "sentences": [
                    {
                        "template": "metric_unavailable",
                        "fact_key": "cash",
                        "evidence_refs": ["native-statement:native-old"],
                    }
                ]
            },
            evidence,
        )
        return {"state": "completed", "request_id": "mock", "proposal": proposal}


def test_mock_gateway_preserves_native_null_evidence_and_mutations_and_invoice_limits_skip_model(book):
    frozen = native_context(native(book))
    gateway = Gateway()
    result = asyncio.run(
        respond(
            manifest=frozen,
            question="موجودی بانک؟",
            company_id="c",
            actor_id="finance_manager",
            request_key="native",
            gateway=gateway,
        )
    )
    assert result["manifest_id"] is None and result["native_statement_id"] == "native-old"
    assert result["facts"][0]["value"] is None and result["evidence_refs"] == ["native-statement:native-old"]
    assert len(gateway.calls) == 2
    mutation = asyncio.run(
        respond(
            manifest=frozen,
            question="این سند را ثبت کن",
            company_id="c",
            actor_id="finance_manager",
            request_key="mutation",
            gateway=gateway,
        )
    )
    assert mutation["facts"] == [] and "بخش مربوط" in mutation["answer"] and len(gateway.calls) == 2
    invoice = asyncio.run(
        respond(
            manifest=frozen,
            question="مانده فاکتور فروش؟",
            company_id="c",
            actor_id="finance_manager",
            request_key="invoice",
            gateway=gateway,
        )
    )
    assert invoice["facts"] == [] and "ماندهٔ فاکتوری" in invoice["answer"] and len(gateway.calls) == 2


def test_http_context_selection_is_exact_private_and_rechecks_membership_after_answer(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.native_reporting_models import NativeStatementRun
from didban.posting_models import NativeJournal
owner=client_for("owner");outsider=client_for("outsider")
path=base+"/assistant"
def snapshot(value):return {"as_of":"2026-09-30","period_id":period_id,"metrics":[{"metric_key":"trade_receivable_balance","value":value,"status":"available","reason_codes":[]}]}
with transaction("company-a") as db:
    db.add(CompanyAccountingSetup(company_id="company-a",mode="primary"))
    run=NativeStatementRun(company_id="company-a",actor_id=users["owner"],digest="a"*64,snapshot=snapshot("100"))
    db.add(run);db.flush();old=run.id
context=owner.get(path+"/context").json()
assert context["context_type"]=="native_statement" and context["native_statement_id"]==old and context["manifest_id"] is None
assert outsider.get(path+"/context").status_code==404
payload={"context_type":"native_statement","native_statement_id":old,"manifest_id":None,"question":"مطالبات؟"}
reply=command(owner,"POST",path+"/questions",payload)
assert reply.status_code==200,reply.text
assert reply.json()["facts"][0]["value"]=="100" and reply.json()["manifest_id"] is None
assert reply.json()["evidence_refs"]==["native-statement:"+old]
assert reply.json()["native_statement_id"]==old
assert command(owner,"POST",path+"/questions",{**payload,"manifest_id":manifest_ids[0]}).status_code==422
with transaction("company-a") as db:
    new=NativeStatementRun(company_id="company-a",actor_id=users["owner"],digest="b"*64,snapshot=snapshot("900"))
    db.add(new);db.flush();new_id=new.id
assert owner.get(path+"/context").json()["native_statement_id"]==new_id
assert command(owner,"POST",path+"/questions",payload).json()["facts"][0]["value"]=="100"
missing=command(owner,"POST",path+"/questions",{**payload,"native_statement_id":None}).json()
assert missing["facts"]==[] and "گزارش مالی دفتر اصلی" in missing["answer"]
mutation=command(owner,"POST",path+"/questions",{**payload,"question":"سند را ثبت کن"}).json()
assert mutation["facts"]==[] and "بخش مربوط" in mutation["answer"]
with transaction("company-a") as db:assert db.scalar(select(NativeJournal.id)) is None
import didban.assistant_service as assistant_service
async def revoke_during_answer(**kwargs):
    with transaction("company-a") as db:db.get(m.Membership,members["owner"]).active=False
    return {"answer":"should not leak","facts":[]}
assistant_service.respond=revoke_during_answer
assert command(owner,"POST",path+"/questions",payload).status_code==404
""",
    )


def test_primary_without_native_statement_never_uses_an_existing_imported_manifest(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.accounting_setup_models import CompanyAccountingSetup
owner=client_for("owner")
with transaction("company-a") as db:db.add(CompanyAccountingSetup(company_id="company-a",mode="primary"))
path=base+"/assistant"
context=owner.get(path+"/context").json()
assert context["available"] is False and context["manifest_id"] is None and context["native_statement_id"] is None
assert context["reason_code"]=="native_statement_missing"
answer=command(owner,"POST",path+"/questions",{"question":"موجودی بانک؟"})
assert answer.status_code==200,answer.text
assert answer.json()["facts"]==[] and "گزارش مالی دفتر اصلی" in answer.json()["answer"]
assert "بارگذاری" not in answer.json()["answer"]
""",
    )


def test_private_bot_native_questions_use_the_same_pinned_filtered_context_without_personnel(tmp_path):
    from test_api_delivery import scenario
    from test_bots import SETUP

    scenario(
        tmp_path,
        SETUP
        + r"""
from types import SimpleNamespace
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.native_reporting_models import NativeStatementRun
from didban.assistant_service import respond
with transaction("company-a") as db:
    db.add(CompanyAccountingSetup(company_id="company-a",mode="primary"))
    original=NativeStatementRun(company_id="company-a",actor_id=users["owner"],digest="a"*64,
        snapshot={"as_of":"2026-09-30","period_id":period_id,"metrics":[{"metric_key":"trade_receivable_balance","value":"100","status":"available","reason_codes":[]},{"metric_key":"payroll_payable_balance","value":"999999","status":"available","reason_codes":[]}],"items":[{"party_id":"private-employee"}],"employee_name":"private-person"})
    db.add(original);db.flush();old=original.id
pairing()
calls=[]
async def responder(**kwargs):
    calls.append(kwargs)
    frozen=kwargs["manifest"]
    assert frozen["context_type"]=="native_statement" and frozen["native_statement_id"]==old
    assert "private-employee" not in str(frozen) and "private-person" not in str(frozen) and "999999" not in str(frozen)
    assert len(frozen["metrics"])==6
    with transaction("company-a") as db:
        db.add(NativeStatementRun(company_id="company-a",actor_id=users["owner"],digest="b"*64,
            snapshot={"as_of":"2026-09-30","period_id":period_id,"metrics":[{"metric_key":"trade_receivable_balance","value":"900","status":"available","reason_codes":[]}]}))
    return await respond(**kwargs,gateway=SimpleNamespace(config=SimpleNamespace(enabled=False,api_key=None)))
ingress(2,"مطالبات؟",responder=responder)
ingress(2,"مطالبات؟",responder=responder)
assert len(calls)==1 and len(transport.messages)==1
text=transport.messages[0][1]
assert "100" in text and "900" not in text and old in text
assert "private-person" not in text and "999999" not in text
with transaction("company-a") as db:db.get(m.Membership,members["owner"]).active=False
ingress(3,"مطالبات؟",responder=responder)
assert len(calls)==1 and len(transport.messages)==1
""",
    )
