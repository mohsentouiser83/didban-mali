import io

import pytest
from PIL import Image
from test_api_delivery import scenario
from test_model_gateway import SETUP

from didban.errors import DomainError
from didban.media_adapter import image_png
from didban.model_gateway import validate_proposal


def image():
    out = io.BytesIO()
    Image.new("RGB", (10, 10), "white").save(out, format="PNG")
    return out.getvalue()


def test_bounded_image_preserves_original_and_rejects_invalid_container():
    source = image()
    assert image_png(source).startswith(b"\x89PNG")
    assert source == image()
    with pytest.raises(DomainError):
        image_png(b"not an image")


def test_document_proposal_requires_real_source_refs_and_preserves_unknowns():
    proposal = {
        "family": "unknown",
        "unit": "unknown",
        "calendar": "unknown",
        "rows": [
            {
                "date": None,
                "reference": None,
                "party_id": None,
                "account": None,
                "amount": None,
                "evidence_refs": ["page1"],
            }
        ],
        "evidence_refs": ["page1"],
        "unresolved_fields": ["amount"],
    }
    assert (
        validate_proposal("extract_document", proposal, {"source_refs": ["page1"]})["rows"][0]["amount"]
        is None
    )
    with pytest.raises(DomainError):
        validate_proposal("extract_document", proposal, {"source_refs": ["other"]})
    proposal["rows"][0]["amount"] = 12.5
    with pytest.raises(DomainError):
        validate_proposal("extract_document", proposal, {"source_refs": ["page1"]})


def test_multimodal_gateway_uses_private_high_detail_and_reserved_budget(tmp_path):
    scenario(
        tmp_path,
        SETUP
        + r"""
import io,base64
from PIL import Image
out=io.BytesIO();Image.new("RGB",(10,10),"white").save(out,format="PNG");image=out.getvalue()
proposal={"family":"unknown","unit":"unknown","calendar":"unknown","rows":[],"evidence_refs":["page1"],"unresolved_fields":["amount"]}
def handler(request):
    body=json.loads(request.content)
    assert body["input"][0]["content"][1]["type"]=="input_image"
    assert body["input"][0]["content"][1]["detail"]=="high"
    assert body["store"] is False
    assert "media_sha256" in body["input"][0]["content"][0]["text"]
    with transaction("company-a") as db:
        reservations=list(db.scalars(select(m.BudgetReservation)));assert reservations and reservations[0].state=="held"
        assert base64.b64encode(image).decode() not in str(list(db.scalars(select(m.ModelRequest)))[0].__dict__)
    return httpx.Response(200,json=envelope(proposal))
result=asyncio.run(configured(handler).invoke(company_id="company-a",actor_id=users["owner"],purpose="extract_document",evidence={"source_refs":["page1"]},request_key="image1",media_inputs=[image]))
assert result["state"]=="completed",result
assert result["proposal"]["family"]=="unknown"
try:
    asyncio.run(configured(handler).invoke(company_id="company-a",actor_id=users["owner"],purpose="chat",evidence={"source_refs":["page1"]},request_key="badpurpose",media_inputs=[image]))
    raise AssertionError("media crossed purpose boundary")
except Exception as error:
    assert getattr(error,"code",None)=="invalid_model_media"
# Tariff capacity insufficient for image+schema+framing must block before HTTP.
with transaction("company-a") as db:
    # immutable tariffs are append-only; create a new effective version.
    old=db.scalar(select(m.ModelTariff));db.add(m.ModelTariff(company_id="company-a",model=old.model,price_version="small",currency="USD",input_per_million="1",cached_input_per_million="0.1",cache_write_per_million="1.25",output_per_million="2",max_input_tokens=9000,max_output_tokens=1024,effective_from=now()))
try:
    asyncio.run(configured(lambda request: (_ for _ in ()).throw(AssertionError("unexpectedHTTP"))).invoke(company_id="company-a",actor_id=users["owner"],purpose="extract_document",evidence={"source_refs":["page1"]},request_key="small",media_inputs=[image]))
    raise AssertionError("budget bound bypassed")
except Exception as error:
    assert getattr(error,"code",None)=="model_input_limit",error
""",
    )


