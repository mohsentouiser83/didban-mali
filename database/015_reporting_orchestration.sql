-- Shared workflow version after report/retention feature migrations.
BEGIN;
SET search_path=app,pg_catalog;

CREATE FUNCTION terminal_session_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('completed','completed_limited','cancelled','failed')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'terminal_session_cannot_reopen' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER terminal_session_no_reopen BEFORE UPDATE ON processing_sessions
FOR EACH ROW EXECUTE FUNCTION terminal_session_guard();

CREATE OR REPLACE FUNCTION runtime_version() RETURNS integer
LANGUAGE sql IMMUTABLE AS $$ SELECT 10 $$;
COMMIT;
