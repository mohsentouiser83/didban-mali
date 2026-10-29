BEGIN;
SET search_path=app,pg_catalog;
CREATE TABLE payroll_employees (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), row_version bigint NOT NULL DEFAULT 1,
 personnel_code text NOT NULL CHECK(length(btrim(personnel_code))>0), profile jsonb NOT NULL,
 changed_by uuid NOT NULL REFERENCES users(id), UNIQUE(company_id,id), UNIQUE(company_id,personnel_code)
);
CREATE TABLE payroll_employee_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), employee_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), actor_id uuid NOT NULL REFERENCES users(id),
 profile jsonb NOT NULL, version bigint NOT NULL, FOREIGN KEY(company_id,employee_id) REFERENCES payroll_employees(company_id,id), UNIQUE(company_id,id)
);
CREATE TABLE payroll_contracts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), employee_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), effective_from date NOT NULL, effective_to date,
 content jsonb NOT NULL, actor_id uuid NOT NULL REFERENCES users(id),
 CHECK(effective_to IS NULL OR effective_to>=effective_from),
 FOREIGN KEY(company_id,employee_id) REFERENCES payroll_employees(company_id,id), UNIQUE(company_id,id)
);
CREATE TABLE payroll_work_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), employee_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), period_start date NOT NULL, period_end date NOT NULL,
 content jsonb NOT NULL, actor_id uuid NOT NULL REFERENCES users(id), revision integer NOT NULL,
 CHECK(period_end>=period_start), FOREIGN KEY(company_id,employee_id) REFERENCES payroll_employees(company_id,id),
 UNIQUE(company_id,employee_id,period_start,period_end,revision), UNIQUE(company_id,id)
);
CREATE TABLE payroll_rule_sets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), effective_from date NOT NULL, effective_to date NOT NULL,
 name text NOT NULL, content jsonb NOT NULL, actor_id uuid NOT NULL REFERENCES users(id),
 CHECK(effective_to>=effective_from), UNIQUE(company_id,id)
);
CREATE TABLE payroll_rule_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), rule_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), actor_id uuid NOT NULL REFERENCES users(id),
 reference text NOT NULL CHECK(length(btrim(reference))>0), fixture_results jsonb NOT NULL,
 FOREIGN KEY(company_id,rule_id) REFERENCES payroll_rule_sets(company_id,id), UNIQUE(company_id,rule_id), UNIQUE(company_id,id)
);
-- Trusted legal acceptance is separate from an operator's arithmetic fixture review.
-- Runtime roles cannot insert these records; verified packs require controlled deployment.
CREATE TABLE payroll_legal_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), rule_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), reviewer_reference text NOT NULL CHECK(length(btrim(reviewer_reference))>0),
 source_manifest jsonb NOT NULL, rule_content_hash text NOT NULL, fixture_manifest jsonb NOT NULL,
 FOREIGN KEY(company_id,rule_id) REFERENCES payroll_rule_sets(company_id,id), UNIQUE(company_id,rule_id), UNIQUE(company_id,id)
);
CREATE TABLE payroll_legal_revocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id),review_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),reason text NOT NULL CHECK(length(btrim(reason))>0),
 FOREIGN KEY(company_id,review_id) REFERENCES payroll_legal_reviews(company_id,id),UNIQUE(company_id,review_id),UNIQUE(company_id,id)
);
ALTER TABLE payroll_legal_revocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_legal_revocations FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_legal_revocation_read ON payroll_legal_revocations FOR SELECT USING(payroll_allowed(company_id,'view'));
GRANT SELECT ON payroll_legal_revocations TO didban_app;
CREATE TRIGGER legal_revocation_history BEFORE UPDATE OR DELETE ON payroll_legal_revocations FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE TABLE payroll_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), period_start date NOT NULL, period_end date NOT NULL,
 kind text NOT NULL CHECK(kind IN('monthly','eidi','sanavat','termination','arrears')),
 rule_id uuid NOT NULL, input_hash text NOT NULL, content jsonb NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id), supersedes_id uuid,
 FOREIGN KEY(company_id,rule_id) REFERENCES payroll_rule_sets(company_id,id),
 FOREIGN KEY(company_id,supersedes_id) REFERENCES payroll_runs(company_id,id),
 CHECK(period_end>=period_start), UNIQUE(company_id,id)
);
CREATE TABLE payroll_run_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), run_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), actor_id uuid NOT NULL REFERENCES users(id), authority text NOT NULL, legal_review_id uuid NOT NULL,
 FOREIGN KEY(company_id,legal_review_id) REFERENCES payroll_legal_reviews(company_id,id),
 FOREIGN KEY(company_id,run_id) REFERENCES payroll_runs(company_id,id), UNIQUE(company_id,run_id), UNIQUE(company_id,id)
);
CREATE TABLE payroll_payment_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), run_id uuid NOT NULL,
 employee_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), actor_id uuid NOT NULL REFERENCES users(id),
 amount money_irr NOT NULL CHECK(amount>0), paid_on date NOT NULL, reference text NOT NULL, bank_movement_id uuid,
 FOREIGN KEY(company_id,run_id) REFERENCES payroll_runs(company_id,id),
 FOREIGN KEY(company_id,employee_id) REFERENCES payroll_employees(company_id,id),
 FOREIGN KEY(company_id,bank_movement_id) REFERENCES bank_movements(company_id,id), UNIQUE(company_id,id)
);
CREATE TABLE payroll_import_previews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), actor_id uuid NOT NULL REFERENCES users(id),
 content jsonb NOT NULL, input_hash text NOT NULL, original_bytes bytea NOT NULL, original_name text NOT NULL, UNIQUE(company_id,id)
);
CREATE TABLE payroll_import_commits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), preview_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), actor_id uuid NOT NULL REFERENCES users(id),
 FOREIGN KEY(company_id,preview_id) REFERENCES payroll_import_previews(company_id,id), UNIQUE(company_id,preview_id), UNIQUE(company_id,id)
);
CREATE FUNCTION payroll_employee_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.id IS DISTINCT FROM OLD.id THEN
 RAISE EXCEPTION 'employee_identity_immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER employee_version BEFORE UPDATE ON payroll_employees FOR EACH ROW EXECUTE FUNCTION bump_row_version();
