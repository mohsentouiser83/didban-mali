-- Provider proposals have durable dispatch identities and immutable final decisions.
BEGIN;
SET search_path=app,pg_catalog;
CREATE TABLE intake_model_proposals (
 company_id uuid NOT NULL REFERENCES companies(id),
 request_id uuid PRIMARY KEY,
 step_id uuid NOT NULL,
 source_file_id uuid NOT NULL,
 policy_id uuid NOT NULL,
 context_fingerprint text NOT NULL CHECK(length(context_fingerprint)=64),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 outcome text NOT NULL DEFAULT 'pending' CHECK(outcome IN ('pending','accepted','rejected','unavailable','usage_unknown')),
 proposal jsonb,
 UNIQUE(company_id,step_id,context_fingerprint),
 FOREIGN KEY(company_id,request_id) REFERENCES model_requests(company_id,id),
 FOREIGN KEY(company_id,step_id) REFERENCES processing_steps(company_id,id),
 FOREIGN KEY(company_id,source_file_id) REFERENCES source_files(company_id,id),
 FOREIGN KEY(company_id,policy_id) REFERENCES policy_versions(company_id,id)
);
ALTER TABLE intake_model_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_model_proposals FORCE ROW LEVEL SECURITY;
CREATE POLICY read_company ON intake_model_proposals FOR SELECT USING(can_read(company_id));
CREATE POLICY write_company ON intake_model_proposals FOR INSERT WITH CHECK(can_operate(company_id));
CREATE POLICY update_company ON intake_model_proposals FOR UPDATE USING(can_operate(company_id)) WITH CHECK(can_operate(company_id));
GRANT SELECT ON intake_model_proposals TO didban_app;
GRANT SELECT,INSERT,UPDATE ON intake_model_proposals TO didban_worker;
CREATE FUNCTION guard_intake_model_proposal() RETURNS trigger LANGUAGE plpgsql SET search_path=app,pg_catalog AS $$
BEGIN
 IF OLD.outcome<>'pending' OR NEW.company_id IS DISTINCT FROM OLD.company_id
 OR NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.step_id IS DISTINCT FROM OLD.step_id
 OR NEW.source_file_id IS DISTINCT FROM OLD.source_file_id OR NEW.policy_id IS DISTINCT FROM OLD.policy_id
 OR NEW.context_fingerprint IS DISTINCT FROM OLD.context_fingerprint OR NEW.created_at IS DISTINCT FROM OLD.created_at
 OR NEW.outcome='pending' THEN RAISE EXCEPTION 'immutable_model_proposal' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER preserve_final_proposal BEFORE UPDATE ON intake_model_proposals FOR EACH ROW EXECUTE FUNCTION guard_intake_model_proposal();
CREATE TRIGGER preserve_proposal_history BEFORE DELETE ON intake_model_proposals FOR EACH ROW EXECUTE FUNCTION immutable_row();
COMMIT;