def test_media_proposal_review_is_immutable_explicit_and_financially_inert(tmp_path):
    from test_bots import SETUP as BOT_SETUP

    scenario(
        tmp_path,
        BOT_SETUP
        + r"""
import io
from PIL import Image
from didban.bot_intake_models import BotIntake
from didban.bot_extraction_models import BotExtractionProposal,BotExtractionReview
from didban.bot_extraction_service import extract
initialize();settings.media_extraction_enabled=True
pair=pairing()
out=io.BytesIO();Image.new("RGB",(10,10),"white").save(out,format="JPEG");image=out.getvalue()
class MediaTransport(Transport):
    async def download_file(self,file_id,**kwargs):return image
transport=MediaTransport()
message={"update_id":2,"message":{"message_id":2,"from":{"id":77,"is_bot":False},"chat":{"id":77,"type":"private"},"photo":[{"file_id":"img","file_size":len(image)}]}}
asyncio.run(bot_service.receive("telegram",message,transport=transport))
with transaction("company-a") as db:
    item=db.scalar(select(BotIntake));intake_id=item.id;assert item.state=="pending_extraction"
class Gateway:
    calls=0
    async def invoke(self,**kwargs):
        self.calls+=1
        assert kwargs["purpose"]=="extract_document" and kwargs["media_inputs"][0].startswith(b"\x89PNG")
        ref=kwargs["evidence"]["source_refs"][0]
        return {"state":"completed","proposal":{"family":"bank","unit":"IRR","calendar":"gregorian","rows":[{"date":"2026-09-03","reference":"R","party_id":None,"account":"A","amount":"12","evidence_refs":[ref]}],"evidence_refs":[ref],"unresolved_fields":[]}}
gateway=Gateway()
result=asyncio.run(extract("company-a",users["owner"],intake_id,1,"request",gateway=gateway))
assert asyncio.run(extract("company-a",users["owner"],intake_id,1,"request",gateway=gateway))["id"]==result["id"]
assert gateway.calls==1
with transaction("company-a") as db:
    assert db.scalar(select(m.SourceFile.id)) is None
    assert db.scalar(select(m.JournalLine.id)) is None
proposal_id=result["id"]
review={"period_id":period_id,"family":"bank","unit":"IRR","calendar":"gregorian","rows":result["proposal"]["rows"]}
invalid=review|{"rows":[review["rows"][0]|{"evidence_refs":["other-source"]}]}
assert command(owner,"POST",base+"/bot-intakes/extractions/"+proposal_id+"/review",invalid,version=2).status_code==409
key=str(uuid4());response=command(owner,"POST",base+"/bot-intakes/extractions/"+proposal_id+"/review",review,version=2,key=key)
assert response.status_code==201,response.text
assert command(owner,"POST",base+"/bot-intakes/extractions/"+proposal_id+"/review",review,version=2,key=key).json()==response.json()
with transaction("company-a") as db:
    assert db.get(m.ProcessingSession,response.json()["session_id"]).state=="receiving"
    assert db.scalar(select(m.JournalLine.id)) is None
    assert db.scalar(select(BotExtractionReview)).proposal_id==proposal_id
try:
    with transaction("company-a") as db:db.get(BotExtractionProposal,proposal_id).source_sha256="changed"
    raise AssertionError("proposal changed")
except IntegrityError:pass
""",
    )


def test_pdf_page_limit_and_encryption_rejected_before_raster(tmp_path, monkeypatch):
    from didban import media_adapter as adapter

    path = tmp_path / "file.pdf"
    path.write_bytes(b"%PDF-synthetic")
    calls = []

    def too_many(arguments, timeout):
        calls.append(arguments)
        return 0, b"Pages: 5\n"

    monkeypatch.setattr(adapter, "bounded_process", too_many)
    with pytest.raises(DomainError) as error:
        adapter.rasterize(path, "file.pdf")
    assert error.value.code == "media_page_limit" and len(calls) == 1
    monkeypatch.setattr(adapter, "bounded_process", lambda arguments, timeout: (1, b"Encrypted PDF"))
    with pytest.raises(DomainError) as error:
        adapter.rasterize(path, "file.pdf")
    assert error.value.code == "media_pdf_invalid"


def test_image_pixel_cap_is_checked_before_decode(monkeypatch):
    from didban.config import settings

    out = io.BytesIO()
    Image.new("RGB", (101, 101), "white").save(out, format="PNG")
    monkeypatch.setattr(settings, "media_max_pixels", 10000)
    with pytest.raises(DomainError) as error:
        image_png(out.getvalue())
    assert error.value.code == "media_pixel_limit"


def test_pdf_child_metadata_output_is_bounded():
    import sys

    from didban.media_adapter import bounded_process

    with pytest.raises(DomainError) as error:
        bounded_process([sys.executable, "-c", 'print("x"*70000)'], 5)
    assert error.value.code == "media_pdf_invalid"
