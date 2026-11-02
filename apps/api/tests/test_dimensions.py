from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select, text
from test_control import workspace as workspace

from didban import models as m
from didban.dimensions_models import DimensionAllocation, DimensionReportRun
from didban.dimensions_service import assign, report, save_dimension, save_report
from didban.errors import DomainError


def setup_dimensions(db):
    user = db.get(m.User, "owner")
    manifest = db.get(m.ResultManifest, "manifest")
    manifest.metrics = [
        {"metric_key": "revenue", "status": "available"},
        {"metric_key": "expense", "status": "available"},
    ]
    for ident, row, role, debit, credit in [
        ("revenue", "r0", "revenue", "0", "100"),
        ("expense", "r1", "operating_expense", "40", "0"),
    ]:
        db.add(
            m.JournalLine(
                id=ident,
                company_id="c",
                source_row_id=row,
                session_id="s",
                original_unit="IRR",
                original_amount=debit if debit != "0" else credit,
                entry_id="J",
                date=date(2026, 10, 1),
                account=ident,
                role=role,
                debit=debit,
                credit=credit,
                entry_type="regular",
                reference="",
            )
        )
    db.flush()
    a = save_dimension(db, "c", user, {"kind": "project", "code": "A", "name": "الف", "active": True})
    b = save_dimension(db, "c", user, {"kind": "project", "code": "B", "name": "ب", "active": True})
    return user, a, b


def allocation(a, b, line="revenue"):
    return {
        "manifest_id": "manifest",
        "line_id": line,
        "kind": "project",
        "method": "shared",
        "shares": [{"dimension_id": a["id"], "percent": "60"}, {"dimension_id": b["id"], "percent": "40"}],
        "review_reason": "تقسیم بررسی‌شده بر مبنای کارکرد",
    }


def test_shared_allocations_preserve_exact_totals_and_immutable_report_history(workspace):
    db = workspace
    user, a, b = setup_dimensions(db)
    db.execute(
        text(
            "CREATE TRIGGER immutable_dimension_report BEFORE UPDATE ON dimension_report_runs BEGIN SELECT RAISE(ABORT,'immutable'); END"
        )
    )
    before = report(db, "c", "manifest", "project")
    assert before["unassigned"]["revenue"] == "100" and before["unassigned"]["expense"] == "40"
    rev = assign(db, "c", user, allocation(a, b), 1)
    assert [share["amount"] for share in rev["shares"]] == ["60", "40"]
    limited = report(db, "c", "manifest", "project")
    assert all(bucket["profit"] is None for bucket in limited["buckets"])
    assign(db, "c", user, allocation(a, b, "expense"), 1)
    complete = report(db, "c", "manifest", "project")
    assert complete["status"] == "available" and complete["unassigned"]["line_count"] == 0
    assert sum(Decimal(row["profit"]) for row in complete["buckets"]) == 60
    saved = save_report(db, "c", user, {"manifest_id": "manifest", "kind": "project"})
    changed = allocation(a, b)
    changed["shares"][0]["percent"] = "70"
    changed["shares"][1]["percent"] = "30"
    second = assign(db, "c", user, changed, rev["version"])
    assert second["version"] == 2
    assert db.get(DimensionReportRun, saved["id"]).snapshot == complete
    assert db.get(m.JournalLine, "revenue").credit == "100"
    assert len(list(db.scalars(select(DimensionAllocation)))) == 3
    with pytest.raises(DomainError):
        assign(db, "c", user, changed, 1)


def test_invalid_share_scope_and_current_membership_guards(workspace):
    db = workspace
    user, a, b = setup_dimensions(db)
    with pytest.raises(DomainError):
        assign(db, "c", db.get(m.User, "viewer"), allocation(a, b), 1)
    with pytest.raises(DomainError):
        report(db, "other", "manifest", "project")
    bad = allocation(a, b)
    bad["shares"][1]["percent"] = "39"
    with pytest.raises(DomainError):
        assign(db, "c", user, bad, 1)
    bad = allocation(a, b)
    bad["line_id"] = "i0"
    with pytest.raises(DomainError):
        assign(db, "c", user, bad, 1)
    save_dimension(
        db,
        "c",
        user,
        {**{key: a[key] for key in ["kind", "code", "name"]}, "active": False},
        a["id"],
        a["version"],
    )
    with pytest.raises(DomainError):
        assign(db, "c", user, allocation(a, b), 1)