CREATE TRIGGER employee_guard BEFORE UPDATE ON payroll_employees FOR EACH ROW EXECUTE FUNCTION payroll_employee_version();
CREATE TRIGGER employee_no_delete BEFORE DELETE ON payroll_employees FOR EACH ROW EXECUTE FUNCTION immutable_row();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['payroll_employees','payroll_employee_history','payroll_contracts','payroll_work_records','payroll_rule_sets','payroll_rule_reviews','payroll_runs','payroll_run_approvals','payroll_payment_links','payroll_import_previews','payroll_import_commits'] LOOP
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY payroll_read ON app.%I FOR SELECT USING (app.payroll_allowed(company_id,''view''))',t);
 EXECUTE format('GRANT SELECT,INSERT ON app.%I TO didban_app',t);
 IF t<>'payroll_employees' THEN
 EXECUTE format('CREATE TRIGGER preserve_history BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.immutable_row()',t);
 END IF;
 EXECUTE format('CREATE POLICY payroll_write ON app.%I FOR INSERT WITH CHECK (app.payroll_allowed(company_id,''manage'') AND app.payroll_allowed(company_id,''view''))',t);
 END LOOP;
END $$;
DROP POLICY payroll_write ON payroll_run_approvals;
CREATE POLICY payroll_approve ON payroll_run_approvals FOR INSERT WITH CHECK(payroll_allowed(company_id,'approve') AND payroll_allowed(company_id,'view'));
CREATE POLICY payroll_update ON payroll_employees FOR UPDATE USING(payroll_allowed(company_id,'manage') AND payroll_allowed(company_id,'view')) WITH CHECK(payroll_allowed(company_id,'manage') AND payroll_allowed(company_id,'view'));
GRANT UPDATE ON payroll_employees TO didban_app;
REVOKE ALL ON FUNCTION payroll_employee_version() FROM PUBLIC;
ALTER TABLE payroll_legal_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_legal_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_legal_read ON payroll_legal_reviews FOR SELECT USING(payroll_allowed(company_id,'view'));
GRANT SELECT ON payroll_legal_reviews TO didban_app;
CREATE TRIGGER legal_review_history BEFORE UPDATE OR DELETE ON payroll_legal_reviews FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE FUNCTION guard_payroll_approval() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r payroll_runs%ROWTYPE; item jsonb; latest uuid;
BEGIN
 IF NEW.actor_id IS DISTINCT FROM current_actor() OR NOT payroll_allowed(NEW.company_id,'approve') OR NOT payroll_allowed(NEW.company_id,'view') THEN
 RAISE EXCEPTION 'payroll_approval_forbidden' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.company_id::text||':payroll-approval',0));
 SELECT * INTO r FROM payroll_runs WHERE company_id=NEW.company_id AND id=NEW.run_id;
 FOR item IN SELECT * FROM jsonb_array_elements(r.content->'items') LOOP
 SELECT x.id INTO latest FROM payroll_runs x JOIN payroll_run_approvals a ON a.company_id=x.company_id AND a.run_id=x.id
 WHERE x.company_id=NEW.company_id AND x.period_start<=r.period_end AND x.period_end>=r.period_start AND x.kind=r.kind
 AND x.content->'employee_ids' ? (item->>'employee_id') ORDER BY a.created_at DESC LIMIT 1;
 IF latest IS DISTINCT FROM r.supersedes_id THEN
 RAISE EXCEPTION 'payroll_scope_already_approved' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM payroll_legal_reviews WHERE company_id=NEW.company_id AND id=NEW.legal_review_id AND rule_id=r.rule_id AND NOT EXISTS(SELECT 1 FROM payroll_legal_revocations v WHERE v.company_id=NEW.company_id AND v.review_id=NEW.legal_review_id)) THEN
 RAISE EXCEPTION 'payroll_legal_review_required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payroll_approval_guard BEFORE INSERT ON payroll_run_approvals FOR EACH ROW EXECUTE FUNCTION guard_payroll_approval();
