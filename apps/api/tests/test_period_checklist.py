from datetime import date

import pytest
from sqlalchemy import select
from test_period_locks import data as data

from didban import models as m
from didban.errors import DomainError
from didban.period_checklist_service import save
from didban.period_lock_models import PeriodLockEvent
from didban.period_lock_service import checklist, transition


def payload(**patch):
    return {
        "title": "بررسی تأییدیه بانک",
        "required": True,
        "responsible_member_id": "advisor",
        "due_date": date(2026, 12, 31),
        "reason": "برنامه پایان سال",
        **patch,
    }


def test_required_tasks_exact_versions_completion_and_close_pin(data):
    db = data
    user = db.get(m.User, "finance_manager")
    task = save(db, "c", user, "p", payload())
    current = checklist(db, "c", "p", user)
    assert not current["ready_to_close"] and current["custom_items"][0]["version"] == 1
    with pytest.raises(DomainError) as error:
        transition(db, "c", user, "p", True, "پایان", True, 1, current["checklist_digest"])
    assert error.value.code == "period_close_blocked"
    completed = save(db, "c", user, "p", payload(completed=True, reason="نامه بانک تطبیق شد"), task["id"], 1)
    assert completed["completed_by"] == user.id and completed["completed_at"].endswith("+00:00")
    assert checklist(db, "c", "p", user)["ready_to_close"]
    with pytest.raises(DomainError) as error:
        transition(db, "c", user, "p", True, "پایان", True, 1, current["checklist_digest"])
    assert error.value.code == "period_checklist_changed"
    latest = checklist(db, "c", "p", user)
    transition(db, "c", user, "p", True, "پایان", True, 1, latest["checklist_digest"])
    event = db.scalar(select(PeriodLockEvent))
    assert event.checklist["custom_items"][0] == completed
    with pytest.raises(DomainError) as error:
        save(db, "c", user, "p", payload(), task["id"], 2)
    assert error.value.code == "period_closed"
    assert db.scalar(select(m.AuditEvent.id).where(m.AuditEvent.action == "period.checklist_changed"))


def test_optional_tasks_current_authority_assignee_and_archiving(data):
    db = data
    user = db.get(m.User, "advisor")
    task = save(db, "c", user, "p", payload(required=False))
    current = checklist(db, "c", "p", user)
    assert current["ready_to_close"] and any(
        row["code"] == "period_optional_task_pending" for row in current["warnings"]
    )
    with pytest.raises(DomainError):
        save(db, "c", user, "p", payload(), task["id"], 9)
    with pytest.raises(DomainError):
        save(db, "c", db.get(m.User, "viewer"), "p", payload())
    future = save(db, "c", user, "p", payload(due_date=date(2027, 1, 1), active=False))
    assert future["due_date"] == "2027-01-01"
    db.get(m.Membership, "owner").active = False
    with pytest.raises(DomainError):
        save(db, "c", user, "p", payload(responsible_member_id="owner"))
    with pytest.raises(DomainError):
        save(db, "other", user, "p", payload())
    save(db, "c", user, "p", payload(active=False, required=False), task["id"], 1)
    assert checklist(db, "c", "p", user)["custom_items"] == []


def test_http_manager_can_choose_safe_task_assignee_without_member_administration(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
manager=client_for("finance_manager");outsider=client_for("outsider")
response=manager.get(base+"/control/assignees")
assert response.status_code==200,response.text
people=response.json()["items"]
assert {row["membership_id"] for row in people}=={members["owner"],members["finance_manager"],members["advisor"]}
assert all(set(row)=={"membership_id","name"} for row in people)
assert manager.get(base+"/members").status_code==403
assert command(manager,"PATCH",base+"/members/"+members["advisor"],{"role":"owner"}).status_code==403
assert outsider.get(base+"/control/assignees").status_code==404
response=command(manager,"POST",base+"/financial-periods/"+period_id+"/checklist-items",{"title":"بررسی پایان دوره","required":True,"responsible_member_id":members["advisor"],"reason":"تعیین مسئول"})
assert response.status_code==200,response.text
assert response.json()["responsible_member_id"]==members["advisor"]
""",
    )
