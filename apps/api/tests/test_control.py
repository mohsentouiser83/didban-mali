"""Control collaboration cannot alter financial evidence or bypass company access."""

from datetime import date

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session

from didban import control_service as service
from didban import models as m
from didban.control_models import ControlActivity, ControlCase
from didban.control_schemas import ActivityCreate, CaseCreate, CaseUpdate
from didban.errors import DomainError


@pytest.fixture
def workspace():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

    m.Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add_all([m.Company(id="c", name="شرکت"), m.Company(id="other", name="دیگر")])
        for role in ("owner", "finance_manager", "advisor", "viewer", "outsider"):
            db.add(m.User(id=role, name=role, email=f"{role}@example.local", password_hash="unused"))
        db.flush()
        for role in ("owner", "finance_manager", "advisor", "viewer"):
            db.add(m.Membership(id=role, user_id=role, company_id="c", role=role))
        db.add(m.Membership(id="outsider", user_id="outsider", company_id="other", role="owner"))
        db.add(m.Period(id="p", company_id="c", name="دوره", start=date(2026, 1, 1), end=date(2026, 12, 31)))
        db.flush()
        db.add(
            m.ProcessingSession(id="s", company_id="c", period_id="p", actor_id="owner", state="completed")
        )
        db.flush()
        db.add(
            m.SourceFile(
                id="f",
                company_id="c",
                session_id="s",
                name="sales.csv",
                sha256="a" * 64,
                size=100,
                storage_key="private-key",
                scan_status="clean",
                row_count=3,
            )
        )
        db.flush()
        for index in range(3):
            db.add(
                m.SourceRow(
                    id=f"r{index}",
                    company_id="c",
                    file_id="f",
                    sheet="sales",
                    row_number=index + 1,
                    values={},
                )
            )
        db.flush()
        for index in range(3):
            db.add(
                m.Invoice(
                    id=f"i{index}",
                    company_id="c",
                    source_row_id=f"r{index}",
                    session_id="s",
                    original_unit="IRR",
                    original_amount="100",
                    reference=f"invoice-{index}",
                    party_id="customer",
                    date=date(2026, 10, 1),
                    due_date=date(2026, 10, 10),
                    amount="100",
                    direction="sales",
                )
            )
        db.flush()
        db.add(
            m.ResultManifest(
                id="manifest",
                company_id="c",
                session_id="s",
                period_id="p",
                digest="b" * 64,
                selection={"row_ids": ["r0", "r1", "r2"]},
                metrics=[{"metric_key": "cash", "value": None, "reason_codes": ["bank_source_missing"]}],
                details={
                    "as_of_date": "2026-11-01",
                    "invoices": [
                        {
                            "id": "i0",
                            "direction": "sales",
                            "reference": "invoice-0",
                            "party_id": "customer",
                            "remaining": "100",
                            "amount": "100",
                            "due_date": "2026-10-20",
                            "evidence_refs": ["r0"],
                        },
                        {
                            "id": "i1",
                            "direction": "sales",
                            "reference": "invoice-1",
                            "party_id": "customer",
                            "remaining": "200",
                            "amount": "200",
                            "due_date": "2026-10-25",
                            "evidence_refs": ["r1"],
                        },
                        {
                            "id": "i2",
                            "direction": "sales",
                            "reference": "invoice-2",
                            "party_id": "customer",
                            "remaining": None,
                            "amount": "100",
                            "due_date": None,
                            "evidence_refs": ["r2"],
                        },
                    ],
                },
            )
        )
        db.flush()
        db.add(
            m.Finding(
                id="finding",
                company_id="c",
                manifest_id="manifest",
                code="bank_source_missing",
                title="مانده بانک",
                evidence=["r0"],
            )
        )
        db.flush()
        yield db


def create(db, kind="finding", subject="finding", actor="advisor", **extra):
    return service.create_case(
        db, "c", db.get(m.User, actor), CaseCreate(kind=kind, subject_id=subject, **extra).model_dump()
    )


def test_case_metadata_and_history_leave_finding_and_report_unchanged(workspace):
    db = workspace
    result = create(db, assignee_membership_id="advisor", next_action="درخواست گردش بانک")
    assert result["source_snapshot"]["amount"] is None
    assert result["source_snapshot"]["classification"]["kind"] == "data_limitation"
    values = CaseUpdate(
        state="resolved",
        reason="فایل مورد نیاز دریافت شد.",
        assignee_membership_id="advisor",
        due_date=date(2026, 11, 3),
        next_action="بررسی فایل",
    ).model_dump()
    changed = service.update_case(db, "c", db.get(m.User, "advisor"), result["id"], values, 1)
    assert changed["version"] == 2 and changed["state"] == "resolved"
    original = db.get(m.Finding, "finding")
    assert original.state == "open" and original.version == 1 and original.decision is None
    assert db.get(m.ResultManifest, "manifest").metrics[0]["value"] is None
    log = list(
        db.scalars(
            select(ControlActivity)
            .where(ControlActivity.case_id == result["id"])
            .order_by(ControlActivity.created_at)
        )
    )
    assert [item.kind for item in log] == ["created", "updated"]
    assert log[1].data["before"]["state"] == "open" and log[1].data["after"]["state"] == "resolved"


