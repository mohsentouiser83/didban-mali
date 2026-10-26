# Supported administration inputs only; other engine policies remain pinned history.
SCHEMAS['PolicySettingsRequest']['oneOf'] = [ref('ForecastPolicyRequest'),ref('UploadPolicyRequest')]
SCHEMAS['Policy']['properties'].update({'parameters':{'type':'object','additionalProperties':True},'created_at':TIME})
SCHEMAS['Policy']['required'] += ['parameters','created_at']
obj('SourceFileSummary', {'id':ID,'original_name':TEXT,'sha256':HASH,'byte_size':{'type':'integer','minimum':1},'format':enum('csv','xls','xlsx'),'scan_status':enum('quarantined','scanning','clean','rejected'),'created_at':TIME,'archived':BOOL,'version':VERSION})
obj('RetentionPolicy',{'company_id':ID,'retention_days':nullable({'type':'integer','minimum':1,'maximum':36500}),'automatic_deletion':{'const':False},'version':VERSION})
obj('RetentionPolicyPatch',{'retention_days':nullable({'type':'integer','minimum':1,'maximum':36500}),'reason':TEXT})
endpoint('get',C+'/source-files','listSourceFiles',list_item='SourceFileSummary')
PATHS[C+'/source-files/{file_id}/archive']['patch']['responses']['200']['content']['application/json']['schema']=ref('SourceFileSummary')
endpoint('get',C+'/retention-policy','getRetentionPolicy','RetentionPolicy')
endpoint('patch',C+'/retention-policy','updateRetentionPolicy','RetentionPolicy','RetentionPolicyPatch',permission='company.owner',versioned=True)