REVOKE ALL ON FUNCTION guard_payroll_approval() FROM PUBLIC;
CREATE UNIQUE INDEX payroll_payment_reference ON payroll_payment_links(company_id,run_id,employee_id,paid_on,reference,amount);
CREATE FUNCTION guard_payroll_payment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r payroll_runs%ROWTYPE; capacity numeric; used numeric; bank bank_movements%ROWTYPE; allocated numeric;
BEGIN
 IF NEW.actor_id IS DISTINCT FROM current_actor() THEN RAISE EXCEPTION 'actor_mismatch' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.company_id::text||':payroll-approval',0));
 SELECT * INTO r FROM payroll_runs WHERE company_id=NEW.company_id AND id=NEW.run_id;
 IF NOT EXISTS(SELECT 1 FROM payroll_run_approvals WHERE company_id=NEW.company_id AND run_id=NEW.run_id) THEN
 RAISE EXCEPTION 'payroll_not_approved' USING ERRCODE='23514'; END IF;
 SELECT (e->'result'->>'net')::numeric INTO capacity FROM jsonb_array_elements(r.content->'items') e WHERE e->>'employee_id'=NEW.employee_id::text;
 IF r.content ? 'delta_items' THEN capacity=(r.content->'delta_items'->>NEW.employee_id::text)::numeric; END IF;
 SELECT coalesce(sum(amount),0) INTO used FROM payroll_payment_links WHERE company_id=NEW.company_id AND run_id=NEW.run_id AND employee_id=NEW.employee_id;
 IF capacity IS NULL OR used+NEW.amount>capacity THEN RAISE EXCEPTION 'payroll_payment_exceeds_capacity' USING ERRCODE='23514'; END IF;
 IF NEW.bank_movement_id IS NOT NULL THEN
 SELECT * INTO bank FROM bank_movements WHERE company_id=NEW.company_id AND id=NEW.bank_movement_id FOR UPDATE;
 SELECT coalesce(sum(amount),0) INTO used FROM payroll_payment_links WHERE company_id=NEW.company_id AND bank_movement_id=NEW.bank_movement_id;
 SELECT coalesce(sum(a.amount),0) INTO allocated FROM allocations a JOIN settlement_events e ON e.company_id=a.company_id AND e.id=a.settlement_event_id
 WHERE a.company_id=NEW.company_id AND e.bank_movement_id=NEW.bank_movement_id AND NOT EXISTS(SELECT 1 FROM allocation_reversals v WHERE v.company_id=a.company_id AND v.allocation_id=a.id);
 IF bank.amount IS NULL OR bank.amount>=0 OR used+allocated+NEW.amount>abs(bank.amount) OR bank.movement_on<>NEW.paid_on THEN
 RAISE EXCEPTION 'payroll_bank_capacity_or_direction' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payroll_payment_guard BEFORE INSERT ON payroll_payment_links FOR EACH ROW EXECUTE FUNCTION guard_payroll_payment();
