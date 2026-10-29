BEGIN;
SET search_path=app,pg_catalog;
ALTER TABLE processing_sessions ADD COLUMN input_review_required boolean NOT NULL DEFAULT false;
ALTER TABLE processing_sessions ALTER COLUMN input_review_required SET DEFAULT true;
CREATE FUNCTION input_review_session_default() RETURNS trigger LANGUAGE plpgsql SET search_path=app,pg_catalog AS $$
BEGIN
 IF NEW.analysis_context->>'purpose'='forecast' THEN NEW.input_review_required=false; ELSE NEW.input_review_required=true; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER input_review_default BEFORE INSERT ON processing_sessions FOR EACH ROW EXECUTE FUNCTION input_review_session_default();
CREATE TABLE input_review_comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
 session_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), snapshot_hash text NOT NULL CHECK(length(snapshot_hash)=64),
 body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 4000),
 file_id uuid, sheet_name text, account_code text,
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','resolved')),
 resolved_by uuid REFERENCES users(id), resolved_at timestamptz, resolution text,
 FOREIGN KEY(company_id,session_id) REFERENCES processing_sessions(company_id,id),
 FOREIGN KEY(company_id,file_id) REFERENCES source_files(company_id,id), UNIQUE(company_id,id)
);
CREATE TABLE input_review_proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
 session_id uuid NOT NULL, comment_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), snapshot_hash text NOT NULL CHECK(length(snapshot_hash)=64),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','proposed','ambiguous','unavailable','usage_unknown','accepted','rejected','stale')),
 content jsonb, context jsonb NOT NULL, model_request_id uuid,
 decided_by uuid REFERENCES users(id), decided_at timestamptz,
 FOREIGN KEY(company_id,session_id) REFERENCES processing_sessions(company_id,id),
 FOREIGN KEY(company_id,comment_id) REFERENCES input_review_comments(company_id,id),
 FOREIGN KEY(company_id,model_request_id) REFERENCES model_requests(company_id,id), UNIQUE(company_id,id)
);
CREATE TABLE input_review_confirmations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
 session_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), snapshot_hash text NOT NULL CHECK(length(snapshot_hash)=64),
 FOREIGN KEY(company_id,session_id) REFERENCES processing_sessions(company_id,id),
 UNIQUE(company_id,session_id,snapshot_hash), UNIQUE(company_id,id)
);
CREATE FUNCTION input_review_hash(target uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=app,pg_catalog AS $$
 SELECT encode(sha256(convert_to(jsonb_build_object('period',s.period_id,'as_of_date',s.as_of_date,'context',s.interpretation_context,
 'files',coalesce((SELECT jsonb_agg(jsonb_build_object('file',sf.source_file_id,'run',sf.interpretation_run_id,'settings',sf.interpretation_settings,'summary',sf.interpretation_summary) ORDER BY sf.source_file_id)
 FROM session_files sf WHERE sf.company_id=s.company_id AND sf.session_id=s.id),'[]'::jsonb))::text,'UTF8')),'hex')
 FROM processing_sessions s WHERE s.id=target AND s.company_id=current_company() AND can_read(s.company_id)
$$;
CREATE FUNCTION input_review_ready(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=app,pg_catalog AS $$
 SELECT coalesce(NOT s.input_review_required OR (s.interpretation_finished_at IS NOT NULL AND
 EXISTS(SELECT 1 FROM input_review_confirmations c WHERE c.company_id=s.company_id AND c.session_id=s.id AND c.snapshot_hash=input_review_hash(s.id)) AND
 NOT EXISTS(SELECT 1 FROM processing_issues i WHERE i.company_id=s.company_id AND i.session_id=s.id AND i.required AND i.resolved_at IS NULL AND i.superseded_at IS NULL) AND
 NOT EXISTS(SELECT 1 FROM input_review_comments c WHERE c.company_id=s.company_id AND c.session_id=s.id AND c.status='open') AND
 NOT EXISTS(SELECT 1 FROM input_review_proposals p WHERE p.company_id=s.company_id AND p.session_id=s.id AND p.status IN('pending','proposed'))),false)
 FROM processing_sessions s WHERE s.id=target AND s.company_id=current_company() AND can_read(s.company_id)
$$;
CREATE FUNCTION input_review_dataset_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=app,pg_catalog AS $$
BEGIN
 IF NOT coalesce(input_review_ready(NEW.session_id),false) THEN RAISE EXCEPTION 'input_review_required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER input_review_dataset_gate BEFORE INSERT ON dataset_revisions FOR EACH ROW EXECUTE FUNCTION input_review_dataset_guard();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['input_review_comments','input_review_proposals','input_review_confirmations'] LOOP
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY read_company ON app.%I FOR SELECT USING(app.can_operate(company_id))',t);
 EXECUTE format('CREATE POLICY insert_company ON app.%I FOR INSERT WITH CHECK(app.can_operate(company_id))',t);
 EXECUTE format('CREATE POLICY update_company ON app.%I FOR UPDATE USING(app.can_operate(company_id)) WITH CHECK(app.can_operate(company_id))',t);
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON app.%I TO didban_app,didban_worker',t);
 EXECUTE format('CREATE TRIGGER preserve_history BEFORE DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.immutable_row()',t);
 END LOOP;
END $$;
REVOKE UPDATE ON input_review_confirmations FROM didban_app,didban_worker;
CREATE TRIGGER confirmation_immutable BEFORE UPDATE ON input_review_confirmations FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE FUNCTION input_review_confirmation_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=app,pg_catalog AS $$
DECLARE s processing_sessions%ROWTYPE; BEGIN
 PERFORM 1 FROM company_memberships WHERE company_id=NEW.company_id AND user_id=current_actor() AND active AND role IN('owner','finance_manager','advisor_accountant') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'review_confirmation_permission_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM processing_sessions WHERE company_id=NEW.company_id AND id=NEW.session_id FOR UPDATE;
 IF NOT can_operate(NEW.company_id) OR NEW.actor_id IS DISTINCT FROM current_actor() OR s.status<>'waiting_dependency' OR s.manifest_id IS NOT NULL OR s.interpretation_finished_at IS NULL OR NEW.snapshot_hash IS DISTINCT FROM input_review_hash(s.id)
 OR EXISTS(SELECT 1 FROM input_review_comments c WHERE c.company_id=s.company_id AND c.session_id=s.id AND c.status='open')
 OR EXISTS(SELECT 1 FROM processing_issues i WHERE i.company_id=s.company_id AND i.session_id=s.id AND i.required AND i.resolved_at IS NULL AND i.superseded_at IS NULL)
 THEN RAISE EXCEPTION 'input_review_not_confirmable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER confirmation_guard BEFORE INSERT ON input_review_confirmations FOR EACH ROW EXECUTE FUNCTION input_review_confirmation_guard();
REVOKE ALL ON FUNCTION input_review_hash(uuid),input_review_ready(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION input_review_hash(uuid),input_review_ready(uuid) TO didban_app,didban_worker;
-- Review jobs have separate claims; model receipt remains durable across stale review versions.
CREATE FUNCTION claim_input_review_job(claim uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE e outbox_events%ROWTYPE; p input_review_proposals%ROWTYPE; s processing_sessions%ROWTYPE; BEGIN
 SELECT * INTO e FROM outbox_events WHERE event_kind='input_review.propose' AND published_at IS NULL AND available_at<=clock_timestamp() AND (lease_expires_at IS NULL OR lease_expires_at<clock_timestamp()) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO p FROM input_review_proposals WHERE company_id=e.company_id AND id=(e.payload->>'proposal_id')::uuid;
 SELECT * INTO s FROM processing_sessions WHERE company_id=e.company_id AND id=e.session_id;
 IF p.status<>'pending' OR s.status IN('completed','completed_limited','cancelled','failed') THEN UPDATE outbox_events SET published_at=clock_timestamp() WHERE id=e.id; RETURN NULL; END IF;
 IF s.status='waiting_input' THEN UPDATE outbox_events SET available_at=clock_timestamp()+interval '10 seconds' WHERE id=e.id; RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM company_memberships m JOIN users u ON u.id=m.user_id WHERE m.company_id=e.company_id AND m.user_id=p.actor_id AND m.active AND m.role IN('owner','finance_manager','advisor_accountant') AND u.disabled_at IS NULL) THEN UPDATE outbox_events SET available_at=clock_timestamp()+interval '30 seconds' WHERE id=e.id; RETURN NULL; END IF;
 UPDATE outbox_events SET lease_token=claim,lease_expires_at=clock_timestamp()+interval '120 seconds',delivery_attempts=delivery_attempts+1 WHERE id=e.id;
 RETURN jsonb_build_object('id',e.id,'company_id',e.company_id,'session_id',e.session_id,'actor_id',p.actor_id,'proposal_id',p.id,'claim',claim);
END $$;
REVOKE ALL ON FUNCTION claim_input_review_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_input_review_job(uuid) TO didban_worker;
CREATE FUNCTION input_review_manifest_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=app,pg_catalog AS $$
DECLARE target uuid; BEGIN
 SELECT session_id INTO target FROM dataset_revisions WHERE company_id=NEW.company_id AND id=NEW.dataset_revision_id;
 IF NOT coalesce(input_review_ready(target),false) THEN RAISE EXCEPTION 'input_review_required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER input_review_manifest_gate BEFORE INSERT OR UPDATE OF status ON result_manifests FOR EACH ROW EXECUTE FUNCTION input_review_manifest_guard();
CREATE FUNCTION input_review_report_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=app,pg_catalog AS $$
DECLARE target uuid; BEGIN
 SELECT d.session_id INTO target FROM result_manifests m JOIN dataset_revisions d ON d.company_id=m.company_id AND d.id=m.dataset_revision_id WHERE m.company_id=NEW.company_id AND m.id=NEW.manifest_id;
 IF NOT coalesce(input_review_ready(target),false) THEN RAISE EXCEPTION 'input_review_required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER input_review_report_gate BEFORE INSERT ON report_snapshots FOR EACH ROW EXECUTE FUNCTION input_review_report_guard();
CREATE FUNCTION input_review_requirement_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=app,pg_catalog AS $$
BEGIN
 IF NEW.input_review_required IS DISTINCT FROM OLD.input_review_required THEN RAISE EXCEPTION 'input_review_requirement_immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER input_review_required_guard BEFORE UPDATE ON processing_sessions FOR EACH ROW EXECUTE FUNCTION input_review_requirement_immutable();
CREATE FUNCTION input_review_comment_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=app,pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.actor_id IS DISTINCT FROM current_actor() OR NEW.status<>'open' THEN RAISE EXCEPTION 'review_comment_actor_mismatch' USING ERRCODE='42501'; END IF;
 ELSE
  IF OLD.status<>'open' OR NEW.status<>'resolved' OR NEW.resolved_by IS DISTINCT FROM current_actor() OR length(btrim(coalesce(NEW.resolution,'')))=0
  OR (to_jsonb(NEW)-ARRAY['status','resolved_by','resolved_at','resolution']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','resolved_by','resolved_at','resolution'])
  THEN RAISE EXCEPTION 'review_comment_history_immutable' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER review_comment_history BEFORE INSERT OR UPDATE ON input_review_comments FOR EACH ROW EXECUTE FUNCTION input_review_comment_guard();
CREATE FUNCTION input_review_proposal_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=app,pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.actor_id IS DISTINCT FROM current_actor() OR NEW.status<>'pending' THEN RAISE EXCEPTION 'review_proposal_actor_mismatch' USING ERRCODE='42501'; END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['status','content','model_request_id','decided_by','decided_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','content','model_request_id','decided_by','decided_at'])
  OR (OLD.model_request_id IS NOT NULL AND NEW.model_request_id IS DISTINCT FROM OLD.model_request_id)
  OR (OLD.status<>'pending' AND NEW.content IS DISTINCT FROM OLD.content)
  OR NOT ((OLD.status='pending' AND NEW.status IN('pending','proposed','ambiguous','unavailable','usage_unknown','stale')) OR (OLD.status='proposed' AND NEW.status IN('accepted','rejected')) OR (OLD.status IN('ambiguous','unavailable','usage_unknown') AND NEW.status='rejected'))
  THEN RAISE EXCEPTION 'review_proposal_history_immutable' USING ERRCODE='23514'; END IF;
  IF NEW.status IN('accepted','rejected') AND NEW.decided_by IS DISTINCT FROM current_actor() THEN RAISE EXCEPTION 'review_decision_actor_mismatch' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER review_proposal_history BEFORE INSERT OR UPDATE ON input_review_proposals FOR EACH ROW EXECUTE FUNCTION input_review_proposal_guard();
COMMIT;