def test_current_membership_assignee_company_and_viewer_guards(workspace):
    db = workspace
    for assignee in ("viewer", "outsider"):
        with pytest.raises(DomainError):
            create(db, assignee_membership_id=assignee)
    for actor in ("viewer", "outsider"):
        with pytest.raises(DomainError):
            create(db, actor=actor)
    db.get(m.Membership, "advisor").active = False
    db.flush()
    with pytest.raises(DomainError):
        create(db)
    with pytest.raises(DomainError):
        create(db, actor="owner", assignee_membership_id="advisor")


def test_duplicate_subject_and_version_conflict_are_explicit(workspace):
    db = workspace
    result = create(db)
    with pytest.raises(DomainError) as error:
        create(db)
    assert error.value.code == "case_exists"
    command = ActivityCreate(kind="comment", message="بررسی شد").model_dump()
    with pytest.raises(DomainError) as error:
        service.record_activity(db, "c", db.get(m.User, "advisor"), result["id"], command, 9)
    assert error.value.code == "version_conflict"
    assert len(list(db.scalars(select(ControlActivity)))) == 1


def test_promise_exact_conversion_never_records_payment(workspace):
    db = workspace
    result = create(db, kind="invoice", subject="i0")
    source_before = dict(result["source_snapshot"])
    command = ActivityCreate(
        kind="promise",
        message="وعده مشتری",
        promise_date=date(2026, 11, 5),
        promise_amount="12345678901234567890123456789",
        unit="TOMAN",
    ).model_dump()
    updated = service.record_activity(db, "c", db.get(m.User, "advisor"), result["id"], command, 1)
    assert updated["version"] == 2 and updated["source_snapshot"] == source_before
    activity = db.scalar(select(ControlActivity).where(ControlActivity.kind == "promise"))
    assert activity.data["amount"] == "123456789012345678901234567890"
    assert db.scalar(select(m.Settlement.id)) is None
    assert db.scalar(select(m.Allocation.id)) is None
    assert db.get(m.Invoice, "i0").amount == "100"
    assert db.get(m.ResultManifest, "manifest").details["invoices"][0]["remaining"] == "100"


@pytest.mark.parametrize("value", ["NaN", "Infinity", "1e32", "0.0000001", "-1", "0"])
def test_invalid_promise_amount_does_not_append_activity(workspace, value):
    db = workspace
    result = create(db, kind="invoice", subject="i0")
    command = ActivityCreate(
        kind="promise", message="وعده", promise_date=date(2026, 11, 5), promise_amount=value
    ).model_dump()
    with pytest.raises(DomainError):
        service.record_activity(db, "c", db.get(m.User, "advisor"), result["id"], command, 1)
    assert len(list(db.scalars(select(ControlActivity)))) == 1
    assert db.get(ControlCase, result["id"]).version == 1


def test_promise_requires_invoice_and_date_and_other_comments_reject_promise_fields(workspace):
    db = workspace
    result = create(db)
    with pytest.raises(DomainError) as error:
        service.record_activity(
            db,
            "c",
            db.get(m.User, "advisor"),
            result["id"],
            ActivityCreate(kind="promise", message="وعده", promise_date=date(2026, 11, 5)).model_dump(),
            1,
        )
    assert error.value.code == "promise_requires_invoice"
    invoice = create(db, kind="invoice", subject="i0")
    with pytest.raises(DomainError) as error:
        service.record_activity(
            db,
            "c",
            db.get(m.User, "advisor"),
            invoice["id"],
            ActivityCreate(kind="promise", message="وعده").model_dump(),
            1,
        )
    assert error.value.code == "promise_date_required"
    with pytest.raises(DomainError):
        service.record_activity(
            db,
            "c",
            db.get(m.User, "advisor"),
            invoice["id"],
            ActivityCreate(kind="comment", message="یادداشت", promise_amount="10").model_dump(),
            1,
        )


