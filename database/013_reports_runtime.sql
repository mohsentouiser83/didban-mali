-- Immutable report editions and leased private export generation.
BEGIN;
SET search_path=app,pg_catalog;
ALTER TABLE report_snapshots DROP CONSTRAINT report_snapshots_company_id_manifest_id_key;
ALTER TABLE report_snapshots ADD COLUMN input_fingerprint text;
ALTER TABLE report_snapshots DISABLE TRIGGER preserve_history;
UPDATE report_snapshots SET input_fingerprint=content_hash WHERE input_fingerprint IS NULL;
ALTER TABLE report_snapshots ENABLE TRIGGER preserve_history;
ALTER TABLE report_snapshots ALTER COLUMN input_fingerprint SET NOT NULL;
CREATE FUNCTION report_input_default() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 NEW.input_fingerprint := coalesce(NEW.input_fingerprint, NEW.content_hash);
 RETURN NEW;
END $$;
CREATE TRIGGER report_input_default BEFORE INSERT ON report_snapshots FOR EACH ROW EXECUTE FUNCTION report_input_default();
ALTER TABLE report_snapshots ADD COLUMN revision_number bigint NOT NULL DEFAULT 1 CHECK(revision_number>0);
ALTER TABLE report_snapshots ADD COLUMN generation_session_id uuid;
ALTER TABLE report_snapshots ADD FOREIGN KEY(company_id,generation_session_id) REFERENCES processing_sessions(company_id,id);
ALTER TABLE report_snapshots ADD COLUMN scope_status text NOT NULL DEFAULT 'limited' CHECK(scope_status IN ('ready','limited'));
CREATE UNIQUE INDEX report_input_once ON report_snapshots(company_id,manifest_id,input_fingerprint);
CREATE UNIQUE INDEX report_edition_once ON report_snapshots(company_id,manifest_id,revision_number);
ALTER TABLE export_jobs ADD COLUMN generation_actor_id uuid REFERENCES users(id);
ALTER TABLE export_jobs ADD COLUMN lease_token uuid;
ALTER TABLE export_jobs ADD COLUMN lease_expires_at timestamptz;
ALTER TABLE export_jobs ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0);
ALTER TABLE export_jobs ADD COLUMN error_code text;
ALTER TABLE export_jobs ADD COLUMN byte_size bigint CHECK(byte_size>0);
CREATE UNIQUE INDEX report_export_once ON export_jobs(company_id,report_id,format) WHERE report_id IS NOT NULL;
CREATE INDEX export_dispatch ON export_jobs(created_at,id) WHERE status IN ('pending','running');
CREATE FUNCTION export_ready_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status='ready' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'ready_export_immutable' USING ERRCODE='23514'; END IF;
 IF NEW.report_id IS DISTINCT FROM OLD.report_id OR NEW.manifest_id IS DISTINCT FROM OLD.manifest_id OR NEW.format IS DISTINCT FROM OLD.format OR NEW.requested_by IS DISTINCT FROM OLD.requested_by THEN RAISE EXCEPTION 'export_input_immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER export_ready_immutable BEFORE UPDATE ON export_jobs FOR EACH ROW EXECUTE FUNCTION export_ready_immutable();
