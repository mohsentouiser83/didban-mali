from datetime import date

import pytest
from sqlalchemy import select
from test_posting import book as book
from test_posting import data

from didban import document_thread_service as service
from didban import models as m
from didban.accounting_models import Draft
from didban.accounting_service import save_draft
from didban.document_thread_models import NativeDocumentActivity as Activity
from didban.document_thread_models import NativeDocumentThread as Thread
from didban.errors import DomainError
from didban.posting_models import NativeJournal
from didban.posting_service import post_batch, preview


def context(read):
    return {
        "subject_kind": read["subject"]["kind"],
        "subject_id": read["subject"]["id"],
        "expected_subject_digest": read["subject"]["digest"],
        "expected_version": read["expected_version"],
    }


def draft_subject(db):
    user = db.get(m.User, "advisor")
    draft = save_draft(db, "c", user, data(db, "10"))
    return user, draft, service.read(db, "c", user, "draft", draft["id"])


def test_comments_requests_assignment_and_same_thread_after_posting(book):
    db = book
    user, draft, initial = draft_subject(db)
    assert initial["thread"] is None and db.scalar(select(Thread.id)) is None
    commented = service.add(
        db, "c", user, context(initial) | {"kind": "comment", "message": "مدرک بررسی شود"}
    )
    assert commented["thread"]["version"] == 2
    followed = service.update(
        db,
        "c",
        user,
        commented["thread"]["id"],
        context(commented)
        | {
            "assignee_membership_id": "advisor",
            "due_date": date(2026, 11, 10),
            "state": "in_progress",
            "next_action": "دریافت اصل مدرک",
            "reason": "ارجاع به حسابدار",
        },
    )
    assert followed["thread"]["assignee_name"] == "advisor" and followed["thread"]["version"] == 3
    requested = service.add(
        db,
        "c",
        user,
        context(followed) | {"kind": "document_request", "message": "اصل قرارداد را در پرونده ارائه کنید"},
    )
    activities = service.activities(db, "c", user, requested["thread"]["id"])["items"]
    assert {row["kind"] for row in activities} == {"comment", "document_request", "updated"}
    assert all(row["context"]["version"] == 1 and row["created_at"].endswith("+00:00") for row in activities)
    finance = db.get(m.User, "finance_manager")
    checked = preview(db, "c", finance, draft["id"])
    journal = post_batch(
        db, "c", finance, [{key: checked[key] for key in ("draft_id", "expected_version", "digest")}]
    )["items"][0]
    from_journal = service.read(db, "c", user, "journal", journal["id"])
    assert (
        from_journal["thread"]["id"] == requested["thread"]["id"]
        and from_journal["subject"]["digest"] == journal["digest"]
    )
    result = service.add(
        db, "c", user, context(from_journal) | {"kind": "comment", "message": "پس از ثبت نیز سابقه حفظ شد"}
    )
    assert result["thread"]["version"] == 5
    assert db.get(Draft, draft["id"]).version == 2
    assert len(list(db.scalars(select(NativeJournal)))) == 1 and db.scalar(select(m.JournalLine.id)) is None
    assert len(list(db.scalars(select(Thread)))) == 1


def test_changed_source_and_stale_thread_do_not_rebase_a_comment(book):
    db = book
    user, draft, old = draft_subject(db)
    save_draft(db, "c", user, data(db, "20"), draft["id"], 1)
    with pytest.raises(DomainError) as error:
        service.add(db, "c", user, context(old) | {"kind": "comment", "message": "متن درباره نسخه قدیمی"})
    assert error.value.code == "document_context_changed" and db.scalar(select(Thread.id)) is None
    current = service.read(db, "c", user, "draft", draft["id"])
    service.add(db, "c", user, context(current) | {"kind": "comment", "message": "نسخه جدید بررسی شد"})
    with pytest.raises(DomainError) as error:
        service.add(db, "c", user, context(current) | {"kind": "comment", "message": "هم‌زمان"})
    assert error.value.code == "version_conflict" and len(list(db.scalars(select(Activity)))) == 1


