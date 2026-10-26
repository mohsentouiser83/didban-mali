"""Exact period cashflow projections; operational split is nullable without proof."""
obj('CashMovementEvidence', {'source_row_id':ID,'source_file_id':ID,'sheet_name':TEXT,'row_number':{'type':'integer','minimum':1},'account_name':TEXT,'date':DATE,'amount':MONEY,'reference':nullable(TEXT)})
obj('CashAccountBalance', {'bank_account_id':nullable(ID),'name':TEXT,'as_of_date':DATE,'balance':nullable(MONEY),'status':STATUS,'reason_codes':arr(TEXT),'evidence_refs':arr(ID)})
obj('CashDay', {'date':DATE,'opening':nullable(MONEY),'inflow_external':nullable(MONEY),'outflow_external':nullable(MONEY),'internal_net':nullable(MONEY),'inflow_recorded':nullable(MONEY),'outflow_recorded':nullable(MONEY),'net_recorded':nullable(MONEY),'closing':nullable(MONEY),'status':STATUS,'reason_codes':arr(TEXT),'evidence_refs':arr(ID),'movements':arr(ref('CashMovementEvidence'))})

obj('CashDayPage', {'items':arr(ref('CashDay')),'next_cursor':nullable(string(maxLength=2048)),'reason_codes':arr(TEXT),'snapshot_created_at':TIME})
