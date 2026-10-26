BEGIN;
SET search_path=app,pg_catalog;

CREATE FUNCTION bump_row_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.row_version:=OLD.row_version+1; RETURN NEW; END $$;
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT table_name FROM information_schema.columns WHERE table_schema='app' AND column_name='row_version' LOOP
    EXECUTE format('CREATE TRIGGER zz_bump_version BEFORE UPDATE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.bump_row_version()',t.table_name);
  END LOOP;
END $$;

CREATE FUNCTION membership_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM companies WHERE id=OLD.company_id FOR UPDATE;
  IF TG_OP='UPDATE' AND (NEW.company_id,NEW.user_id,NEW.id) IS DISTINCT FROM (OLD.company_id,OLD.user_id,OLD.id) THEN
    RAISE EXCEPTION 'membership_identity_immutable' USING ERRCODE='23514'; END IF;
  IF OLD.role='owner' AND OLD.active AND
    (TG_OP='DELETE' OR NOT NEW.active OR NEW.role<>'owner') AND
    NOT EXISTS(SELECT 1 FROM company_memberships WHERE company_id=OLD.company_id AND role='owner' AND active AND id<>OLD.id)
  THEN RAISE EXCEPTION 'last_owner_required' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER membership_owner_guard BEFORE UPDATE OR DELETE ON company_memberships FOR EACH ROW EXECUTE FUNCTION membership_guard();

CREATE FUNCTION role_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.provenance='validated_automatic' THEN
    IF NEW.actor_id IS NOT NULL OR NEW.evidence IN ('[]'::jsonb,'{}'::jsonb,'null'::jsonb)
      OR NEW.control_results IN ('[]'::jsonb,'{}'::jsonb,'null'::jsonb) THEN
      RAISE EXCEPTION 'automatic_role_requires_controls' USING ERRCODE='23514'; END IF;
    IF NEW.role='unknown' OR (NEW.control_results->>'status') IS DISTINCT FROM 'passed'
      OR jsonb_typeof(NEW.control_results->'checks') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'automatic_role_controls_not_passed' USING ERRCODE='23514'; END IF;
    IF jsonb_array_length(NEW.control_results->'checks')=0 OR EXISTS(
      SELECT 1 FROM jsonb_array_elements(NEW.control_results->'checks') c WHERE c->>'result' IS DISTINCT FROM 'passed') THEN
      RAISE EXCEPTION 'automatic_role_controls_not_passed' USING ERRCODE='23514'; END IF;
    IF EXISTS(SELECT 1 FROM account_role_versions WHERE company_id=NEW.company_id AND account_id=NEW.account_id AND provenance='human') THEN
      RAISE EXCEPTION 'human_role_decision_preserved' USING ERRCODE='23514'; END IF;
  ELSIF NEW.actor_id IS DISTINCT FROM current_actor() THEN
    RAISE EXCEPTION 'actor_mismatch' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validated_account_role BEFORE INSERT ON account_role_versions FOR EACH ROW EXECUTE FUNCTION role_version_guard();

CREATE FUNCTION sealed_revision_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid uuid; tenant uuid; BEGIN
  IF TG_OP='DELETE' THEN rid:=OLD.dataset_revision_id; tenant:=OLD.company_id;
  ELSE rid:=NEW.dataset_revision_id; tenant:=NEW.company_id; END IF;
  IF EXISTS(SELECT 1 FROM dataset_revisions WHERE company_id=tenant AND id=rid AND state<>'building' FOR SHARE) THEN
    RAISE EXCEPTION 'sealed_revision_immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND (NEW.company_id,NEW.dataset_revision_id) IS DISTINCT FROM (OLD.company_id,OLD.dataset_revision_id) THEN
    RAISE EXCEPTION 'revision_identity_immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER revision_membership_freeze BEFORE INSERT OR UPDATE OR DELETE ON revision_records FOR EACH ROW EXECUTE FUNCTION sealed_revision_child();
CREATE TRIGGER revision_coverage_freeze BEFORE INSERT OR UPDATE OR DELETE ON source_coverage FOR EACH ROW EXECUTE FUNCTION sealed_revision_child();
CREATE FUNCTION revision_state_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state<>'building' AND (TG_OP='DELETE' OR NEW.state NOT IN ('sealed','superseded')
      OR (to_jsonb(NEW)-ARRAY['state','row_version'])<>(to_jsonb(OLD)-ARRAY['state','row_version'])) THEN
    RAISE EXCEPTION 'sealed_revision_immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER revision_freeze BEFORE UPDATE OR DELETE ON dataset_revisions FOR EACH ROW EXECUTE FUNCTION revision_state_guard();

CREATE FUNCTION metric_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mid uuid; eid uuid; tenant uuid; BEGIN
  IF TG_OP='DELETE' THEN tenant:=OLD.company_id; mid:=OLD.metric_id; eid:=OLD.evidence_id;
  ELSE tenant:=NEW.company_id; mid:=NEW.metric_id; eid:=NEW.evidence_id; END IF;
  SELECT manifest_id INTO mid FROM metric_observations WHERE company_id=tenant AND id=mid;
  SELECT manifest_id INTO eid FROM evidence WHERE company_id=tenant AND id=eid;
  IF mid IS DISTINCT FROM eid THEN RAISE EXCEPTION 'evidence_manifest_mismatch' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM result_manifests WHERE company_id=tenant AND id=mid AND status='published' FOR SHARE) THEN
    RAISE EXCEPTION 'published_manifest_child_immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'evidence_link_immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER metric_evidence_freeze BEFORE INSERT OR UPDATE OR DELETE ON metric_evidence FOR EACH ROW EXECUTE FUNCTION metric_evidence_guard();

