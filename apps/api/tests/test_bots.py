"""Isolated bot pairing, replay and read-only AI boundaries (no real delivery)."""

from test_api_delivery import scenario

SETUP = r'''
import asyncio
from datetime import timedelta
from sqlalchemy import func
from didban import bot_service
from pydantic import SecretStr
settings.bots_enabled=True
settings.telegram_bot_token=SecretStr("123456:test-token")
settings.telegram_webhook_secret=SecretStr("a"*40)
owner=client_for("owner"); viewer=client_for("viewer")
path=base+"/bot-connections"

def incoming(identifier, text, sender=77):
    return {"update_id": identifier, "message":{"message_id":identifier,"from":{"id":sender,"is_bot":False},"chat":{"id":sender,"type":"private"},"text":text}}

class Transport:
    def __init__(self): self.messages=[]
    async def send_message(self, chat_id, text): self.messages.append((chat_id,text)); return "1"

transport=Transport()

def ingress(identifier, text, sender=77, responder=None):
    return asyncio.run(bot_service.receive("telegram",incoming(identifier,text,sender),transport=transport,responder=responder))

def pairing(client=owner, sender=77, identifier=1):
    response=command(client,"POST",path,{"provider":"telegram"})
    assert response.status_code==201,response.text
    pair=response.json()
    ingress(identifier,"/start "+pair["pairing_code"],sender)
    response=command(client,"POST",path+"/"+pair["id"]+"/confirm",version=2)
    assert response.status_code==200,response.text
    return response.json()
'''


def test_bot_pairing_requires_web_confirmation_and_hashes_code(tmp_path):
    scenario(tmp_path, SETUP + r'''
key=str(uuid4())
response=command(owner,"POST",path,{"provider":"telegram"},key=key)
assert response.status_code==201,response.text
pair=response.json()
assert len(pair["pairing_code"])>=40
assert command(owner,"POST",path,{"provider":"telegram"},key=key).json()["pairing_code"] is None
with transaction() as db:
    item=db.get(m.BotConnection,pair["id"])
    assert item.token_hash!=pair["pairing_code"]
    assert pair["pairing_code"] not in str(db.scalar(select(m.Idempotency).where(m.Idempotency.key==key)).response)
ingress(1,"/start "+pair["pairing_code"])
ingress(2,"موجودی بانک")
assert transport.messages==[]
assert command(viewer,"POST",path+"/"+pair["id"]+"/confirm",version=2).status_code==404
assert command(owner,"POST",path+"/"+pair["id"]+"/confirm",version=1).status_code==409
assert command(owner,"POST",path+"/"+pair["id"]+"/confirm",version=2).status_code==200
ingress(3,"/start "+pair["pairing_code"],sender=88)
item=owner.get(path).json()["items"][0]
assert item["state"]=="active" and item["sender_id"]=="77"
assert client_for("outsider").get(path).status_code==404
csrf=owner.headers.pop("x-csrf-token")
assert command(owner,"POST",path,{"provider":"telegram"}).status_code==403
''')


def test_bot_ai_uses_filtered_manifest_and_duplicate_delivery_does_not_repeat(tmp_path):
    scenario(tmp_path, SETUP + r'''
pair=pairing()
calls=[]
async def responder(**kwargs):
    calls.append(kwargs)
    assert kwargs["company_id"]=="company-a" and kwargs["actor_id"]==users["owner"]
    assert kwargs["manifest"]["details"]=={"as_of_date":None}
    return {"answer":"داده گزارش", "manifest_id":kwargs["manifest"]["id"],"model_state":"completed","facts":[{"metric_key":"cash","label":"نقد","value":None,"unit":"IRR","reason_codes":["bank_source_missing"]}]}
ingress(2,"موجودی بانک",responder=responder)
ingress(2,"موجودی بانک",responder=responder)
assert len(calls)==1 and len(transport.messages)==1
assert "ناموجود" in transport.messages[0][1] and "نسخه گزارش" in transport.messages[0][1]
assert "گردش بانک موجود نیست" in transport.messages[0][1]
assert command(owner,"DELETE",path+"/"+pair["id"],version=3).status_code==200
ingress(3,"موجودی بانک",responder=responder)
assert len(transport.messages)==1
''')


def test_bot_expiry_revocation_in_flight_and_rate_limit(tmp_path):
    scenario(tmp_path, SETUP + r'''
pair=command(owner,"POST",path,{"provider":"telegram"}).json()
with transaction() as db:
    db.get(m.BotConnection,pair["id"]).expires_at=m.now()-timedelta(seconds=1)
ingress(1,"/start "+pair["pairing_code"])
assert command(owner,"POST",path+"/"+pair["id"]+"/confirm",version=1).status_code==409
pair=pairing(identifier=2)
async def revoke_while_model_runs(**kwargs):
    with transaction("company-a") as db:
        db.get(m.Membership,members["owner"]).active=False
    return {"answer":"private", "facts":[]}
ingress(3,"موجودی بانک",responder=revoke_while_model_runs)
assert transport.messages==[]
with transaction("company-a") as db:
    db.get(m.Membership,members["owner"]).active=True
async def responder(**kwargs): return {"answer":"ok","facts":[]}
for index in range(4,20): ingress(index,"سلام",responder=responder)
assert len(transport.messages)==9
with transaction() as db:
    assert db.scalar(select(func.count()).select_from(m.BotUpdate).where(m.BotUpdate.state=="rate_limited"))>0
''')


