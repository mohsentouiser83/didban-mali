-- Source lineage inspection expects a stable id on every source-linked entity.
-- Preserve the proposal dispatch identity rather than introducing a second identity.
BEGIN;
SET search_path=app,pg_catalog;
ALTER TABLE intake_model_proposals ADD COLUMN id uuid GENERATED ALWAYS AS (request_id) STORED;
COMMIT;
