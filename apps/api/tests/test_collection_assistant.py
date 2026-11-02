"""Optional collection ranking and reminder drafts are read-only, not payments/messages."""

from datetime import date

import pytest
from sqlalchemy import func, select
from test_control import workspace as workspace

from didban import models as m
from didban.collection_assistant_service import history_statistics, queue, reminder
from didban.errors import DomainError


def calibration(db, manifest, *, party="customer", events=None):
    if events is None:
        events = [("one", "2026-10-03", "1"), ("two", "2026-10-10", "100"), ("three", "2026-10-08", "1")]
    mapping = {key: key for key in ("event_id", "invoice_id", "party_id", "due_date", "paid_on", "amount")}
    item = m.Interpretation(
        id="calibration",
        company_id="c",
        file_id="f",
        sheet="history",
        family="history",
        mapping=mapping,
        unit="IRR",
        calendar="gregorian",
        provenance="human",
        evidence={},
    )
    db.add(item)
    db.flush()
    ids = list(manifest.selection["row_ids"])
    for index, (identifier, paid, amount) in enumerate(events):
        row = m.SourceRow(
            id="h" + str(index),
            company_id="c",
            file_id="f",
            sheet="history",
            row_number=index + 1,
            values={
                "event_id": identifier,
                "invoice_id": "paid-invoice",
                "party_id": party,
                "due_date": "2026-10-01",
                "paid_on": paid,
                "amount": amount,
            },
        )
        db.add(row)
        ids.append(row.id)
    manifest.selection = {"row_ids": ids, "interpretation_ids": [item.id]}
    db.flush()


def test_history_uses_three_180_day_events_amount_weighted_actual_due_and_pinned_mapping(workspace):
    db = workspace
    manifest = db.get(m.ResultManifest, "manifest")
    calibration(
        db,
        manifest,
        events=[
            ("one", "2026-10-03", "1"),
            ("two", "2026-10-10", "100"),
            ("three", "2026-10-08", "1"),
            ("future", "2026-11-02", "999999"),
            ("old", "2026-01-01", "999999"),
        ],
    )
    # A later interpretation must not replace the manifest's pinned history meaning.
    db.add(
        m.Interpretation(
            id="new-mapping",
            company_id="c",
            file_id="f",
            sheet="history",
            family="history",
            mapping={"party_id": "not-the-party"},
            unit="IRR",
            calendar="gregorian",
            provenance="human",
            evidence={},
        )
    )
    db.flush()
    stats = history_statistics(db, "c", manifest, manifest.details["invoices"])
    assert stats["customer"]["history_lag_days"] == 9
    assert stats["customer"]["history_event_count"] == 3
    assert stats["customer"]["history_reason"] is None
    assert set(stats["customer"]["history_evidence_refs"]) == {"h0", "h1", "h2"}


def test_unknown_history_is_null_not_zero_and_promises_are_not_receipts(workspace):
    from didban.control_service import create_case, record_activity

    db = workspace
    manifest = db.get(m.ResultManifest, "manifest")
    actor = db.get(m.User, "advisor")
    case = create_case(
        db,
        "c",
        actor,
        {
            "kind": "invoice",
            "subject_id": "i0",
            "assignee_membership_id": None,
            "due_date": None,
            "next_action": "پیگیری",
        },
    )
    record_activity(
        db,
        "c",
        actor,
        case["id"],
        {
            "kind": "promise",
            "message": "مشتری وعده داد",
            "unit": "IRR",
            "promise_date": date(2026, 10, 20),
            "promise_amount": "100",
        },
        case["version"],
    )
    stats = history_statistics(db, "c", manifest, manifest.details["invoices"])
    assert stats["customer"]["history_lag_days"] is None and stats["customer"]["history_event_count"] == 0
    calibration(
        db,
        manifest,
        events=[("one", "2026-10-01", "1"), ("two", "2026-10-01", "2"), ("three", "2026-10-01", "3")],
    )
    stats = history_statistics(db, "c", manifest, manifest.details["invoices"])
    assert stats["customer"]["history_lag_days"] == 0
    assert stats["customer"]["history_reason"] is None


