"""Native statements require explicit semantics and actual opening evidence."""

from datetime import date

import pytest
from sqlalchemy import select
from test_posting import approval, data
from test_posting import book as book

from didban import models as m
from didban.accounting_models import Account
from didban.accounting_service import save_account, save_draft
from didban.closing_service import create_closing, create_opening
from didban.errors import DomainError
from didban.native_reporting_service import build_statement, declare_opening, save_role, save_statement
from didban.period_lock_models import PeriodLock
from didban.posting_service import create_reversal, post_batch


def metric(snapshot, key):
    return next(row for row in snapshot["metrics"] if row["metric_key"] == key)


def accounts(db):
    return list(db.scalars(select(Account).where(Account.company_id == "c").order_by(Account.code)))


def post(db, amount="100", stamp=date(2026, 11, 1)):
    user = db.get(m.User, "finance_manager")
    draft = save_draft(db, "c", user, {**data(db, amount), "unit": "IRR", "date": stamp})
    return post_batch(db, "c", user, [approval(db, draft)])["items"][0]


def test_unknown_roles_and_missing_opening_are_not_zero_and_fixed_run_does_not_change(book):
    db = book
    user = db.get(m.User, "finance_manager")
    journal = post(db)
    snapshot = build_statement(db, "c", user, "p")
    assert metric(snapshot, "revenue")["value"] is None
    assert metric(snapshot, "bank_balance")["value"] is None
    assert snapshot["journal_ids"] == [journal["id"]] and snapshot["includes_imported_ledger"] is False
    first, second = accounts(db)
    save_role(db, "c", user, first.id, "trade_receivable", 1)
    save_role(db, "c", user, second.id, "revenue", 1)
    run = save_statement(db, "c", user, "p")
    assert metric(run["snapshot"], "revenue")["value"] == "100"
    assert metric(run["snapshot"], "expense")["value"] == "0"
    assert metric(run["snapshot"], "trade_receivable_balance")["value"] is None
    assert run["snapshot"]["items"][0]["period_movement"] == "100"
    save_role(db, "c", user, second.id, None, 2)
    assert metric(build_statement(db, "c", user, "p"), "revenue")["value"] is None
    assert metric(run["snapshot"], "revenue")["value"] == "100"
    assert (
        next(row for row in run["snapshot"]["role_assignments"] if row["account_id"] == second.id)[
            "assignment_version"
        ]
        == 2
    )


def test_only_owner_or_manager_can_classify_and_versions_and_company_are_checked(book):
    db = book
    first, _second = accounts(db)
    for role in ("advisor", "viewer"):
        with pytest.raises(DomainError):
            save_role(db, "c", db.get(m.User, role), first.id, "bank", 1)
    owner = db.get(m.User, "owner")
    result = save_role(db, "c", owner, first.id, "bank", 1)
    assert result["version"] == 2
    with pytest.raises(DomainError):
        save_role(db, "c", owner, first.id, "bank", 1)
    with pytest.raises(DomainError):
        save_role(db, "other", owner, first.id, "bank", 2)
    with pytest.raises(DomainError):
        save_role(db, "c", owner, first.id, "guessed", 2)
    events = list(
        db.scalars(select(m.AuditEvent).where(m.AuditEvent.action == "accounting.account_role_changed"))
    )
    assert events[0].details["before"] is None and events[0].details["after"] == "bank"


def opening(db):
    user = db.get(m.User, "finance_manager")
    first, second = accounts(db)
    journal = post(db, "1000", date(2026, 1, 1))
    save_role(db, "c", user, first.id, "bank", 1)
    save_role(db, "c", user, second.id, "equity", 1)
    declare_opening(db, "c", user, journal["id"], journal["digest"], "انتخاب صریح مانده ابتدای دوره")
    return user, first, second, journal


