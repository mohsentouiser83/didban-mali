-- Only confirmed pre-dispatch failures may start another bounded attempt.
BEGIN;
SET search_path=app,pg_catalog;
ALTER TABLE intake_model_proposals ADD COLUMN attempt_number integer NOT NULL DEFAULT 1 CHECK(attempt_number BETWEEN 1 AND 3);
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='app.intake_model_proposals'::regclass AND contype='u'
 AND array_length(conkey,1)=3 LOOP
  EXECUTE format('ALTER TABLE app.intake_model_proposals DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE intake_model_proposals ADD CONSTRAINT intake_model_attempt_identity UNIQUE(company_id,step_id,context_fingerprint,attempt_number);
CREATE OR REPLACE FUNCTION guard_intake_model_proposal() RETURNS trigger LANGUAGE plpgsql SET search_path=app,pg_catalog AS $$
BEGIN
 IF OLD.outcome<>'pending' OR NEW.company_id IS DISTINCT FROM OLD.company_id
 OR NEW.request_id IS DISTINCT FROM OLD.request_id OR NEW.step_id IS DISTINCT FROM OLD.step_id
 OR NEW.source_file_id IS DISTINCT FROM OLD.source_file_id OR NEW.policy_id IS DISTINCT FROM OLD.policy_id
 OR NEW.context_fingerprint IS DISTINCT FROM OLD.context_fingerprint OR NEW.created_at IS DISTINCT FROM OLD.created_at
 OR NEW.attempt_number IS DISTINCT FROM OLD.attempt_number OR NEW.outcome='pending'
 THEN RAISE EXCEPTION 'immutable_model_proposal' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
COMMIT;
