-- A command authorized before a self-demotion may finish its own receipt.
-- No financial mutation or read privilege survives loss of membership.
BEGIN;
SET search_path=app,pg_catalog;
CREATE FUNCTION complete_idempotent_command(command_id uuid, http_status integer, receipt jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE command idempotency_records%ROWTYPE; BEGIN
  SELECT * INTO command FROM idempotency_records WHERE id=command_id
    AND company_id=current_company() AND actor_id=current_actor() FOR UPDATE;
  IF command.id IS NULL OR command.state<>'in_progress' THEN
    RAISE EXCEPTION 'command_not_owned' USING ERRCODE='42501'; END IF;
  IF http_status<200 OR http_status>=300 THEN
    RAISE EXCEPTION 'invalid_command_receipt' USING ERRCODE='23514'; END IF;
  UPDATE idempotency_records SET state='completed',response_status=http_status,response_body=receipt
    WHERE id=command.id;
END $$;
REVOKE ALL ON FUNCTION complete_idempotent_command(uuid,integer,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_idempotent_command(uuid,integer,jsonb) TO didban_app;
CREATE OR REPLACE FUNCTION runtime_version() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 5 $$;
COMMIT;