def test_manual_opening_requires_authority_and_balance_roles_and_is_excluded_from_profit(book):
    db = book
    user = db.get(m.User, "finance_manager")
    journal = post(db, "1000", date(2026, 1, 1))
    with pytest.raises(DomainError):
        declare_opening(db, "c", user, journal["id"], journal["digest"], "مبنا")
    first, second = accounts(db)
    save_role(db, "c", user, first.id, "bank", 1)
    save_role(db, "c", user, second.id, "equity", 1)
    with pytest.raises(DomainError):
        declare_opening(db, "c", db.get(m.User, "owner"), journal["id"], journal["digest"], "مبنا")
    declare_opening(db, "c", user, journal["id"], journal["digest"], "افتتاحیه صریح")
    snapshot = build_statement(db, "c", user, "p")
    assert metric(snapshot, "revenue")["value"] == "0"
    assert metric(snapshot, "profit_before_tax")["value"] == "0"
    assert metric(snapshot, "bank_balance")["value"] == "1000"
    assert snapshot["profit_journal_ids"] == []
    assert snapshot["opening_evidence"]["scope"] == "explicit_declared_opening"
    save_role(db, "c", user, first.id, "revenue", 2)
    changed = build_statement(db, "c", user, "p")
    assert metric(changed, "bank_balance")["value"] is None
    assert metric(changed, "profit_before_tax")["value"] is None
    assert "period_accounting_role_conflict" in metric(changed, "profit_before_tax")["reason_codes"]


def test_reversal_after_cutoff_does_not_erase_valid_historical_opening(book):
    db = book
    user, _first, _second, journal = opening(db)
    reversal = create_reversal(
        db, "c", user, journal["id"], {"period_id": "p", "date": date(2026, 3, 1), "reason": "اصلاح"}
    )
    post_batch(db, "c", user, [approval(db, reversal)])
    earlier = build_statement(db, "c", user, "p", date(2026, 2, 1))
    later = build_statement(db, "c", user, "p", date(2026, 3, 2))
    assert metric(earlier, "bank_balance")["value"] == "1000"
    assert metric(later, "bank_balance")["value"] is None
    assert metric(later, "profit_before_tax")["value"] == "0"


def test_generated_closing_and_opening_do_not_pollute_profit_and_source_reopen_is_local_limitation(book):
    db = book
    user = db.get(m.User, "finance_manager")
    post(db, "100")
    first, second = accounts(db)
    result = save_account(db, "c", user, {"code": "003", "name": "نتیجه", "active": True})
    save_role(db, "c", user, first.id, "bank", 1)
    save_role(db, "c", user, second.id, "revenue", 1)
    save_role(db, "c", user, result["id"], "equity", 1)
    closing = create_closing(
        db,
        "c",
        user,
        {
            "period_id": "p",
            "account_ids": [second.id],
            "result_account_id": result["id"],
            "reason": "بستن درآمد",
        },
    )
    post_batch(db, "c", user, [approval(db, closing)])
    statement = build_statement(db, "c", user, "p")
    assert metric(statement, "revenue")["value"] == "100"
    db.add(m.Period(id="next", company_id="c", name="بعد", start=date(2027, 1, 1), end=date(2027, 12, 31)))
    lock = PeriodLock(company_id="c", period_id="p", closed=True)
    db.add(lock)
    db.flush()
    draft = create_opening(
        db,
        "c",
        user,
        {
            "source_period_id": "p",
            "target_period_id": "next",
            "account_ids": [first.id, result["id"]],
            "reason": "انتقال",
        },
    )
    post_batch(db, "c", user, [approval(db, draft)])
    fixed = save_statement(db, "c", user, "next")
    assert metric(fixed["snapshot"], "bank_balance")["value"] == "100"
    assert metric(fixed["snapshot"], "profit_before_tax")["value"] == "0"
    lock.closed = False
    db.flush()
    changed = build_statement(db, "c", user, "next")
    assert "opening_source_not_closed" in metric(changed, "bank_balance")["reason_codes"]
    assert metric(fixed["snapshot"], "bank_balance")["value"] == "100"


