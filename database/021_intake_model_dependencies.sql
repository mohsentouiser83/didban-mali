-- Model outages and caps defer the interpretation step without failing its source.
BEGIN;
SET search_path=app,pg_catalog;
CREATE OR REPLACE FUNCTION defer_intake_job(job uuid, claim uuid, reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE e outbox_events%ROWTYPE;
BEGIN
 SELECT * INTO e FROM outbox_events WHERE id=job AND lease_token=claim AND published_at IS NULL AND lease_expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF reason NOT IN ('scanner_unavailable','storage_unavailable','permission_revoked','barrier','model_unavailable','budget_exhausted','budget_not_configured') THEN RAISE EXCEPTION 'invalid_intake_dependency'; END IF;
 UPDATE outbox_events SET lease_token=NULL,lease_expires_at=NULL,available_at=clock_timestamp()+interval '10 seconds' WHERE id=e.id;
 IF reason<>'barrier' AND EXISTS(SELECT 1 FROM processing_sessions WHERE id=e.session_id AND company_id=e.company_id AND status IN ('sealed','processing','waiting_dependency')) THEN
  UPDATE processing_steps SET status='waiting_dependency',dependency_code=reason,lease_expires_at=NULL WHERE id=(e.payload->>'step_id')::uuid AND company_id=e.company_id;
  UPDATE processing_sessions SET status='waiting_dependency' WHERE id=e.session_id AND company_id=e.company_id AND status IN ('sealed','processing','waiting_dependency');
 END IF;
END $$;
COMMIT;
