-- Forward interpretation staging. Financial ledgers/results are not populated here.
BEGIN;
SET search_path=app,pg_catalog;
ALTER TABLE operations DROP CONSTRAINT operations_kind_check;
ALTER TABLE operations ADD CONSTRAINT operations_kind_check CHECK(kind IN ('seal_session','retry_session','cancel_session','delete_source','interpretation_configured','start_interpretation'));
ALTER TABLE processing_sessions ADD COLUMN interpretation_finished_at timestamptz;
ALTER TABLE processing_sessions ADD COLUMN interpretation_context jsonb NOT NULL DEFAULT '{}';
ALTER TABLE session_files ADD COLUMN interpretation_settings jsonb NOT NULL DEFAULT '{"sheets":{}}';
ALTER TABLE session_files ADD COLUMN interpretation_preview jsonb NOT NULL DEFAULT '[]';
ALTER TABLE session_files ADD COLUMN interpretation_summary jsonb;
ALTER TABLE session_files ADD COLUMN interpretation_run_id uuid;
CREATE TABLE interpretation_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), row_version bigint NOT NULL DEFAULT 1,
 session_id uuid NOT NULL, source_file_id uuid NOT NULL, policy_id uuid NOT NULL,
 settings jsonb NOT NULL, summary jsonb NOT NULL, UNIQUE(company_id,id),
 FOREIGN KEY(company_id,session_id) REFERENCES processing_sessions(company_id,id),
 FOREIGN KEY(company_id,source_file_id) REFERENCES source_files(company_id,id),
 FOREIGN KEY(company_id,policy_id) REFERENCES policy_versions(company_id,id)
);
ALTER TABLE session_files ADD FOREIGN KEY(company_id,interpretation_run_id) REFERENCES interpretation_runs(company_id,id);
ALTER TABLE interpretation_versions ADD COLUMN run_id uuid;
ALTER TABLE interpretation_versions ADD FOREIGN KEY(company_id,run_id) REFERENCES interpretation_runs(company_id,id);
CREATE TABLE normalized_source_rows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), row_version bigint NOT NULL DEFAULT 1,
 run_id uuid NOT NULL, source_row_id uuid NOT NULL, source_kind text NOT NULL,
 canonical_values jsonb NOT NULL, content_fingerprint text NOT NULL, logical_key text,
 state text NOT NULL CHECK(state IN ('valid','rejected','excluded_overlap')),
 error_codes jsonb NOT NULL, overlap_evidence jsonb NOT NULL,
 UNIQUE(company_id,id), UNIQUE(company_id,source_row_id),
 FOREIGN KEY(company_id,run_id) REFERENCES interpretation_runs(company_id,id),
 FOREIGN KEY(company_id,source_row_id) REFERENCES source_rows(company_id,id)
);
CREATE INDEX normalized_fingerprint ON normalized_source_rows(company_id,content_fingerprint);
CREATE INDEX normalized_logical_key ON normalized_source_rows(company_id,logical_key) WHERE logical_key IS NOT NULL;
CREATE INDEX interpretation_dispatch ON outbox_events(available_at,created_at) WHERE published_at IS NULL AND event_kind='intake.interpret';
ALTER TABLE interpretation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE interpretation_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY select_company ON interpretation_runs FOR SELECT USING(app.can_read(company_id));
CREATE POLICY insert_company ON interpretation_runs FOR INSERT WITH CHECK(app.can_operate(company_id));
GRANT SELECT,INSERT ON interpretation_runs TO didban_app;
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON interpretation_runs FOR EACH ROW EXECUTE FUNCTION app.immutable_row();
ALTER TABLE normalized_source_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE normalized_source_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY select_company ON normalized_source_rows FOR SELECT USING(app.can_read(company_id));
CREATE POLICY insert_company ON normalized_source_rows FOR INSERT WITH CHECK(app.can_operate(company_id));
GRANT SELECT,INSERT ON normalized_source_rows TO didban_app;
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON normalized_source_rows FOR EACH ROW EXECUTE FUNCTION app.immutable_row();
CREATE FUNCTION claim_interpretation_job(claim uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE e outbox_events%ROWTYPE; s processing_sessions%ROWTYPE;
BEGIN
 SELECT e1.* INTO e FROM outbox_events e1 JOIN processing_sessions s1 ON s1.id=e1.session_id AND s1.company_id=e1.company_id
 WHERE e1.event_kind='intake.interpret' AND e1.published_at IS NULL
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
REVOKE ALL ON FUNCTION claim_interpretation_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_interpretation_job(uuid) TO didban_worker;
CREATE OR REPLACE FUNCTION runtime_version() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 7 $$;
COMMIT;
