BEGIN;
SET search_path=app,pg_catalog;
CREATE TABLE policy_configuration_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), policy_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id), reason text NOT NULL CHECK(length(btrim(reason))>0),
 FOREIGN KEY(company_id,policy_id) REFERENCES policy_versions(company_id,id), UNIQUE(company_id,id)
);
CREATE TABLE retention_settings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL UNIQUE REFERENCES companies(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), row_version bigint NOT NULL DEFAULT 1,
 retention_days integer CHECK(retention_days BETWEEN 1 AND 36500), automatic_deletion boolean NOT NULL DEFAULT false CHECK(NOT automatic_deletion),
 changed_by uuid NOT NULL REFERENCES users(id), UNIQUE(company_id,id)
);
CREATE TABLE source_lifecycle_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), entity_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES users(id),
 action text NOT NULL CHECK(action IN('archived','restored','delete_requested','retention_changed')),
 reason text NOT NULL, details jsonb NOT NULL DEFAULT '{}', UNIQUE(company_id,id)
);
CREATE TABLE source_deletion_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), entity_id uuid NOT NULL,
 operation_id uuid NOT NULL, object_key text NOT NULL CHECK(object_key ~ '^[0-9a-f]{32}/[0-9a-f]{32}$' AND split_part(object_key,'/',1)=replace(company_id::text,'-','')),
 actor_id uuid NOT NULL REFERENCES users(id), finished_at timestamptz,
 lease_token uuid, lease_expires_at timestamptz, attempts integer NOT NULL DEFAULT 0,
 FOREIGN KEY(company_id,operation_id) REFERENCES operations(company_id,id), UNIQUE(company_id,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['policy_configuration_events','retention_settings','source_lifecycle_events','source_deletion_jobs'] LOOP
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY read_company ON app.%I FOR SELECT USING (app.can_read(company_id))',t);
  EXECUTE format('CREATE POLICY insert_company ON app.%I FOR INSERT WITH CHECK (app.can_own(company_id))',t);
  EXECUTE format('GRANT SELECT,INSERT ON app.%I TO didban_app',t);
 END LOOP;
END $$;
-- Finance managers may configure financial policies; retention/purge remain owner-only.
DROP POLICY insert_company ON policy_configuration_events;
CREATE POLICY insert_company ON policy_configuration_events FOR INSERT WITH CHECK(member_role(company_id) IN('owner','finance_manager'));
CREATE POLICY update_owner ON retention_settings FOR UPDATE USING(can_own(company_id)) WITH CHECK(can_own(company_id));
GRANT UPDATE ON retention_settings TO didban_app;
CREATE TRIGGER retention_version BEFORE UPDATE ON retention_settings FOR EACH ROW EXECUTE FUNCTION bump_row_version();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON policy_configuration_events FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON source_lifecycle_events FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE FUNCTION source_dependency_rows(target_company uuid,target_file uuid)
RETURNS TABLE(entity_type text,entity_id uuid,reason_code text)
LANGUAGE plpgsql STABLE SET search_path=app,pg_catalog AS $$
DECLARE t record; BEGIN
 FOR t IN SELECT c.table_name FROM information_schema.columns c WHERE c.table_schema='app' AND c.column_name='source_file_id'
  AND EXISTS(SELECT 1 FROM information_schema.columns i WHERE i.table_schema=c.table_schema AND i.table_name=c.table_name AND i.column_name='id') LOOP
  RETURN QUERY EXECUTE format('SELECT %L::text,id,''historical_source_dependency''::text FROM app.%I WHERE company_id=$1 AND source_file_id=$2 ORDER BY id LIMIT 20',t.table_name,t.table_name) USING target_company,target_file;
 END LOOP;
END $$;
-- FK locks on the source prevent racing new dependencies during guarded deletion.
CREATE FUNCTION source_dependency_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=app,pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM source_dependency_rows(OLD.company_id,OLD.id)) THEN
  RAISE EXCEPTION 'source_has_dependencies' USING ERRCODE='23514';
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER source_dependency_guard BEFORE DELETE ON source_files FOR EACH ROW EXECUTE FUNCTION source_dependency_guard();
CREATE FUNCTION claim_source_deletion(claim uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE j source_deletion_jobs%ROWTYPE; BEGIN
 SELECT * INTO j FROM source_deletion_jobs jobs WHERE finished_at IS NULL AND NOT EXISTS(SELECT 1 FROM source_files f WHERE f.company_id=jobs.company_id AND (f.id=jobs.entity_id OR f.object_key=jobs.object_key)) AND (lease_expires_at IS NULL OR lease_expires_at<clock_timestamp())
 ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE source_deletion_jobs SET lease_token=claim,lease_expires_at=clock_timestamp()+interval '60 seconds',attempts=attempts+1 WHERE id=j.id;
 RETURN jsonb_build_object('id',j.id,'company_id',j.company_id,'object_key',j.object_key,'claim',claim);
END $$;
CREATE FUNCTION finish_source_deletion(job_id uuid,claim uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE j source_deletion_jobs%ROWTYPE; BEGIN
 SELECT * INTO j FROM source_deletion_jobs WHERE id=job_id AND lease_token=claim AND finished_at IS NULL AND lease_expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE source_deletion_jobs SET finished_at=clock_timestamp(),lease_token=NULL,lease_expires_at=NULL WHERE id=j.id;
 UPDATE operations SET status='succeeded',finished_at=clock_timestamp() WHERE company_id=j.company_id AND id=j.operation_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION claim_source_deletion(uuid),finish_source_deletion(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_source_deletion(uuid),finish_source_deletion(uuid,uuid) TO didban_worker;
COMMIT;