REVOKE ALL ON FUNCTION guard_payroll_payment() FROM PUBLIC;
CREATE FUNCTION guard_allocation_against_payroll() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE bank_id uuid; bank_amount numeric; payroll_used numeric; invoice_used numeric;
BEGIN
 IF NOT coalesce(can_operate(NEW.company_id),false) THEN RAISE EXCEPTION 'operation_forbidden' USING ERRCODE='42501'; END IF;
 SELECT bank_movement_id INTO bank_id FROM settlement_events WHERE company_id=NEW.company_id AND id=NEW.settlement_event_id;
 IF bank_id IS NOT NULL AND EXISTS(SELECT 1 FROM payroll_payment_links WHERE company_id=NEW.company_id AND bank_movement_id=bank_id) THEN
 SELECT amount INTO bank_amount FROM bank_movements WHERE company_id=NEW.company_id AND id=bank_id FOR UPDATE;
 SELECT coalesce(sum(amount),0) INTO payroll_used FROM payroll_payment_links WHERE company_id=NEW.company_id AND bank_movement_id=bank_id;
 SELECT coalesce(sum(a.amount),0) INTO invoice_used FROM allocations a JOIN settlement_events e ON e.company_id=a.company_id AND e.id=a.settlement_event_id
 WHERE a.company_id=NEW.company_id AND e.bank_movement_id=bank_id AND a.id<>NEW.id AND NOT EXISTS(SELECT 1 FROM allocation_reversals v WHERE v.company_id=a.company_id AND v.allocation_id=a.id);
 IF payroll_used+invoice_used+NEW.amount>abs(bank_amount) THEN RAISE EXCEPTION 'bank_capacity_reserved_for_payroll' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER allocation_payroll_capacity BEFORE INSERT OR UPDATE ON allocations FOR EACH ROW EXECUTE FUNCTION guard_allocation_against_payroll();