def test_explicit_zero_opening_is_not_inferred_and_can_be_revoked_without_changing_snapshot(book):
    from didban.native_reporting_service import declare_zero_opening, revoke_zero_opening

    db = book
    user = db.get(m.User, "finance_manager")
    post(db, "100")
    first, second = accounts(db)
    save_role(db, "c", user, first.id, "bank", 1)
    save_role(db, "c", user, second.id, "revenue", 1)
    assert metric(build_statement(db, "c", user, "p"), "bank_balance")["value"] is None
    with pytest.raises(DomainError):
        declare_zero_opening(db, "c", db.get(m.User, "owner"), "p", "صفر")
    declaration = declare_zero_opening(db, "c", user, "p", "ماندهٔ ابتدای فعالیت صفر است")
    fixed = save_statement(db, "c", user, "p")
    assert metric(fixed["snapshot"], "bank_balance")["value"] == "100"
    assert metric(fixed["snapshot"], "revenue")["value"] == "100"
    assert fixed["snapshot"]["opening_evidence"]["scope"] == "explicit_declared_zero_opening"
    revoke_zero_opening(db, "c", user, declaration["id"], "مبنا نیاز به اصلاح دارد")
    assert metric(build_statement(db, "c", user, "p"), "bank_balance")["value"] is None
    assert metric(fixed["snapshot"], "bank_balance")["value"] == "100"
    replacement = declare_zero_opening(db, "c", user, "p", "اظهار مجدد پس از بررسی")
    assert replacement["id"] != declaration["id"]
    assert metric(build_statement(db, "c", user, "p"), "bank_balance")["value"] == "100"


def test_zero_opening_rejects_prior_history_and_new_prior_history_invalidates_new_report_only(book):
    from didban.native_reporting_service import declare_zero_opening

    db = book
    user = db.get(m.User, "finance_manager")
    declare_zero_opening(db, "c", user, "p", "آغاز بدون مانده")
    fixed = save_statement(db, "c", user, "p")
    db.add(
        m.Period(id="earlier", company_id="c", name="پیشین", start=date(2025, 1, 1), end=date(2025, 12, 31))
    )
    db.flush()
    with pytest.raises(DomainError) as error:
        declare_zero_opening(db, "c", user, "p", "صفر مجدد")
    assert error.value.code == "zero_opening_prior_history"
    changed = build_statement(db, "c", user, "p")
    assert "zero_opening_prior_history" in metric(changed, "bank_balance")["reason_codes"]
    assert metric(fixed["snapshot"], "bank_balance")["value"] == "0"


