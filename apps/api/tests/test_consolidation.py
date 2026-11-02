from datetime import date

import pytest
from sqlalchemy import select
from test_company_groups import workspace as workspace

from didban import models as m
from didban.company_group_service import compare, save
from didban.consolidation_models import DraftConsolidationRun
from didban.consolidation_service import create_draft, read_draft, save_mapping, sources
from didban.errors import DomainError


def setup(db, user, *, fresh_manifests=False):
    for company, roles in [
        ("a", [("revenue", "0", "100"), ("trade_ar", "100", "0")]),
        ("b", [("operating_expense", "100", "0"), ("trade_ap", "0", "100")]),
    ]:
        file = m.SourceFile(
            id=company + "f",
            company_id=company,
            session_id=company + "s",
            name="ledger.csv",
            sha256=company,
            size=100,
            storage_key=company,
            row_count=2,
            scan_status="test",
        )
        db.add(file)
        db.flush()
        row_ids = []
        for index, (role, debit, credit) in enumerate(roles):
            row = m.SourceRow(
                id=company + str(index),
                company_id=company,
                file_id=file.id,
                sheet="ledger",
                row_number=index + 2,
                values={},
            )
            db.add(row)
            db.flush()
            row_ids.append(row.id)
            db.add(
                m.JournalLine(
                    id="line-" + row.id,
                    company_id=company,
                    source_row_id=row.id,
                    session_id=company + "s",
                    original_unit="IRR",
                    original_amount="100",
                    date=date(2026, 1, 5),
                    entry_id="INV-1",
                    account=role,
                    role=role,
                    party_id="B-PARTY" if company == "a" else "A-PARTY",
                    debit=debit,
                    credit=credit,
                    entry_type="regular",
                    reference="INV-1",
                )
            )
        manifest = (
            m.ResultManifest(
                id=company + "m",
                company_id=company,
                session_id=company + "s",
                period_id=company + "p",
                digest="source",
            )
            if fresh_manifests
            else db.get(m.ResultManifest, company + "m")
        )
        if fresh_manifests:
            db.add(manifest)
        manifest.selection = {"row_ids": row_ids, "coverage": {"ledger_complete": True}}
        manifest.details = {"ledger_controls": {"balanced": True, "unknown_role_rows": []}}
        values = {
            "revenue": ("100" if company == "a" else "0"),
            "expense": ("0" if company == "a" else "100"),
            "ar_ledger": ("100" if company == "a" else "0"),
            "ap_trade_ledger": ("0" if company == "a" else "100"),
            "net_profit": ("100" if company == "a" else "-100"),
        }
        manifest.metrics = [
            {
                "metric_key": key,
                "basis": "ledger",
                "scope": "commercial_receivables"
                if key == "ar_ledger"
                else "commercial_payables"
                if key == "ap_trade_ledger"
                else "company",
                "unit": "IRR",
                "status": "available",
                "value": value,
            }
            for key, value in values.items()
        ]
    db.flush()
    group = save(db, "a", user, {"name": "گروه کامل", "company_ids": ["a", "b"]})
    comparison = compare(db, "a", user, group["id"], "ap", 1)
    mapping = save_mapping(
        db,
        "a",
        user,
        {
            "group_id": group["id"],
            "left_company": "a",
            "right_company": "b",
            "left_party_id": "B-PARTY",
            "right_party_id": "A-PARTY",
            "ownership_100": True,
            "ownership_note": "اظهار مالکیت کامل برای نمونه",
        },
        1,
    )
    return group, comparison, mapping


def pair(mapping, kind="services"):
    return {
        "mapping_id": mapping["id"],
        "left_line_id": "line-a0" if kind == "services" else "line-a1",
        "right_line_id": "line-b0" if kind == "services" else "line-b1",
        "kind": kind,
        "review_reason": "مرجع، تاریخ و ماهیت دو طرف بررسی شد",
    }


def test_draft_exact_services_and_trade_eliminations_have_no_real_effects(workspace):
    db, user = workspace
    _, comparison, mapping = setup(db, user)
    draft = create_draft(
        db, "a", user, {"comparison_id": comparison["id"], "pairs": [pair(mapping), pair(mapping, "balance")]}
    )
    snapshot = draft["snapshot"]
    metrics = {item["metric_key"]: item for item in snapshot["metrics"]}
    assert metrics["revenue"]["before"] == "100" and metrics["revenue"]["after"] == "0"
    assert (
        metrics["expense"]["after"] == "0"
        and metrics["ar_ledger"]["after"] == "0"
        and metrics["ap_trade_ledger"]["after"] == "0"
    )
    assert metrics["net_profit"]["after"] == "0"
    assert snapshot["approval_available"] is True and snapshot["status"] == "draft"
    assert snapshot["mappings"][0]["ownership_declaration"]["independently_verified"] is False
    assert len(list(db.scalars(select(m.JournalLine)))) == 4 and db.scalar(select(m.Allocation.id)) is None
    assert db.get(m.ResultManifest, "am").metrics[0]["value"] == "100"


