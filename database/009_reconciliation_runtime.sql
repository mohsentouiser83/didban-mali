-- Pinned, immutable comparison runs and auditable comparison decisions.
BEGIN;
SET search_path=app,pg_catalog;
ALTER TABLE reconciliation_runs ADD COLUMN missing_source_kinds text[] NOT NULL DEFAULT '{}';
ALTER TABLE reconciliation_runs ADD COLUMN status text NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','limited'));
CREATE UNIQUE INDEX one_reconciliation_per_manifest_kind ON reconciliation_runs(company_id,manifest_id,kind);
CREATE TRIGGER reconciliation_run_immutable BEFORE UPDATE OR DELETE ON reconciliation_runs FOR EACH ROW EXECUTE FUNCTION immutable_row();
ALTER TABLE reconciliation_candidates ADD COLUMN latest_decision_id uuid;
ALTER TABLE reconciliation_candidates ADD COLUMN accepted boolean NOT NULL DEFAULT false;
ALTER TABLE reconciliation_candidates ADD FOREIGN KEY(company_id,latest_decision_id) REFERENCES decisions(company_id,id);
ALTER TABLE decisions ADD COLUMN provenance text NOT NULL DEFAULT 'human' CHECK(provenance IN ('human','validated_automatic','preserved_human'));
ALTER TABLE decisions ADD COLUMN source_decision_id uuid;
ALTER TABLE decisions ADD FOREIGN KEY(company_id,source_decision_id) REFERENCES decisions(company_id,id);
ALTER TABLE decisions ADD CHECK((provenance='preserved_human')=(source_decision_id IS NOT NULL));
CREATE FUNCTION comparison_candidate_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['row_version','latest_decision_id','accepted'])<>(to_jsonb(OLD)-ARRAY['row_version','latest_decision_id','accepted']) THEN
  RAISE EXCEPTION 'comparison_evidence_immutable' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.decisions d WHERE d.company_id=NEW.company_id AND d.id=NEW.latest_decision_id AND d.candidate_id=NEW.id AND NEW.accepted=(d.action='accept')) THEN
  RAISE EXCEPTION 'comparison_decision_mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER comparison_candidate_evidence BEFORE UPDATE OR DELETE ON reconciliation_candidates FOR EACH ROW EXECUTE FUNCTION comparison_candidate_guard();
CREATE TABLE reconciliation_claims (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),row_version bigint NOT NULL DEFAULT 1,
 run_id uuid NOT NULL,normalized_row_id uuid NOT NULL,candidate_id uuid NOT NULL,
 UNIQUE(company_id,id),UNIQUE(company_id,run_id,normalized_row_id),
 FOREIGN KEY(company_id,run_id) REFERENCES reconciliation_runs(company_id,id),
 FOREIGN KEY(company_id,normalized_row_id) REFERENCES normalized_source_rows(company_id,id),
 FOREIGN KEY(company_id,candidate_id) REFERENCES reconciliation_candidates(company_id,id)
);
CREATE INDEX reconciliation_claims_source ON reconciliation_claims(company_id,normalized_row_id);
ALTER TABLE reconciliation_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_claims FORCE ROW LEVEL SECURITY;
CREATE POLICY select_company ON reconciliation_claims FOR SELECT USING(can_read(company_id));
CREATE POLICY insert_company ON reconciliation_claims FOR INSERT WITH CHECK(can_operate(company_id));
CREATE POLICY delete_company ON reconciliation_claims FOR DELETE USING(can_operate(company_id));
GRANT SELECT,INSERT,DELETE ON reconciliation_claims TO didban_app;
ALTER TABLE reconciliation_candidates ADD UNIQUE(company_id,id,run_id);
ALTER TABLE reconciliation_claims ADD FOREIGN KEY(company_id,candidate_id,run_id) REFERENCES reconciliation_candidates(company_id,id,run_id);
CREATE TABLE cashflow_period_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES companies(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),row_version bigint NOT NULL DEFAULT 1,
 manifest_id uuid NOT NULL,payload jsonb NOT NULL,
 UNIQUE(company_id,id),UNIQUE(company_id,manifest_id),
 FOREIGN KEY(company_id,manifest_id) REFERENCES result_manifests(company_id,id)
);
ALTER TABLE cashflow_period_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashflow_period_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY select_company ON cashflow_period_snapshots FOR SELECT USING(can_read(company_id));
CREATE POLICY insert_company ON cashflow_period_snapshots FOR INSERT WITH CHECK(can_operate(company_id));
GRANT SELECT,INSERT ON cashflow_period_snapshots TO didban_app;
CREATE TRIGGER cashflow_snapshot_immutable BEFORE UPDATE OR DELETE ON cashflow_period_snapshots FOR EACH ROW EXECUTE FUNCTION immutable_row();
COMMIT;
