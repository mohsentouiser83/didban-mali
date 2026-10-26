-- Forward-only: periods and durable file preparation. No financial effects.
BEGIN;
SET search_path=app,pg_catalog;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='didban_worker') THEN CREATE ROLE didban_worker NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$;
ALTER TABLE processing_sessions ADD COLUMN preparation_finished_at timestamptz;
ALTER TABLE source_files ADD COLUMN scan_engine text;
ALTER TABLE source_files ADD COLUMN scanned_at timestamptz;
ALTER TABLE session_files ADD COLUMN preparation_settings jsonb NOT NULL DEFAULT '{}';
ALTER TABLE session_files ADD COLUMN preparation_summary jsonb;
ALTER TABLE session_files ADD COLUMN error_code text;
ALTER TABLE processing_steps ADD COLUMN completed_items integer NOT NULL DEFAULT 0 CHECK(completed_items>=0);
ALTER TABLE processing_steps ADD COLUMN total_items integer CHECK(total_items>=0);
ALTER TABLE processing_steps DROP CONSTRAINT processing_steps_dependency_code_check;
ALTER TABLE processing_steps ADD CONSTRAINT processing_steps_dependency_code_check CHECK(dependency_code IN ('model_unavailable','budget_exhausted','storage_unavailable','queue_unavailable','scanner_unavailable','permission_revoked'));
ALTER TABLE outbox_events ADD COLUMN lease_token uuid;
ALTER TABLE outbox_events ADD COLUMN lease_expires_at timestamptz;
ALTER TABLE outbox_events ADD COLUMN delivery_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE outbox_events ADD COLUMN available_at timestamptz NOT NULL DEFAULT clock_timestamp();
CREATE UNIQUE INDEX one_open_issue_root ON processing_issues(company_id,session_id,root_key) WHERE resolved_at IS NULL AND superseded_at IS NULL;
CREATE INDEX intake_dispatch ON outbox_events(available_at,created_at) WHERE published_at IS NULL AND event_kind='intake.prepare';
-- A worker may discover only bounded job IDs. HTTP financial roles cannot dispatch globally.
CREATE FUNCTION claim_intake_job(claim uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE e outbox_events%ROWTYPE; s processing_sessions%ROWTYPE;
BEGIN
 SELECT e1.* INTO e FROM outbox_events e1 JOIN processing_sessions s1 ON s1.id=e1.session_id AND s1.company_id=e1.company_id
 WHERE e1.event_kind='intake.prepare' AND e1.published_at IS NULL
 AND e1.available_at<=clock_timestamp() AND (e1.lease_expires_at IS NULL OR e1.lease_expires_at<=clock_timestamp())
 AND s1.status IN ('sealed','processing','waiting_dependency')
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
 UPDATE outbox_events SET lease_token=claim,lease_expires_at=clock_timestamp()+interval '120 seconds',delivery_attempts=delivery_attempts+1 WHERE id=e.id;
 RETURN jsonb_build_object('id',e.id,'company_id',e.company_id,'session_id',s.id,'actor_id',s.requested_by,'step_id',e.payload->>'step_id','file_id',e.payload->>'file_id','claim',claim);
END $$;
CREATE FUNCTION defer_intake_job(job uuid, claim uuid, reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE e outbox_events%ROWTYPE;
BEGIN
 SELECT * INTO e FROM outbox_events WHERE id=job AND lease_token=claim AND published_at IS NULL AND lease_expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF reason NOT IN ('scanner_unavailable','storage_unavailable','permission_revoked','barrier') THEN RAISE EXCEPTION 'invalid_intake_dependency'; END IF;
 UPDATE outbox_events SET lease_token=NULL,lease_expires_at=NULL,available_at=clock_timestamp()+interval '10 seconds' WHERE id=e.id;
 IF reason<>'barrier' AND EXISTS(SELECT 1 FROM processing_sessions WHERE id=e.session_id AND company_id=e.company_id AND status IN ('sealed','processing','waiting_dependency')) THEN
  UPDATE processing_steps SET status='waiting_dependency',dependency_code=reason,lease_expires_at=NULL WHERE id=(e.payload->>'step_id')::uuid AND company_id=e.company_id;
  UPDATE processing_sessions SET status='waiting_dependency' WHERE id=e.session_id AND company_id=e.company_id AND status IN ('sealed','processing','waiting_dependency');
 END IF;
END $$;
REVOKE ALL ON FUNCTION claim_intake_job(uuid),defer_intake_job(uuid,uuid,text) FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO didban_worker;
GRANT EXECUTE ON FUNCTION claim_intake_job(uuid),defer_intake_job(uuid,uuid,text) TO didban_worker;
-- Period policy is a narrower write permission than ordinary operations.
DROP POLICY insert_company ON financial_periods;
DROP POLICY update_company ON financial_periods;
DROP POLICY delete_company ON financial_periods;
CREATE POLICY insert_company ON financial_periods FOR INSERT WITH CHECK(app.member_role(company_id) IN ('owner','finance_manager'));
CREATE POLICY update_company ON financial_periods FOR UPDATE USING(app.member_role(company_id) IN ('owner','finance_manager')) WITH CHECK(app.member_role(company_id) IN ('owner','finance_manager'));
CREATE POLICY delete_company ON financial_periods FOR DELETE USING(app.member_role(company_id) IN ('owner','finance_manager'));
CREATE FUNCTION period_history_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=app,pg_catalog AS $$
BEGIN
 IF (NEW.starts_on,NEW.ends_on,NEW.previous_period_id) IS DISTINCT FROM (OLD.starts_on,OLD.ends_on,OLD.previous_period_id)
 AND (EXISTS(SELECT 1 FROM processing_sessions WHERE company_id=OLD.company_id AND period_id=OLD.id)
 OR EXISTS(SELECT 1 FROM result_manifests WHERE company_id=OLD.company_id AND period_id=OLD.id)) THEN
 RAISE EXCEPTION 'period_in_use' USING ERRCODE='23514'; END IF;
 IF NEW.previous_period_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM financial_periods WHERE company_id=NEW.company_id AND id=NEW.previous_period_id AND ends_on<NEW.starts_on) THEN RAISE EXCEPTION 'invalid_previous_period' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM financial_periods WHERE company_id=NEW.company_id AND previous_period_id=NEW.id AND starts_on<=NEW.ends_on) THEN RAISE EXCEPTION 'invalid_previous_period' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER period_history BEFORE UPDATE ON financial_periods FOR EACH ROW EXECUTE FUNCTION period_history_guard();
CREATE OR REPLACE FUNCTION source_preservation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND
    (to_jsonb(NEW) - ARRAY['archived_at','row_version','scan_status','raw_row_count','data_row_count','scan_engine','scanned_at']) <>
    (to_jsonb(OLD) - ARRAY['archived_at','row_version','scan_status','raw_row_count','data_row_count','scan_engine','scanned_at'])
  THEN RAISE EXCEPTION 'source_original_immutable' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'DELETE' THEN
    IF NOT can_own(OLD.company_id) THEN RAISE EXCEPTION 'owner_required' USING ERRCODE='42501'; END IF;
    IF EXISTS (SELECT 1 FROM manifest_dependencies WHERE company_id=OLD.company_id AND source_file_id=OLD.id)
       OR EXISTS (SELECT 1 FROM interpretation_versions WHERE company_id=OLD.company_id AND source_file_id=OLD.id)
       OR EXISTS (SELECT 1 FROM session_files WHERE company_id=OLD.company_id AND source_file_id=OLD.id)
    THEN RAISE EXCEPTION 'source_has_dependencies' USING ERRCODE='23514'; END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION runtime_version() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 6 $$;
COMMIT;
