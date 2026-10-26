BEGIN;
SET search_path=app,pg_catalog;
ALTER TABLE planned_payment_versions ADD COLUMN title_snapshot text;
CREATE TABLE settlement_projections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),row_version bigint NOT NULL DEFAULT 1,
 manifest_id uuid NOT NULL, content jsonb NOT NULL,
 UNIQUE(company_id,id),UNIQUE(company_id,manifest_id),
 FOREIGN KEY(company_id,manifest_id) REFERENCES result_manifests(company_id,id)
);
CREATE TABLE settlement_balance_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),row_version bigint NOT NULL DEFAULT 1,
 manifest_id uuid NOT NULL,version bigint NOT NULL CHECK(version>0),content jsonb NOT NULL,
 UNIQUE(company_id,id),UNIQUE(company_id,manifest_id,version),
 FOREIGN KEY(company_id,manifest_id) REFERENCES result_manifests(company_id,id)
);
CREATE TABLE settlement_workspace_heads (
 company_id uuid NOT NULL REFERENCES companies(id),manifest_id uuid NOT NULL,snapshot_id uuid NOT NULL,version bigint NOT NULL,
 PRIMARY KEY(company_id,manifest_id),
 FOREIGN KEY(company_id,manifest_id) REFERENCES result_manifests(company_id,id),
 FOREIGN KEY(company_id,snapshot_id) REFERENCES settlement_balance_snapshots(company_id,id)
);
CREATE TABLE forecast_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),row_version bigint NOT NULL DEFAULT 1,
 manifest_id uuid NOT NULL,session_id uuid NOT NULL,snapshot_id uuid NOT NULL,policy_id uuid NOT NULL,
 input_fingerprint text NOT NULL,inputs jsonb NOT NULL,answers jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL CHECK(status IN ('waiting_input','published')),content jsonb,
 UNIQUE(company_id,id),
 FOREIGN KEY(company_id,manifest_id) REFERENCES result_manifests(company_id,id),
 FOREIGN KEY(company_id,session_id) REFERENCES processing_sessions(company_id,id),
 FOREIGN KEY(company_id,snapshot_id) REFERENCES settlement_balance_snapshots(company_id,id),
 FOREIGN KEY(company_id,policy_id) REFERENCES policy_versions(company_id,id)
);
CREATE INDEX forecast_run_manifest ON forecast_runs(company_id,manifest_id,created_at,id);
CREATE TABLE forecast_question_links (
 company_id uuid NOT NULL REFERENCES companies(id),issue_id uuid NOT NULL,run_id uuid NOT NULL,answer_key text NOT NULL,
 PRIMARY KEY(company_id,issue_id),UNIQUE(company_id,run_id,answer_key),
 FOREIGN KEY(company_id,issue_id) REFERENCES processing_issues(company_id,id),
 FOREIGN KEY(company_id,run_id) REFERENCES forecast_runs(company_id,id)
);
CREATE FUNCTION freeze_forecast_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status='published' THEN RAISE EXCEPTION 'published_forecast_immutable' USING ERRCODE='23514'; END IF;
 IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.manifest_id IS DISTINCT FROM OLD.manifest_id
 OR NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id OR NEW.inputs IS DISTINCT FROM OLD.inputs
 OR NEW.policy_id IS DISTINCT FROM OLD.policy_id OR NEW.input_fingerprint IS DISTINCT FROM OLD.input_fingerprint
 THEN RAISE EXCEPTION 'forecast_inputs_immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER freeze_forecast BEFORE UPDATE ON forecast_runs FOR EACH ROW EXECUTE FUNCTION freeze_forecast_run();
CREATE TRIGGER projection_immutable BEFORE UPDATE OR DELETE ON settlement_projections FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE TRIGGER settlement_snapshot_immutable BEFORE UPDATE OR DELETE ON settlement_balance_snapshots FOR EACH ROW EXECUTE FUNCTION immutable_row();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['settlement_projections','settlement_balance_snapshots','forecast_runs'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY company_read ON %I FOR SELECT USING(app.can_read(company_id))',t);
 EXECUTE format('CREATE POLICY company_insert ON %I FOR INSERT WITH CHECK(app.can_operate(company_id))',t);
 EXECUTE format('GRANT SELECT,INSERT ON %I TO didban_app',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['settlement_workspace_heads','forecast_question_links'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY company_read ON %I FOR SELECT USING(app.can_read(company_id))',t);
 EXECUTE format('CREATE POLICY company_insert ON %I FOR INSERT WITH CHECK(app.can_operate(company_id))',t);
 EXECUTE format('GRANT SELECT,INSERT ON %I TO didban_app',t);
 END LOOP;
END $$;
CREATE POLICY company_update ON settlement_workspace_heads FOR UPDATE USING(app.can_operate(company_id)) WITH CHECK(app.can_operate(company_id));
CREATE POLICY company_update ON forecast_runs FOR UPDATE USING(app.can_operate(company_id)) WITH CHECK(app.can_operate(company_id));
GRANT UPDATE ON settlement_workspace_heads,forecast_runs TO didban_app;
COMMIT;
