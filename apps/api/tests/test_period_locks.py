from datetime import date

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from didban import models as m
from didban.accounting_models import Draft
from didban.accounting_service import grant
from didban.errors import DomainError
from didban.period_lock_models import PeriodLock, PeriodLockEvent
from didban.period_lock_service import checklist, require_open_period, transition


@pytest.fixture
def data():
    engine = create_engine("sqlite://")
    m.Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        db.add_all([m.Company(id="c", name="شرکت"), m.Company(id="other", name="دیگر")])
        for role in ("owner", "finance_manager", "advisor", "viewer"):
            db.add(m.User(id=role, email=role + "@example.test", name=role, password_hash="unused"))
        db.flush()
        for role in ("owner", "finance_manager", "advisor", "viewer"):
            db.add(m.Membership(id=role, company_id="c", user_id=role, role=role))
        db.add(m.Period(id="p", company_id="c", name="سال", start=date(2026, 1, 1), end=date(2026, 12, 31)))
        db.flush()
        yield db


def test_close_reopen_reasons_versions_and_no_financial_effect(data):
    db = data
    manager = db.get(m.User, "finance_manager")
    current = checklist(db, "c", "p", manager)
    assert current["warnings"][0]["code"] == "period_report_missing"
    with pytest.raises(DomainError):
        transition(db, "c", manager, "p", True, "بستن", False, 1)
    with pytest.raises(DomainError):
        transition(db, "c", manager, "p", True, "   ", True, 1)
    closed = transition(db, "c", manager, "p", True, "پایان بررسی عملیاتی", True, 1)
    assert closed["version"] == 2 and closed["closed"]
    with pytest.raises(DomainError) as error:
        require_open_period(db, "c", "p")
    assert error.value.code == "period_closed"
    with pytest.raises(DomainError):
        transition(db, "c", manager, "p", False, "رفع نقص", False, 1)
    opened = transition(db, "c", manager, "p", False, "رفع نقص", False, 2)
    assert opened["version"] == 3 and not opened["closed"]
    require_open_period(db, "c", "p")
    assert len(list(db.scalars(select(PeriodLockEvent)))) == 2
    assert db.scalar(select(m.JournalLine.id)) is None
    assert db.scalar(select(m.ReportApproval.id)) is None


def test_owner_requires_explicit_authority_and_revocation_is_live(data):
    db = data
    owner = db.get(m.User, "owner")
    manager = db.get(m.User, "finance_manager")
    advisor = db.get(m.User, "advisor")
    with pytest.raises(DomainError):
        transition(db, "c", owner, "p", True, "دلیل", True, 1)
    grant(db, "c", owner, "advisor", {"post_journal": True, "reopen_period": True}, 1)
    transition(db, "c", advisor, "p", True, "دلیل", True, 1)
    grant(db, "c", owner, "advisor", {"post_journal": False, "reopen_period": False}, 2)
    with pytest.raises(DomainError):
        transition(db, "c", advisor, "p", False, "دلیل", False, 2)
    db.get(m.Membership, "finance_manager").role = "viewer"
    with pytest.raises(DomainError):
        transition(db, "c", manager, "p", False, "دلیل", False, 2)
    with pytest.raises(DomainError):
        checklist(db, "other", "p", owner)


@pytest.mark.parametrize(
    "state", ["receiving", "sealed", "processing", "waiting_input", "waiting_dependency"]
)
def test_active_session_blocks_close(data, state):
    db = data
    manager = db.get(m.User, "finance_manager")
    db.add(m.ProcessingSession(company_id="c", period_id="p", actor_id=manager.id, state=state))
    db.flush()
    assert checklist(db, "c", "p", manager)["active_session_count"] == 1
    with pytest.raises(DomainError) as error:
        transition(db, "c", manager, "p", True, "دلیل", True, 1)
    assert error.value.code == "period_close_blocked"
    assert db.scalar(select(PeriodLock.id)) is None


