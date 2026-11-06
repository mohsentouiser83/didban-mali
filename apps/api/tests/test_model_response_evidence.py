"""Provider accounting receipts use synthetic HTTP only, never live company files."""

from test_api_delivery import scenario
from test_model_gateway import SETUP


def test_unknown_cost_retains_full_ids_and_counters_without_output_or_secrets(tmp_path):
    scenario(tmp_path, SETUP + r'''
from sqlalchemy.exc import IntegrityError
long_id="resp_"+"a"*250
value=envelope()
value["id"]=long_id
value["usage"]["input_tokens_details"].pop("cache_write_tokens")
value["usage"]["secret"]="must-not-be-stored"
value["usage"]["output_tokens_details"]={"reasoning_tokens":3,"text":"private reasoning"}
calls=[]
def handler(request):
    calls.append(request)
    return httpx.Response(200,json=value,headers={
        "avalai-request-id":"provider-lookup-1","x-request-id":"http-trace-1",
        "authorization":"Bearer must-not-be-stored","set-cookie":"private-cookie",
    })
gateway=configured(handler)
first=asyncio.run(gateway.invoke(**arguments))
assert first["state"]=="waiting_reconciliation",first
assert asyncio.run(gateway.invoke(**arguments))==first and len(calls)==1
with transaction("company-a") as db:
    reservation=db.scalar(select(m.BudgetReservation));reservation_id=reservation.id
    request=db.scalar(select(m.ModelRequest))
    assert request.provider_response_id is None  # No misleading truncated ID.
    assert request.usage["input_tokens"]==100
    assert "cache_write_tokens" not in request.usage["input_tokens_details"]
    receipt=db.scalar(select(m.AuditEvent).where(m.AuditEvent.action=="model.response_received"))
    receipt_id=receipt.id
    data=receipt.details["response"]
    assert receipt.entity_id==reservation_id and receipt.details["attempt"]==1
    assert data["provider_response_id"]==long_id
    assert data["provider_request_id"]=="provider-lookup-1" and data["http_request_id"]=="http-trace-1"
    assert data["http_status"]==200 and data["cost_reason"]=="model_usage_unknown"
    assert data["usage"]["output_tokens_details"]=={"reasoning_tokens":3}
    assert reservation.state=="unknown" and reservation.actual_cost is None
    assert Decimal(db.scalar(select(m.InstallationModelBudget)).reserved)>0
    assert all(text not in json.dumps(receipt.details) for text in ("must-not-be-stored","private-cookie","private reasoning","output_text","evidence_refs"))
try:
    with transaction("company-a") as db:
        db.execute(update(m.AuditEvent).where(m.AuditEvent.id==receipt_id).values(details={}))
    raise AssertionError("Receipt was mutable")
except IntegrityError:
    pass
owner=client_for("owner");viewer=client_for("viewer");manager=client_for("finance_manager")
path=base+"/model-reservations/"+reservation_id+"/response-evidence"
assert viewer.get(path).status_code==403 and manager.get(path).status_code==403
response=owner.get(path)
assert response.status_code==200 and response.json()["available"] is True,response.text
assert response.json()["evidence"]["response"]["provider_response_id"]==long_id
assert owner.get(path.replace("company-a","company-b")).status_code==404
assert client_for("outsider").get(path).status_code==404
public=viewer.get(base+"/model-requests").json()
assert long_id not in json.dumps(public) and "provider-lookup-1" not in json.dumps(public)
''')


def test_failed_http_and_retry_keep_separate_immutable_receipts(tmp_path):
    scenario(tmp_path, SETUP + r'''
def unavailable(request):
    return httpx.Response(503,json={"error":"private provider error"},headers={"avalai-request-id":"failed-trace"})
first=asyncio.run(configured(unavailable).invoke(**arguments))
assert first["reason_code"]=="model_unavailable"
with transaction("company-a") as db:
    db.scalar(select(m.ModelRequest)).next_attempt_at=now()-timedelta(seconds=1)
second=asyncio.run(configured(lambda req:httpx.Response(200,json=envelope(),headers={"avalai-request-id":"second-trace"})).invoke(**arguments))
assert second["state"]=="completed",second
with transaction("company-a") as db:
    receipts=list(db.scalars(select(m.AuditEvent).where(m.AuditEvent.action=="model.response_received").order_by(m.AuditEvent.created_at)))
    assert len(receipts)==2 and [r.details["attempt"] for r in receipts]==[1,2]
    assert receipts[0].entity_id!=receipts[1].entity_id
    assert receipts[0].details["response"]["http_status"]==503
    assert receipts[0].details["response"]["provider_request_id"]=="failed-trace"
    assert receipts[0].details["response"]["usage"] is None
    assert "private provider error" not in json.dumps([r.details for r in receipts])
    assert receipts[1].details["response"]["provider_request_id"]=="second-trace"
    assert db.scalar(select(m.ModelRequest)).usage["output_tokens"]==5
    reservations=list(db.scalars(select(m.BudgetReservation).order_by(m.BudgetReservation.attempt)))
    assert [r.state for r in reservations]==["unknown","settled"]
''')