def test_http_role_and_statement_freeze_opening_and_real_immutable_guards(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
import io
from openpyxl import load_workbook
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.native_reporting_models import NativeStatementRun,NativeOpeningEvidence,NativeZeroOpeningEvidence,NativeStatementApproval
manager=client_for("finance_manager");owner=client_for("owner");viewer=client_for("viewer");outsider=client_for("outsider")
path=base+"/accounting"
with transaction("company-a") as db:db.add(CompanyAccountingSetup(company_id="company-a",mode="primary"))
accounts=[]
for code,role in (("001","bank"),("002","equity"),("003","revenue")):
    created=command(owner,"POST",path+"/accounts",{"code":code,"name":code,"active":True})
    assert created.status_code==201,created.text
    account=created.json();accounts.append(account["id"])
    assert command(viewer,"PATCH",path+"/account-roles/"+account["id"],{"role":role}).status_code==403
    response=command(owner,"PATCH",path+"/account-roles/"+account["id"],{"role":role})
    assert response.status_code==200,response.text
    assert command(owner,"PATCH",path+"/account-roles/"+account["id"],{"role":role}).status_code==409
assert len(manager.get(path+"/account-roles").json()["catalog"])==12

def post_entry(amount,stamp,credit_account):
    data={"period_id":period_id,"date":stamp,"description":"آزمون","unit":"IRR","lines":[{"account_id":accounts[0],"party_id":"","debit":amount,"credit":"0"},{"account_id":credit_account,"party_id":"","debit":"0","credit":amount}]}
    draft=command(manager,"POST",path+"/drafts",data).json()
    checked=manager.get(path+"/drafts/"+draft["id"]+"/posting-preview").json()
    posted=command(manager,"POST",path+"/postings",{"items":[{key:checked[key] for key in ("draft_id","expected_version","digest")}]})
    assert posted.status_code==201,posted.text
    return posted.json()["items"][0]

journal=post_entry("9007199254740993","2026-09-01",accounts[1])
body={"journal_id":journal["id"],"digest":journal["digest"],"reason":"انتخاب صریح افتتاحیه"}
assert command(owner,"POST",path+"/opening-evidence",body).status_code==403
key=str(uuid4());response=command(manager,"POST",path+"/opening-evidence",body,key=key)
assert response.status_code==201,response.text
assert command(manager,"POST",path+"/opening-evidence",body,key=key).json()==response.json()
post_entry("100","2026-09-02",accounts[2])
response=command(manager,"POST",path+"/statements",{"period_id":period_id})
assert response.status_code==201,response.text
run=response.json();metrics={row["metric_key"]:row for row in run["snapshot"]["metrics"]}
assert metrics["bank_balance"]["value"]=="9007199254741093"
assert metrics["revenue"]["value"]=="100"
assert run["snapshot"]["items"][0]["period_movement"]=="100"
assert command(owner,"POST",path+"/statements/"+run["id"]+"/approvals",{"digest":run["digest"]}).status_code==403
key=str(uuid4());accepted=command(manager,"POST",path+"/statements/"+run["id"]+"/approvals",{"digest":run["digest"]},key=key)
assert accepted.status_code==201,accepted.text
assert accepted.json()["created_at"].endswith("+00:00")
assert command(manager,"POST",path+"/statements/"+run["id"]+"/approvals",{"digest":run["digest"]},key=key).json()==accepted.json()
assert manager.get(path+"/statements/"+run["id"]).json()["approvals"][0]["created_at"].endswith("+00:00")
assert manager.get(path+"/statements/"+run["id"]+"/export",params={"format":"pdf"}).content[:4]==b"%PDF"
excel=manager.get(path+"/statements/"+run["id"]+"/export",params={"format":"xlsx"})
assert excel.content[:2]==b"PK"
book=load_workbook(io.BytesIO(excel.content));sheet=book["گردش حساب‌ها"]
headers=[cell.value for cell in sheet[1]]
assert sheet.cell(2,headers.index("code")+1).value=="001"
assert sheet.cell(2,headers.index("cumulative_balance")+1).value=="9007199254741093"
assert sheet.cell(2,headers.index("cumulative_balance")+1).data_type=="s"
assert outsider.get(path+"/statements/"+run["id"]).status_code==404
assert outsider.get(path+"/statements/"+run["id"]+"/export").status_code==404
assert command(owner,"PATCH",path+"/account-roles/"+accounts[0],{"role":"expense"},version=2).status_code==200
assert manager.get(path+"/statements/"+run["id"]).json()["snapshot"]==run["snapshot"]
summary=manager.get(path+"/statements").json()["items"][0]
assert summary["summary_only"] is True and "items" not in summary["snapshot"]
assert summary["snapshot"]["period_id"]==run["snapshot"]["period_id"] and summary["digest"]==run["digest"]

for model in (NativeStatementRun,NativeOpeningEvidence,NativeStatementApproval):
    try:
        with transaction("company-a") as db:db.execute(update(model).values(actor_id=users["owner"]))
    except IntegrityError:pass
    else:raise AssertionError("Native statement and opening provenance must be immutable")
initialize()
""",
    )


def test_http_zero_opening_is_immutable_opt_in_and_revocation_keeps_old_report(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
from didban.accounting_setup_models import CompanyAccountingSetup
from didban.native_reporting_models import NativeZeroOpeningEvidence
from didban.posting_models import NativeJournal
with transaction("company-b") as db:
    db.add(m.Membership(company_id="company-b",user_id=users["finance_manager"],role="finance_manager"))
    db.add(m.Period(id="z",company_id="company-b",name="شروع",start=date(2026,1,1),end=date(2026,12,31)))
    db.add(CompanyAccountingSetup(company_id="company-b",mode="primary"))
manager=client_for("finance_manager");outsider=client_for("outsider")
path="/api/v1/companies/company-b/accounting"
assert command(outsider,"POST",path+"/zero-opening-evidence",{"period_id":"z","reason":"صفر"}).status_code==403
key=str(uuid4());body={"period_id":"z","reason":"شروع فعالیت با ماندهٔ صفر"}
result=command(manager,"POST",path+"/zero-opening-evidence",body,key=key)
assert result.status_code==201,result.text
assert command(manager,"POST",path+"/zero-opening-evidence",body,key=key).json()==result.json()
run=command(manager,"POST",path+"/statements",{"period_id":"z"}).json()
assert next(row for row in run["snapshot"]["metrics"] if row["metric_key"]=="bank_balance")["value"]=="0"
assert command(manager,"POST",path+"/zero-opening-evidence/"+result.json()["id"]+"/revoke",{"reason":"اصلاح مبنا"}).status_code==200
current=manager.get(path+"/statements/preview",params={"period_id":"z"}).json()
assert next(row for row in current["metrics"] if row["metric_key"]=="bank_balance")["value"] is None
assert manager.get(path+"/statements/"+run["id"]).json()["snapshot"]==run["snapshot"]
try:
    with transaction("company-b") as db:db.execute(update(NativeZeroOpeningEvidence).values(reason="changed"))
except IntegrityError:pass
else:raise AssertionError("Zero-opening declaration must be immutable")
with transaction("company-b") as db:
    assert db.scalar(select(NativeJournal.id).where(NativeJournal.company_id=="company-b")) is None
initialize()
""",
    )


