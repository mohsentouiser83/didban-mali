-- Database boundary guards. Service protocols remain mandatory; see workflow contract.
BEGIN;
SET search_path = app, pg_catalog;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='didban_app') THEN
    CREATE ROLE didban_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  ELSIF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='didban_app' AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'runtime_role_must_not_bypass_rls';
  END IF;
END $$;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO didban_app;

CREATE FUNCTION current_actor() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;
CREATE FUNCTION current_company() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.company_id', true), '')::uuid
$$;

-- Definer must be the trusted migration owner, never the runtime login. Fixed path.
-- Reading membership through a narrow definer avoids recursive RLS policies.
CREATE FUNCTION member_role(target uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_catalog AS $$
  SELECT m.role FROM company_memberships m JOIN users u ON u.id = m.user_id
  WHERE m.company_id = target AND m.user_id = current_actor()
    AND m.active AND u.disabled_at IS NULL
$$;
CREATE FUNCTION can_read(target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT target = current_company() AND member_role(target) IS NOT NULL
$$;
CREATE FUNCTION can_operate(target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT can_read(target) AND member_role(target) IN ('owner','finance_manager','advisor_accountant')
$$;
CREATE FUNCTION can_own(target uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT can_read(target) AND member_role(target) = 'owner'
$$;
CREATE FUNCTION can_approve(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_catalog AS $$
  SELECT can_read(target) AND (member_role(target) = 'finance_manager' OR EXISTS (
    SELECT 1 FROM company_memberships m JOIN permission_grants p
    ON p.company_id = m.company_id AND p.membership_id = m.id
    WHERE m.company_id = target AND m.user_id = current_actor() AND m.active
      AND m.role IN ('owner','advisor_accountant')
      AND p.permission = 'approve_financial_report' AND p.enabled
  ))
$$;

DO $$ DECLARE t record; write_rule text; read_rule text; BEGIN
  FOR t IN SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'app' AND column_name = 'company_id' LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', t.table_name);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY', t.table_name);
    read_rule := CASE WHEN t.table_name='notifications' THEN 'app.can_read(company_id) AND user_id=app.current_actor()' ELSE 'app.can_read(company_id)' END;
    EXECUTE format('CREATE POLICY read_company ON app.%I FOR SELECT USING (%s)', t.table_name,read_rule);
    write_rule := CASE
      WHEN t.table_name IN ('company_memberships','permission_grants') THEN 'app.can_own(company_id)'
      WHEN t.table_name = 'report_approvals' THEN 'app.can_approve(company_id)'
      WHEN t.table_name = 'notifications' THEN 'app.can_read(company_id) AND user_id = app.current_actor()'
      WHEN t.table_name = 'assistant_questions' THEN 'app.can_read(company_id) AND actor_id = app.current_actor()'
      WHEN t.table_name IN ('model_requests','budget_reservations') THEN 'app.can_read(company_id)'
      ELSE 'app.can_operate(company_id)' END;
    EXECUTE format('CREATE POLICY insert_company ON app.%I FOR INSERT WITH CHECK (%s)', t.table_name, write_rule);
    EXECUTE format('CREATE POLICY update_company ON app.%I FOR UPDATE USING (%s) WITH CHECK (%s)', t.table_name, write_rule, write_rule);
    EXECUTE format('CREATE POLICY delete_company ON app.%I FOR DELETE USING (app.can_own(company_id))', t.table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON app.%I TO didban_app', t.table_name);
  END LOOP;
END $$;
REVOKE INSERT,UPDATE,DELETE ON permission_events FROM didban_app;

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
CREATE POLICY companies_read ON companies FOR SELECT USING (can_read(id));
CREATE POLICY companies_update ON companies FOR UPDATE USING (can_own(id)) WITH CHECK (can_own(id));
GRANT SELECT, UPDATE ON companies TO didban_app;
-- Identity, installation and installation-wide budget tables have no runtime grants.
-- A separate privileged identity/operations boundary must implement those routes.

CREATE FUNCTION immutable_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable_history' USING ERRCODE = '23514'; END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['permission_events','policy_versions','source_rows','interpretation_versions',
    'interpretation_controls','issue_answers','record_revisions','account_role_versions',
    'bank_ledger_link_versions','journal_entries','journal_lines','balance_anchors','bank_movements',
    'invoices','invoice_adjustments','settlement_events','settlement_snapshots','snapshot_settlement_events',
    'allocations','allocation_reversals','planned_payment_versions','obligation_settlements','invoice_snapshots',
    'reference_chains','report_snapshots','report_approvals','decisions','audit_events'] LOOP
    EXECUTE format('CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.immutable_row()', t);
  END LOOP;
END $$;

CREATE FUNCTION source_preservation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND
    (to_jsonb(NEW) - ARRAY['archived_at','row_version','scan_status','raw_row_count','data_row_count']) <>
    (to_jsonb(OLD) - ARRAY['archived_at','row_version','scan_status','raw_row_count','data_row_count'])
  THEN RAISE EXCEPTION 'source_original_immutable' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'DELETE' THEN
    IF NOT can_own(OLD.company_id) THEN RAISE EXCEPTION 'owner_required' USING ERRCODE='42501'; END IF;
    IF EXISTS (SELECT 1 FROM manifest_dependencies WHERE company_id=OLD.company_id AND source_file_id=OLD.id)
       OR EXISTS (SELECT 1 FROM interpretation_versions WHERE company_id=OLD.company_id AND source_file_id=OLD.id)
       OR EXISTS (SELECT 1 FROM session_files WHERE company_id=OLD.company_id AND source_file_id=OLD.id)
    THEN RAISE EXCEPTION 'source_has_dependencies' USING ERRCODE='23514'; END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER source_guard BEFORE UPDATE OR DELETE ON source_files FOR EACH ROW EXECUTE FUNCTION source_preservation();

CREATE FUNCTION permission_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, pg_catalog AS $$
DECLARE recipient_role text; BEGIN
  IF NOT coalesce(can_own(NEW.company_id),false) THEN
    RAISE EXCEPTION 'owner_required_for_permission' USING ERRCODE='42501'; END IF;
  SELECT role INTO recipient_role FROM company_memberships
    WHERE company_id=NEW.company_id AND id=NEW.membership_id AND active FOR UPDATE;
  IF recipient_role IS NULL OR recipient_role NOT IN ('owner','advisor_accountant') THEN
    RAISE EXCEPTION 'ineligible_approval_recipient' USING ERRCODE='23514'; END IF;
  IF NEW.changed_by IS DISTINCT FROM current_actor() THEN
    RAISE EXCEPTION 'actor_mismatch' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND (NEW.membership_id,NEW.company_id,NEW.permission) IS DISTINCT FROM
                       (OLD.membership_id,OLD.company_id,OLD.permission) THEN
    RAISE EXCEPTION 'permission_identity_immutable' USING ERRCODE='23514'; END IF;
  INSERT INTO permission_events(company_id,membership_id,permission,before_enabled,after_enabled,actor_id,reason)
  VALUES(NEW.company_id,NEW.membership_id,NEW.permission,
    CASE WHEN TG_OP='INSERT' THEN false ELSE OLD.enabled END,NEW.enabled,current_actor(),NEW.reason);
  RETURN NEW;
END $$;
CREATE TRIGGER permission_guard BEFORE INSERT OR UPDATE ON permission_grants FOR EACH ROW EXECUTE FUNCTION permission_change();
CREATE TRIGGER permission_no_delete BEFORE DELETE ON permission_grants FOR EACH ROW EXECUTE FUNCTION immutable_row();

CREATE FUNCTION approval_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE grant_event uuid; BEGIN
  PERFORM 1 FROM company_memberships WHERE company_id=NEW.company_id AND user_id=current_actor() AND active FOR SHARE;
  IF NEW.actor_id IS DISTINCT FROM current_actor() OR NOT coalesce(can_approve(NEW.company_id),false) THEN
    RAISE EXCEPTION 'approval_not_authorized' USING ERRCODE='42501'; END IF;
  IF member_role(NEW.company_id)='finance_manager' THEN
    NEW.authority := 'finance_manager'; NEW.permission_event_id := NULL;
  ELSE
    SELECT e.id INTO grant_event FROM permission_events e JOIN company_memberships m
      ON m.id=e.membership_id AND m.company_id=e.company_id
      WHERE e.company_id=NEW.company_id AND m.user_id=current_actor() AND e.after_enabled
      ORDER BY e.created_at DESC,e.id DESC LIMIT 1;
    NEW.authority := 'explicit_company_permission'; NEW.permission_event_id := grant_event;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER report_approval_guard BEFORE INSERT ON report_approvals FOR EACH ROW EXECUTE FUNCTION approval_guard();

CREATE FUNCTION balanced_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; tenant uuid; dr numeric; cr numeric; lines bigint; BEGIN
  IF TG_TABLE_NAME='journal_entries' THEN target:=NEW.id; ELSE target:=NEW.entry_id; END IF;
  tenant := NEW.company_id;
  SELECT count(*),coalesce(sum(debit),0),coalesce(sum(credit),0) INTO lines,dr,cr
    FROM journal_lines WHERE company_id=tenant AND entry_id=target;
  IF lines < 2 OR dr <> cr THEN
    RAISE EXCEPTION 'unbalanced_journal' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER journal_entry_balanced AFTER INSERT ON journal_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION balanced_journal();
CREATE CONSTRAINT TRIGGER journal_lines_balanced AFTER INSERT ON journal_lines
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION balanced_journal();

CREATE FUNCTION allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ev settlement_events%ROWTYPE; inv invoices%ROWTYPE; used_event numeric; used_invoice numeric;
  adjustments numeric; used_bank numeric; bank_amount numeric; BEGIN
  -- Fixed lock order across allocation AND reversal: bank, settlement, invoice.
  SELECT * INTO ev FROM settlement_events WHERE company_id=NEW.company_id AND id=NEW.settlement_event_id;
  IF ev.bank_movement_id IS NOT NULL THEN
    SELECT amount INTO bank_amount FROM bank_movements
      WHERE company_id=NEW.company_id AND id=ev.bank_movement_id FOR UPDATE;
  END IF;
  SELECT * INTO ev FROM settlement_events WHERE company_id=NEW.company_id AND id=NEW.settlement_event_id FOR UPDATE;
  SELECT * INTO inv FROM invoices WHERE company_id=NEW.company_id AND id=NEW.invoice_id FOR UPDATE;
  IF ev.id IS NULL OR inv.id IS NULL OR ev.event_role <> 'financial'
    OR (ev.direction='receipt') <> (inv.direction='sales')
    OR (ev.party_id IS NOT NULL AND ev.party_id <> inv.party_id)
  THEN RAISE EXCEPTION 'allocation_scope_direction' USING ERRCODE='23514'; END IF;
  IF ev.bank_movement_id IS NOT NULL AND (ev.direction='receipt') <> (bank_amount>0) THEN
    RAISE EXCEPTION 'bank_direction_mismatch' USING ERRCODE='23514'; END IF;
  IF NEW.provenance='human' AND NEW.actor_id IS DISTINCT FROM current_actor() THEN
    RAISE EXCEPTION 'actor_mismatch' USING ERRCODE='42501'; END IF;
  SELECT coalesce(sum(a.amount),0) INTO used_event FROM allocations a WHERE a.company_id=NEW.company_id
    AND a.settlement_event_id=ev.id AND NOT EXISTS(SELECT 1 FROM allocation_reversals r WHERE r.company_id=a.company_id AND r.allocation_id=a.id);
  SELECT coalesce(sum(a.amount),0) INTO used_invoice FROM allocations a WHERE a.company_id=NEW.company_id
    AND a.invoice_id=inv.id AND NOT EXISTS(SELECT 1 FROM allocation_reversals r WHERE r.company_id=a.company_id AND r.allocation_id=a.id);
  SELECT coalesce(sum(amount),0) INTO adjustments FROM invoice_adjustments WHERE company_id=NEW.company_id AND invoice_id=inv.id;
  IF used_event+NEW.amount > ev.amount OR used_invoice+NEW.amount > inv.gross+adjustments THEN
    RAISE EXCEPTION 'allocation_capacity_conflict' USING ERRCODE='23514'; END IF;
  IF ev.bank_movement_id IS NOT NULL THEN
    SELECT coalesce(sum(a.amount),0) INTO used_bank FROM allocations a JOIN settlement_events e
      ON e.company_id=a.company_id AND e.id=a.settlement_event_id
      WHERE a.company_id=NEW.company_id AND e.bank_movement_id=ev.bank_movement_id
      AND NOT EXISTS(SELECT 1 FROM allocation_reversals r WHERE r.company_id=a.company_id AND r.allocation_id=a.id);
    IF used_bank+NEW.amount > abs(bank_amount) THEN
      RAISE EXCEPTION 'bank_capacity_conflict' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER allocation_capacity BEFORE INSERT ON allocations FOR EACH ROW EXECUTE FUNCTION allocation_guard();
CREATE FUNCTION reversal_lock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a allocations%ROWTYPE; e settlement_events%ROWTYPE; BEGIN
  SELECT * INTO a FROM allocations WHERE company_id=NEW.company_id AND id=NEW.allocation_id;
  SELECT * INTO e FROM settlement_events WHERE company_id=NEW.company_id AND id=a.settlement_event_id;
  IF e.bank_movement_id IS NOT NULL THEN PERFORM 1 FROM bank_movements WHERE company_id=NEW.company_id AND id=e.bank_movement_id FOR UPDATE; END IF;
  PERFORM 1 FROM settlement_events WHERE company_id=NEW.company_id AND id=a.settlement_event_id FOR UPDATE;
  PERFORM 1 FROM invoices WHERE company_id=NEW.company_id AND id=a.invoice_id FOR UPDATE;
  IF NEW.actor_id IS DISTINCT FROM current_actor() THEN RAISE EXCEPTION 'actor_mismatch' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reversal_capacity BEFORE INSERT ON allocation_reversals FOR EACH ROW EXECUTE FUNCTION reversal_lock();

-- These helpers MUST be called inside the same transaction as each worker effect.
CREATE FUNCTION assert_checkpoint(target_session uuid, expected_version bigint, target_step uuid, expected_fence bigint)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE s processing_sessions%ROWTYPE; st processing_steps%ROWTYPE; BEGIN
  SELECT * INTO s FROM processing_sessions WHERE company_id=current_company() AND id=target_session FOR UPDATE;
  IF s.id IS NULL OR NOT coalesce(can_operate(s.company_id),false) THEN
    RAISE EXCEPTION 'session_not_authorized' USING ERRCODE='42501'; END IF;
  IF s.session_version <> expected_version OR s.status NOT IN ('sealed','processing','waiting_dependency')
    OR EXISTS(SELECT 1 FROM processing_issues WHERE company_id=s.company_id AND session_id=s.id
      AND required AND resolved_at IS NULL AND superseded_at IS NULL)
  THEN RAISE EXCEPTION 'session_barrier_or_version' USING ERRCODE='40001'; END IF;
  SELECT * INTO st FROM processing_steps WHERE company_id=s.company_id AND id=target_step AND session_id=s.id FOR UPDATE;
  IF st.id IS NULL OR st.fence <> expected_fence OR st.status <> 'running'
    OR st.lease_expires_at IS NULL OR st.lease_expires_at <= clock_timestamp()
  THEN RAISE EXCEPTION 'stale_worker_lease' USING ERRCODE='40001'; END IF;
END $$;
CREATE FUNCTION open_required_issue_barrier() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.required AND NEW.resolved_at IS NULL AND NEW.superseded_at IS NULL THEN
    UPDATE processing_sessions SET status='waiting_input', session_version=session_version+1,
      row_version=row_version+1 WHERE company_id=NEW.company_id AND id=NEW.session_id
      AND status NOT IN ('cancelled','completed','completed_limited','failed');
    IF NOT FOUND THEN RAISE EXCEPTION 'terminal_session_issue' USING ERRCODE='40001'; END IF;
    SELECT session_version INTO NEW.opened_session_version FROM processing_sessions
      WHERE company_id=NEW.company_id AND id=NEW.session_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER issue_barrier BEFORE INSERT ON processing_issues FOR EACH ROW EXECUTE FUNCTION open_required_issue_barrier();

CREATE FUNCTION frozen_manifest() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='published' THEN RAISE EXCEPTION 'published_manifest_immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER manifest_freeze BEFORE UPDATE OR DELETE ON result_manifests FOR EACH ROW EXECUTE FUNCTION frozen_manifest();
CREATE FUNCTION frozen_manifest_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mid uuid; tenant uuid; BEGIN
  IF TG_OP='DELETE' THEN mid:=OLD.manifest_id; tenant:=OLD.company_id;
  ELSE mid:=NEW.manifest_id; tenant:=NEW.company_id; END IF;
  IF EXISTS(SELECT 1 FROM result_manifests WHERE company_id=tenant AND id=mid AND status='published' FOR SHARE) THEN
    RAISE EXCEPTION 'published_manifest_child_immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND (NEW.manifest_id,NEW.company_id) IS DISTINCT FROM (OLD.manifest_id,OLD.company_id) THEN
    RAISE EXCEPTION 'manifest_identity_immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['manifest_dependencies','metric_observations','evidence','forecast_days'] LOOP
    EXECUTE format('CREATE TRIGGER manifest_child_freeze BEFORE INSERT OR UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.frozen_manifest_child()',t);
  END LOOP;
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT EXECUTE ON FUNCTION current_actor(),current_company(),member_role(uuid),can_read(uuid),can_operate(uuid),can_own(uuid),can_approve(uuid),assert_checkpoint(uuid,bigint,uuid,bigint) TO didban_app;
COMMIT;