def test_history_priority_known_first_and_default_amount_order_unchanged(workspace):
    db = workspace
    user = db.get(m.User, "owner")
    manifest = db.get(m.ResultManifest, "manifest")
    calibration(db, manifest)
    rows = [
        {
            **row,
            "remaining": "100" if row["id"] == "i0" else "999999",
            "party_id": "customer" if row["id"] == "i0" else "unknown",
        }
        for row in manifest.details["invoices"]
    ]
    manifest.details = {**manifest.details, "invoices": rows}
    db.flush()
    default = queue(db, "c", user, 0, "", "amount")
    history = queue(db, "c", user, 0, "", "history")
    assert default["items"][0]["id"] != "i0" and history["items"][0]["id"] == "i0"
    assert history["items"][-1]["history_lag_days"] is None
    assert (
        history["history_policy"]["minimum_events"] == 3 and history["history_policy"]["lookback_days"] == 180
    )
    with pytest.raises(DomainError):
        queue(db, "c", user, 0, "", "opaque-score")


def test_reminder_is_exact_current_version_no_effect_and_unknown_balance_cannot_be_sent(workspace):
    db = workspace
    user = db.get(m.User, "advisor")
    manifest = db.get(m.ResultManifest, "manifest")
    row = next(row for row in manifest.details["invoices"] if row["id"] == "i0")
    result = reminder(db, "c", user, "i0", manifest.id)
    assert result["snapshot"]["remaining"] == row["remaining"] and result["external_send_available"] is False
    assert "ریال" in result["text"] and result["financial_effect"] is False
    assert db.scalar(select(func.count()).select_from(m.Settlement)) == 0
    assert db.scalar(select(m.JournalLine.id)) is None
    with pytest.raises(DomainError):
        reminder(db, "c", user, "i0", "old-manifest")
    with pytest.raises(DomainError):
        reminder(db, "c", db.get(m.User, "viewer"), "i0", manifest.id)
    with pytest.raises(DomainError):
        reminder(db, "other", db.get(m.User, "outsider"), "i0", manifest.id)
    manifest.details = {
        **manifest.details,
        "invoices": [
            {**entry, "remaining": None} if entry["id"] == "i0" else entry
            for entry in manifest.details["invoices"]
        ],
    }
    db.flush()
    with pytest.raises(DomainError) as error:
        reminder(db, "c", user, "i0", manifest.id)
    assert error.value.code == "collection_balance_unavailable"


def test_ambiguous_history_stays_unknown_and_missing_date_never_becomes_zero(workspace):
    db = workspace
    manifest = db.get(m.ResultManifest, "manifest")
    calibration(
        db,
        manifest,
        events=[("same", "2026-10-03", "1"), ("same", "2026-10-10", "100"), ("third", "2026-10-08", "1")],
    )
    stats = history_statistics(db, "c", manifest, manifest.details["invoices"])
    assert stats["customer"]["history_lag_days"] is None
    assert stats["customer"]["history_reason"] == "receipt_history_ambiguous"
    manifest.details = {**manifest.details, "as_of_date": None}
    db.flush()
    stats = history_statistics(db, "c", manifest, manifest.details["invoices"])
    assert (
        stats["customer"]["history_lag_days"] is None
        and stats["customer"]["history_reason"] == "report_date_missing"
    )