def test_late_attempt_receipt_does_not_overwrite_latest_attempt_usage(tmp_path):
    scenario(tmp_path, SETUP + r'''
async def recovery():
    started=asyncio.Event();release=asyncio.Event()
    async def slow(request):
        started.set();await release.wait()
        value=envelope();value["id"]="old-response";value["usage"]["output_tokens"]=7
        return httpx.Response(200,json=value,headers={"avalai-request-id":"old-trace"})
    first=asyncio.create_task(configured(slow).invoke(**arguments))
    await asyncio.wait_for(started.wait(),5)
    with transaction("company-a") as db:
        db.scalar(select(m.ModelRequest)).dispatch_deadline=now()-timedelta(seconds=1)
    new=envelope();new["id"]="new-response"
    second=await configured(lambda request:httpx.Response(200,json=new,headers={"avalai-request-id":"new-trace"})).invoke(**arguments)
    assert second["state"]=="completed",second
    release.set();await first
    with transaction("company-a") as db:
        request=db.scalar(select(m.ModelRequest))
        assert request.provider_response_id=="new-response" and request.usage["output_tokens"]==5
        receipts=list(db.scalars(select(m.AuditEvent).where(m.AuditEvent.action=="model.response_received")))
        by_attempt={r.details["attempt"]:r.details["response"] for r in receipts}
        assert by_attempt[1]["provider_response_id"]=="old-response" and by_attempt[1]["usage"]["output_tokens"]==7
        assert by_attempt[2]["provider_response_id"]=="new-response" and by_attempt[2]["usage"]["output_tokens"]==5
asyncio.run(recovery())
''')


def test_legacy_unknown_reservation_has_no_fabricated_receipt(tmp_path):
    scenario(tmp_path, SETUP + r'''
with transaction("company-a") as db:
    request=m.ModelRequest(company_id="company-a",actor_id=users["owner"],request_key="old",input_hash="0"*64,
        purpose="chat",model="gpt-5.6-luna",prompt_version="old",state="waiting_reconciliation",attempts=1)
    db.add(request);db.flush()
    reservation=m.BudgetReservation(company_id="company-a",request_id=request.id,tariff_id=db.scalar(select(m.ModelTariff)).id,
        installation_budget_id=db.scalar(select(m.InstallationModelBudget)).id,period=period,attempt=1,amount="0.01",state="unknown")
    db.add(reservation);db.flush();reservation_id=reservation.id
owner=client_for("owner")
result=owner.get(base+"/model-reservations/"+reservation_id+"/response-evidence")
assert result.status_code==200 and result.json()["available"] is False and result.json()["evidence"] is None,result.text
''')


def test_response_after_manual_reconciliation_keeps_receipt_without_charging_again(tmp_path):
    scenario(tmp_path, SETUP + r'''
def handler(request):
    # A recovery/admin transaction may reconcile a reserved attempt while HTTP
    # is still in flight. The later receipt must not charge that attempt twice.
    with transaction("company-a") as db:
        reservation=db.scalar(select(m.BudgetReservation));reservation.state="unknown"
        reservation_id=reservation.id
    reconcile_unknown_cost(company_id="company-a",actor_id=users["owner"],reservation_id=reservation_id,
        actual_cost="0.005",evidence_reference="synthetic-provider-ledger")
    return httpx.Response(200,json=envelope(),headers={"avalai-request-id":"late-settled-trace"})
asyncio.run(configured(handler).invoke(**arguments))
with transaction("company-a") as db:
    reservation=db.scalar(select(m.BudgetReservation))
    assert reservation.actual_cost=="0.005" and reservation.state=="settled"
    assert Decimal(db.scalar(select(m.InstallationModelBudget)).used)==Decimal("0.005")
    receipt=db.scalar(select(m.AuditEvent).where(m.AuditEvent.action=="model.response_received"))
    assert receipt.details["response"]["provider_request_id"]=="late-settled-trace"
    assert receipt.details["response"]["cost_reason"]=="reservation_already_resolved"
''')
