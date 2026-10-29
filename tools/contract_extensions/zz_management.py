# Managerial report payloads are immutable children of a normal report edition.
section = enum('revenue','cogs','expense','other_income','income_tax','asset','liability','equity')
obj('StatementTemplateLine', {'key':string(minLength=1,maxLength=120),'label':string(minLength=1,maxLength=120),'section':section,'accounts':{'type':'array','items':string(minLength=1,maxLength=120),'maxItems':2000}})
obj('StatementTemplate', {'name':string(minLength=1,maxLength=120),'lines':{'type':'array','items':ref('StatementTemplateLine'),'minItems':1,'maxItems':100}})
obj('StatementTemplateUpload', {'name':string(minLength=1,maxLength=120),'content_base64':string(minLength=1,maxLength=40000)})
obj('ManagementReportRequest', {'starts_on':DATE,'as_of_date':DATE,'template':ref('StatementTemplate')}, required=[])
measurement = {'value':nullable(MONEY),'status':enum('available','unavailable'),'reason_codes':arr(TEXT)}
obj('ManagementMeasure', measurement)
obj('ManagementSourceRef', {'normalized_id':ID,'source_row_id':ID,'source_file_id':ID,'file_name':nullable(TEXT),'sheet_name':TEXT,'row_number':{'type':'integer'},'date':nullable(DATE),'account':nullable(TEXT),'debit':nullable(MONEY),'credit':nullable(MONEY)})
obj('StatementAccount', {'account':TEXT,**measurement,'source_refs':arr(ref('ManagementSourceRef'))})
obj('StatementLine', {**SCHEMAS['StatementTemplateLine']['properties'],**measurement,'details':arr(ref('StatementAccount'))})
obj('StatementTotal', {'key':TEXT,'label':TEXT,**measurement})
obj('FinancialStatements', {'starts_on':DATE,'as_of_date':DATE,'lines':arr(ref('StatementLine')),'totals':arr(ref('StatementTotal')),'balance_control':ref('ManagementMeasure'),'unmapped_accounts':arr(TEXT),'available_accounts':arr(TEXT)})
# Cash details retain the existing pinned bank snapshot shape. No arbitrary query filter.
obj('ManagementCashMovement', {'source_row_id':ID,'source_file_id':ID,'sheet_name':TEXT,'row_number':{'type':'integer'},'account_name':TEXT,'date':DATE,'amount':MONEY,'reference':nullable(TEXT)})
obj('ManagementDay', {'date':DATE,'opening':nullable(MONEY),'closing':nullable(MONEY),'inflow_recorded':nullable(MONEY),'outflow_recorded':nullable(MONEY),'inflow_external':nullable(MONEY),'outflow_external':nullable(MONEY),'net_recorded':nullable(MONEY),'cash_reason_codes':arr(TEXT),'booked_expense':ref('ManagementMeasure'),'expense_source_refs':arr(ref('ManagementSourceRef')),'movements':arr(ref('ManagementCashMovement'))})
obj('ManagementDaily', {'days':arr(ref('ManagementDay')),'upcoming':arr({'type':'object','additionalProperties':True}),'upcoming_reason_codes':arr(TEXT)})
obj('ProfitDriver', {'line_key':TEXT,'account':TEXT,'label':TEXT,'current':MONEY,'previous':MONEY,'profit_effect':MONEY,'source_refs':arr(ref('ManagementSourceRef')),'previous_source_refs':arr(ref('ManagementSourceRef'))})
obj('ManagementAnalysis', {'comparison_starts_on':nullable(DATE),'comparison_as_of_date':nullable(DATE),'profit_delta':nullable(MONEY),'drivers':arr(ref('ProfitDriver')),'reason_codes':arr(TEXT),'cash_movements':arr(ref('ManagementCashMovement'))})
obj('ManagementReport', {'formula_version':TEXT,'starts_on':DATE,'as_of_date':DATE,'unit':enum('IRR'),'template':nullable(ref('StatementTemplate')),'statements':ref('FinancialStatements'),'daily':ref('ManagementDaily'),'analysis':ref('ManagementAnalysis')})
SCHEMAS['Report']['properties']['management_available']={'type':'boolean'}
endpoint('post',C+'/results/{manifest_id}/management-reports','generateManagementReport','Report','ManagementReportRequest',permission='company.operate',status='201',description='Generate immutable statements, daily reports and arithmetic variance analysis. Optional dates stay within the pinned period/cutoff. Optional explicit account template; no accounting posting or external sends. Existing approvals never transfer.')
endpoint('get',C+'/reports/{report_id}/management','getManagementReport','ManagementReport',description='Read the captured management payload of this exact report edition; never recompute historical reports.')
endpoint('post',C+'/statement-templates/parse','parseStatementTemplate','StatementTemplate','StatementTemplateUpload',permission='company.operate',status='201',description='Parse only bounded text-only mapping workbooks. Does not create financial data, infer mappings, execute formulas or store arbitrary original files.')
endpoint('get',C+'/statement-templates/example','downloadStatementTemplate',result=None)
PATHS[C+'/statement-templates/example']['get']['responses']['200']['content']={'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':{'schema':{'type':'string','format':'binary'}}}

SCHEMAS['AccountMappingAnswer']['properties']['role']['enum'].extend(['fixed_asset','other_asset','contra_asset','other_equity'])

obj('CashChangeDriver', {'key':TEXT,'label':TEXT,'sheet_name':TEXT,**measurement,'source_refs':arr(ref('ManagementCashMovement'))})
obj('CashChangeAnalysis', {**{key:ref('ManagementMeasure') for key in ('opening','closing','change','inflow','outflow','external_inflow','external_outflow')},'drivers':arr(ref('CashChangeDriver'))})
SCHEMAS['ManagementAnalysis']['properties']['cash']=ref('CashChangeAnalysis')

endpoint('get',C+'/reports/{report_id}/statement-template','downloadReportTemplate',result=None)
PATHS[C+'/reports/{report_id}/statement-template']['get']['responses']['200']['content']={'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':{'schema':{'type':'string','format':'binary'}}}
obj('ManagementSourceFile', {'source_file_id':ID,'file_name':TEXT})
SCHEMAS['ManagementReport']['properties']['sources']=arr(ref('ManagementSourceFile'))
