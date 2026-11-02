import io

import openpyxl
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from didban import models as m
from didban.accounting_models import Account
from didban.accounting_setup_service import import_chart, parse_chart, preview_chart, setup, update_mode
from didban.errors import DomainError


@pytest.fixture
def data():
    engine = create_engine("sqlite://")
    m.Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        owner = m.User(id="owner", email="owner@example.test", name="مالک", password_hash="test")
        manager = m.User(id="manager", email="manager@example.test", name="مدیر", password_hash="test")
        db.add_all([owner, manager, m.Company(id="c", name="شرکت"), m.Company(id="other", name="دیگر")])
        db.flush()
        db.add_all(
            [
                m.Membership(company_id="c", user_id="owner", role="owner"),
                m.Membership(company_id="c", user_id="manager", role="finance_manager"),
            ]
        )
        db.flush()
        yield db, owner, manager


def test_mode_only_owner_versioned_availability_does_not_grant_posting_or_financial_effect(data):
    db, owner, manager = data
    assert setup(db, "c", owner)["mode"] == "analysis"
    with pytest.raises(DomainError):
        update_mode(db, "c", manager, "primary", 1)
    saved = update_mode(db, "c", owner, "primary", 1)
    assert saved["version"] == 2 and saved["posting_available"] is True
    assert saved["posting_reason"] is None
    from didban.accounting_service import capabilities

    assert capabilities(db, "c", owner)["can_post"] is False
    assert capabilities(db, "c", manager)["can_post"] is True
    with pytest.raises(DomainError):
        update_mode(db, "c", owner, "analysis", 1)
    assert db.scalar(select(m.JournalLine.id)) is None
    assert db.scalar(select(m.ResultManifest.id)) is None


def test_import_preview_does_not_change_catalog_then_guard_changes_and_company(data):
    db, owner, manager = data
    rows = [{"code": "001", "name": "بانک", "active": True}, {"code": "002", "name": "هزینه", "active": True}]
    checked = preview_chart(db, "c", manager, rows)
    assert db.scalar(select(Account.id)) is None
    with pytest.raises(DomainError):
        import_chart(db, "other", manager, checked["preview_id"])
    with pytest.raises(DomainError):
        import_chart(db, "c", owner, checked["preview_id"])
    result = import_chart(db, "c", manager, checked["preview_id"])
    assert result["created_count"] == 2
    assert list(db.scalars(select(Account.code).order_by(Account.code))) == ["001", "002"]
    with pytest.raises(DomainError):
        import_chart(db, "c", manager, checked["preview_id"])
    with pytest.raises(DomainError):
        preview_chart(db, "c", manager, [rows[0], {"code": "003", "name": "جدید", "active": True}])
    assert db.scalar(select(Account.id).where(Account.code == "003")) is None
    assert db.scalar(select(m.JournalLine.id)) is None


def test_duplicate_and_stale_catalog_rejected_all_or_none(data):
    db, owner, _ = data
    row = {"code": "001", "name": "بانک", "active": True}
    with pytest.raises(DomainError):
        preview_chart(db, "c", owner, [row, row])
    checked = preview_chart(db, "c", owner, [row])
    db.add(Account(company_id="c", code="002", name="دیگر", active=True))
    db.flush()
    with pytest.raises(DomainError) as error:
        import_chart(db, "c", owner, checked["preview_id"])
    assert error.value.code == "chart_changed"
    assert db.scalar(select(Account.id).where(Account.code == "001")) is None


def test_csv_preserves_codes_and_rejects_invalid_headers_and_blank_names():
    rows = parse_chart("chart.csv", b"code,name\n001,Bank\n002,Expense\n")["rows"]
    assert rows[0]["code"] == "001"
    with pytest.raises(DomainError):
        parse_chart("chart.csv", b"wrong,name\n001,Bank\n")
    with pytest.raises(ValueError):
        parse_chart("chart.csv", b"code,name\n001,   \n")
    with pytest.raises(DomainError):
        parse_chart("chart.zip", b"bad")