def test_priority_uses_exact_remaining_then_delay_not_unknown_as_zero(workspace):
    db = workspace
    result = service.collection(db, "c", db.get(m.User, "viewer"), 0, "")
    assert [item["id"] for item in result["items"]] == ["i1", "i0", "i2"]
    assert result["items"][0]["overdue_days"] == 7
    assert result["items"][-1]["ranked"] is False and result["items"][-1]["remaining"] is None
    assert result["as_of_date"] == "2026-11-01" and result["priority_formula"]
    assert service.collection(db, "c", db.get(m.User, "viewer"), 0, "invoice-1")["total"] == 1


def test_classification_never_calls_unknown_pattern_fraud():
    assert service.classification("ledger_unbalanced")["kind"] == "control_error"
    assert service.classification("bank_source_missing")["kind"] == "data_limitation"
    assert service.classification("unfamiliar_pattern")["kind"] == "needs_review"
    with pytest.raises(ValidationError):
        ActivityCreate(kind="comment", message="   ")
    with pytest.raises(ValidationError):
        CaseUpdate(state="resolved", reason="   ")


def test_http_case_replay_activity_immutability_and_viewer_readonly(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.control_models import ControlCase, ControlActivity
with transaction("company-a") as db:
    finding=m.Finding(company_id="company-a",manifest_id=manifest_ids[-1],code="bank_source_missing",title="بانک",evidence=[])
    db.add(finding);db.flush();finding_id=finding.id
owner=client_for("owner");advisor=client_for("advisor");viewer=client_for("viewer");outsider=client_for("outsider")
path=base+"/control/cases"
data={"kind":"finding","subject_id":finding_id,"assignee_membership_id":members["advisor"],"next_action":"بررسی"}
assert command(viewer,"POST",path,data).status_code==403
assert outsider.get(base+"/control/assignees").status_code==404
key=str(uuid4());response=command(advisor,"POST",path,data,key=key)
assert response.status_code==201,response.text
case=response.json();case_id=case["id"]
assert command(advisor,"POST",path,data,key=key).json()["id"]==case_id
assert command(owner,"POST",path,data).status_code==409
activity=path+"/"+case_id+"/activities"
assert viewer.get(activity).status_code==200
assert command(viewer,"POST",activity,{"kind":"comment","message":"رد"}).status_code==403
key=str(uuid4());response=command(advisor,"POST",activity,{"kind":"document_request","message":"گردش بانک را ارسال کنید."},key=key)
assert response.status_code==201,response.text
assert response.json()["version"]==2
assert command(advisor,"POST",activity,{"kind":"document_request","message":"گردش بانک را ارسال کنید."},key=key).json()["version"]==2
assert len(viewer.get(activity).json()["items"])==2
assert command(advisor,"POST",activity,{"kind":"comment","message":"کهنه"},version=1).status_code==409
with transaction("company-a") as db:
    assert db.get(m.Finding,finding_id).state=="open"
    identifier=db.scalar(select(ControlActivity.id))
try:
    with transaction("company-a") as db:
        db.execute(update(ControlActivity).where(ControlActivity.id==identifier).values(message="تغییر"))
except Exception as error:
    assert "immutable" in str(error)
else:
    raise AssertionError("Activity history was editable")
assert outsider.get(path+"/"+case_id).status_code==404
csrf=owner.headers.pop("x-csrf-token")
assert command(owner,"POST",activity,{"kind":"comment","message":"بدون نشست"},version=2).status_code==403
initialize()
""",
    )


def test_disabled_receivables_blocks_current_collection_and_case_mutations_preserves_history(workspace):
    db = workspace
    user = db.get(m.User, "advisor")
    case = service.create_case(db, "c", user, {"kind": "invoice", "subject_id": "i0"})
    db.add(m.CompanyModule(company_id="c", key="receivables", enabled=False))
    db.flush()
    for action in (
        lambda: service.collection(db, "c", user, 0, ""),
        lambda: service.create_case(db, "c", user, {"kind": "invoice", "subject_id": "i1"}),
        lambda: service.update_case(
            db, "c", user, case["id"], CaseUpdate(state="resolved", reason="بررسی").model_dump(), 1
        ),
        lambda: service.record_activity(
            db, "c", user, case["id"], ActivityCreate(kind="comment", message="تازه").model_dump(), 1
        ),
    ):
        with pytest.raises(DomainError) as failure:
            action()
        assert failure.value.code == "module_disabled"
    # Disabling is an operational guard, not deletion of prior evidence/history.
    historical = service.public_case(db, "c", db.get(ControlCase, case["id"]))
    assert historical["source_snapshot"]["id"] == "i0"
    assert len(service.activities(db, "c", user, case["id"], 25, None)["items"]) == 1
