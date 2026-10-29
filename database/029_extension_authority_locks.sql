-- Serialize owner authority with concurrent membership revocation.
BEGIN;
SET search_path=app,pg_catalog;
CREATE FUNCTION lock_extension_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
BEGIN
 PERFORM 1 FROM company_memberships WHERE company_id=NEW.company_id
 AND user_id=current_actor() AND active AND role='owner' FOR SHARE;
 IF NOT FOUND OR NEW.company_id IS DISTINCT FROM current_company() THEN
 RAISE EXCEPTION 'current_owner_required' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_owner_authority_lock BEFORE INSERT OR UPDATE ON payroll_permissions FOR EACH ROW EXECUTE FUNCTION lock_extension_owner();
CREATE TRIGGER a_owner_authority_lock BEFORE INSERT OR UPDATE ON company_module_settings FOR EACH ROW EXECUTE FUNCTION lock_extension_owner();
REVOKE ALL ON FUNCTION lock_extension_owner() FROM PUBLIC;
COMMIT;