def test_xlsx_text_codes_only_and_formulas_rejected():
    def workbook(value):
        book = openpyxl.Workbook()
        sheet = book.active
        sheet.append(["code", "name"])
        sheet.append([value, "Bank"])
        stream = io.BytesIO()
        book.save(stream)
        return stream.getvalue()

    assert parse_chart("chart.xlsx", workbook("0001"))["rows"][0]["code"] == "0001"
    with pytest.raises(DomainError):
        parse_chart("chart.xlsx", workbook(1))
    with pytest.raises(DomainError):
        parse_chart("chart.xlsx", workbook("=1+1"))


def test_isolated_http_import_replay_and_immutable_preview(tmp_path):
    import os
    import subprocess
    import sys
    from pathlib import Path

    root = Path(__file__).resolve().parents[3]
    code = r"""
from uuid import uuid4
from fastapi.testclient import TestClient
from sqlalchemy import select,text
from sqlalchemy.exc import IntegrityError
from didban.api import app
from didban.config import settings
from didban.db import initialize,transaction
from didban.models import Company,User,Membership,JournalLine
from didban.accounting_models import Account
from didban.security import hasher
initialize()
with transaction() as db:
    user=User(id='u',email='qa@example.test',name='مالک',password_hash=hasher.hash('Synthetic-password-2026!'))
    db.add_all([user,Company(id='c',name='شرکت')]);db.flush();db.add(Membership(company_id='c',user_id='u',role='owner'))
client=TestClient(app)
login=client.post('/api/v1/auth/login',json={'email':'qa@example.test','password':'Synthetic-password-2026!'})
assert login.status_code==200,login.text
csrf=login.json()['csrf']
def headers(key=None,version=None):
    result={'X-CSRF-Token':csrf,'Idempotency-Key':key or str(uuid4()),'Origin':settings.web_origin}
    if version:result['If-Match']=str(version)
    return result
base='/api/v1/companies/c/accounting/setup'
assert client.get(base).json()['mode']=='analysis'
assert client.patch(base,json={'mode':'primary'},headers=headers(version=1)).json()['version']==2
assert client.patch(base,json={'mode':'analysis'},headers=headers(version=1)).status_code==409
parsed=client.post(base+'/chart-file',files={'file':('chart.csv',b'code,name\n0001,Bank\n','text/csv')},headers=headers())
assert parsed.status_code==200,parsed.text
assert parsed.json()['rows'][0]['code']=='0001'
unauth=TestClient(app).post(base+'/chart-file',files={'file':('chart.csv',b'bad','text/csv')})
assert unauth.status_code==401,unauth.text
rows=[{'code':'0001','name':'بانک','active':True}]
preview=client.post(base+'/chart-preview',json={'rows':rows},headers=headers())
assert preview.status_code==200,preview.text
body={'preview_id':preview.json()['preview_id']};h=headers(key='import-once')
first=client.post(base+'/chart-import',json=body,headers=h)
assert first.status_code==201,first.text
assert client.post(base+'/chart-import',json=body,headers=h).json()==first.json()
assert client.post(base+'/chart-import',json=body,headers=headers()).status_code==409
with transaction('c') as db:
    assert len(list(db.scalars(select(Account))))==1
    assert db.scalar(select(JournalLine.id)) is None
try:
    with transaction('c') as db:db.execute(text('UPDATE account_import_previews SET rows=rows'))
except IntegrityError:pass
else:raise AssertionError('Preview must be immutable')
print('setup/import/replay/immutable/no-facts: passed')
"""
    env = os.environ | {
        "PYTHONPATH": str(root / "apps/api"),
        "DIDBAN_DATABASE_URL": "sqlite:///" + str(tmp_path / "setup.db"),
        "DIDBAN_STORAGE": str(tmp_path / "files"),
    }
    result = subprocess.run(
        [sys.executable, "-c", code], cwd=root, env=env, capture_output=True, text=True, timeout=60
    )
    assert result.returncode == 0, result.stdout + result.stderr
