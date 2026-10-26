-- Measured maximum-batch analysis needs a bounded ten-minute lease.
-- Keep the same token/fence/barrier checks and atomic publication protocol.
BEGIN;
SET search_path=app,pg_catalog;
CREATE INDEX IF NOT EXISTS record_revisions_normalized_lookup
ON record_revisions(company_id,normalized_row_id);
CREATE OR REPLACE FUNCTION claim_analysis_job(claim uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE e outbox_events%ROWTYPE; s processing_sessions%ROWTYPE;
BEGIN
 SELECT e1.* INTO e FROM outbox_events e1 JOIN processing_sessions s1 ON s1.id=e1.session_id AND s1.company_id=e1.company_id
 WHERE e1.event_kind='analysis.expand' AND e1.published_at IS NULL
 AND e1.available_at<=clock_timestamp() AND (e1.lease_expires_at IS NULL OR e1.lease_expires_at<=clock_timestamp())
 AND s1.status IN ('sealed','processing','waiting_dependency')
 AND s1.manifest_id IS NOT NULL AND s1.analysis_finished_at IS NULL
 AND NOT EXISTS(SELECT 1 FROM processing_issues i WHERE i.company_id=s1.company_id AND i.session_id=s1.id AND i.required AND i.resolved_at IS NULL AND i.superseded_at IS NULL)
 ORDER BY e1.available_at,e1.created_at,e1.id FOR UPDATE OF e1 SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO s FROM processing_sessions WHERE company_id=e.company_id AND id=e.session_id;
 IF NOT EXISTS(SELECT 1 FROM company_memberships m JOIN users u ON u.id=m.user_id
   WHERE m.company_id=s.company_id AND m.user_id=s.requested_by AND m.active
   AND m.role IN ('owner','finance_manager','advisor_accountant') AND u.disabled_at IS NULL) THEN
   UPDATE processing_sessions SET status='waiting_dependency' WHERE id=s.id;
   UPDATE processing_steps SET status='waiting_dependency',dependency_code='permission_revoked' WHERE id=(e.payload->>'step_id')::uuid AND company_id=e.company_id;
   UPDATE outbox_events SET available_at=clock_timestamp()+interval '60 seconds' WHERE id=e.id;
   RETURN NULL;
 END IF;
 UPDATE outbox_events SET lease_token=claim,lease_expires_at=clock_timestamp()+interval '600 seconds',delivery_attempts=delivery_attempts+1 WHERE id=e.id;
 RETURN jsonb_build_object('id',e.id,'company_id',e.company_id,'session_id',s.id,'actor_id',s.requested_by,'step_id',e.payload->>'step_id','manifest_id',s.manifest_id,'claim',claim);
END $$;
REVOKE ALL ON FUNCTION claim_analysis_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_analysis_job(uuid) TO didban_worker;
COMMIT;
