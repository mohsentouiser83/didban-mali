import pytest
from sqlalchemy import select
from test_company_groups import workspace as workspace
from test_consolidation import pair, setup

from didban import models as m
from didban.consolidation_approval_models import ConsolidationApproval
from didban.consolidation_approval_service import POLICY, approve, preview
from didban.consolidation_service import create_draft, read_draft
from didban.errors import DomainError
from didban.posting_models import NativeJournal


def prepared(db):
    user = db.get(m.User, "u")
    group, comparison, mapping = setup(db, user)
    body = {"comparison_id": comparison["id"], "pairs": [pair(mapping), pair(mapping, "balance")]}
    draft = create_draft(db, "a", user, body)
    member = db.scalar(
        select(m.Membership).where(m.Membership.company_id == "a", m.Membership.user_id == "u")
    )
    return user, member, group, draft, body


def test_owner_not_implicit_exact_snapshot_policy_and_approval_no_effect(workspace):
    db, _ = workspace
    user, member, _group, draft, body = prepared(db)
    assert preview(db, "a", user, draft["id"])["can_approve"] is False
    with pytest.raises(DomainError):
        approve(db, "a", user, draft["id"], draft["digest"], POLICY)
    member.approve_financial_report = True
    member.version += 1
    db.flush()
    checked = preview(db, "a", user, draft["id"])
    assert checked["can_approve"] and checked["expected_digest"] == draft["digest"]
    with pytest.raises(DomainError):
        approve(db, "a", user, draft["id"], "0" * 64, POLICY)
    with pytest.raises(DomainError):
        approve(db, "a", user, draft["id"], draft["digest"], "obsolete")
    original = draft["snapshot"]
    event = approve(db, "a", user, draft["id"], draft["digest"], POLICY)
    assert event["permission_provenance"].startswith("explicit:membership:")
    assert event["scope"] == "selected_intercompany_eliminations" and event["policy_version"] == POLICY
    assert approve(db, "a", user, draft["id"], draft["digest"], POLICY)["id"] == event["id"]
    read = read_draft(db, "a", user, draft["id"])
    assert read["snapshot"] == original and read["approval_status"] == "approved_selected_eliminations"
    assert len(read["approvals"]) == 1 and read["statutory_certification"] is False
    assert db.scalar(select(NativeJournal.id)) is None and db.scalar(select(m.Allocation.id)) is None
    other = create_draft(db, "a", user, body)
    assert other["id"] != draft["id"] and other["approvals"] == []
    member.approve_financial_report = False
    member.version += 1
    db.flush()
    with pytest.raises(DomainError):
        approve(db, "a", user, draft["id"], draft["digest"], POLICY)
    assert len(read_draft(db, "a", user, draft["id"])["approvals"]) == 1


def test_finance_manager_authority_and_viewer_report_flag_cannot_approve(workspace):
    db, _ = workspace
    user, member, _group, draft, _body = prepared(db)
    member.role = "finance_manager"
    db.flush()
    event = approve(db, "a", user, draft["id"], draft["digest"], POLICY)
    assert event["permission_provenance"] == "role:finance_manager"
    member.role = "viewer"
    member.approve_financial_report = True
    db.flush()
    assert preview(db, "a", user, draft["id"])["can_approve"] is False
    with pytest.raises(DomainError):
        approve(db, "a", user, draft["id"], draft["digest"], POLICY)


def test_original_company_permissions_rechecked_after_group_edit(workspace):
    from didban.company_group_models import CompanyGroup

    db, _ = workspace
    user, member, group, draft, _body = prepared(db)
    member.approve_financial_report = True
    db.flush()
    approve(db, "a", user, draft["id"], draft["digest"], POLICY)
    db.get(CompanyGroup, group["id"]).company_ids = ["a", "c"]
    selected = db.scalar(
        select(m.Membership).where(m.Membership.company_id == "b", m.Membership.user_id == "u")
    )
    selected.active = False
    db.flush()
    for action in (
        lambda: read_draft(db, "a", user, draft["id"]),
        lambda: preview(db, "a", user, draft["id"]),
        lambda: approve(db, "a", user, draft["id"], draft["digest"], POLICY),
    ):
        with pytest.raises(DomainError):
            action()
    assert len(list(db.scalars(select(ConsolidationApproval)))) == 1


def test_http_approval_replay_frozen_record_and_revoked_scope_export(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
import sys
sys.path.insert(0,"apps/api/tests")
from test_consolidation import setup,pair
from didban.consolidation_approval_models import ConsolidationApproval
from didban.consolidation_approval_service import POLICY
from didban.posting_models import NativeJournal
with transaction() as db:
    source_actor=m.User(id="u",name="منبع",email="source@example.test",password_hash="unused")
    db.add(source_actor);db.add_all([m.Company(id=key,name=key) for key in ("a","b","c")]);db.flush()
    for company in ("a","b","c"):
        db.add(m.Membership(company_id=company,user_id="u",role="owner" if company=="a" else "viewer"))
    db.add_all([m.Membership(company_id=company,user_id=users["owner"],role="owner" if company=="a" else "viewer",approve_financial_report=company=="a") for company in ("a","b")]);db.flush()
    for company in ("a","b"):
        db.add(m.Period(id=company+"p",company_id=company,name="دوره",start=date(2026,1,1),end=date(2026,1,31)));db.flush()
        db.add(m.ProcessingSession(id=company+"s",company_id=company,period_id=company+"p",actor_id="u",state="completed"));db.flush()
    group,comparison,mapping=setup(db,source_actor,fresh_manifests=True)
owner=client_for("owner")
prefix="/api/v1/companies/a/consolidation/drafts"
draft=command(owner,"POST",prefix,{"comparison_id":comparison["id"],"pairs":[pair(mapping)]}).json()
path=prefix+"/"+draft["id"]
checked=owner.get(path+"/approval-preview").json();assert checked["can_approve"] is True
body={"expected_digest":checked["expected_digest"],"policy_version":POLICY};key=str(uuid4())
approved=command(owner,"POST",path+"/approvals",body,key=key)
assert approved.status_code==201,approved.text
assert command(owner,"POST",path+"/approvals",body,key=key).json()==approved.json()
assert owner.get(path).json()["approval_status"]=="approved_selected_eliminations"
assert owner.get(path+"/export").content[:2]==b"PK"
try:
    with transaction("a") as db:db.execute(update(ConsolidationApproval).values(policy_version="changed"))
except IntegrityError:pass
else:raise AssertionError("Approval record was editable")
with transaction("a") as db:
    member=db.scalar(select(m.Membership).where(m.Membership.company_id=="b",m.Membership.user_id==users["owner"]))
    member.active=False
for suffix in ("","/approval-preview","/export"):
    assert owner.get(path+suffix).status_code==404
assert command(owner,"POST",path+"/approvals",body,key=key).status_code==404
with transaction("a") as db:
    assert len(list(db.scalars(select(ConsolidationApproval))))==1
    assert db.scalar(select(NativeJournal.id)) is None
initialize()
""",
    )
