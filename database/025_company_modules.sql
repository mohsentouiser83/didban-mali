BEGIN;
SET search_path=app,pg_catalog;
CREATE TABLE company_module_settings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL UNIQUE REFERENCES companies(id),
 modules jsonb NOT NULL CHECK(jsonb_typeof(modules)='object'),
 row_version bigint NOT NULL DEFAULT 2, changed_by uuid NOT NULL REFERENCES users(id),
 reason text NOT NULL CHECK(length(btrim(reason))>0), UNIQUE(company_id,id)
);
CREATE FUNCTION guard_company_modules() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
BEGIN
 IF NOT coalesce(can_own(NEW.company_id),false) OR NEW.changed_by IS DISTINCT FROM current_actor() THEN
 RAISE EXCEPTION 'owner_required' USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(NEW.modules))<>8 OR EXISTS (
 SELECT 1 FROM jsonb_each(NEW.modules) e WHERE e.key NOT IN('accounting','cash','balances','invoices','settlements','moadian','forecast','payroll') OR jsonb_typeof(e.value)<>'boolean') THEN
 RAISE EXCEPTION 'invalid_module_settings' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id,NEW.company_id) IS DISTINCT FROM (OLD.id,OLD.company_id) THEN
 RAISE EXCEPTION 'module_identity_immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
ALTER TABLE company_module_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_module_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY read_company ON company_module_settings FOR SELECT USING(can_read(company_id));
CREATE POLICY insert_owner ON company_module_settings FOR INSERT WITH CHECK(can_own(company_id));
CREATE POLICY update_owner ON company_module_settings FOR UPDATE USING(can_own(company_id)) WITH CHECK(can_own(company_id));
CREATE TRIGGER modules_guard BEFORE INSERT OR UPDATE ON company_module_settings FOR EACH ROW EXECUTE FUNCTION guard_company_modules();
CREATE TRIGGER modules_version BEFORE UPDATE ON company_module_settings FOR EACH ROW EXECUTE FUNCTION bump_row_version();
CREATE TRIGGER modules_no_delete BEFORE DELETE ON company_module_settings FOR EACH ROW EXECUTE FUNCTION immutable_row();
GRANT SELECT,INSERT,UPDATE ON company_module_settings TO didban_app;
REVOKE ALL ON FUNCTION guard_company_modules() FROM PUBLIC;
CREATE FUNCTION audit_modules_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
BEGIN
 INSERT INTO extension_access_events(company_id,actor_id,entity_id,kind,before_value,after_value,reason)
 VALUES(NEW.company_id,current_actor(),NEW.id,'company_modules',
 CASE WHEN TG_OP='INSERT' THEN '{"accounting":true,"cash":true,"balances":true,"invoices":true,"settlements":true,"moadian":true,"forecast":true,"payroll":false}'::jsonb ELSE OLD.modules END,
 NEW.modules,NEW.reason);
 RETURN NEW;
END $$;
CREATE TRIGGER modules_audit AFTER INSERT OR UPDATE ON company_module_settings FOR EACH ROW EXECUTE FUNCTION audit_modules_change();
REVOKE ALL ON FUNCTION audit_modules_change() FROM PUBLIC;
COMMIT;
