from test_api_delivery import scenario
from test_model_gateway import SETUP

BRIDGE = r'''
from datetime import timezone
from hashlib import sha256
from didban.model_interpretation import prepare_model_interpretations
from didban.workflow import issue,latest_interpretations,process
with transaction("company-a") as db:
    source=m.SourceFile(company_id="company-a",session_id=processing_id,name="bank.csv",sha256="b"*64,size=100,storage_key="bridge-source",state="ready",scan_status="development_unscanned",row_count=2)
    db.add(source);db.flush();source_id=source.id
    db.add(m.Interpretation(company_id="company-a",file_id=source_id,sheet="بانک الف",family="unknown",mapping={},unit=None,calendar=None,provenance="validated_header_rules",evidence={"headers":["D","A","R","C"]}))
    db.add_all([m.SourceRow(company_id="company-a",file_id=source_id,sheet="بانک الف",row_number=2,values={"D":"2026-09-01","A":"100","R":"REF1","C":"IRR"}),m.SourceRow(company_id="company-a",file_id=source_id,sheet="بانک الف",row_number=3,values={"D":"2026-09-02","A":"200","R":"REF2","C":"IRR"})])
    job=m.Job(company_id="company-a",session_id=processing_id,generation=1,state="running",fence=1,leased_until=now()+timedelta(minutes=2))
    db.add(job);db.flush();job_id=job.id

class FakeGateway:
    def __init__(self,state="completed",reason=None):
        self.calls=[];self.state=state;self.reason=reason;self.during=None
    async def invoke(self,**arguments):
        self.calls.append(arguments)
        if self.during:
            self.during()
        return {"request_id":"fake-provider-request","state":self.state,"reason_code":self.reason,"next_attempt_at":(now()+timedelta(seconds=15)).isoformat() if self.state=="waiting_dependency" else None,"proposal":{"family":"bank","mapping":[{"field":"date","header":"D"},{"field":"amount","header":"A"},{"field":"reference","header":"R"},{"field":"currency","header":"C"}],"unit":"TOMAN","calendar":"jalali","evidence_refs":arguments["evidence"]["source_refs"],"unresolved_codes":[]} if self.state=="completed" else None}
'''


def test_worker_bridge_accepts_only_source_controlled_mapping_without_financial_effects(tmp_path):
    scenario(tmp_path, SETUP + BRIDGE + r'''
gateway=FakeGateway()
ready=asyncio.run(prepare_model_interpretations("company-a",job_id,1,gateway))
assert ready is True and len(gateway.calls)==1
with transaction("company-a") as db:
    latest=latest_interpretations(db,"company-a",source_id)[0]
    assert latest.provenance=="validated_automatic",latest.evidence
    assert latest.unit=="IRR" and latest.calendar=="gregorian" # Model guesses were ignored.
    assert latest.evidence["controls"]["all_rows_valid"] is True
    assert db.get(m.ProcessingSession,processing_id).version==2
    assert not list(db.scalars(select(m.BankMovement)))
    assert not list(db.scalars(select(m.ProcessingIssue).where(m.ProcessingIssue.session_id==processing_id)))
''')


def test_all_rows_are_controlled_not_only_the_model_sample(tmp_path):
    scenario(tmp_path, SETUP + BRIDGE + r'''
with transaction("company-a") as db:
    # Immutable source rows are not edited; append a fourth malformed source row.
    db.add(m.SourceRow(company_id="company-a",file_id=source_id,sheet="بانک الف",row_number=4,values={"D":"2026-09-03","A":"invalid","R":"REF3","C":"IRR"}))
gateway=FakeGateway();ready=asyncio.run(prepare_model_interpretations("company-a",job_id,1,gateway))
assert ready is False
with transaction("company-a") as db:
    latest=latest_interpretations(db,"company-a",source_id)[0]
    assert latest.provenance=="model_proposal" and latest.evidence["controls"]["all_rows_valid"] is False
    assert db.get(m.ProcessingSession,processing_id).state=="waiting_input"
    question=db.scalar(select(m.ProcessingIssue).where(m.ProcessingIssue.session_id==processing_id))
    assert question.evidence["mapping"]["amount"]=="A" and question.evidence["family"]=="bank"
    assert not list(db.scalars(select(m.BankMovement)))
''')


def test_missing_source_unit_is_not_accepted_from_model_assertion(tmp_path):
    scenario(tmp_path, SETUP + BRIDGE + r'''
class NoCurrencyGateway(FakeGateway):
    async def invoke(self,**arguments):
        result=await super().invoke(**arguments)
        result["proposal"]["mapping"]=[item for item in result["proposal"]["mapping"] if item["field"]!="currency"]
        result["proposal"]["unit"]="IRR"
        return result
gateway=NoCurrencyGateway()
assert asyncio.run(prepare_model_interpretations("company-a",job_id,1,gateway)) is False
with transaction("company-a") as db:
    latest=latest_interpretations(db,"company-a",source_id)[0]
    assert latest.unit is None and latest.provenance=="model_proposal"
    assert db.get(m.ProcessingSession,processing_id).state=="waiting_input"
''')