def test_double_use_wrong_party_and_reference_are_rejected(workspace):
    db, user = workspace
    _, comparison, mapping = setup(db, user)
    with pytest.raises(DomainError) as error:
        create_draft(
            db, "a", user, {"comparison_id": comparison["id"], "pairs": [pair(mapping), pair(mapping)]}
        )
    assert error.value.code == "double_elimination"
    line = db.get(m.JournalLine, "line-b0")
    line.reference = "OTHER"
    with pytest.raises(DomainError) as error:
        create_draft(db, "a", user, {"comparison_id": comparison["id"], "pairs": [pair(mapping)]})
    assert error.value.code == "shared_evidence"
    line.reference = "INV-1"
    line.party_id = "other-company"
    with pytest.raises(DomainError) as error:
        create_draft(db, "a", user, {"comparison_id": comparison["id"], "pairs": [pair(mapping)]})
    assert error.value.code == "party_mapping"
    assert db.scalar(select(DraftConsolidationRun.id)) is None


def test_partial_settlement_with_different_reference_blocks_original_invoice_balance(workspace):
    db, user = workspace
    _, comparison, mapping = setup(db, user)
    row = m.SourceRow(id="receipt", company_id="a", file_id="af", sheet="ledger", row_number=4, values={})
    db.add(row)
    db.flush()
    db.add(
        m.JournalLine(
            id="receipt-line",
            company_id="a",
            source_row_id=row.id,
            session_id="as",
            original_unit="IRR",
            original_amount="40",
            date=date(2026, 1, 10),
            entry_id="payment",
            account="trade_ar",
            role="trade_ar",
            party_id="B-PARTY",
            debit="0",
            credit="40",
            entry_type="regular",
            reference="PAYMENT-DIFFERENT",
        )
    )
    source = db.get(m.ResultManifest, "am")
    source.selection = {**source.selection, "row_ids": source.selection["row_ids"] + ["receipt"]}
    db.flush()
    with pytest.raises(DomainError) as error:
        create_draft(db, "a", user, {"comparison_id": comparison["id"], "pairs": [pair(mapping, "balance")]})
    assert error.value.code == "balance_reference_ambiguous"


def test_missing_metric_null_and_revoked_original_company_after_group_edit(workspace):
    db, user = workspace
    group, comparison, mapping = setup(db, user)
    manifest = db.get(m.ResultManifest, "bm")
    manifest.metrics = [metric for metric in manifest.metrics if metric["metric_key"] != "net_profit"]
    draft = create_draft(db, "a", user, {"comparison_id": comparison["id"], "pairs": [pair(mapping)]})
    net = next(item for item in draft["snapshot"]["metrics"] if item["metric_key"] == "net_profit")
    assert net["before"] is None and net["after"] is None
    save(db, "a", user, {"name": "تغییر گروه", "company_ids": ["a", "c"]}, group["id"], 1)
    membership = db.scalar(select(m.Membership).where(m.Membership.company_id == "b"))
    membership.active = False
    with pytest.raises(DomainError):
        read_draft(db, "a", user, draft["id"])
    with pytest.raises(DomainError):
        sources(db, "a", user, comparison["id"])


def test_incomplete_ledger_and_mismatched_positive_amount_are_not_eliminated(workspace):
    db, user = workspace
    _, comparison, mapping = setup(db, user)
    manifest = db.get(m.ResultManifest, "bm")
    manifest.selection = {**manifest.selection, "coverage": {"ledger_complete": False}}
    assert sources(db, "a", user, comparison["id"])["unavailable"]
    with pytest.raises(DomainError) as error:
        create_draft(db, "a", user, {"comparison_id": comparison["id"], "pairs": [pair(mapping)]})
    assert error.value.code == "ledger_coverage"
    manifest.selection = {**manifest.selection, "coverage": {"ledger_complete": True}}
    line = db.get(m.JournalLine, "line-b0")
    line.debit = "0"
    line.credit = "100"
    with pytest.raises(DomainError) as error:
        create_draft(db, "a", user, {"comparison_id": comparison["id"], "pairs": [pair(mapping)]})
    assert error.value.code == "elimination_amount"


