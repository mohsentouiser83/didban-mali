from test_api_delivery import scenario
from test_bots import SETUP


def test_explicit_text_intake_private_original_unknown_fields_review_and_no_posting(tmp_path):
    scenario(
        tmp_path,
        SETUP
        + r"""
from pathlib import Path
from hashlib import sha256
from didban.bot_intake_models import BotIntake
from didban.bot_extraction_models import BotExtractionProposal,BotExtractionReview
from didban.posting_models import NativeJournal
pair=pairing()
text="دریافت ۱۲ میلیون تومان بابت خدمات؛ تاریخ نامشخص"
ingress(2,"/document "+text)
ingress(2,"/document "+text)
with transaction("company-a") as db:
    intake=db.scalar(select(BotIntake));assert intake.kind=="text" and intake.state=="awaiting_review"
    original=(settings.storage/intake.storage_key).read_bytes();assert original.decode()==text
    assert sha256(original).hexdigest()==intake.sha256
    proposal=db.scalar(select(BotExtractionProposal));assert proposal.method=="plain_text"
    assert proposal.proposal["text"]==text and proposal.proposal["rows"]==[]
    assert proposal.proposal["unit"]==proposal.proposal["calendar"]==proposal.proposal["family"]=="unknown"
    assert proposal.model_request_id is None and db.scalar(select(NativeJournal.id)) is None
    identifier=intake.id;proposal_id=proposal.id;original_sha=intake.sha256
assert len(transport.messages)==1 and "سند مالی ثبت نشد" in transport.messages[0][1]
assert owner.get(base+"/bot-intakes").json()["items"][0]["duplicate_original"] is False
assert viewer.get(base+"/bot-intakes/"+identifier+"/download").status_code==404
assert owner.get(base+"/bot-intakes/"+identifier+"/download").content==original
body={"period_id":period_id,"family":"bank","unit":"TOMAN","calendar":"gregorian","rows":[{"date":"2026-09-03","reference":"text-1","party_id":"customer","account":"A","amount":"12000000","evidence_refs":["intake:"+identifier]}]}
key=str(uuid4());reviewed=command(owner,"POST",base+"/bot-intakes/extractions/"+proposal_id+"/review",body,version=1,key=key)
assert reviewed.status_code==201,reviewed.text
assert command(owner,"POST",base+"/bot-intakes/extractions/"+proposal_id+"/review",body,version=1,key=key).json()==reviewed.json()
with transaction("company-a") as db:
    item=db.get(BotIntake,identifier);assert item.sha256==original_sha and (settings.storage/item.storage_key).read_bytes()==original
    assert db.scalar(select(m.ProcessingSession).where(m.ProcessingSession.id==reviewed.json()["session_id"])).state=="receiving"
    assert db.scalar(select(m.JournalLine.id)) is None and db.scalar(select(NativeJournal.id)) is None
    assert len(list(db.scalars(select(BotExtractionReview))))==1
""",
    )


def test_text_duplicates_warn_without_foreign_intake_identity_and_plain_chat_not_intake(tmp_path):
    scenario(
        tmp_path,
        SETUP
        + r"""
from didban.bot_intake_models import BotIntake
pair=pairing()
async def responder(**kwargs):return {"answer":"خواندنی","facts":[],"model_state":"completed"}
ingress(2,"این متن فقط سؤال است",responder=responder)
with transaction("company-a") as db:assert db.scalar(select(BotIntake.id)) is None
ingress(3,"/document متن یکسان")
ingress(4,"/document متن یکسان")
items=owner.get(base+"/bot-intakes").json()["items"]
assert len(items)==2 and sum(row["duplicate_original"] for row in items)==1
for item in items:
    assert not any("duplicate" in key and key!="duplicate_original" for key in item)
    assert "connection_id" not in item and "storage_key" not in item
with transaction("company-a") as db:
    member=db.get(m.Membership,members["owner"]);member.role="viewer"
ingress(5,"/document غیرمجاز")
with transaction("company-a") as db:assert len(list(db.scalars(select(BotIntake))))==2
assert command(owner,"DELETE",path+"/"+pair["id"],version=3).status_code==200
ingress(6,"/document اتصال لغوشده")
with transaction("company-a") as db:assert len(list(db.scalars(select(BotIntake))))==2
""",
    )