def test_native_statement_approval_is_exact_independent_live_and_never_transfers(book):
    from didban.accounting_service import grant
    from didban.native_reporting_models import NativeStatementApproval, NativeStatementRun
    from didban.native_statement_approval_service import approve_statement, statement_public

    db = book
    manager = db.get(m.User, "finance_manager")
    owner = db.get(m.User, "owner")
    advisor = db.get(m.User, "advisor")
    run = save_statement(db, "c", manager, "p")
    for person in (owner, advisor, db.get(m.User, "viewer")):
        with pytest.raises(DomainError):
            approve_statement(db, "c", person, run["id"], run["digest"])
    grant(db, "c", owner, "advisor", {"post_journal": True, "reopen_period": False}, 1)
    with pytest.raises(DomainError):
        approve_statement(db, "c", advisor, run["id"], run["digest"])
    with pytest.raises(DomainError):
        approve_statement(db, "c", manager, run["id"], "0" * 64)
    accepted = approve_statement(db, "c", manager, run["id"], run["digest"])
    assert accepted["created_at"].endswith("+00:00")
    assert accepted["permission_provenance"]["source"] == "role:finance_manager"
    assert run["snapshot"]["report_approved"] is False
    assert len(list(db.scalars(select(NativeStatementApproval)))) == 1
    assert approve_statement(db, "c", manager, run["id"], run["digest"])["id"] == accepted["id"]
    revised = save_statement(db, "c", manager, "p")
    assert revised["id"] != run["id"] and revised["approvals"] == []
    membership = db.get(m.Membership, "advisor")
    membership.approve_financial_report = True
    membership.version += 1
    db.flush()
    second = approve_statement(db, "c", advisor, run["id"], run["digest"])
    assert second["permission_provenance"]["source"] == "explicit:approve_financial_report"
    membership.approve_financial_report = False
    membership.version += 1
    db.flush()
    with pytest.raises(DomainError):
        approve_statement(db, "c", advisor, revised["id"], revised["digest"])
    public = statement_public(
        db,
        "c",
        advisor,
        db.get(NativeStatementRun, run["id"]),
    )
    assert public["can_approve"] is False and len(public["approvals"]) == 2
    assert all(row["created_at"].endswith("+00:00") for row in public["approvals"])