def test_http_reminder_rejects_stale_manifest_and_never_creates_messages_or_financial_effect(tmp_path):
    from test_api_delivery import scenario

    scenario(
        tmp_path,
        r"""
with transaction('company-a') as db:
    db.add(m.SourceFile(id='sales-file',company_id='company-a',session_id=source_session,name='sales.csv',sha256='x',size=1,storage_key='unused',row_count=1,scan_status='test'));db.flush()
    db.add(m.SourceRow(id='sales-row',company_id='company-a',file_id='sales-file',sheet='sales',row_number=2,values={'amount':'9007199254740993'}));db.flush()
    db.add(m.Invoice(id='invoice',company_id='company-a',source_row_id='sales-row',session_id=source_session,original_unit='IRR',original_amount='9007199254740993',reference='INV1',party_id='customer',date=date(2026,9,1),due_date=date(2026,9,10),amount='9007199254740993',direction='sales'));db.flush()
    db.add(m.ProcessingSession(id='collection-source',company_id='company-a',period_id=period_id,actor_id=users['owner'],state='completed'));db.flush()
    current=m.ResultManifest(company_id='company-a',session_id='collection-source',period_id=period_id,digest='collection',selection={'row_ids':['sales-row']},metrics=[],details={'as_of_date':'2026-09-30','invoices':[{'id':'invoice','direction':'sales','reference':'INV1','party_id':'customer','remaining':'9007199254740993','amount':'9007199254740993','due_date':'2026-09-10','evidence_refs':['sales-row']}]})
    db.add(current);db.flush();manifest=current.id
advisor=client_for('advisor');viewer=client_for('viewer');outsider=client_for('outsider')
path=base+'/collection-assistant/invoices/invoice/reminder'
response=advisor.get(path,params={'manifest_id':manifest})
assert response.status_code==200,response.text
assert response.json()['external_send_available'] is False and '۹۰۰۷۱۹۹۲۵۴۷۴۰۹۹۳' in response.json()['text']
assert viewer.get(path,params={'manifest_id':manifest}).status_code==403
assert outsider.get(path,params={'manifest_id':manifest}).status_code==404
assert advisor.get(base+'/collection-assistant/queue',params={'priority':'history'}).json()['items'][0]['history_lag_days'] is None
with transaction('company-a') as db:
    db.add(m.ProcessingSession(id='collection-new',company_id='company-a',period_id=period_id,actor_id=users['owner'],state='completed'));db.flush()
    db.add(m.ResultManifest(company_id='company-a',session_id='collection-new',period_id=period_id,digest='new',selection={'row_ids':[]},metrics=[],details={'as_of_date':'2026-09-30','invoices':[]}))
assert advisor.get(path,params={'manifest_id':manifest}).status_code==409
with transaction('company-a') as db:
    assert db.scalar(select(m.Settlement.id)) is None
    assert db.scalar(select(m.JournalLine.id)) is None
    assert db.scalar(select(m.Notification.id)) is None
    assert db.scalar(select(m.BotUpdate.id)) is None
    member=db.get(m.Membership,members['advisor']);member.active=False
assert advisor.get(path,params={'manifest_id':manifest}).status_code==404
""",
    )


def test_duplicate_invoice_reference_cannot_pick_history_party_by_row_order(workspace):
    from datetime import date

    db = workspace
    manifest = db.get(m.ResultManifest, "manifest")
    db.get(m.Invoice, "i1").reference = "invoice-0"
    db.get(m.Invoice, "i1").party_id = "different-customer"
    db.get(m.Invoice, "i1").due_date = date(2026, 10, 20)
    selected = list(manifest.selection["row_ids"])
    for index in range(3):
        identifier = "receipt-" + str(index)
        db.add(
            m.SourceRow(
                id=identifier,
                company_id="c",
                file_id="f",
                sheet="settlements",
                row_number=index + 1,
                values={},
            )
        )
        db.flush()
        db.add(
            m.Settlement(
                company_id="c",
                source_row_id=identifier,
                session_id="s",
                original_unit="IRR",
                original_amount="10",
                reference=identifier,
                invoice_reference="invoice-0",
                date=date(2026, 10, 25),
                amount="10",
                direction="receipt",
            )
        )
        selected.append(identifier)
    manifest.selection = {"row_ids": selected}
    db.flush()
    stats = history_statistics(db, "c", manifest, manifest.details["invoices"])
    assert stats["customer"]["history_lag_days"] is None
    assert stats["customer"]["history_reason"] == "receipt_history_ambiguous"
