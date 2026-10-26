-- Forward migration: runtime identity boundary, durable throttling and replay.
BEGIN;
SET search_path=app,pg_catalog;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='didban_identity') THEN
    CREATE ROLE didban_identity NOLOGIN NOSUPERUSER NOBYPASSRLS;
  ELSIF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='didban_identity' AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'identity_role_must_not_bypass_rls';
  END IF;
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER TABLE users ADD COLUMN activated_at timestamptz;
ALTER TABLE auth_sessions ADD COLUMN user_auth_version bigint NOT NULL DEFAULT 1;
CREATE INDEX active_session_token ON auth_sessions(token_hash) WHERE revoked_at IS NULL;
CREATE TABLE identity_idempotency (
  scope_key text NOT NULL,
  route_key text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  response_encrypted text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(scope_key,route_key,key)
);
CREATE TABLE auth_rate_limits (
  bucket_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL CHECK(attempts > 0)
);
GRANT USAGE ON SCHEMA app TO didban_identity;
GRANT SELECT,INSERT,UPDATE ON users,auth_sessions,identity_tokens,identity_idempotency,auth_rate_limits TO didban_identity;
REVOKE ALL ON identity_idempotency,auth_rate_limits FROM didban_app;

CREATE FUNCTION identity_companies() RETURNS SETOF companies
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=app,pg_catalog AS $$
  SELECT c.* FROM companies c JOIN company_memberships m ON m.company_id=c.id
  JOIN users u ON u.id=m.user_id WHERE m.user_id=current_actor() AND m.active AND u.disabled_at IS NULL
$$;
CREATE FUNCTION identity_create_company(target_name text, target_owner uuid, target_timezone text, target_unit text)
RETURNS SETOF companies LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE c companies%ROWTYPE; BEGIN
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=current_actor() AND is_installation_admin AND disabled_at IS NULL) THEN
    RAISE EXCEPTION 'installation_admin_required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM users WHERE id=target_owner AND disabled_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'owner_not_found' USING ERRCODE='23503'; END IF;
  INSERT INTO companies(name,timezone,display_unit) VALUES(target_name,target_timezone,target_unit) RETURNING * INTO c;
  INSERT INTO company_memberships(company_id,user_id,role) VALUES(c.id,target_owner,'owner');
  INSERT INTO audit_events(company_id,actor_id,action,entity_type,entity_id)
    VALUES(c.id,current_actor(),'company.created','company',c.id);
  RETURN NEXT c;
END $$;
CREATE FUNCTION runtime_version() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 4 $$;
CREATE FUNCTION assert_current_session(target_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
BEGIN
  PERFORM 1 FROM users WHERE id=current_actor() AND disabled_at IS NULL AND activated_at IS NOT NULL FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM auth_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.user_id=current_actor() AND s.token_hash=target_hash AND s.revoked_at IS NULL
      AND s.expires_at>clock_timestamp() AND s.user_auth_version=u.auth_version FOR SHARE OF s;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION identity_companies(),identity_create_company(text,uuid,text,text),runtime_version() FROM PUBLIC;
REVOKE ALL ON FUNCTION assert_current_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION current_actor(),current_company(),identity_companies(),identity_create_company(text,uuid,text,text),runtime_version(),assert_current_session(text) TO didban_identity;
GRANT EXECUTE ON FUNCTION runtime_version(),assert_current_session(text) TO didban_app;
COMMIT;