def test_assignment_can_start_thread_but_invalid_or_foreign_assignee_cannot(book):
    db = book
    user, draft, current = draft_subject(db)
    payload = context(current) | {
        "assignee_membership_id": "viewer",
        "due_date": None,
        "state": "open",
        "next_action": "",
        "reason": "ارجاع",
    }
    with pytest.raises(DomainError):
        service.update(db, "c", user, None, payload)
    assert db.scalar(select(Thread.id)) is None
    value = service.update(db, "c", user, None, payload | {"assignee_membership_id": "finance_manager"})
    assert value["thread"]["version"] == 2
    db.get(m.Membership, "finance_manager").active = False
    db.flush()
    assert service.read(db, "c", user, "draft", draft["id"])["thread"]["assignee_active"] is False
    with pytest.raises(DomainError):
        service.read(db, "other", user, "draft", draft["id"])
    db.get(m.Membership, "advisor").role = "viewer"
    db.flush()
    assert service.read(db, "c", user, "draft", draft["id"])["can_write"] is False
    with pytest.raises(DomainError):
        service.add(db, "c", user, context(value) | {"kind": "comment", "message": "غیرمجاز"})


def test_http_discussion_replay_shared_subject_immutable_activities_and_tenant_fk(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.accounting_service import save_account,save_draft
from didban.document_thread_models import NativeDocumentThread as Thread,NativeDocumentActivity as Activity
owner=client_for("owner");advisor=client_for("advisor");viewer=client_for("viewer");outsider=client_for("outsider")
with transaction("company-a") as db:
    actor=db.get(m.User,users["owner"])
    accounts=[save_account(db,"company-a",actor,{"code":code,"name":code,"active":True}) for code in ("001","002")]
    draft=save_draft(db,"company-a",actor,{"period_id":period_id,"date":date(2026,9,3),"description":"سند همکاری","unit":"IRR","lines":[{"account_id":accounts[0]["id"],"party_id":"customer","debit":"10","credit":"0"},{"account_id":accounts[1]["id"],"party_id":"customer","debit":"0","credit":"10"}]})
prefix=base+"/accounting/discussions"
params={"subject_kind":"draft","subject_id":draft["id"]}
assert outsider.get(prefix,params=params).status_code==404
read=advisor.get(prefix,params=params).json();assert read["thread"] is None
body=params|{"expected_subject_digest":read["subject"]["digest"],"expected_version":1,"kind":"document_request","message":"اصل سند لازم است"}
assert command(viewer,"POST",prefix+"/activities",body).status_code==403
key=str(uuid4());result=command(advisor,"POST",prefix+"/activities",body,key=key)
assert result.status_code==201,result.text
assert command(advisor,"POST",prefix+"/activities",body,key=key).json()==result.json()
thread=result.json()["thread"];assert thread["version"]==2
assert command(owner,"POST",prefix+"/activities",body).status_code==409
assert len(viewer.get(prefix+"/"+thread["id"]+"/activities").json()["items"])==1
try:
    with transaction("company-a") as db:db.execute(update(Activity).values(message="تغییر"))
except IntegrityError:pass
else:raise AssertionError("Discussion history was editable")
try:
    with transaction("company-b") as db:
        db.add(Thread(company_id="company-b",draft_id=draft["id"],actor_id=users["outsider"]))
except IntegrityError:pass
else:raise AssertionError("Cross-company native draft FK was accepted")
with transaction("company-a") as db:
    assert len(list(db.scalars(select(Thread))))==1
    assert len(list(db.scalars(select(Activity))))==1
    assert db.scalar(select(m.JournalLine.id)) is None
    db.get(m.Membership,members["advisor"]).role="viewer"
assert command(advisor,"POST",prefix+"/activities",body,key=key).status_code==403
initialize()
""",
    )
