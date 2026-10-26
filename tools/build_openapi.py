"""Fresh API contract source. Deterministic JSON output; no legacy imports."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMAS: dict = {}
PATHS: dict = {}


def ref(name):
    return {'$ref': '#/components/schemas/' + name}


def string(**kw):
    return {'type': 'string', **kw}


def enum(*values):
    return string(enum=list(values))


def arr(item):
    return {'type': 'array', 'items': item}


def nullable(schema):
    return {'anyOf': [schema, {'type': 'null'}]}


def obj(name, props, required=None, **kw):
    schema = {'type': 'object', 'additionalProperties': False, 'properties': props,
              'required': list(props) if required is None else required, **kw}
    SCHEMAS[name] = schema
    return ref(name)


ID = string(format='uuid')
DATE = string(format='date')
TIME = string(format='date-time')
TEXT = string(minLength=1, maxLength=4000, pattern=r'.*\S.*')
VERSION = {'type': 'integer', 'minimum': 1, 'maximum': 9007199254740991}
BOOL = {'type': 'boolean'}
MONEY = string(pattern=r'^-?(?:0|[1-9][0-9]{0,31})(?:\.[0-9]{1,6})?$', examples=['1234','123.4','0'])
POSITIVE = string(pattern=r'^(?=.*[1-9])(?:0|[1-9][0-9]{0,31})(?:\.[0-9]{1,6})?$', description='Positive Decimal, IRR; never JSON number.')
USD = string(pattern=r'^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,8})?$', description='Model API billing only, not a supported financial input currency.')
PERCENT = string(pattern=r'^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,30})?$')
HASH = string(pattern='^[0-9a-f]{64}$')
ROLE = enum('owner','finance_manager','advisor_accountant','viewer')
STATUS = enum('available','limited','estimated','unavailable')
SESSION_STATE = enum('receiving','sealed','processing','waiting_input','waiting_dependency','completed','completed_limited','failed','cancelled')
SOURCE_KIND = enum('ledger','bank','sales_invoices','purchase_invoices','settlements','moadian_sales','moadian_purchases','planned_payments','receipt_history')
AMOUNT_PROPS = {'amount': MONEY, 'unit': enum('IRR','IRT')}

obj('FieldError', {'field': TEXT, 'code': TEXT, 'message_fa': TEXT})
obj('Error', {'code': TEXT, 'message_fa': TEXT, 'request_id': ID, 'retryable': BOOL,
              'field_errors': arr(ref('FieldError')), 'details': arr(ref('FieldError'))})
obj('AcceptedOperation', {'operation_id': ID, 'status': enum('accepted'), 'resource_id': ID})
obj('Operation', {'id': ID,'kind': enum('seal_session','retry_session','cancel_session','delete_source'),'resource_id': ID,'status': enum('accepted','running','succeeded','failed'),'error_code': nullable(TEXT),'finished_at': nullable(TIME)})
obj('Success', {'ok': {'const': True}})
obj('CsrfToken', {'token': TEXT}, description='Bound to an anonymous/authenticated cookie; no authentication authority.')
obj('LoginRequest', {'email': string(format='email'), 'password': string(minLength=1,maxLength=1024)})
obj('TokenPasswordRequest', {'token': TEXT, 'new_password': string(minLength=12,maxLength=1024)})
obj('User', {'id': ID, 'display_name': TEXT, 'email': string(format='email'), 'is_installation_admin': BOOL})
obj('Company', {'id': ID, 'name': TEXT, 'timezone': string(), 'display_unit': enum('IRR','IRT'), 'archived': BOOL, 'version': VERSION})
obj('CompanyCreate', {'name': TEXT, 'owner_user_id': ID, 'timezone': {'const':'Asia/Tehran'}, 'display_unit': enum('IRR','IRT')})
obj('CompanyPatch', {'name': TEXT, 'display_unit': enum('IRR','IRT'), 'archived': BOOL}, [], minProperties=1)
obj('Membership', {'id': ID, 'company_id': ID, 'user_id': ID, 'role': ROLE, 'active': BOOL, 'version': VERSION})
obj('MembershipCreate', {'user_id': ID, 'email': string(format='email'), 'role': ROLE}, ['role'], oneOf=[{'required':['user_id'],'not':{'required':['email']}},{'required':['email'],'not':{'required':['user_id']}}])
obj('MemberDirectoryEntry', {**SCHEMAS['Membership']['properties'], 'display_name': TEXT, 'email': string(format='email')})
obj('DirectoryUser', {**SCHEMAS['User']['properties'], 'activated': BOOL, 'disabled': BOOL})
obj('MembershipPatch', {'role': ROLE, 'active': BOOL}, [], minProperties=1)
obj('CompanyAccess', {'company_id': ID, 'role': ROLE, 'permissions': arr(enum('company.read','company.operate','company.owner','company.approve_report','company.financial_policy'))})
obj('PermissionRequest', {'enabled': BOOL, 'reason': TEXT})
obj('Permission', {'membership_id': ID, 'permission': {'const':'approve_financial_report'}, 'enabled': BOOL, 'version': VERSION})
obj('CreateUser', {'email': string(format='email'), 'display_name': TEXT})
obj('ManualToken', {'user_id': ID, 'token': TEXT, 'expires_at': TIME}, description='One-time manually delivered secret; never logged or sent by email automatically.')
obj('PeriodCreate', {'name': TEXT,'starts_on': DATE,'ends_on': DATE,'previous_period_id': nullable(ID)})
obj('PeriodPatch', {'name': TEXT,'starts_on': DATE,'ends_on': DATE,'previous_period_id': nullable(ID)}, [], minProperties=1)
obj('Period', {'id': ID,'name': TEXT,'starts_on': DATE,'ends_on': DATE,'previous_period_id': nullable(ID),'version': VERSION})
obj('Step', {'id': ID,'kind': TEXT,'status': enum('pending','running','succeeded','limited','waiting_input','waiting_dependency','failed','skipped','cancelled'), 'completed_items': {'type':'integer','minimum':0}, 'total_items': nullable({'type':'integer','minimum':0}), 'dependency_code': nullable(enum('model_unavailable','budget_exhausted','storage_unavailable','queue_unavailable','scanner_unavailable','permission_revoked'))})
obj('SessionCreate', {'period_id': nullable(ID), 'as_of_date': nullable(DATE)}, [])
obj('ProcessingSession', {'id': ID,'company_id': ID,'status': SESSION_STATE,'session_version': VERSION,'period_id': nullable(ID),'as_of_date': nullable(DATE),'steps': arr(ref('Step')),'open_required_issue_ids': arr(ID),'manifest_id': nullable(ID),'created_at': TIME, 'preparation_finished_at': nullable(TIME),'interpretation_finished_at':nullable(TIME),'financial_finished_at':nullable(TIME),'interpretation_context':obj('InterpretationContext',{'coverage':nullable(enum('declared_complete','partial','unknown'))})})
obj('SealRequest', {'expected_file_ids': {'type':'array','items':ID,'minItems':1,'maxItems':10,'uniqueItems':True}})
obj('RetryRequest', {'step_ids': {'type':'array','items':ID,'minItems':1,'uniqueItems':True}})
obj('PreparationSheet', {'name': TEXT, 'nonempty_rows': {'type':'integer','minimum':0}, 'columns': {'type':'integer','minimum':0}})
obj('PreparationSummary', {'nonempty_rows': {'type':'integer','minimum':0}, 'sheets': arr(ref('PreparationSheet')), 'financial_data_rows': {'type':'null'}})
obj('File', {'id': ID,'original_name': TEXT,'sha256': HASH,'byte_size': {'type':'integer','minimum':1},'format': enum('csv','xls','xlsx'),'status': enum('quarantined','scanning','rejected','pending_interpretation','ready','excluded_overlap'),'duplicate': BOOL,'archived': BOOL,'version': VERSION,'preparation_summary':nullable(ref('PreparationSummary')),'error_code':nullable(TEXT),'interpretation_summary':nullable(ref('InterpretationSummary'))})
obj('Dependency', {'entity_type': TEXT,'entity_id': ID,'reason_code': TEXT})
obj('DeletionImpact', {'source_file_id': ID,'hard_delete_allowed': BOOL,'dependencies': arr(ref('Dependency')),'version': VERSION})
obj('DeleteRequest', {'confirmed': {'const':True},'reason': TEXT})
obj('ArchiveRequest', {'archived': BOOL})
obj('ColumnMapping', {'target_field': TEXT,'source_column': TEXT})
obj('InterpretationRequest', {'sheet_name': TEXT,'cell_range': TEXT,'source_kind': SOURCE_KIND,'unit': enum('IRR','IRT'),'calendar': enum('gregorian','jalali','excel_serial'),'mapping': {'type':'array','items':ref('ColumnMapping'),'minItems':1},'reason': TEXT})
obj('Interpretation', {'id': ID,'source_file_id': ID,'source_kind': SOURCE_KIND,'sheet_name': TEXT,'cell_range': TEXT,'unit': nullable(enum('IRR','IRT')),'calendar': nullable(enum('gregorian','jalali','excel_serial')),'mapping': arr(ref('ColumnMapping')),'provenance': enum('proposal','validated_automatic','human'),'version': VERSION})
obj('InterpretationControl',{'key':TEXT,'outcome':enum('passed','failed','unknown')})
obj('InterpretedSheet',{'sheet_name':TEXT,'source_kind':enum('ignore',*SOURCE_KIND['enum']),'header_row':{'type':'integer','minimum':1},'provenance':enum('validated_automatic','human'),'controls':arr(ref('InterpretationControl')),'mapping':arr(ref('ColumnMapping'))})
obj('InterpretationSummary',{'valid_rows':{'type':'integer','minimum':0},'rejected_rows':{'type':'integer','minimum':0},'excluded_rows':{'type':'integer','minimum':0},'skipped_rows':{'type':'integer','minimum':0},'sheets':arr(ref('InterpretedSheet')),'coverage':enum('unknown'),'financial_effects_committed':{'const':False}})
obj('InterpretationPreview',{'unit':nullable(enum('IRR','IRT')),'calendar':nullable(enum('gregorian','jalali')),'selected_kind':nullable(enum('ignore',*SOURCE_KIND['enum'])),'reason':string(),'sheet_name':TEXT,'header_row':{'type':'integer','minimum':1},'columns':arr(string()),'header_candidates':arr(obj('HeaderCandidate',{'row_number':{'type':'integer','minimum':1},'columns':arr(string())})),'sample_rows':arr(arr(nullable(string()))),'mapping':arr(ref('ColumnMapping')),'source_kinds':arr(SOURCE_KIND)})
obj('InterpretationProfile',{'source_kind':SOURCE_KIND,'required_fields':arr(TEXT),'optional_fields':arr(TEXT)})
obj('SessionInterpretation',{'file_id':ID,'original_name':TEXT,'session_version':VERSION,'run_id':nullable(ID),'previews':arr(ref('InterpretationPreview')),'summary':nullable(ref('InterpretationSummary')),'profiles':arr(ref('InterpretationProfile'))})
obj('SessionInterpretationSettings',{'sheet_name':TEXT,'header_row':{'type':'integer','minimum':1,'maximum':20000},'source_kind':enum('ignore',*SOURCE_KIND['enum']),'unit':nullable(enum('IRR','IRT')),'calendar':nullable(enum('gregorian','jalali')),'mapping':{'type':'array','maxItems':512,'items':obj('ColumnIndexMapping',{'target_field':TEXT,'source_column':string(pattern=r'^[1-9][0-9]{0,2}$')})},'reason':string(minLength=1,maxLength=1000)})
obj('NormalizedField',{'field':TEXT,'value':nullable(string())})
obj('NormalizedRow',{'id':ID,'sheet_name':TEXT,'row_number':{'type':'integer','minimum':1},'source_kind':SOURCE_KIND,'state':enum('valid','rejected','excluded_overlap'),'raw_values':arr(nullable(string())),'values':arr(ref('NormalizedField')),'error_codes':arr(TEXT)})
obj('Evidence', {'id': ID,'manifest_id': nullable(ID),'source_file_id': nullable(ID),'sheet_name': nullable(TEXT),'row_number': nullable({'type':'integer','minimum':1}),'rule_key': TEXT,'description_fa': TEXT,'fact_values': arr(MONEY)})
obj('AnswerConstraints', {'choices': arr(TEXT),'allow_unknown': BOOL,'allowed_account_ids': arr(ID),'allowed_bank_account_ids': arr(ID),'allowed_party_ids': arr(ID),'file_id':ID,'sheet_name':string(),'setting_key':enum('source_kind','mapping','unit','overlap','period_id','coverage','account_role','financial'),'financial_key':TEXT,'account_code':TEXT}, [])
obj('ProcessingIssue', {'id': ID,'session_id': ID,'code': TEXT,'question_fa': TEXT,'required': BOOL,'answer_kind': enum('unit','date','choice','source_coverage','account_mapping','bank_ledger_link','unknown_allowed'),'constraints': ref('AnswerConstraints'),'evidence': arr(ref('Evidence')),'status': enum('open','resolved','superseded'),'session_version': VERSION})
unit_answer = obj('UnitAnswer', {'kind': {'const':'unit'},'value': enum('IRR','IRT')})
date_answer = obj('DateAnswer', {'kind': {'const':'date'},'value': DATE})
choice_answer = obj('ChoiceAnswer', {'kind': {'const':'choice'},'value': TEXT})
coverage_answer = obj('CoverageAnswer', {'kind': {'const':'source_coverage'},'source_kind': SOURCE_KIND,'scope_key': TEXT,'starts_on': DATE,'ends_on': DATE,'state': enum('declared_complete','partial','unknown')})
account_answer = obj('AccountMappingAnswer', {'kind': {'const':'account_mapping'},'account_id': ID,'role': enum('bank','cash','trade_ar','other_ar','trade_ap','loan_payable','tax_payable','payroll_payable','other_liability','inventory','capital','revenue','other_income','expense','cogs','income_tax_expense','vat_receivable','vat_payable','unknown')})
unknown_answer = obj('UnknownAnswer', {'kind': {'const':'unknown'}})
bank_link_answer = obj('BankLinkAnswer', {'kind': {'const':'bank_ledger_link'},'bank_account_id': ID,'ledger_account_id': ID})
obj('AnswerRequest', {'answer': {'oneOf':[unit_answer,date_answer,choice_answer,coverage_answer,account_answer,bank_link_answer,unknown_answer]}}, description='Validate against current issue constraints too; unknown only when explicitly allowed. If-Match uses the current session version, not the issue creation version.')
obj('AnswerReceipt', {'id': ID,'issue_id': ID,'session_id': ID,'session_version': VERSION,'status': SESSION_STATE})
obj('RevisionSelection', {'logical_record_id': ID,'record_revision_id': ID})
obj('RevisionRequest', {'session_id': ID,'parent_revision_id': nullable(ID),'selections': arr(ref('RevisionSelection')),'reason': TEXT})
obj('DatasetRevision', {'id': ID,'session_id': ID,'parent_revision_id': nullable(ID),'state': enum('building','sealed','superseded'),'version': VERSION})
obj('Coverage', {'state': enum('missing','declared_complete','verified_complete','partial','unknown'),'provenance': enum('user_declaration','independent_control','unknown'),'scope_key': TEXT,'starts_on': nullable(DATE),'ends_on': nullable(DATE)})
obj('MetricScope', {'company_id': ID,'scope_key': TEXT,'party_ids': arr(ID),'account_ids': arr(ID)})
obj('MetricComparison', {'period_id': ID,'value': nullable(MONEY),'delta': nullable(MONEY),'percent': nullable(PERCENT),'reason_codes': arr(TEXT)})
obj('MetricObservation', {'id': ID,'manifest_id': ID,'metric_key': TEXT,'basis': enum('ledger','invoice','bank','comparable_difference'),'scope': ref('MetricScope'),'value': nullable(MONEY),'unit': {'const':'IRR'},'status': STATUS,'as_of_date': DATE,'period_id': ID,'comparison': nullable(ref('MetricComparison')),'reason_codes': arr(TEXT),'coverage': arr(ref('Coverage')),'formula_version': TEXT,'evidence_refs': {'type':'array','items':ID,'minItems':1}}, allOf=[
    {'if':{'properties':{'status':{'const':'unavailable'}}},'then':{'properties':{'value':{'type':'null'},'reason_codes':{'minItems':1}}},'else':{'properties':{'value':MONEY}}},
    {'if':{'properties':{'status':{'const':'limited'}}},'then':{'properties':{'reason_codes':{'minItems':1}}}}
])
obj('ResultManifest', {'id': ID,'company_id': ID,'dataset_revision_id': ID,'manifest_hash': HASH,'period_id': ID,'as_of_date': DATE,'financial_policy_id': ID,'forecast_policy_id': nullable(ID),'scope_key':{'const':'core_financial_v1'},'missing_modules':arr(TEXT),'published_at': TIME,'report_scope': enum('complete','limited'),'missing_source_kinds': arr(SOURCE_KIND)})
obj('Finding', {'id': ID,'manifest_id': ID,'code': TEXT,'title_fa': TEXT,'severity': enum('info','warning','error'),'evidence_refs': arr(ID),'version': VERSION})
obj('DecisionRequest', {'action': enum('accept','reject','needs_review'),'reason': TEXT})
obj('Decision', {'id': ID,'action': enum('accept','reject','needs_review'),'actor_id': ID,'created_at': TIME})
obj('Candidate', {'id': ID,'classification': enum('exact_unique','suggested','ambiguous','unmatched','amount_mismatch','needs_review'),'bank_movement_id': nullable(ID),'invoice_id': nullable(ID),'evidence_refs': arr(ID),'version': VERSION})
obj('ReconciliationRun', {'id': ID,'manifest_id': ID,'kind': enum('bank_ledger','bank_invoice','moadian_sales','moadian_purchases'),'policy_id': ID,'candidate_count': {'type':'integer','minimum':0}})
obj('AllocationRequest', {'settlement_event_id': ID,'invoice_id': ID,'dataset_revision_id': ID,'amount': POSITIVE,'reason': TEXT})
obj('Allocation', {'id': ID,'settlement_event_id': ID,'invoice_id': ID,'amount': POSITIVE,'reversed': BOOL,'version': VERSION})
obj('ReversalRequest', {'reason': TEXT})
obj('Reversal', {'id': ID,'allocation_id': ID,'actor_id': ID,'reason': TEXT,'created_at': TIME})
obj('ComparisonRequest', {'manifest_id': ID,'direction': enum('sales','purchase'),'internal_snapshot_ids': {'type':'array','items':ID,'minItems':1},'portal_snapshot_ids': {'type':'array','items':ID,'minItems':1}})
obj('ComparisonResult', {'id': ID,'manifest_id': ID,'direction': enum('sales','purchase'),'status': enum('pending','ready','limited','failed'),'finding_ids': arr(ID)})
obj('PlannedPaymentCreate', {'obligation_id': nullable(ID),'invoice_id': nullable(ID),'party_id': nullable(ID),'title': TEXT,'scheduled_on': DATE,'total_amount': POSITIVE,'unit': enum('IRR','IRT')}, ['title','scheduled_on','total_amount','unit'])
obj('PlannedPaymentPatch', {'title': TEXT,'scheduled_on': DATE,'total_amount': POSITIVE,'unit': enum('IRR','IRT')}, [], minProperties=1)
obj('PlannedPayment', {'id': ID,'obligation_id': ID,'invoice_id': nullable(ID),'title': TEXT,'scheduled_on': DATE,'total_amount': POSITIVE,'remaining_amount': MONEY,'unit': {'const':'IRR'},'state': enum('confirmed','cancelled'),'version': VERSION})
obj('RecurrenceDecisionRequest', {'action': enum('accept','reject'),'reason': TEXT})
obj('RecurrenceProposal', {'id': ID,'title': TEXT,'suggested_on': DATE,'suggested_amount': POSITIVE,'state': enum('proposed','accepted','rejected'),'evidence_refs': arr(ID),'version': VERSION})
obj('ForecastDay', {'date': DATE,'opening': nullable(MONEY),'expected_in': nullable(MONEY),'expected_out': nullable(MONEY),'closing': nullable(MONEY),'status': enum('estimated','limited','unavailable'),'reason_codes': arr(TEXT)})
obj('Forecast', {'manifest_id': ID,'policy_id': ID,'as_of_date': DATE,'status': enum('estimated','limited','unavailable'),'days': {'type':'array','items':ref('ForecastDay'),'minItems':30,'maxItems':30},'assumptions': arr(TEXT),'excluded_evidence_refs': arr(ID)})
obj('Report', {'id': ID,'manifest_id': ID,'label': {'const':'تولیدشده سامانه'},'content_hash': HASH,'created_at': TIME,'approval_ids': arr(ID),'version': VERSION})
obj('ApprovalRequest', {'confirmed': {'const':True}})
obj('Approval', {'id': ID,'report_id': ID,'actor_id': ID,'created_at': TIME,'authority': enum('finance_manager','explicit_company_permission')})
obj('ExportRequest', {'manifest_id': ID,'report_id': nullable(ID),'format': enum('pdf','xlsx','error_csv')}, ['manifest_id','format'])
obj('ExportJob', {'id': ID,'manifest_id': ID,'format': enum('pdf','xlsx','error_csv'),'status': enum('pending','running','ready','failed'),'sha256': nullable(HASH),'created_at': TIME})
obj('AssistantQuestionRequest', {'manifest_id': ID,'question': TEXT})
obj('AssistantAnswer', {'id': ID,'manifest_id': ID,'status': enum('pending','ready','waiting_dependency','failed'),'answer_fa': nullable(TEXT),'evidence_refs': arr(ID)}, description='Read-only analysis; no mutation instruction, tool or free SQL accepted.')
obj('Notification', {'id': ID,'title_fa': TEXT,'session_id': nullable(ID),'issue_id': nullable(ID),'manifest_id': nullable(ID),'read_at': nullable(TIME),'version': VERSION})
obj('NotificationPatch', {'read': BOOL})
obj('Usage', {'period_start': TIME,'period_end': TIME,'currency': {'const':'USD'},'ceiling': USD,'reserved': USD,'spent': USD,'usage_unknown': BOOL})
obj('BudgetPolicy', {'id': ID,'ceiling_usd': USD,'period_kind': enum('calendar_month','custom'),'version': VERSION})
obj('BudgetPolicyPatch', {'ceiling_usd': USD})
obj('Policy', {'id': ID,'kind': enum('financial','forecast','interpretation','matching','upload','retry'),'version': VERSION,'effective_from': DATE,'validation_status': enum('proposed','evaluated','approved')})
obj('InvoiceBalance', {'invoice_id': ID,'party_id': ID,'source_invoice_id': TEXT,'direction': enum('sales','purchase'),'issued_on': DATE,'due_on': nullable(DATE),'gross': MONEY,'settled_as_of': nullable(MONEY),'remaining_as_of': nullable(MONEY),'status': STATUS,'overdue_days': nullable({'type':'integer','minimum':0}),'reason_codes': arr(TEXT),'evidence_refs': arr(ID)})
obj('CashAccountBalance', {'bank_account_id': ID,'name': TEXT,'as_of_date': DATE,'balance': nullable(MONEY),'status': STATUS,'reason_codes': arr(TEXT),'evidence_refs': arr(ID)})
obj('CashDay', {'date': DATE,'opening': nullable(MONEY),'inflow_external': MONEY,'outflow_external': MONEY,'internal_net': MONEY,'closing': nullable(MONEY),'status': STATUS,'evidence_refs': arr(ID)})
obj('BankMovement', {'id': ID,'bank_account_id': ID,'date': DATE,'amount': MONEY,'reference': nullable(TEXT),'description': string(),'evidence_refs': arr(ID)})
obj('Account', {'id': ID,'code': TEXT,'name': TEXT,'parent_id': nullable(ID),'role': nullable(TEXT),'role_provenance': nullable(enum('human','validated_automatic')),'version': VERSION})
obj('Party', {'id': ID,'display_name': TEXT,'national_id': nullable(TEXT)})
obj('BankAccount', {'id': ID,'name': TEXT,'account_number': nullable(TEXT),'iban': nullable(TEXT),'version': VERSION})
obj('UploadPolicy', {'max_files': {'type':'integer','minimum':1,'maximum':10},'max_data_rows': {'type':'integer','minimum':1,'maximum':20000},'max_file_bytes': {'type':'integer','minimum':1},'max_expanded_bytes': {'type':'integer','minimum':1},'formats': arr(enum('csv','xls','xlsx'))})
obj('SourceRoleRequest', {'role': SCHEMAS['AccountMappingAnswer']['properties']['role'],'effective_from': DATE,'reason': TEXT})
obj('LedgerLinkRequest', {'ledger_account_id': ID,'effective_from': DATE,'reason': TEXT})
obj('BankLedgerLink', {'id': ID,'bank_account_id': ID,'ledger_account_id': ID,'effective_from': DATE,'version': VERSION})
policy_parameters = {
    'financial': obj('FinancialParameters', {'canonical_unit': {'const':'IRR'},'recognition_basis': {'const':'ledger'},'classification_profile': TEXT}),
    'forecast': obj('ForecastParameters', {'minimum_events': {'type':'integer','minimum':1,'maximum':10000},'lookback_days': {'type':'integer','minimum':1,'maximum':3650},'delay_method': {'const':'amount_weighted_median'}}),
    'interpretation': obj('InterpretationParameters', {'control_profile': TEXT,'allow_validated_automatic_roles': {'const':True}}),
    'matching': obj('MatchingParameters', {'candidate_limit': {'type':'integer','minimum':1,'maximum':10000},'date_window_days': {'type':'integer','minimum':0,'maximum':365},'automatic_amount_tolerance': {'const':'0'}}),
    'upload': obj('UploadParameters', {'max_files': {'type':'integer','minimum':1,'maximum':10},'max_data_rows': {'type':'integer','minimum':1,'maximum':20000},'max_file_bytes': {'type':'integer','minimum':1},'max_expanded_bytes': {'type':'integer','minimum':1}}),
    'retry': obj('RetryParameters', {'max_attempts': {'type':'integer','minimum':1,'maximum':10},'timeout_seconds': {'type':'integer','minimum':1,'maximum':3600},'lease_seconds': {'type':'integer','minimum':1,'maximum':3600}})
}
SCHEMAS['PolicySettingsRequest'] = {'oneOf': [obj(kind.title()+'PolicyRequest', {'kind': {'const':kind},'effective_from': DATE,'parameters': parameters,'reason': TEXT}) for kind,parameters in policy_parameters.items()]}


def page(item):
    name = item+'Page'
    if name not in SCHEMAS:
        obj(name, {'items': arr(ref(item)), 'next_cursor': nullable(string(maxLength=2048))})
    return name


ERRORS = {code: {'description': desc, 'content': {'application/json': {'schema': ref('Error')}}}
          for code, desc in {'400':'Malformed request','401':'Authentication required','403':'Role or explicit permission denied','404':'Not found or inaccessible company/resource','405':'Method not allowed','409':'Version, capacity, idempotency or dependency conflict','413':'Configured file/row/expanded-size limit','415':'Unsupported format','422':'Invalid content or domain constraint','428':'Required precondition missing','429':'Authentication rate limit','500':'Unexpected internal error','503':'Temporary dependency unavailable'}.items()}


def parameter(name, location, schema, required=False):
    return {'name':name,'in':location,'required':required,'schema':schema}


def endpoint(method, route, operation, result='Success', request=None, permission='company.read', status=None, *, versioned=False, list_item=None, public=False, multipart=False, description=''):
    parameters=[]
    import re
    for name in re.findall(r'\{([^}]+)\}',route):
        parameters.append(parameter(name,'path',ID,True))
    mutating=method in ('post','put','patch','delete')
    if mutating:
        parameters += [parameter('Idempotency-Key','header',string(minLength=8,maxLength=128),True), parameter('X-CSRF-Token','header',string(minLength=16,maxLength=512),True)]
    if versioned:
        parameters.append(parameter('If-Match','header',string(pattern=r'^"v[1-9][0-9]*"$'),True))
    if list_item:
        result=page(list_item)
        parameters += [parameter('limit','query',{'type':'integer','minimum':1,'maximum':100,'default':25}),parameter('cursor','query',string(maxLength=2048))]
    status = status or ('201' if method=='post' else '200')
    response={'description':'Successful response','headers':{'X-Request-ID':{'schema':ID}}}
    if result:
        response['content']={'application/json':{'schema':ref(result)}}
    if versioned or result in ('ProcessingSession','Company','Membership','Period','Permission','PlannedPayment','File','Notification','BudgetPolicy','Report'):
        response['headers']['ETag']={'schema':string(pattern=r'^"v[1-9][0-9]*"$')}
    op={'operationId':operation,'tags':[route.split('/')[3] if route.startswith('/api/v1/') else 'system'],
        'summary':operation,'description':description or 'Authorization and company isolation are enforced on the server.',
        'parameters':parameters,'responses':{status:response,**ERRORS},'x-required-permission':permission}
    if public:
        op['security']=[]
    if request:
        op['requestBody']={'required':True,'content':{'application/json':{'schema':ref(request)}}}
    if multipart:
        op['requestBody']={'required':True,'content':{'multipart/form-data':{'schema':{'type':'object','additionalProperties':False,'required':['file'],'properties':{'file':{'type':'string','format':'binary'}}}}}}
    PATHS.setdefault(route,{})[method]=op


C='/api/v1/companies/{company_id}'
endpoint('get','/health/ready','readiness',public=True,permission='public')
endpoint('get','/api/v1/auth/csrf','csrfToken','CsrfToken',public=True,permission='public')
endpoint('post','/api/v1/auth/login','login','User','LoginRequest',public=True,permission='public',status='200')
endpoint('post','/api/v1/auth/logout','logout',status='200',permission='authenticated')
endpoint('get','/api/v1/auth/me','currentUser','User',permission='authenticated')
endpoint('post','/api/v1/auth/accept-invitation','acceptInvitation','User','TokenPasswordRequest',public=True,permission='one_time_token')
endpoint('post','/api/v1/auth/reset-password','resetPassword','Success','TokenPasswordRequest',public=True,permission='one_time_token',status='200')
endpoint('get','/api/v1/companies','listCompanies',list_item='Company',permission='authenticated',description='Only current company memberships. Installation administration grants no implicit financial membership.')
endpoint('post','/api/v1/admin/companies','createCompany','Company','CompanyCreate',permission='installation.admin',description='Privileged identity boundary; create company and initial owner in one transaction.')
endpoint('get','/api/v1/admin/users','listUsers',list_item='DirectoryUser',permission='installation.admin')
endpoint('post','/api/v1/admin/users','createInvitedUser','ManualToken','CreateUser',permission='installation.admin')
endpoint('post','/api/v1/admin/users/{user_id}/password-reset','issuePasswordReset','ManualToken',permission='installation.admin')
endpoint('post','/api/v1/admin/users/{user_id}/invitation','reissueInvitation','ManualToken',permission='installation.admin',description='Only unactivated users; invalidate previous invitation codes; manual delivery only.')
endpoint('get',C,'getCompany','Company')
endpoint('get',C+'/access','getCompanyAccess','CompanyAccess',description='Current server-derived role and capabilities. Installation administration grants no company access; owner approval still needs its explicit grant.')
endpoint('get',C+'/operations/{operation_id}','getOperation','Operation')
endpoint('patch',C,'updateCompany','Company','CompanyPatch',permission='company.owner',versioned=True)
endpoint('get',C+'/memberships','listMemberships',list_item='MemberDirectoryEntry',permission='company.owner')
endpoint('post',C+'/memberships','addMembership','Membership','MembershipCreate',permission='company.owner')
endpoint('patch',C+'/memberships/{membership_id}','updateMembership','Membership','MembershipPatch',permission='company.owner',versioned=True,description='Recheck current role; prevent removal of the last active owner and audit role changes.')
endpoint('get',C+'/memberships/{membership_id}/report-approval-permission','readApprovalPermission','Permission',permission='company.owner')
endpoint('put',C+'/memberships/{membership_id}/report-approval-permission','setApprovalPermission','Permission','PermissionRequest',permission='company.owner',versioned=True,description='D08: only current owner of this company; owner/advisor recipient only; audit before and after. Initial disabled permission is version 1; first explicit change uses If-Match: "v1".')
for method,suffix,operation,result,request in [
 ('get','/financial-periods','listPeriods',None,None),('post','/financial-periods','createPeriod','Period','PeriodCreate'),('get','/financial-periods/{period_id}','getPeriod','Period',None),('patch','/financial-periods/{period_id}','updatePeriod','Period','PeriodPatch'),('delete','/financial-periods/{period_id}','deletePeriod','Success',None)]:
    endpoint(method,C+suffix,operation,result,request,permission='company.read' if method=='get' else 'company.financial_policy',versioned=method in ('patch','delete'),list_item='Period' if operation=='listPeriods' else None)
endpoint('post',C+'/processing-sessions','createProcessingSession','ProcessingSession','SessionCreate',permission='company.operate')
endpoint('get',C+'/processing-sessions','listProcessingSessions',list_item='ProcessingSession')
endpoint('get',C+'/processing-sessions/{session_id}','getProcessingSession','ProcessingSession')
endpoint('post',C+'/processing-sessions/{session_id}/files','uploadFile','File',permission='company.operate',status='202',versioned=True,multipart=True,description='Stream one CSV/XLS/XLSX; check limits and signature; quarantine before parsing. Company hash dedupe preserves the original object. A hash match never replays a financial effect. No client-selected source kind.')
endpoint('get',C+'/processing-sessions/{session_id}/files','listSessionFiles',list_item='File')
for suffix,request in [('seal','SealRequest'),('retry','RetryRequest'),('cancel',None)]:
    endpoint('post',C+'/processing-sessions/{session_id}/'+suffix,suffix+'ProcessingSession','AcceptedOperation',request,permission='company.operate',status='202',versioned=True)
endpoint('get',C+'/processing-sessions/{session_id}/issues','listProcessingIssues',list_item='ProcessingIssue')
endpoint('post',C+'/processing-issues/{issue_id}/answers','answerProcessingIssue','AnswerReceipt','AnswerRequest',permission='company.operate',versioned=True,description='If-Match is CURRENT parent session_version. Validate answer against issue kind/choices/scope and current membership. Duplicate same-key answer returns original receipt. Answering one of several questions does not lift remaining barriers.')
endpoint('get',C+'/source-files/{file_id}','getSourceFile','File')
endpoint('post',C+'/processing-sessions/{session_id}/interpret','startSessionInterpretation','AcceptedOperation',permission='company.operate',versioned=True,status='202')
endpoint('get',C+'/processing-sessions/{session_id}/files/{file_id}/interpretation','getSessionInterpretation','SessionInterpretation')
endpoint('put',C+'/processing-sessions/{session_id}/files/{file_id}/interpretation','configureSessionInterpretation','AcceptedOperation','SessionInterpretationSettings',permission='company.operate',versioned=True,status='202')
endpoint('get',C+'/processing-sessions/{session_id}/files/{file_id}/rows','listNormalizedRows',list_item='NormalizedRow')
endpoint('get',C+'/source-files/{file_id}/interpretations','listInterpretations',list_item='Interpretation')
endpoint('post',C+'/source-files/{file_id}/interpretations','reviseInterpretation','Interpretation','InterpretationRequest',permission='company.operate',versioned=True)
endpoint('patch',C+'/source-files/{file_id}/archive','archiveSourceFile','File','ArchiveRequest',permission='company.owner',versioned=True)
endpoint('get',C+'/source-files/{file_id}/deletion-impact','getSourceDeletionImpact','DeletionImpact',permission='company.owner')
endpoint('post',C+'/source-files/{file_id}/deletion','deleteSourceFile','AcceptedOperation','DeleteRequest',permission='company.owner',versioned=True,status='202',description='D06: 409 while any historical/current dependency remains. No cascade. Recheck dependency graph in deletion transaction; archive does not remove financial effects.')
endpoint('post',C+'/dataset-revisions','createDatasetRevision','DatasetRevision','RevisionRequest',permission='company.operate',description='Explicit overlap resolution and active logical-record selection; validate preview, version ancestry and resulting financial impact before sealing. Does not mutate a published manifest.')
endpoint('get',C+'/dataset-revisions/{revision_id}','getDatasetRevision','DatasetRevision')
endpoint('post',C+'/processing-sessions/{session_id}/calculate','startFinancialCalculation','AcceptedOperation',permission='company.operate',versioned=True,status='202')
endpoint('get',C+'/results','listResultManifests',list_item='ResultManifest')
endpoint('get',C+'/results/{manifest_id}','getResultManifest','ResultManifest')
endpoint('get',C+'/results/{manifest_id}/metrics','listMetricObservations',list_item='MetricObservation')
for suffix,item,op in [('receivables','InvoiceBalance','listReceivables'),('payables','InvoiceBalance','listPayables'),('cash-accounts','CashAccountBalance','listCashAccountBalances'),('cash-days','CashDay','listCashDays'),('bank-movements','BankMovement','listBankMovements')]:
    endpoint('get',C+'/results/{manifest_id}/'+suffix,op,list_item=item,description='Read exclusively from the pinned manifest selection and as_of date. Do not substitute live balances or net ledger and invoice bases together.')
for suffix,item,op in [('accounts','Account','listAccounts'),('parties','Party','listParties'),('bank-accounts','BankAccount','listBankAccounts')]:
    endpoint('get',C+'/'+suffix,op,list_item=item)
endpoint('post',C+'/accounts/{account_id}/role-versions','reviseAccountRole','Account','SourceRoleRequest',permission='company.operate',versioned=True,description='Human account-role correction creates a version and reprocesses dependent results. Imported amounts stay immutable.')
endpoint('post',C+'/bank-accounts/{bank_account_id}/ledger-links','reviseBankLedgerLink','BankLedgerLink','LedgerLinkRequest',permission='company.operate',versioned=True,description='Human same-company bank/ledger association; new version with evidence and downstream reprocessing.')
endpoint('get',C+'/upload-policy','getUploadPolicy','UploadPolicy')
endpoint('get',C+'/results/{manifest_id}/findings','listFindings',list_item='Finding')
endpoint('get',C+'/findings/{finding_id}','getFinding','Finding')
endpoint('post',C+'/findings/{finding_id}/decisions','decideFinding','Decision','DecisionRequest',permission='company.operate',versioned=True)
endpoint('get',C+'/evidence/{evidence_id}','getEvidence','Evidence')
endpoint('get',C+'/reconciliations/{run_id}','getReconciliation','ReconciliationRun')
endpoint('get',C+'/reconciliations/{run_id}/candidates','listReconciliationCandidates',list_item='Candidate')
endpoint('post',C+'/reconciliation-proposals/{candidate_id}/decisions','decideReconciliation','Decision','DecisionRequest',permission='company.operate',versioned=True)
endpoint('post',C+'/allocations','createAllocation','Allocation','AllocationRequest',permission='company.operate',description='D04: owner/finance manager/advisor; atomic capacity locks for bank, settlement and invoice. Validate active revision, party, direction and remaining capacity. No bank money movement.')
endpoint('get',C+'/allocations','listAllocations',list_item='Allocation')
endpoint('post',C+'/allocations/{allocation_id}/reversals','reverseAllocation','Reversal','ReversalRequest',permission='company.operate',versioned=True)
endpoint('post',C+'/invoice-comparisons','createInvoiceComparison','ComparisonResult','ComparisonRequest',permission='company.operate',status='202')
endpoint('get',C+'/invoice-comparisons/{comparison_id}','getInvoiceComparison','ComparisonResult')
endpoint('get',C+'/planned-payments','listPlannedPayments',list_item='PlannedPayment')
endpoint('post',C+'/planned-payments','createPlannedPayment','PlannedPayment','PlannedPaymentCreate',permission='company.operate')
endpoint('get',C+'/planned-payments/{plan_id}','getPlannedPayment','PlannedPayment')
endpoint('patch',C+'/planned-payments/{plan_id}','revisePlannedPayment','PlannedPayment','PlannedPaymentPatch',permission='company.operate',versioned=True,description='Create a new version, never edit imported financial source amounts. Link invoice and plan to one obligation; remaining comes from matched settlements.')
endpoint('delete',C+'/planned-payments/{plan_id}','cancelPlannedPayment','PlannedPayment',permission='company.operate',versioned=True,description='Versioned cancellation, not physical deletion of history.')
endpoint('get',C+'/recurrence-proposals','listRecurrenceProposals',list_item='RecurrenceProposal')
endpoint('post',C+'/recurrence-proposals/{proposal_id}/decisions','decideRecurrence','PlannedPayment','RecurrenceDecisionRequest',permission='company.operate',versioned=True,description='Acceptance creates a confirmed obligation/plan; rejection returns the proposal. See response oneOf.')
PATHS[C+'/recurrence-proposals/{proposal_id}/decisions']['post']['responses']['201']['content']['application/json']['schema']={'oneOf':[ref('PlannedPayment'),ref('RecurrenceProposal')]}
endpoint('get',C+'/forecasts/{manifest_id}','getForecast','Forecast')
endpoint('get',C+'/reports','listReports',list_item='Report')
endpoint('get',C+'/reports/{report_id}','getReport','Report')
endpoint('post',C+'/reports/{report_id}/approvals','approveReport','Approval','ApprovalRequest',permission='company.approve_report',versioned=True,description='D05: finance manager OR owner/advisor with current explicit same-company permission. Read If-Match against immutable report version; record exact report and actor. Generation and download do not require approval.')
endpoint('post',C+'/exports','createExport','ExportJob','ExportRequest',permission='company.read',status='202')
endpoint('get',C+'/exports/{export_id}','getExport','ExportJob')
endpoint('get',C+'/exports/{export_id}/content','downloadExport',result=None,description='Authorized binary proxy; recheck company membership at download, status ready and manifest scope. Never expose internal object keys.')
download=PATHS[C+'/exports/{export_id}/content']['get']['responses']['200']
download['content']={m:{'schema':{'type':'string','format':'binary'}} for m in ['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv']}
download['headers']['Content-Disposition']={'schema':string()}
endpoint('post',C+'/assistant/questions','askReadOnlyAssistant','AssistantAnswer','AssistantQuestionRequest',permission='company.read',status='202')
endpoint('get',C+'/assistant/questions/{question_id}','getAssistantAnswer','AssistantAnswer')
endpoint('get',C+'/notifications','listNotifications',list_item='Notification',description='Only notifications for current user and company. Read status never resolves a processing issue.')
endpoint('patch',C+'/notifications/{notification_id}','markNotification','Notification','NotificationPatch',permission='notification.self',versioned=True)
endpoint('get',C+'/usage','companyUsage','Usage',permission='company.read')
endpoint('get','/api/v1/admin/budget-policy','getInstallationBudget','BudgetPolicy',permission='installation.admin')
endpoint('patch','/api/v1/admin/budget-policy','updateInstallationBudget','BudgetPolicy','BudgetPolicyPatch',permission='installation.admin',versioned=True)
endpoint('get',C+'/policies','listPolicies',list_item='Policy',permission='company.financial_policy')
endpoint('post',C+'/policies','createPolicyVersion','Policy','PolicySettingsRequest',permission='company.financial_policy',description='New immutable policy version. Validate parameters by policy kind, record proposed/evaluated/approved separately; no unvalidated automatic-matching/forecast threshold becomes approved merely by submission.')

# Locally authored domain extensions share the generator's schema/endpoint helpers.
for extension in sorted((ROOT / 'tools/contract_extensions').glob('*.py')):
    exec(compile(extension.read_text(), str(extension), 'exec'), globals())

DOC={'openapi':'3.1.1','info':{'title':'Didban Mali Fresh Rebuild API','version':'0.1.0','description':'Design contract, not a running server. D01-D08 are binding. Financial values are IRR Decimal strings; unknown is null with a reason. All financial endpoints are company scoped. Mutation services must enforce idempotency, authorization and version/transaction protocols.'},
     'servers':[{'url':'/','description':'Same-origin private installation; not a deployed service.'}],
     'security':[{'SessionCookie':[]}], 'paths':PATHS,
     'components':{'securitySchemes':{'SessionCookie':{'type':'apiKey','in':'cookie','name':'didban_session','description':'HttpOnly, Secure, SameSite=Lax; rotate at login/reset and revoke at logout. Never use localStorage for sessions.'}},'schemas':SCHEMAS},
     'x-decisions':['D01','D02','D03','D04','D05','D06','D07','D08'],
     'x-implementation-status':'contract_only',
     'x-engineering-defaults':{'cursor_order':['created_at','id'],'page_limit':100,'money_storage':'app.money_irr numeric domain; 32 integer and 6 fractional digits; reject before rounding'},
     'x-reason-codes':['ledger_source_missing','invoice_source_missing','balance_anchor_missing','unsupported_currency','unit_unknown','payment_dates_missing','due_date_missing','source_coverage_unknown','comparison_missing','zero_denominator','income_tax_unknown','overlap_unresolved','reference_missing','tax_missing','source_has_dependencies','allocation_capacity_conflict','bank_capacity_conflict','session_barrier_or_version','stale_worker_lease','model_unavailable','budget_exhausted']}


if __name__=='__main__':
    target = ROOT/'contracts/openapi.json'
    rendered = json.dumps(DOC,ensure_ascii=False,indent=2)+'\n'
    if '--check' in sys.argv:
        if not target.exists() or target.read_text() != rendered:
            raise SystemExit('OpenAPI is stale; run make contracts and npm run generate:api.')
        print('OpenAPI matches its source and domain extensions.')
    else:
        target.write_text(rendered)
        print(f'Generated {len(PATHS)} paths, {sum(len(v) for v in PATHS.values())} operations, {len(SCHEMAS)} schemas')