def test_dependency_wait_has_backoff_and_no_financial_question_or_effect(tmp_path):
    scenario(tmp_path, SETUP + BRIDGE + r'''
gateway=FakeGateway("waiting_dependency","model_unavailable")
assert asyncio.run(prepare_model_interpretations("company-a",job_id,1,gateway)) is False
with transaction("company-a") as db:
    session=db.get(m.ProcessingSession,processing_id);job=db.get(m.Job,job_id)
    assert session.state=="waiting_dependency" and session.error_code=="model_unavailable"
    assert job.state=="pending" and job.leased_until.replace(tzinfo=timezone.utc)>now()
    assert not list(db.scalars(select(m.ProcessingIssue).where(m.ProcessingIssue.session_id==processing_id)))
from didban.worker import run_once
assert run_once()==0 # Not-before backoff is enforced before claiming another fence.
''')


def test_existing_question_and_inflight_new_question_preserve_whole_session_barrier(tmp_path):
    scenario(tmp_path, SETUP + BRIDGE + r'''
def question_during_provider():
    with transaction("company-a") as db:
        session=db.get(m.ProcessingSession,processing_id)
        issue(db,session,"unit:during","واحد مبلغ چیست؟",[{"value":"IRR","label":"ریال"}],{},source_id)
gateway=FakeGateway();gateway.during=question_during_provider
assert asyncio.run(prepare_model_interpretations("company-a",job_id,1,gateway)) is False
with transaction("company-a") as db:
    assert db.get(m.ProcessingSession,processing_id).state=="waiting_input"
    assert latest_interpretations(db,"company-a",source_id)[0].provenance=="validated_header_rules"
    assert not list(db.scalars(select(m.BankMovement)))
gateway2=FakeGateway()
assert asyncio.run(prepare_model_interpretations("company-a",job_id,1,gateway2)) is True
assert not gateway2.calls
''')


def test_automatic_attempt_cap_spans_worker_fences(tmp_path):
    scenario(tmp_path, SETUP + BRIDGE + r'''
prefix=f"interpret:{job_id}:{source_id}:{sha256('بانک الف'.encode()).hexdigest()[:12]}:"
with transaction("company-a") as db:
    db.add(m.ModelRequest(company_id="company-a",actor_id=users["owner"],session_id=processing_id,session_version=1,job_id=job_id,fence=0,request_key=prefix+"f0",input_hash="a"*64,purpose="propose_interpretation",model="gpt-5.6-luna",prompt_version="test",state="failed",attempts=3,error_code="model_unavailable"))
gateway=FakeGateway()
assert asyncio.run(prepare_model_interpretations("company-a",job_id,1,gateway)) is False
assert not gateway.calls
with transaction("company-a") as db:
    assert db.get(m.ProcessingSession,processing_id).state=="failed"
    assert db.get(m.ProcessingSession,processing_id).error_code=="model_retry_exhausted"
''')


def test_disabled_bridge_uses_manual_questions_without_external_request(tmp_path):
    scenario(tmp_path, SETUP + BRIDGE + r'''
assert settings.model_enabled is False
assert asyncio.run(prepare_model_interpretations("company-a",job_id,1)) is True
with transaction("company-a") as db:
    process(db,db.get(m.Job,job_id))
with transaction("company-a") as db:
    assert db.get(m.ProcessingSession,processing_id).state=="waiting_input"
    assert not list(db.scalars(select(m.ModelRequest)))
''')


def test_unknown_coverage_does_not_block_independently_valid_mapping(tmp_path):
    scenario(tmp_path, SETUP + BRIDGE + r'''
class CoverageUnknown(FakeGateway):
    async def invoke(self,**arguments):
        result=await super().invoke(**arguments)
        result["proposal"]["unresolved_codes"]=["coverage_unknown"]
        return result
assert asyncio.run(prepare_model_interpretations("company-a",job_id,1,CoverageUnknown())) is True
with transaction("company-a") as db:
    assert latest_interpretations(db,"company-a",source_id)[0].provenance=="validated_automatic"
    assert not list(db.scalars(select(m.ProcessingIssue).where(m.ProcessingIssue.session_id==processing_id)))
''')


def test_explicit_mixed_rial_toman_rows_keep_source_units_under_model_mapping(tmp_path):
    scenario(tmp_path, SETUP + BRIDGE + r'''
with transaction("company-a") as db:
    db.add(m.SourceRow(company_id="company-a",file_id=source_id,sheet="بانک الف",row_number=4,values={"D":"2026-09-03","A":"3.4","R":"REF3","C":"TOMAN"}))
assert asyncio.run(prepare_model_interpretations("company-a",job_id,1,FakeGateway())) is True
with transaction("company-a") as db:
    latest=latest_interpretations(db,"company-a",source_id)[0]
    assert latest.provenance=="validated_automatic" and latest.unit=="per_row"
    assert latest.evidence["controls"]["unit_from_source"] is True
''')