-- Billing is in USD; this is model operating cost, not foreign financial input.
-- Lock request then all applicable budget periods in UUID order.
CREATE FUNCTION reserve_model_budget(request_id uuid, reservation_usd numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE req model_requests%ROWTYPE; b record; n integer:=0; global_found boolean:=false; BEGIN
  IF reservation_usd IS NULL OR reservation_usd < 0 OR scale(reservation_usd)>8
    OR reservation_usd IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) THEN
    RAISE EXCEPTION 'invalid_budget_reservation' USING ERRCODE='23514'; END IF;
  SELECT * INTO req FROM model_requests WHERE company_id=current_company() AND id=request_id FOR UPDATE;
  IF req.id IS NULL OR NOT coalesce(can_read(req.company_id),false) OR req.status<>'reserved' THEN
    RAISE EXCEPTION 'model_request_not_authorized' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM budget_reservations WHERE company_id=req.company_id AND model_request_id=req.id) THEN
    IF EXISTS(SELECT 1 FROM budget_reservations WHERE company_id=req.company_id AND model_request_id=req.id AND reserved_usd<>reservation_usd) THEN
      RAISE EXCEPTION 'reservation_payload_conflict' USING ERRCODE='23514'; END IF;
    RETURN;
  END IF;
  FOR b IN SELECT p.*,pol.scope_company_id FROM budget_periods p JOIN budget_policies pol ON pol.id=p.policy_id
    WHERE (pol.scope_company_id IS NULL OR pol.scope_company_id=req.company_id)
      AND p.starts_at<=clock_timestamp() AND p.ends_at>clock_timestamp() ORDER BY p.id FOR UPDATE OF p LOOP
    IF b.scope_company_id IS NULL THEN global_found:=true; END IF;
    IF b.spent_usd+b.reserved_usd+reservation_usd>b.ceiling_usd THEN
      RAISE EXCEPTION 'budget_exhausted' USING ERRCODE='23514'; END IF;
    UPDATE budget_periods SET reserved_usd=reserved_usd+reservation_usd WHERE id=b.id;
    INSERT INTO budget_reservations(company_id,model_request_id,budget_period_id,reserved_usd,status)
      VALUES(req.company_id,req.id,b.id,reservation_usd,'held');
    n:=n+1;
  END LOOP;
  IF n=0 OR NOT global_found THEN RAISE EXCEPTION 'installation_budget_not_configured' USING ERRCODE='23514'; END IF;
  UPDATE model_requests SET billing_status='held' WHERE id=req.id;
END $$;

CREATE FUNCTION settle_model_budget(request_id uuid, actual_usd numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE req model_requests%ROWTYPE; r record; BEGIN
  SELECT * INTO req FROM model_requests WHERE company_id=current_company() AND id=request_id FOR UPDATE;
  IF req.id IS NULL OR NOT (coalesce(can_read(req.company_id),false) OR EXISTS(
    SELECT 1 FROM users WHERE id=current_actor() AND is_installation_admin AND disabled_at IS NULL)) THEN
    RAISE EXCEPTION 'model_request_not_authorized' USING ERRCODE='42501'; END IF;
  IF actual_usd IS NOT NULL AND (actual_usd<0 OR scale(actual_usd)>8 OR actual_usd IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)) THEN
    RAISE EXCEPTION 'invalid_actual_cost' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM budget_reservations WHERE company_id=req.company_id AND model_request_id=req.id) THEN
    RAISE EXCEPTION 'reservation_required' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM budget_reservations WHERE company_id=req.company_id AND model_request_id=req.id AND status IN ('held','usage_unknown')) THEN
    IF req.actual_cost_usd IS DISTINCT FROM actual_usd THEN RAISE EXCEPTION 'cost_payload_conflict' USING ERRCODE='23514'; END IF;
    RETURN;
  END IF;
  FOR r IN SELECT br.* FROM budget_reservations br WHERE br.company_id=req.company_id AND br.model_request_id=req.id ORDER BY br.budget_period_id LOOP
    PERFORM 1 FROM budget_periods WHERE id=r.budget_period_id FOR UPDATE;
    IF actual_usd IS NULL THEN
      UPDATE budget_reservations SET status='usage_unknown' WHERE id=r.id;
    ELSE
      UPDATE budget_periods SET reserved_usd=reserved_usd-r.reserved_usd,spent_usd=spent_usd+actual_usd WHERE id=r.budget_period_id;
      UPDATE budget_reservations SET status='settled' WHERE id=r.id;
    END IF;
  END LOOP;
  UPDATE model_requests SET actual_cost_usd=actual_usd,billing_status=CASE WHEN actual_usd IS NULL THEN 'usage_unknown' ELSE 'settled' END WHERE id=req.id;
END $$;
REVOKE INSERT,UPDATE,DELETE ON budget_reservations FROM didban_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reserve_model_budget(uuid,numeric),settle_model_budget(uuid,numeric) TO didban_app;
COMMIT;
