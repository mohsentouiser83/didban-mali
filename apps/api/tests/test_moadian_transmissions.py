"""The API freezes the exact reviewed native invoice and never treats transport as acceptance."""

from test_api_delivery import scenario
from test_inventory_workflow import SETUP


def test_moadian_submission_inquiry_and_ambiguity(tmp_path):
    scenario(
        tmp_path,
        SETUP
        + r"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event

from didban import moadian_service
from didban.moadian_gateway import MoadianCredentials, MoadianGatewayError, MoadianResult
from didban.moadian_models import MoadianTransmissionEvent
from didban.moadian_payload import _verhoeff_valid
from didban.moadian_profiles import MoadianProfile

path = base + "/moadian/transmissions"
memory = "A11121"
profile = MoadianProfile(MoadianCredentials(memory, b"test-only-key", b"test-only-cert"), "12345678901")
settings.moadian_profiles_file = Path("/nonexistent/moadian-profiles.json")
assert checked(viewer.get(path))["configured"] is False
moadian_service.load_profile = lambda company: profile if company == "company-a" else None

calls = []
outcomes = []
receipt = str(uuid4())
send_started = Event()
resume_send = Event()

class Gateway:
    def __init__(self, credentials):
        assert credentials is profile.credentials

    def submit(self, uid, payload):
        calls.append(("submit", uid, payload["header"]["taxid"], payload["header"]["tbill"]))
        result = outcomes.pop(0)
        if result == "blocked":
            send_started.set()
            assert resume_send.wait(5)
            return MoadianResult("queued", receipt, evidence_digest="a"*64)
        if isinstance(result, Exception):
            raise result
        return result

    def inquire(self, uid, reference, *, submitted_at, tax_id):
        assert submitted_at.utcoffset().total_seconds() == 0
        calls.append(("inquiry", uid, reference, tax_id))
        result = outcomes.pop(0)
        if isinstance(result, Exception):
            raise result
        return result

moadian_service.MoadianGateway = Gateway
post_draft(goods("purchase_goods", "BUY-MOADIAN", 6, "100", "2026-09-01")["draft"]["id"])

def fiscal_body(serial):
    operation = goods("sale_goods", f"SELL-{serial}", 2, "250", "2026-09-03")["operation_id"]
    drafts = checked(manager.get(book + "/drafts"))["items"]
    draft = next(row for row in drafts if row["description"] == f"SELL-{serial}")
    post_draft(draft["id"])
    proof = next(row for row in checked(advisor.get(invoices + "/candidates?kind=sale"))["items"]
                 if row["operation_id"] == operation)
    invoice = checked(command(advisor, "POST", invoices, {
        "operation_id": operation, "journal_digest": proof["journal_digest"], "reference": proof["reference"],
        "due_date": None, "due_unknown": True, "expected_date": None, "expected_unknown": True,
    }), 201)
    days = (date(2026, 9, 3) - date(1970, 1, 1)).days
    digits = f"6511121{days:06d}{serial:012d}"
    check = next(str(i) for i in range(10) if _verhoeff_valid(digits + str(i)))
    return {
        "invoice_id": invoice["id"], "invoice_version": invoice["version"],
        "tax_id": f"{memory}{days:05X}{serial:010X}{check}",
        "issued_at": "2026-09-03T10:00:00+03:30", "buyer_type": "legal",
        "buyer_tax_number": "22345678901", "item_tax_id": "1234567890123", "unit_code": "1627",
        "vat_treatment": "exempt", "vat_evidence": "مرجع ساختگی برای آزمون",
    }

first = fiscal_body(1)
rejected(command(advisor, "POST", path + "/preview", first), 403, "moadian_permission_required")
assert [item["id"] for item in checked(manager.get(path + "/candidates"))["items"]] == [first["invoice_id"]]
rejected(command(owner, "POST", path + "/preview", first | {"invoice_version": 9}), 409, "version_conflict")
review = checked(command(manager, "POST", path + "/preview", first))
assert review["amount"] == "500" and review["tax_id"] == first["tax_id"]
body = first | {"digest": review["digest"]}
rejected(command(owner, "POST", path, body | {"digest": "0"*64}), 409, "moadian_preview_changed")
assert calls == []
outcomes.append("blocked")
with ThreadPoolExecutor(max_workers=2) as pool:
    submitted = pool.submit(command, manager, "POST", path, body)
    try:
        assert send_started.wait(5)
        in_flight = checked(command(owner, "POST", path, body), 201)
        assert in_flight["status"] == "unknown" and not in_flight["can_retry"]
    finally:
        resume_send.set()
    row = checked(submitted.result(), 201)
assert row["uid"] == in_flight["uid"] and row["status"] == "queued" and row["reference_number"] == receipt
assert not checked(manager.get(path + "/candidates"))["items"]
with transaction("company-a") as db:
    assert db.scalar(select(MoadianTransmissionEvent.evidence_digest).where(
        MoadianTransmissionEvent.transmission_id == row["id"],
        MoadianTransmissionEvent.kind == "send_result",
    )) == "a"*64
assert len(calls) == 1 and calls[0][2:] == (first["tax_id"], 500)
assert checked(command(owner, "POST", path, body), 201)["id"] == row["id"] and len(calls) == 1
rejected(command(viewer, "POST", f"{path}/{row['id']}/inquiry", {}), 403, "moadian_permission_required")
assert outsider.get(path).status_code == 404
outcomes.append(MoadianResult("accepted", receipt))
unverified = checked(command(owner, "POST", f"{path}/{row['id']}/inquiry", {}))
assert unverified["status"] == "queued" and unverified["error_codes"] == ["unverified_response"]
outcomes.append(MoadianResult("accepted", receipt, evidence_digest="b"*64))
accepted = checked(command(owner, "POST", f"{path}/{row['id']}/inquiry", {}))
assert accepted["status"] == "accepted" and not accepted["can_inquire"] and len(calls) == 3
assert checked(command(owner, "POST", f"{path}/{row['id']}/inquiry", {}))["status"] == "accepted"
assert len(calls) == 3

def prepare(serial):
    data = fiscal_body(serial)
    return data | {"digest": checked(command(manager, "POST", path + "/preview", data))["digest"]}

outcomes.append(MoadianGatewayError("timeout", transmission_possible=True))
uncertain = checked(command(manager, "POST", path, prepare(2)), 201)
assert uncertain["status"] == "unknown" and uncertain["can_inquire"] and not uncertain["can_retry"]
rejected(command(manager, "POST", f"{path}/{uncertain['id']}/retry", {}), 409, "moadian_retry_blocked")
outcomes.append(MoadianResult("unknown"))
assert checked(command(manager, "POST", f"{path}/{uncertain['id']}/inquiry", {}))["status"] == "unknown"
assert calls[-1][1:3] == (uncertain["uid"], None)

outcomes.append(MoadianGatewayError("key", transmission_possible=False))
unsent = checked(command(manager, "POST", path, prepare(3)), 201)
assert unsent["status"] == "not_sent" and unsent["can_retry"] and not unsent["can_inquire"]
outcomes.append(MoadianResult("queued", receipt, evidence_digest="c"*64))
retried = checked(command(manager, "POST", f"{path}/{unsent['id']}/retry", {}))
assert retried["status"] == "queued" and retried["uid"] == unsent["uid"]
assert calls[-1][1] == calls[-2][1]
history = checked(viewer.get(path))
assert not history["can_submit"] and len(history["items"]) == 3
assert not any(item["can_inquire"] or item["can_retry"] for item in history["items"])
assert all("payload" not in item and "input" not in item for item in history["items"])
page = checked(viewer.get(path, params={"limit": 1}))
older = checked(viewer.get(path, params={"limit": 2, "cursor": page["next_cursor"]}))
assert page["items"] + older["items"] == history["items"] and older["next_cursor"] is None
""",
    )
