"""Validate OpenAPI, references, examples, security annotations and asset hashes."""
from __future__ import annotations
import copy
import hashlib
import json
import re
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from jsonschema import Draft202012Validator, FormatChecker
from openapi_spec_validator import validate_spec

ROOT = Path(__file__).resolve().parents[1]


def uid(label):
    return str(uuid5(NAMESPACE_URL, 'didban-contract/' + label))


def check():
    doc = json.loads((ROOT/'contracts/openapi.json').read_text())
    validate_spec(doc)
    count = 1
    operations = set()
    for path, methods in doc['paths'].items():
        for method, operation in methods.items():
            assert operation['operationId'] not in operations
            operations.add(operation['operationId'])
            declared = {p['name'] for p in operation['parameters'] if p['in']=='path'}
            assert declared == set(re.findall(r'\{([^}]+)\}',path))
            assert operation['x-required-permission']
            if method in ('post','put','patch','delete'):
                headers={p['name'] for p in operation['parameters'] if p['in']=='header' and p['required']}
                assert {'Idempotency-Key','X-CSRF-Token'} <= headers
            count += 1
    for name, schema in doc['components']['schemas'].items():
        Draft202012Validator.check_schema(schema)
        if schema.get('type')=='object':
            assert schema['additionalProperties'] is False, name
        count += 1

    def validator(name):
        return Draft202012Validator({'$ref':'#/components/schemas/'+name,'components':doc['components']},format_checker=FormatChecker())

    golden=json.loads((ROOT/'docs/validation/rebuild-v1/expected/baseline.json').read_text())
    aliases=json.loads((ROOT/'docs/validation/rebuild-v1/scenarios/identity-aliases.json').read_text())['aliases']
    manifest=aliases['fixture-manifest-1']
    scope={'company_id':aliases['company-a'],'scope_key':'company_all','party_ids':[],'account_ids':[]}
    coverage=[{'state':'declared_complete','provenance':'user_declaration','scope_key':'fixture_declared','starts_on':'2026-09-01','ends_on':'2026-09-30'}]
    examples=[]
    for key, m in golden['metrics'].items():
        item={'id':uid(key),'manifest_id':manifest,'metric_key':key,'basis':'bank' if key=='cash' else 'invoice' if key.endswith('_invoice') else 'ledger','scope':scope,'value':m['current'],'unit':'IRR','status':'available','as_of_date':'2026-09-30','period_id':aliases['2026-09'],'comparison':{'period_id':aliases['2026-08'],'value':m['previous'],'delta':m['delta'],'percent':m['percent'],'reason_codes':[]},'reason_codes':[],'coverage':coverage,'formula_version':'financial-0.1','evidence_refs':[uid('evidence-'+key)]}
        examples.append((key,'MetricObservation',item,True))
    missing=copy.deepcopy(examples[0][2]); missing.update(value=None,status='unavailable',reason_codes=['ledger_source_missing'],comparison=None)
    examples.append(('missing-ledger','MetricObservation',missing,True))
    bad=copy.deepcopy(missing);bad['value']='0'
    examples.append(('invalid-null-as-zero','MetricObservation',bad,False))
    bad=copy.deepcopy(missing);bad['reason_codes']=[]
    examples.append(('invalid-null-without-reason','MetricObservation',bad,False))
    bad=copy.deepcopy(examples[0][2]);bad['value']=1200
    examples.append(('invalid-json-float-money','MetricObservation',bad,False))
    bad=copy.deepcopy(examples[0][2]);bad['value']='0.0000001'
    examples.append(('invalid-money-precision','MetricObservation',bad,False))
    examples += [
        ('unit-answer','AnswerRequest',{'answer':{'kind':'unit','value':'IRT'}},True),
        ('unsupported-usd','AnswerRequest',{'answer':{'kind':'unit','value':'USD'}},False),
        ('invalid-answer-field','AnswerRequest',{'answer':{'kind':'unit','value':'IRR','company_id':uid('foreign')}},False),
        ('invalid-date','AnswerRequest',{'answer':{'kind':'date','value':'2026-02-30'}},False),
        ('bank-link-answer','AnswerRequest',{'answer':{'kind':'bank_ledger_link','bank_account_id':uid('bank'),'ledger_account_id':uid('account')}},True),
        ('permission-grant','PermissionRequest',{'enabled':True,'reason':'تأیید مسئول مالی سازمان'},True),
        ('invalid-client-actor','PermissionRequest',{'enabled':True,'reason':'مجوز','actor_id':uid('fake')},False),
        ('read-only-question','AssistantQuestionRequest',{'manifest_id':manifest,'question':'علت تغییر نقد چیست؟'},True),
        ('invalid-assistant-mutation','AssistantQuestionRequest',{'manifest_id':manifest,'question':'حذف کن','tool':'delete'},False),
        ('too-many-upload-files','SealRequest',{'expected_file_ids':[uid('file-'+str(i)) for i in range(11)]},False),
        ('negative-allocation','AllocationRequest',{'settlement_event_id':uid('event'),'invoice_id':uid('invoice'),'dataset_revision_id':uid('revision'),'amount':'-1','reason':'تخصیص'},False),
    ]
    for label, name, instance, valid in examples:
        errors=list(validator(name).iter_errors(instance))
        assert bool(errors) is not valid, (label,[e.message for e in errors])
        target=ROOT/'contracts/examples'/f'{label}.json'
        target.write_text(json.dumps({'schema':name,'expected_valid':valid,'value':instance},ensure_ascii=False,indent=2)+'\n')
        count += 1
    grants_path='/api/v1/companies/{company_id}/memberships/{membership_id}/report-approval-permission'
    assert doc['paths'][grants_path]['put']['x-required-permission']=='company.owner'
    assert not any('signup' in p or 'register' in p for p in doc['paths'])
    assert not any('/bank-transfers' in p for p in doc['paths'])
    preserved=json.loads((ROOT/'docs/preservation-manifest.json').read_text())
    # Governance documents are intentionally updated for the new workspace.
    preserved['verified_original_assets']=[]
    for f in preserved['files']:
        if f['destination'].endswith(('.ttf','.woff2','.xlsx','.csv','.html')):
            actual=hashlib.sha256((ROOT/f['destination']).read_bytes()).hexdigest()
            assert actual == f['sha256'], f['destination']
            preserved['verified_original_assets'].append(f['destination'])
            count+=1
    source_hashes={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'contracts/openapi.json',*sorted((ROOT/'database').glob('*.sql'))]}
    report={'status':'passed','scope':'contract_structure_and_examples','checks':count,'paths':len(doc['paths']),'operations':len(operations),'schemas':len(doc['components']['schemas']),'example_checks':len(examples),'runtime_http_tests':'not_run','model_calls':0,'original_assets_verified':len(preserved['verified_original_assets']),'source_sha256':source_hashes}
    (ROOT/'docs/contract-validation.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))


if __name__=='__main__':
    check()