def test_bot_webhook_disabled_secret_and_payload_guards(tmp_path):
    scenario(tmp_path, SETUP + r'''
url="/api/v1/bots/telegram/webhook"
assert owner.post(url,json=incoming(1,"سلام")).status_code==403
assert owner.post(url,json=incoming(1,"سلام"),headers=[(b"x-telegram-bot-api-secret-token", "نامعتبر".encode("utf-8"))]).status_code==403
headers={"x-telegram-bot-api-secret-token":"a"*40}
assert owner.post(url,json=incoming(1,"سلام"),headers=headers).status_code==200
assert owner.post(url,content=b"x"*32769,headers=headers).status_code==413
settings.bale_bot_token=SecretStr("123456:test-token")
settings.bale_webhook_secret=SecretStr("a"*40)
assert owner.post("/api/v1/bots/bale/webhook/نامعتبر",json=incoming(2,"سلام")).status_code==403
settings.bots_enabled=False
assert owner.post(url,json=incoming(2,"سلام"),headers=headers).status_code==503
assert owner.get(path).json()["providers"]["telegram"]["configured"] is False
''')


def test_consumed_pairing_expires_and_unconfirmed_delivery_is_not_retried(tmp_path):
    scenario(tmp_path, SETUP + r'''
pair=command(owner,"POST",path,{"provider":"telegram"}).json()
ingress(1,"/start "+pair["pairing_code"])
with transaction() as db:
    db.get(m.BotConnection,pair["id"]).expires_at=m.now()-timedelta(seconds=1)
assert command(owner,"POST",path+"/"+pair["id"]+"/confirm",version=2).status_code==409
pair=pairing(identifier=2)
class Uncertain:
    calls=0
    async def send_message(self,chat_id,text):
        self.calls+=1
        raise RuntimeError("provider URL must not be stored")
uncertain=Uncertain()
async def responder(**kwargs): return {"answer":"ok","facts":[]}
asyncio.run(bot_service.receive("telegram",incoming(3,"سلام"),transport=uncertain,responder=responder))
asyncio.run(bot_service.receive("telegram",incoming(3,"سلام"),transport=uncertain,responder=responder))
assert uncertain.calls==1
with transaction() as db:
    assert db.scalar(select(m.BotUpdate).where(m.BotUpdate.update_id=="3")).state=="failed"
settings.telegram_webhook_secret=SecretStr("a"*39+"/")
assert owner.get(path).json()["providers"]["telegram"]["configured"] is False
settings.telegram_webhook_secret=SecretStr("a"*40)
settings.telegram_bot_token=SecretStr("invalid token with spaces")
assert command(owner,"POST",path,{"provider":"telegram"}).status_code==503
''')


def test_bot_default_responder_reuses_guarded_assistant_service(tmp_path):
    scenario(tmp_path, SETUP + r'''
pair=pairing()
ingress(2,"موجودی بانک")
assert len(transport.messages)==1
assert "گردش بانک موجود نیست" in transport.messages[0][1]
assert "مدل اجرا نشده" in transport.messages[0][1]
assert "0 ریال" not in transport.messages[0][1]
''')


def test_connection_metadata_exposes_only_public_bot_destination(tmp_path):
    scenario(tmp_path, SETUP + r'''
settings.telegram_bot_username="company_test_bot"
settings.bale_bot_username="company_bale_bot"
response=owner.get(path)
assert response.status_code==200,response.text
body=response.json()
assert body["providers"]["telegram"]["username"]=="company_test_bot"
assert body["providers"]["bale"]["username"]=="company_bale_bot"
assert settings.telegram_bot_token.get_secret_value() not in response.text
assert settings.telegram_webhook_secret.get_secret_value() not in response.text
assert body["items"]==[]
''')


def test_pairing_expiry_retains_utc_after_database_reload(tmp_path):
    scenario(tmp_path, SETUP + r'''
from datetime import datetime, timezone
pair=command(owner,"POST",path,{"provider":"telegram"}).json()
listed=owner.get(path).json()["items"][0]
assert datetime.fromisoformat(listed["expires_at"]).tzinfo is not None
assert datetime.fromisoformat(listed["created_at"]).tzinfo is not None
assert datetime.fromisoformat(listed["expires_at"])==datetime.fromisoformat(pair["expires_at"])
assert datetime.fromisoformat(listed["expires_at"])>m.now()
''')