def test_draft_and_factual_error_cannot_be_bypassed_with_warning_ack(data):
    db = data
    manager = db.get(m.User, "finance_manager")
    draft = Draft(
        company_id="c",
        period_id="p",
        date=date(2026, 11, 1),
        description="پیش‌نویس",
        lines=[],
        original_unit="IRR",
        actor_id=manager.id,
    )
    db.add(draft)
    db.flush()
    with pytest.raises(DomainError):
        transition(db, "c", manager, "p", True, "تأیید", True, 1)
    db.delete(draft)
    db.flush()
    session = m.ProcessingSession(
        id="s", company_id="c", period_id="p", actor_id=manager.id, state="completed_limited"
    )
    db.add(session)
    db.flush()
    report = m.ResultManifest(
        id="r",
        company_id="c",
        session_id="s",
        period_id="p",
        digest="test",
        selection={},
        metrics=[],
        details={},
    )
    db.add(report)
    db.flush()
    db.add(
        m.Finding(
            company_id="c",
            manifest_id="r",
            code="ledger_unbalanced",
            title="سند نامتوازن",
            evidence=[],
            state="reviewed",
        )
    )
    db.flush()
    assert checklist(db, "c", "p", manager)["errors"][0]["code"] == "ledger_unbalanced"
    with pytest.raises(DomainError):
        transition(db, "c", manager, "p", True, "قبول", True, 1)


def test_http_lock_replay_history_immutable_and_closed_input_guard(tmp_path):
    import os
    import subprocess
    import sys
    from pathlib import Path

    root = Path(__file__).resolve().parents[3]
    code = r"""
from datetime import date
from uuid import uuid4
from fastapi.testclient import TestClient
from sqlalchemy import select,text
from sqlalchemy.exc import IntegrityError
from didban.api import app
from didban.config import settings
from didban.db import initialize,transaction
from didban.models import Company,User,Membership,Period,JournalLine,ReportApproval
from didban.period_lock_models import PeriodLockEvent
from didban.security import hasher
initialize()
with transaction() as db:
    user=User(id='u',email='qa@example.test',name='مدیر',password_hash=hasher.hash('Synthetic-password-2026!'))
    db.add_all([user,Company(id='c',name='شرکت')]);db.flush()
    db.add_all([Membership(company_id='c',user_id='u',role='finance_manager'),Period(id='p',company_id='c',name='سال',start=date(2026,1,1),end=date(2026,12,31))])
client=TestClient(app)
login=client.post('/api/v1/auth/login',json={'email':'qa@example.test','password':'Synthetic-password-2026!'})
assert login.status_code==200,login.text
csrf=login.json()['csrf']
def headers(key=None,version=1):return {'X-CSRF-Token':csrf,'Idempotency-Key':key or str(uuid4()),'Origin':settings.web_origin,'If-Match':str(version)}
base='/api/v1/companies/c/financial-periods/p'
body={'reason':'بستن آزمایشی','acknowledge_warnings':True};h=headers('close-once')
closed=client.post(base+'/close',json=body,headers=h)
assert closed.status_code==200,closed.text
assert closed.json()['closed'] is True
assert client.post(base+'/close',json=body,headers=h).json()==closed.json()
assert client.post('/api/v1/companies/c/processing-sessions',json={'period_id':'p'},headers=headers()).status_code==409
assert client.get(base+'/lock-history').json()['items'][0]['reason']=='بستن آزمایشی'
opened=client.post(base+'/reopen',json={'reason':'رفع نقص'},headers=headers(version=2))
assert opened.status_code==200 and opened.json()['closed'] is False,opened.text
with transaction('c') as db:
    assert len(list(db.scalars(select(PeriodLockEvent))))==2
    assert db.scalar(select(JournalLine.id)) is None
    assert db.scalar(select(ReportApproval.id)) is None
try:
    with transaction('c') as db:db.execute(text('UPDATE period_lock_events SET reason=reason'))
except IntegrityError:pass
else:raise AssertionError('Lock history must be immutable')
"""
    env = os.environ | {
        "PYTHONPATH": str(root / "apps/api"),
        "DIDBAN_DATABASE_URL": "sqlite:///" + str(tmp_path / "lock.db"),
        "DIDBAN_STORAGE": str(tmp_path / "files"),
    }
    result = subprocess.run(
        [sys.executable, "-c", code], cwd=root, env=env, capture_output=True, text=True, timeout=60
    )
    assert result.returncode == 0, result.stdout + result.stderr
