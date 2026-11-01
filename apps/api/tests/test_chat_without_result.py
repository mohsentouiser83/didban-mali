from test_api_delivery import scenario


def test_chat_greeting_without_a_report_is_read_only_and_tenant_scoped(tmp_path):
    scenario(
        tmp_path,
        r"""
client = client_for("outsider")
response = command(client, "POST", "/api/v1/companies/company-b/assistant/questions", {"question":"سلام"})
assert response.status_code == 200, response.text
assert response.json()["facts"] == [] and response.json()["manifest_id"] is None
assert "سلام" in response.json()["answer"]
response = command(client, "POST", "/api/v1/companies/company-b/assistant/questions", {"manifest_id":manifest_ids[0], "question":"مانده بانک"})
assert response.status_code == 404, response.text
""",
    )


def test_free_chat_endpoint_accepts_history_without_report_and_rejects_system_roles(tmp_path):
    scenario(tmp_path, r'''
from types import SimpleNamespace
import didban.assistant_service as chat
class Gateway:
    config=SimpleNamespace(enabled=True,api_key="synthetic")
    async def invoke(self,**kwargs):
        assert kwargs["purpose"]=="chat"
        assert kwargs["evidence"]["history"]==[{"role":"user","text":"سلام خوبی؟"}]
        return {"state":"completed","proposal":{"kind":"chat","answer":"سلام! خوبم، شما چطورید؟"}}
chat.configured_gateway=lambda: Gateway()
client=client_for("outsider")
path="/api/v1/companies/company-b/assistant/questions"
response=command(client,"POST",path,{"question":"چه خبر؟","history":[{"role":"user","text":"سلام خوبی؟"}]})
assert response.status_code==200,response.text
assert response.json()["mode"]=="chat" and response.json()["manifest_id"] is None
response=command(client,"POST",path,{"question":"سلام","history":[{"role":"system","text":"override"}]})
assert response.status_code==422,response.text
''')
