"""Settlement workspaces are explicit live revisions; result invoice pages stay pinned."""
obj('SettlementEventRequest', {'bank_movement_id':ID,'reason':TEXT})
obj('SettlementEvent', {'id':ID,'bank_movement_id':nullable(ID),'party_id':nullable(ID),'settled_on':DATE,'direction':enum('receipt','payment'),'amount':POSITIVE,'allocated':MONEY,'version':VERSION})
obj('SettlementBankMovement', {'id':ID,'date':DATE,'amount':MONEY,'reference':nullable(TEXT),'event_id':nullable(ID)})
obj('SettlementWorkspace', {'id':ID,'manifest_id':ID,'dataset_revision_id':ID,'as_of_date':DATE,'version':VERSION,'invoices':arr(ref('InvoiceBalance')),'events':arr(ref('SettlementEvent')),'bank_movements':arr(ref('SettlementBankMovement')),'allocations':arr(ref('Allocation')),'reason_codes':arr(TEXT)})
obj('ForecastStart', {'minimum_events':{'type':'integer','minimum':1,'maximum':10000},'lookback_days':{'type':'integer','minimum':1,'maximum':3650}}, [])
obj('ForecastRun', {'id':ID,'manifest_id':ID,'snapshot_id':ID,'session_id':ID,'status':enum('waiting_input','published'),'forecast':nullable(ref('Forecast')),'created_at':TIME})
SCHEMAS['AnswerConstraints']['properties']['setting_key']['enum'].append('forecast')
SCHEMAS['AnswerConstraints']['properties'].update({'forecast_key':TEXT,'forecast_run_id':ID,'min_date':DATE,'max_date':DATE})
endpoint('get',C+'/settlements/{manifest_id}','getSettlementWorkspace','SettlementWorkspace')
endpoint('post',C+'/results/{manifest_id}/settlement-events','createSettlementEvent','SettlementEvent','SettlementEventRequest',permission='company.operate')
endpoint('post',C+'/results/{manifest_id}/forecasts','createForecast','ForecastRun','ForecastStart',permission='company.operate')
endpoint('get',C+'/forecast-runs/{forecast_id}','getForecastRun','ForecastRun')
SCHEMAS['Forecast']['properties'].update({'run_id':ID,'snapshot_id':ID})
SCHEMAS['Forecast']['required'] += ['run_id','snapshot_id']

SCHEMAS['PlannedPayment']['properties']['remaining_amount']=nullable(MONEY)
SCHEMAS['InvoiceBalance']['properties']['party_display_name']=TEXT
SCHEMAS['SettlementWorkspace']['properties']['totals']=obj('SettlementTotals',{key:nullable(MONEY) for key in ('ar_ledger','ar_invoice','ar_difference','ap_trade_ledger','ap_invoice','ap_difference','debt_total_ledger')})
SCHEMAS['SettlementWorkspace']['required'].append('totals')
endpoint('get',C+'/results/{manifest_id}/forecast-runs','listForecastRuns',list_item='ForecastRun')
SCHEMAS['Forecast']['properties']['summary']=obj('ForecastSummary',{'ending':nullable(MONEY),'minimum':nullable(MONEY),'minimum_on':nullable(DATE),'expected_in':nullable(MONEY),'expected_out':nullable(MONEY)})
SCHEMAS['Forecast']['required'].append('summary')
SCHEMAS['PlannedPayment']['properties']['as_of_date']=DATE