REVOKE ALL ON FUNCTION guard_allocation_against_payroll() FROM PUBLIC;
CREATE UNIQUE INDEX payroll_employee_national_identity ON payroll_employees(company_id,(profile->>'national_id')) WHERE coalesce(profile->>'national_id','')<>'';
CREATE UNIQUE INDEX payroll_employee_insurance_identity ON payroll_employees(company_id,(profile->>'insurance_number')) WHERE coalesce(profile->>'insurance_number','')<>'';
CREATE TABLE payroll_financial_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id), run_id uuid NOT NULL,
 obligation_id uuid NOT NULL, plan_id uuid NOT NULL, source_manifest_id uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), actor_id uuid NOT NULL REFERENCES users(id),
 content jsonb NOT NULL, FOREIGN KEY(company_id,run_id) REFERENCES payroll_runs(company_id,id),
 FOREIGN KEY(company_id,obligation_id) REFERENCES obligations(company_id,id),
 FOREIGN KEY(company_id,plan_id) REFERENCES planned_payment_versions(company_id,id),
 FOREIGN KEY(company_id,source_manifest_id) REFERENCES result_manifests(company_id,id),
 UNIQUE(company_id,run_id), UNIQUE(company_id,id)
);
ALTER TABLE payroll_financial_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_financial_links FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_link_read ON payroll_financial_links FOR SELECT USING(payroll_allowed(company_id,'view'));
CREATE POLICY payroll_link_write ON payroll_financial_links FOR INSERT WITH CHECK(payroll_allowed(company_id,'view') AND payroll_allowed(company_id,'manage'));
GRANT SELECT,INSERT ON payroll_financial_links TO didban_app;
CREATE TRIGGER payroll_link_history BEFORE UPDATE OR DELETE ON payroll_financial_links FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE FUNCTION payroll_paid_for_obligation(target uuid,obligation uuid,cutoff date) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE paid numeric; overlap numeric;
BEGIN
 IF NOT coalesce(can_read(target),false) THEN RAISE EXCEPTION 'company_access_required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(sum(p.amount),0) INTO paid FROM payroll_payment_links p JOIN payroll_financial_links l ON l.company_id=p.company_id AND l.run_id=p.run_id
 WHERE l.company_id=target AND l.obligation_id=obligation AND p.paid_on<=cutoff;
 SELECT coalesce(sum(least(q.amount,q.already_settled)),0) INTO overlap FROM (
 SELECT p.bank_movement_id,sum(p.amount) AS amount,(SELECT coalesce(sum(os.amount),0) FROM obligation_settlements os JOIN settlement_events e ON e.company_id=os.company_id AND e.id=os.settlement_event_id
 WHERE os.company_id=target AND os.obligation_id=obligation AND e.bank_movement_id=p.bank_movement_id AND e.settled_on<=cutoff) AS already_settled
 FROM payroll_payment_links p JOIN payroll_financial_links l ON l.company_id=p.company_id AND l.run_id=p.run_id
 WHERE l.company_id=target AND l.obligation_id=obligation AND p.paid_on<=cutoff AND p.bank_movement_id IS NOT NULL GROUP BY p.bank_movement_id) q;
 RETURN paid-overlap;
END $$;
REVOKE ALL ON FUNCTION payroll_paid_for_obligation(uuid,uuid,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payroll_paid_for_obligation(uuid,uuid,date) TO didban_app;
CREATE FUNCTION payroll_actor_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE member company_memberships%ROWTYPE; claimed uuid;
BEGIN
 SELECT * INTO member FROM company_memberships WHERE company_id=NEW.company_id AND user_id=current_actor() AND active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'active_membership_required' USING ERRCODE='42501'; END IF;
 claimed=(to_jsonb(NEW)->>CASE WHEN TG_TABLE_NAME='payroll_employees' THEN 'changed_by' ELSE 'actor_id' END)::uuid;
 IF claimed IS DISTINCT FROM current_actor() OR NOT payroll_allowed(NEW.company_id,'view') THEN RAISE EXCEPTION 'payroll_actor_mismatch' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='payroll_run_approvals' THEN
 IF NOT payroll_allowed(NEW.company_id,'approve') THEN RAISE EXCEPTION 'payroll_approval_required' USING ERRCODE='42501'; END IF;
 ELSIF NOT payroll_allowed(NEW.company_id,'manage') THEN RAISE EXCEPTION 'payroll_manage_required' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='payroll_rule_reviews' AND member.role<>'finance_manager' THEN RAISE EXCEPTION 'finance_manager_required' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['payroll_employees','payroll_employee_history','payroll_contracts','payroll_work_records','payroll_rule_sets','payroll_rule_reviews','payroll_runs','payroll_run_approvals','payroll_payment_links','payroll_import_previews','payroll_import_commits','payroll_financial_links'] LOOP
 EXECUTE format('CREATE TRIGGER payroll_actor_guard BEFORE INSERT OR UPDATE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.payroll_actor_guard()',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION payroll_actor_guard() FROM PUBLIC;
COMMIT;
