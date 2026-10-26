# Executed with build_openapi globals; shared source remains coordinator-owned.
SCHEMAS['AssistantAnswer']['properties'].update({'question':TEXT,'created_at':TIME,'dependency_code':nullable(TEXT),'related_path':nullable(TEXT),'version':VERSION})
SCHEMAS['AssistantAnswer']['required'] += ['question','created_at','dependency_code','related_path','version']
SCHEMAS['Usage']['properties']['budget_configured'] = BOOL
SCHEMAS['Usage']['required'].append('budget_configured')
obj('ModelStatus',{'configured':BOOL,'provider':{'type':'string','enum':['openai','avalai']},'model_identifier':nullable(TEXT),'rates_configured':BOOL})
obj('ModelUsageReconcile',{'actual_cost_usd':USD})
endpoint('post','/api/v1/admin/budget-policy','createInstallationBudget','BudgetPolicy','BudgetPolicyPatch',permission='installation.admin')
endpoint('get','/api/v1/admin/usage','getInstallationUsage','Usage',permission='installation.admin')
endpoint('post','/api/v1/admin/model-requests/{model_request_id}/reconcile','reconcileModelUsage','Success','ModelUsageReconcile',permission='installation.admin')
endpoint('get',C+'/model-status','getModelStatus','ModelStatus')
endpoint('get',C+'/assistant/questions','listAssistantQuestions',list_item='AssistantAnswer')
endpoint('post',C+'/assistant/questions/{question_id}/retry','retryAssistantQuestion','AssistantAnswer',versioned=True,status='202')

obj('UncertainModelCharge',{'id':ID,'created_at':TIME,'reserved_usd':USD})
endpoint('get','/api/v1/admin/model-requests','listUncertainModelRequests',list_item='UncertainModelCharge',permission='installation.admin')