def test_mapping_versions_selected_companies_and_declared_ownership_scope(workspace):
    db, user = workspace
    group, comparison, mapping = setup(db, user)
    data = {
        "group_id": group["id"],
        "left_company": "a",
        "right_company": "b",
        "left_party_id": "B-PARTY",
        "right_party_id": "A-PARTY",
        "ownership_100": True,
        "ownership_note": "بازبینی اظهار مالکیت",
    }
    with pytest.raises(DomainError):
        save_mapping(db, "a", user, data | {"ownership_100": False}, mapping["version"])
    revised = save_mapping(db, "a", user, data, mapping["version"])
    assert revised["version"] == 2
    with pytest.raises(DomainError) as error:
        create_draft(db, "a", user, {"comparison_id": comparison["id"], "pairs": [pair(mapping)]})
    assert error.value.code == "stale_mapping"
    save(db, "a", user, {"name": "گروه تازه", "company_ids": ["a", "b", "c"]}, group["id"], 1)
    outside = save_mapping(db, "a", user, data | {"right_company": "c", "right_party_id": "C-PARTY"}, 1)
    with pytest.raises(DomainError) as error:
        create_draft(db, "a", user, {"comparison_id": comparison["id"], "pairs": [pair(outside)]})
    assert error.value.code == "mapping_company_scope"
    membership = db.scalar(select(m.Membership).where(m.Membership.company_id == "a"))
    membership.role = "viewer"
    with pytest.raises(DomainError):
        create_draft(db, "a", user, {"comparison_id": comparison["id"], "pairs": [pair(revised)]})


def test_large_exact_services_and_prior_adjustment_with_different_reference(workspace):
    db, user = workspace
    _, comparison, mapping = setup(db, user)
    large = "99999999999999999999999999999"
    db.get(m.JournalLine, "line-a0").credit = large
    db.get(m.JournalLine, "line-b0").debit = large
    for company, key in [("a", "revenue"), ("b", "expense")]:
        manifest = db.get(m.ResultManifest, company + "m")
        manifest.metrics = [
            {**metric, "value": large} if metric["metric_key"] == key else metric
            for metric in manifest.metrics
        ]
    draft = create_draft(db, "a", user, {"comparison_id": comparison["id"], "pairs": [pair(mapping)]})
    assert draft["snapshot"]["pairs"][0]["amount"] == large
    assert next(row for row in draft["snapshot"]["metrics"] if row["metric_key"] == "revenue")["after"] == "0"
    row = m.SourceRow(id="correction", company_id="a", file_id="af", sheet="ledger", row_number=4, values={})
    db.add(row)
    db.flush()
    db.add(
        m.JournalLine(
            id="correction-line",
            company_id="a",
            source_row_id=row.id,
            session_id="as",
            original_unit="IRR",
            original_amount="40",
            date=date(2026, 1, 10),
            entry_id="correction",
            account="revenue",
            role="revenue",
            party_id="B-PARTY",
            debit="40",
            credit="0",
            entry_type="regular",
            reference="CORRECTION-OTHER",
        )
    )
    source = db.get(m.ResultManifest, "am")
    source.selection = {**source.selection, "row_ids": source.selection["row_ids"] + ["correction"]}
    db.flush()
    with pytest.raises(DomainError) as error:
        create_draft(db, "a", user, {"comparison_id": comparison["id"], "pairs": [pair(mapping)]})
    assert error.value.code == "services_reference_ambiguous"


