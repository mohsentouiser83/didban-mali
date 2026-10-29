# Explicit trial-balance scope is metadata, never an inferred ledger posting.
SCHEMAS['SessionInterpretationSettings']['properties'].update({'period_start':DATE,'as_of_date':DATE,'trial_balance_level':enum('detail','unknown'),'trial_balance_flows':enum('before_closing','includes_closing','unknown')})
SCHEMAS['ManagementReportRequest']['properties']['statement_basis']=enum('ledger','trial_balance')
SCHEMAS['ManagementReport']['properties']['statement_basis']=enum('ledger','trial_balance')
SCHEMAS['AccountMappingAnswer']['properties']['role']['enum'].append('cash_equivalent')
SCHEMAS['ManagementSourceRef']['properties']['basis']=enum('period_movement','closing_balance','journal_line')
SCHEMAS['InterpretationPreview']['properties'].update({'period_start':nullable(DATE),'as_of_date':nullable(DATE)})
obj('CashStatementSection', {'key':enum('operating','investing','financing'),'label':TEXT,'net':ref('ManagementMeasure'),'classified_net':ref('ManagementMeasure'),'source_refs':arr(ref('ManagementSourceRef'))})
obj('CashFlowStatement', {'formula_version':TEXT,'basis':enum('ledger'),'status':enum('available','limited','unavailable'),'reason_codes':arr(TEXT),**{key:ref('ManagementMeasure') for key in ('opening','closing','change','control','unclassified_net')},'sections':arr(ref('CashStatementSection')),'unclassified_count':{'type':'integer','minimum':0},'unclassified_refs':arr(ref('ManagementSourceRef')),'internal_entries_excluded':{'type':'integer','minimum':0},'noncash_entries_excluded':{'type':'integer','minimum':0}})
SCHEMAS['ManagementReport']['properties']['cashflow_statement']=ref('CashFlowStatement')

SCHEMAS["AnswerConstraints"]["properties"]["setting_key"]["enum"].extend(["trial_balance_level", "trial_balance_flows"])