CREATE FUNCTION claim_export_job(claim uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE e export_jobs%ROWTYPE; sid uuid;
BEGIN
 UPDATE export_jobs e1 SET error_code='export_permission_required' WHERE e1.status IN ('pending','running') AND (e1.lease_expires_at IS NULL OR e1.lease_expires_at<=clock_timestamp()) AND e1.error_code IS DISTINCT FROM 'export_permission_required' AND NOT EXISTS(SELECT 1 FROM company_memberships cm JOIN users u ON u.id=cm.user_id WHERE cm.company_id=e1.company_id AND cm.user_id=coalesce(e1.generation_actor_id,e1.requested_by) AND cm.active AND cm.role IN ('owner','finance_manager','advisor_accountant') AND u.disabled_at IS NULL);
 SELECT e1.* INTO e FROM export_jobs e1 JOIN report_snapshots r ON r.id=e1.report_id AND r.company_id=e1.company_id JOIN processing_sessions s ON s.company_id=r.company_id AND s.id=r.generation_session_id
 WHERE e1.report_id IS NOT NULL AND e1.status IN ('pending','running') AND (e1.lease_expires_at IS NULL OR e1.lease_expires_at<=clock_timestamp())
 AND s.analysis_finished_at IS NOT NULL AND s.status NOT IN ('cancelled','failed','expired')
 AND NOT EXISTS(SELECT 1 FROM processing_issues i WHERE i.company_id=s.company_id AND i.session_id=s.id AND i.required AND i.resolved_at IS NULL AND i.superseded_at IS NULL)
 AND EXISTS(SELECT 1 FROM company_memberships cm JOIN users u ON u.id=cm.user_id WHERE cm.company_id=e1.company_id AND cm.user_id=coalesce(e1.generation_actor_id,e1.requested_by) AND cm.active AND cm.role IN ('owner','finance_manager','advisor_accountant') AND u.disabled_at IS NULL)
 ORDER BY e1.created_at,e1.id FOR UPDATE OF e1 SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE export_jobs SET status='running',error_code=NULL,lease_token=claim,lease_expires_at=clock_timestamp()+interval '120 seconds',attempts=attempts+1,row_version=row_version+1 WHERE id=e.id;
 RETURN jsonb_build_object('id',e.id,'company_id',e.company_id,'actor_id',coalesce(e.generation_actor_id,e.requested_by),'report_id',e.report_id,'manifest_id',e.manifest_id,'format',e.format,'claim',claim);
END $$;
REVOKE ALL ON FUNCTION claim_export_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_export_job(uuid) TO didban_worker;
CREATE FUNCTION assert_export_checkpoint(target uuid, claim uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE e export_jobs%ROWTYPE; r report_snapshots%ROWTYPE; s processing_sessions%ROWTYPE;
BEGIN
 PERFORM 1 FROM company_memberships m JOIN users u ON u.id=m.user_id
 WHERE m.company_id=current_company() AND m.user_id=current_actor() AND m.active
 AND m.role IN ('owner','finance_manager','advisor_accountant') AND u.disabled_at IS NULL FOR SHARE OF m,u;
 IF NOT FOUND THEN RAISE EXCEPTION 'export_not_authorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM export_jobs WHERE company_id=current_company() AND id=target;
 SELECT * INTO r FROM report_snapshots WHERE company_id=e.company_id AND id=e.report_id;
 SELECT * INTO s FROM processing_sessions WHERE company_id=r.company_id AND id=r.generation_session_id FOR UPDATE;
 IF s.id IS NULL OR s.status IN ('cancelled','failed') OR s.analysis_finished_at IS NULL OR EXISTS(
  SELECT 1 FROM processing_issues i WHERE i.company_id=s.company_id AND i.session_id=s.id AND i.required AND i.resolved_at IS NULL AND i.superseded_at IS NULL
 ) THEN RAISE EXCEPTION 'export_session_barrier' USING ERRCODE='40001'; END IF;
 SELECT * INTO e FROM export_jobs WHERE company_id=current_company() AND id=target FOR UPDATE;
 IF e.id IS NULL OR coalesce(e.generation_actor_id,e.requested_by) IS DISTINCT FROM current_actor() OR e.status<>'running' OR e.lease_token IS DISTINCT FROM claim OR e.lease_expires_at IS NULL OR e.lease_expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'stale_export_lease' USING ERRCODE='40001'; END IF;
 RETURN r.content_hash;
END $$;
REVOKE ALL ON FUNCTION assert_export_checkpoint(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION assert_export_checkpoint(uuid,uuid) TO didban_worker;
COMMIT;