def test_http_draft_freeze_no_posting_and_revoked_original_company_export(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
import sys
sys.path.insert(0,"apps/api/tests")
from test_consolidation import setup, pair
from didban.consolidation_models import IntercompanyMapping,DraftConsolidationRun
with transaction() as db:
    source_actor=m.User(id="u",name="منبع آزمایشی",email="source@example.test",password_hash="unused")
    db.add(source_actor);db.add_all([m.Company(id=key,name=key) for key in ("a","b","c")]);db.flush()
    for company in ("a","b","c"):
        db.add(m.Membership(company_id=company,user_id="u",role="owner" if company=="a" else "viewer"))
    db.add_all([m.Membership(company_id=company,user_id=users["owner"],role="owner" if company=="a" else "viewer") for company in ("a","b")]);db.flush()
    for company in ("a","b"):
        db.add(m.Period(id=company+"p",company_id=company,name="دوره",start=date(2026,1,1),end=date(2026,1,31)));db.flush()
        db.add(m.ProcessingSession(id=company+"s",company_id=company,period_id=company+"p",actor_id="u",state="completed"));db.flush()
    group,comparison,mapping=setup(db,source_actor,fresh_manifests=True)
owner=client_for("owner");outsider=client_for("outsider")
prefix="/api/v1/companies/a/consolidation"
data={"comparison_id":comparison["id"],"pairs":[pair(mapping),pair(mapping,"balance")]}
assert outsider.get(prefix+"/sources",params={"comparison_id":comparison["id"]}).status_code==404
key=str(uuid4());response=command(owner,"POST",prefix+"/drafts",data,key=key)
assert response.status_code==201,response.text
draft=response.json();assert draft["snapshot"]["approval_available"] is True
assert command(owner,"POST",prefix+"/drafts",data,key=key).json()["id"]==draft["id"]
assert owner.get(prefix+"/drafts/"+draft["id"]+"/export").content[:2]==b"PK"
for table in (IntercompanyMapping,DraftConsolidationRun):
    try:
        with transaction("a") as db:
            db.execute(update(table).values(actor_id=users["owner"]))
    except Exception as error:assert "immutable" in str(error)
    else:raise AssertionError("Consolidation provenance was editable")
with transaction("a") as db:
    group_obj=db.get(__import__('didban.company_group_models',fromlist=['CompanyGroup']).CompanyGroup,group["id"])
    group_obj.company_ids=["a","c"];group_obj.version+=1
    member=db.scalar(select(m.Membership).where(m.Membership.company_id=="b",m.Membership.user_id==users["owner"]))
    member.active=False
assert owner.get(prefix+"/drafts/"+draft["id"]).status_code==404
assert owner.get(prefix+"/drafts/"+draft["id"]+"/export").status_code==404
with transaction("a") as db:
    assert len(list(db.scalars(select(m.JournalLine).where(m.JournalLine.company_id=="a"))))==2
    assert db.scalar(select(m.Allocation.id)) is None
initialize()
""",
    )


def test_all_included_companies_need_ownership_scope_even_without_selected_pairs(workspace):
    db, user = workspace
    group, _, mapping = setup(db, user)
    third = m.Period(id="cp", company_id="c", name="دوره", start=date(2026, 1, 1), end=date(2026, 1, 31))
    db.add(third)
    db.flush()
    db.add(m.ProcessingSession(id="cs", company_id="c", period_id="cp", actor_id=user.id, state="completed"))
    db.flush()
    values = {
        "revenue": "1000",
        "expense": "0",
        "ar_ledger": "0",
        "ap_trade_ledger": "0",
        "net_profit": "1000",
    }
    metrics = [
        {
            "metric_key": key,
            "basis": "ledger",
            "scope": "commercial_receivables"
            if key == "ar_ledger"
            else "commercial_payables"
            if key == "ap_trade_ledger"
            else "company",
            "value": value,
            "status": "available",
            "unit": "IRR",
        }
        for key, value in values.items()
    ]
    db.add(
        m.ResultManifest(
            id="cm",
            company_id="c",
            period_id="cp",
            session_id="cs",
            digest="third",
            selection={"row_ids": [], "coverage": {"ledger_complete": True}},
            details={"ledger_controls": {"balanced": True, "unknown_role_rows": []}},
            metrics=metrics,
        )
    )
    db.flush()
    from didban.company_group_models import CompanyGroup

    db.get(CompanyGroup, group["id"]).company_ids = ["a", "b", "c"]
    db.flush()
    comparison = compare(db, "a", user, group["id"], "ap", 1)
    data = {"comparison_id": comparison["id"], "pairs": [pair(mapping)]}
    with pytest.raises(DomainError) as error:
        create_draft(db, "a", user, data)
    assert error.value.code == "ownership_scope_incomplete"
    ownership = save_mapping(
        db,
        "a",
        user,
        {
            "group_id": group["id"],
            "left_company": "a",
            "right_company": "c",
            "left_party_id": "C-PARTY",
            "right_party_id": "A-PARTY",
            "ownership_100": True,
            "ownership_note": "اظهار صریح دامنه کامل شرکت بدون معامله منتخب",
        },
        1,
    )
    result = create_draft(db, "a", user, data)
    assert len(result["snapshot"]["pairs"]) == 1
    assert len(result["snapshot"]["ownership_declarations"]) == 2
    assert ownership["id"] in {row["mapping_id"] for row in result["snapshot"]["ownership_declarations"]}
    assert (
        next(row for row in result["snapshot"]["metrics"] if row["metric_key"] == "revenue")["after"]
        == "1000"
    )