def test_period_replacement_scope_guard_and_historical_invalid_replacement_do_not_fake_profit(book):
    from didban.accounting_models import Draft
    from didban.posting_models import NativeJournal
    from didban.posting_service import create_replacement

    db = book
    user = db.get(m.User, "finance_manager")
    post(db, "100")
    first, second = accounts(db)
    result = save_account(db, "c", user, {"code": "003", "name": "نتیجه", "active": True})
    expense = save_account(db, "c", user, {"code": "004", "name": "هزینه", "active": True})
    for account_id, role in (
        (first.id, "bank"),
        (second.id, "revenue"),
        (result["id"], "equity"),
        (expense["id"], "expense"),
    ):
        save_role(db, "c", user, account_id, role, 1)
    closing = create_closing(
        db,
        "c",
        user,
        {"period_id": "p", "account_ids": [second.id], "result_account_id": result["id"], "reason": "بستن"},
    )
    original = post_batch(db, "c", user, [approval(db, closing)])["items"][0]
    reversal = create_reversal(
        db, "c", user, original["id"], {"period_id": "p", "date": date(2026, 12, 31), "reason": "اصلاح"}
    )
    post_batch(db, "c", user, [approval(db, reversal)])
    body = {
        "period_id": "p",
        "date": date(2026, 12, 31),
        "description": "جایگزین نامعتبر بستن",
        "unit": "IRR",
        "lines": [
            {"account_id": expense["id"], "party_id": "", "debit": "100", "credit": "0"},
            {"account_id": first.id, "party_id": "", "debit": "0", "credit": "100"},
        ],
        "reason": "آزمون تغییر دامنه",
    }
    wrong = create_replacement(db, "c", user, original["id"], body)
    with pytest.raises(DomainError) as error:
        approval(db, wrong)
    assert error.value.code == "period_correction_accounts_changed"
    assert len(list(db.scalars(select(NativeJournal)))) == 3
    # Simulate an immutable historical journal created before the new guard.
    draft = db.get(Draft, wrong["id"])
    historical_lines = []
    for line in draft.lines:
        account = db.get(Account, line["account_id"])
        historical_lines.append(
            {**line, "code": account.code, "name": account.name, "account_version": account.version}
        )
    historical = NativeJournal(
        company_id="c",
        draft_id=draft.id,
        draft_version=draft.version,
        period_id="p",
        date=draft.date,
        sequence=4,
        digest="a" * 64,
        snapshot={"lines": historical_lines, "original_unit": "IRR"},
        actor_id=user.id,
        permission_provenance={"source": "historical_fixture"},
        replacement_of=original["id"],
    )
    db.add(historical)
    draft.state = "posted"
    draft.version += 1
    db.flush()
    snapshot = build_statement(db, "c", user, "p")
    assert metric(snapshot, "profit_before_tax")["value"] is None
    assert "period_accounting_role_conflict" in metric(snapshot, "profit_before_tax")["reason_codes"]
    repair = create_reversal(
        db,
        "c",
        user,
        historical.id,
        {"period_id": "p", "date": date(2026, 12, 31), "reason": "رفع جایگزین ناسازگار"},
    )
    post_batch(db, "c", user, [approval(db, repair)])
    repaired = build_statement(db, "c", user, "p")
    assert metric(repaired, "profit_before_tax")["value"] == "100"


def test_empty_native_report_and_zero_declaration_protect_period_bounds(book):
    from didban.services import period_has_dependencies, save_period

    db = book
    user = db.get(m.User, "finance_manager")
    period = db.get(m.Period, "p")
    assert not period_has_dependencies(db, "c", "p")
    save_statement(db, "c", user, "p")
    assert period_has_dependencies(db, "c", "p")
    with pytest.raises(DomainError) as error:
        save_period(
            db, "c", user, {"name": period.name, "start": date(2026, 1, 2), "end": period.end}, period
        )
    assert error.value.code == "period_in_use"
