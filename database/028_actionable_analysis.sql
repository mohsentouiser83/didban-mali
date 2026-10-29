BEGIN;
SET search_path=app,pg_catalog;
CREATE TABLE actionable_settings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL UNIQUE REFERENCES companies(id),
 parameters jsonb NOT NULL, row_version bigint NOT NULL DEFAULT 1, actor_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(company_id,id)
);
CREATE TABLE actionable_proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id),
 report_id uuid NOT NULL, axis text NOT NULL CHECK(axis IN('cash','balances','profit','quality','payroll')),
 content jsonb NOT NULL, settings_snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(company_id,id), UNIQUE(company_id,report_id,axis),
 FOREIGN KEY(company_id,report_id) REFERENCES report_snapshots(company_id,id)
);
CREATE TABLE actionable_followups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id),
 proposal_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES users(id),
 status text NOT NULL CHECK(status IN('unreviewed','in_progress','done','rejected')),
 reason text NOT NULL, version bigint NOT NULL CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(company_id,id), UNIQUE(company_id,proposal_id,version),
 CHECK(status<>'rejected' OR length(btrim(reason))>0),
 FOREIGN KEY(company_id,proposal_id) REFERENCES actionable_proposals(company_id,id)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['actionable_settings','actionable_proposals','actionable_followups'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY read_scope ON %I FOR SELECT USING(can_read(company_id) AND (''%s''<>''actionable_proposals'' OR coalesce(to_jsonb(%I)->>''axis'','''')<>''payroll'' OR payroll_allowed(company_id,''view'')))',t,t,t);
 EXECUTE format('CREATE POLICY write_scope ON %I FOR INSERT WITH CHECK(can_operate(company_id))',t);
 EXECUTE format('GRANT SELECT,INSERT ON %I TO didban_app',t);
 END LOOP;
END $$;
DROP POLICY write_scope ON actionable_settings;
CREATE POLICY write_scope ON actionable_settings FOR INSERT WITH CHECK(member_role(company_id)='finance_manager');
CREATE POLICY update_finance ON actionable_settings FOR UPDATE USING(member_role(company_id)='finance_manager') WITH CHECK(member_role(company_id)='finance_manager');
GRANT UPDATE ON actionable_settings TO didban_app;
CREATE TRIGGER settings_version BEFORE UPDATE ON actionable_settings FOR EACH ROW EXECUTE FUNCTION bump_row_version();
CREATE TRIGGER proposal_immutable BEFORE UPDATE OR DELETE ON actionable_proposals FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE TRIGGER followup_immutable BEFORE UPDATE OR DELETE ON actionable_followups FOR EACH ROW EXECUTE FUNCTION immutable_row();
DROP POLICY read_scope ON actionable_followups;
CREATE POLICY read_scope ON actionable_followups FOR SELECT USING(can_read(company_id) AND EXISTS(SELECT 1 FROM actionable_proposals p WHERE p.company_id=actionable_followups.company_id AND p.id=proposal_id));
DROP POLICY write_scope ON actionable_followups;
CREATE POLICY write_scope ON actionable_followups FOR INSERT WITH CHECK(can_operate(company_id) AND actor_id=current_actor() AND EXISTS(SELECT 1 FROM actionable_proposals p WHERE p.company_id=actionable_followups.company_id AND p.id=proposal_id AND (p.axis<>'payroll' OR payroll_allowed(company_id,'manage'))));
CREATE TABLE actionable_evaluations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
 proposal_id uuid NOT NULL, report_id uuid NOT NULL, assessment jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(company_id,id), UNIQUE(company_id,proposal_id,report_id),
 FOREIGN KEY(company_id,proposal_id) REFERENCES actionable_proposals(company_id,id),
 FOREIGN KEY(company_id,report_id) REFERENCES report_snapshots(company_id,id)
);
ALTER TABLE actionable_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE actionable_evaluations FORCE ROW LEVEL SECURITY;
CREATE POLICY read_scope ON actionable_evaluations FOR SELECT USING(can_read(company_id) AND EXISTS(SELECT 1 FROM actionable_proposals p WHERE p.company_id=actionable_evaluations.company_id AND p.id=proposal_id));
CREATE POLICY write_scope ON actionable_evaluations FOR INSERT WITH CHECK(can_operate(company_id) AND EXISTS(SELECT 1 FROM actionable_proposals p WHERE p.company_id=actionable_evaluations.company_id AND p.id=proposal_id));
CREATE TRIGGER evaluation_immutable BEFORE UPDATE OR DELETE ON actionable_evaluations FOR EACH ROW EXECUTE FUNCTION immutable_row();
GRANT SELECT,INSERT ON actionable_evaluations TO didban_app;
CREATE TABLE actionable_settings_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id),
 actor_id uuid NOT NULL REFERENCES users(id),before_value jsonb NOT NULL,after_value jsonb NOT NULL,
 version bigint NOT NULL,reason text NOT NULL CHECK(length(btrim(reason))>0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(company_id,id),UNIQUE(company_id,version)
);
ALTER TABLE actionable_settings_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE actionable_settings_events FORCE ROW LEVEL SECURITY;
CREATE POLICY read_scope ON actionable_settings_events FOR SELECT USING(can_read(company_id));
CREATE POLICY write_scope ON actionable_settings_events FOR INSERT WITH CHECK(member_role(company_id)='finance_manager' AND actor_id=current_actor());
CREATE TRIGGER settings_history_immutable BEFORE UPDATE OR DELETE ON actionable_settings_events FOR EACH ROW EXECUTE FUNCTION immutable_row();
GRANT SELECT,INSERT ON actionable_settings_events TO didban_app;
COMMIT;