def test_dimension_axes_are_independent_and_precision_is_not_silently_rounded(workspace):
    db = workspace
    user, a, b = setup_dimensions(db)
    db.get(m.JournalLine, "revenue").credit = "1"
    bad = allocation(a, b)
    bad["shares"][0]["percent"] = "33.333333"
    bad["shares"][1]["percent"] = "66.666667"
    with pytest.raises(DomainError) as error:
        assign(db, "c", user, bad, 1)
    assert error.value.code == "allocation_precision"
    branch = save_dimension(db, "c", user, {"kind": "branch", "code": "A", "name": "شعبه", "active": True})
    direct = allocation(a, b)
    direct.update(kind="branch", method="direct", shares=[{"dimension_id": branch["id"], "percent": "100"}])
    assign(db, "c", user, direct, 1)
    assert report(db, "c", "manifest", "project")["unassigned"]["line_count"] == 2
    assert report(db, "c", "manifest", "branch")["unassigned"]["line_count"] == 1


def test_http_dimensions_replay_versions_and_immutable_snapshots(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.dimensions_models import DimensionAllocation, DimensionReportRun
with transaction("company-a") as db:
    session=m.ProcessingSession(company_id="company-a",period_id=period_id,actor_id=users["owner"],state="completed")
    db.add(session);db.flush()
    source=m.SourceFile(company_id="company-a",session_id=session.id,name="ledger.csv",sha256="d"*64,size=100,storage_key="dimension-test",row_count=1,scan_status="test")
    db.add(source);db.flush()
    row=m.SourceRow(company_id="company-a",file_id=source.id,sheet="دفتر",row_number=2,values={})
    db.add(row);db.flush()
    line=m.JournalLine(company_id="company-a",source_row_id=row.id,session_id=session.id,original_unit="IRR",original_amount="100",entry_id="J",date=date(2026,9,5),account="income",role="revenue",debit="0",credit="100",entry_type="regular",reference="")
    db.add(line);db.flush();line_id=line.id
    manifest=m.ResultManifest(company_id="company-a",session_id=session.id,period_id=period_id,digest="e"*64,selection={"row_ids":[row.id]},metrics=[{"metric_key":"revenue","status":"available"},{"metric_key":"expense","status":"available"}],details={})
    db.add(manifest);db.flush();manifest_id=manifest.id
owner=client_for("owner");viewer=client_for("viewer");outsider=client_for("outsider")
path=base+"/dimensions";data={"kind":"project","code":"A","name":"پروژه الف"}
assert command(viewer,"POST",path,data).status_code==403
key=str(uuid4());created=command(owner,"POST",path,data,key=key)
assert created.status_code==201,created.text
dimension=created.json();assert command(owner,"POST",path,data,key=key).json()["id"]==dimension["id"]
allocation={"manifest_id":manifest_id,"line_id":line_id,"kind":"project","method":"direct","shares":[{"dimension_id":dimension["id"],"percent":"100"}],"review_reason":"انتساب مستقیم بررسی شد"}
key=str(uuid4());response=command(owner,"POST",path+"/allocations",allocation,key=key)
assert response.status_code==201,response.text
assert command(owner,"POST",path+"/allocations",allocation,key=key).json()["id"]==response.json()["id"]
assert viewer.get(path+"/report/current",params={"manifest_id":manifest_id,"kind":"project"}).json()["buckets"][0]["profit"]=="100"
assert outsider.get(path+"/report/current",params={"manifest_id":manifest_id,"kind":"project"}).status_code==404
response=command(owner,"POST",path+"/reports/saved",{"manifest_id":manifest_id,"kind":"project"})
assert response.status_code==201,response.text
run_id=response.json()["id"]
assert viewer.get(path+"/reports/saved/"+run_id+"/export?format=xlsx").content[:2]==b"PK"
assert viewer.get(path+"/reports/saved/"+run_id+"/export?format=pdf").content[:4]==b"%PDF"
for table,column in [(DimensionAllocation,"review_reason"),(DimensionReportRun,"kind")]:
    try:
        with transaction("company-a") as db:
            db.execute(update(table).values(**{column:"changed"}))
    except Exception as error:assert "immutable" in str(error)
    else:raise AssertionError("Immutable dimension history was modified")
assert viewer.get(path+"/reports/saved").json()["items"][0]["id"]==run_id
initialize()
""",
    )
