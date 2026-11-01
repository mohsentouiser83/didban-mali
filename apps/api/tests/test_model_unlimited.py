"""Uncapped mode removes spend ceilings while preserving financial safeguards."""
from test_api_delivery import scenario
from test_model_gateway import SETUP


def test_unlimited_bootstraps_accounting_and_settles_usage_without_company_budget(tmp_path):
    setup = "\n".join(line for line in SETUP.splitlines() if not any(
        marker in line for marker in ("db.add(m.ModelTariff", "db.add(m.BudgetPolicy", "db.add(m.InstallationModelBudget")
    ))
    scenario(tmp_path, setup + r'''
from pydantic import SecretStr
from didban.config import settings
from didban.model_admin_service import model_status, company_usage
settings.model_budget_unlimited=True
settings.openai_api_key=SecretStr("synthetic")
with transaction("company-a") as db:
    status=model_status(db,"company-a")
    assert status["configured"] and status["budget_mode"]=="unlimited"
calls=[]
def handler(request):
    calls.append(request)
    assert str(request.url)=="https://api.avalai.ir/v1/responses"
    return httpx.Response(200,json={"model":"gpt-5.6-luna","service_tier":"default","status":"completed",
        "usage":{"input_tokens":100,"input_tokens_details":{"cached_tokens":0,"cache_write_tokens":0},"output_tokens":20},
        "output":[{"type":"message","content":[{"type":"output_text","text":json.dumps(proposal)}]}]})
gateway=ModelGateway(GatewayConfig(enabled=True,api_key="synthetic",budget_unlimited=True),httpx.MockTransport(handler))
result=asyncio.run(gateway.invoke(**arguments))
assert result["state"]=="completed",result
again=asyncio.run(gateway.invoke(**arguments))
assert again["request_id"]==result["request_id"] and len(calls)==1
with transaction("company-a") as db:
    budget=db.scalar(select(m.InstallationModelBudget))
    assert budget.cap=="0" and budget.used=="0.000044" and Decimal(budget.reserved)==0
    reservation=db.scalar(select(m.BudgetReservation))
    assert reservation.state=="settled" and reservation.actual_cost=="0.000044"
    assert not list(db.scalars(select(m.BudgetPolicy)))
    assert len(list(db.scalars(select(m.ModelTariff))))==1
    usage=company_usage(db,"company-a",db.get(m.User,users["owner"]))
    assert usage["budget_mode"]=="unlimited" and usage["used"]=="0.000044"
# Returning to capped mode restores the required explicit company budget.
capped=ModelGateway(GatewayConfig(enabled=True,api_key="synthetic"),httpx.MockTransport(handler))
result=asyncio.run(capped.invoke(**(arguments|{"request_key":"capped-after-unlimited"})))
assert result["reason_code"]=="model_budget_not_configured" and len(calls)==1
''')


def test_unlimited_ignores_all_spend_caps_but_preserves_authorization_and_unknown_cost(tmp_path):
    scenario(tmp_path, SETUP + r'''
with transaction("company-a") as db:
    db.scalar(select(m.BudgetPolicy)).cap="0"
    budget=db.scalar(select(m.InstallationModelBudget))
    budget.cap="0";budget.per_session_cap="0"
calls=[]
def handler(request):
    calls.append(request)
    return httpx.Response(200,json={"model":"gpt-5.6-luna","service_tier":"default","status":"completed",
       "output":[{"type":"message","content":[{"type":"output_text","text":json.dumps(proposal)}]}]})
gateway=ModelGateway(GatewayConfig(enabled=True,api_key="synthetic",budget_unlimited=True),httpx.MockTransport(handler))
try:
    asyncio.run(gateway.invoke(**(arguments|{"actor_id":users["outsider"],"request_key":"unauthorized"})))
    raise AssertionError("Cross-company request accepted")
except Exception as error:
    assert getattr(error,"code",None)=="not_found",str(error)
assert not calls
result=asyncio.run(gateway.invoke(**arguments))
assert result["state"]=="waiting_reconciliation",result
with transaction("company-a") as db:
    reservation=db.scalar(select(m.BudgetReservation))
    assert reservation.state=="unknown" and Decimal(reservation.amount)>0
    assert db.scalar(select(m.InstallationModelBudget)).reserved==reservation.amount
''')


def test_avalai_zero_tool_usage_is_accepted_but_nonzero_or_unknown_tools_are_not():
    from didban.model_gateway import no_billable_tools

    observed = {"image_gen": {"input_tokens": 0, "input_tokens_details": {"image_tokens": 0, "text_tokens": 0},
                              "output_tokens": 0, "output_tokens_details": {"image_tokens": 0, "text_tokens": 0},
                              "total_tokens": 0}, "web_search": {"num_requests": 0}}
    assert no_billable_tools(observed)
    assert not no_billable_tools({"web_search": {"num_requests": 1}})
    assert not no_billable_tools({"unknown_tool": {"num_requests": 0}})
    assert not no_billable_tools({"web_search": {"num_requests": None}})
    assert not no_billable_tools({"web_search": {"num_requests": -1}})
