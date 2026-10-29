# Payroll extension: rule sets are explicit and reviewed, no built-in statutory constants.
PJSON = {'type':'object','additionalProperties':True}
obj('PayrollEmployeeRequest', {'personnel_code':TEXT,'profile':PJSON})
obj('PayrollEmployee', {'id':ID,'personnel_code':TEXT,'profile':PJSON,'version':VERSION})
obj('PayrollEmployeeList', {'items':arr(ref('PayrollEmployee')),'next_cursor':nullable(TEXT)})
obj('PayrollContractRequest', {'employee_id':ID,'effective_from':DATE,'effective_to':nullable(DATE),'content':PJSON})
obj('PayrollContract', {'id':ID,'employee_id':ID,'effective_from':DATE,'effective_to':nullable(DATE),'content':PJSON})
obj('PayrollContractList', {'items':arr(ref('PayrollContract')),'next_cursor':nullable(TEXT)})
obj('PayrollWorkRequest', {'employee_id':ID,'period_start':DATE,'period_end':DATE,'content':PJSON})
obj('PayrollWork', {'id':ID,'employee_id':ID,'period_start':DATE,'period_end':DATE,'content':PJSON,'revision':VERSION})
obj('PayrollWorkList', {'items':arr(ref('PayrollWork')),'next_cursor':nullable(TEXT)})
obj('PayrollRuleRequest', {'name':TEXT,'effective_from':DATE,'effective_to':DATE,'content':PJSON})
obj('PayrollRule', {'id':ID,'name':TEXT,'effective_from':DATE,'effective_to':DATE,'content':PJSON,'reviewed':BOOL,'legal_verified':BOOL})
obj('PayrollRuleList', {'items':arr(ref('PayrollRule')),'next_cursor':nullable(TEXT)})
obj('PayrollRuleReview', {'reference':TEXT,'fixtures':{'type':'array','minItems':1,'maxItems':30,'items':PJSON}})
obj('PayrollRunRequest', {'period_start':DATE,'period_end':DATE,'kind':enum('monthly','eidi','sanavat','termination','arrears'),'rule_id':ID,'employee_ids':{'type':'array','items':ID,'minItems':1,'maxItems':1000,'uniqueItems':True},'supersedes_id':nullable(ID)})
obj('PayrollRun', {'id':ID,'period_start':DATE,'period_end':DATE,'kind':TEXT,'rule_id':ID,'input_hash':HASH,'content':PJSON,'approved':BOOL,'supersedes_id':nullable(ID),'created_at':TIME})
obj('PayrollRunList', {'items':arr(ref('PayrollRun')),'next_cursor':nullable(TEXT)})
obj('PayrollSummary', {'period_start':DATE,'period_end':DATE,'hires':{'type':'integer','minimum':0},'departures':{'type':'integer','minimum':0},'active_employees':{'type':'integer','minimum':0},'employees_paid':{'type':'integer','minimum':0},'approved_runs':{'type':'integer','minimum':0},'gross':MONEY,'net':MONEY,'employer_cost':MONEY,'paid':MONEY,'unpaid':MONEY})
obj('PayrollPaymentRequest', {'employee_id':ID,'amount':POSITIVE,'paid_on':DATE,'reference':TEXT,'bank_movement_id':nullable(ID)})
obj('PayrollPayment', {'id':ID,'run_id':ID,'employee_id':ID,'amount':MONEY,'paid_on':DATE,'reference':TEXT,'bank_movement_id':nullable(ID)})
obj('PayrollImportRequest', {'kind':enum('employees','work'),'filename':TEXT,'data_base64':string(minLength=1,maxLength=3000000)})
obj('PayrollImportPreview', {'id':ID,'input_hash':HASH,'content':PJSON})
obj('PayrollActionRequest', {})
obj('PayrollFinancialLinkRequest', {'scheduled_on':DATE,'existing_plan_id':nullable(ID),'existing_plan_version':nullable(VERSION),'source_manifest_id':nullable(ID),'ledger_line_ids':{'type':'array','items':ID,'maxItems':1000,'uniqueItems':True},'reason':TEXT})
obj('PayrollFinancialLink',{'content':PJSON})
obj('PayrollExportRequest', {'format':enum('pdf','xlsx','insurance','tax')})
obj('PayrollExport', {'filename':TEXT,'media_type':TEXT,'data_base64':string(minLength=1,maxLength=20000000),'sha256':HASH})
for method,path,operation,result,request in [
 ('get','/payroll/employees/{employee_id}/contracts','listPayrollEmployeeContracts','PayrollContractList',None),
 ('get','/payroll/employees/{employee_id}/work','listPayrollEmployeeWork','PayrollWorkList',None),
 ('get','/payroll/employees/{employee_id}/runs','listPayrollEmployeeRuns','PayrollRunList',None),
 ('get','/payroll/employees/{employee_id}/details','getPayrollEmployeeDetails','PayrollFinancialLink',None),
 ('get','/payroll/employees','listPayrollEmployees','PayrollEmployeeList',None),
 ('post','/payroll/employees','createPayrollEmployee','PayrollEmployee','PayrollEmployeeRequest'),
 ('patch','/payroll/employees/{employee_id}','updatePayrollEmployee','PayrollEmployee','PayrollEmployeeRequest'),
 ('get','/payroll/contracts','listPayrollContracts','PayrollContractList',None),
 ('post','/payroll/contracts','createPayrollContract','PayrollContract','PayrollContractRequest'),
 ('get','/payroll/work','listPayrollWork','PayrollWorkList',None),
 ('post','/payroll/work','savePayrollWork','PayrollWork','PayrollWorkRequest'),
 ('get','/payroll/rules','listPayrollRules','PayrollRuleList',None),
 ('post','/payroll/rules','createPayrollRule','PayrollRule','PayrollRuleRequest'),
 ('post','/payroll/rules/{rule_id}/reviews','validatePayrollRule','PayrollRule','PayrollRuleReview'),
 ('get','/payroll/runs','listPayrollRuns','PayrollRunList',None),
 ('post','/payroll/runs','createPayrollRun','PayrollRun','PayrollRunRequest'),
 ('get','/payroll/runs/{payroll_run_id}','getPayrollRun','PayrollRun',None),
 ('post','/payroll/runs/{payroll_run_id}/approvals','approvePayrollRun','PayrollRun',None),
 ('post','/payroll/runs/{payroll_run_id}/payments','recordPayrollPayment','PayrollPayment','PayrollPaymentRequest'),
 ('post','/payroll/runs/{payroll_run_id}/exports','exportPayrollRun','PayrollExport','PayrollExportRequest'),
 ('get','/payroll/runs/{payroll_run_id}/financial-options','getPayrollFinancialOptions','PayrollFinancialLink',None),
 ('post','/payroll/runs/{payroll_run_id}/financial-link','linkPayrollFinancial','PayrollFinancialLink','PayrollFinancialLinkRequest'),
 ('get','/payroll/summary','getPayrollSummary','PayrollSummary',None),
 ('post','/payroll/imports','previewPayrollImport','PayrollImportPreview','PayrollImportRequest'),
 ('post','/payroll/imports/{preview_id}/commit','commitPayrollImport','Success',None),
]:
 if operation in ('approvePayrollRun','commitPayrollImport'): request='PayrollActionRequest'
 endpoint(method,C+path,operation,result,request,permission='payroll.view' if method=='get' or operation=='exportPayrollRun' else 'payroll.approve' if operation=='approvePayrollRun' else 'payroll.manage',versioned=operation=='updatePayrollEmployee',status='200' if operation in ('exportPayrollRun','commitPayrollImport') else None)

for path,item in PATHS.items():
 for method,operation in item.items():
  if isinstance(operation,dict) and (operation.get('operationId','').startswith('listPayroll') or operation.get('operationId')=='getPayrollEmployeeDetails'):
   operation['parameters'] += [parameter('limit','query',{'type':'integer','minimum':1,'maximum':100,'default':25}),parameter('cursor','query',string(maxLength=2048))]
