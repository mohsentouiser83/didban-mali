# Shared downstream workflow fields; never claim the whole release is completed.
SCHEMAS['ProcessingSession']['properties']['analysis_finished_at'] = nullable(TIME)
SCHEMAS['ProcessingSession']['required'].append('analysis_finished_at')
SCHEMAS['ProcessingSession']['properties'].update({'report_id': nullable(ID), 'purpose': enum('upload','forecast'), 'source_session_id': nullable(ID)})
SCHEMAS['ProcessingSession']['required'] += ['report_id', 'purpose', 'source_session_id']
SCHEMAS['Operation']['properties']['kind'] = enum('seal_session','retry_session','cancel_session','delete_source','interpretation_configured','start_interpretation','start_financial','start_analysis')
endpoint('post', C+'/processing-sessions/{session_id}/analyze', 'startBusinessAnalysis', 'AcceptedOperation', permission='company.operate', versioned=True, status='202')

PATHS[C+'/processing-sessions/{session_id}/issues']['get']['parameters'].append({'name':'status','in':'query','required':False,'schema':enum('open','resolved','superseded')})
