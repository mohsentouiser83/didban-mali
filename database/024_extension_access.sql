-- Company-scoped extension permissions. Existing financial grants remain untouched.
BEGIN;
SET search_path=app,pg_catalog;
CREATE TABLE payroll_permissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
 membership_id uuid NOT NULL, membership_version bigint NOT NULL,
 can_view boolean NOT NULL DEFAULT false, can_manage boolean NOT NULL DEFAULT false,
 can_approve boolean NOT NULL DEFAULT false, row_version bigint NOT NULL DEFAULT 2,
 changed_by uuid NOT NULL REFERENCES users(id), reason text NOT NULL CHECK(length(btrim(reason))>0),
 FOREIGN KEY(company_id,membership_id) REFERENCES company_memberships(company_id,id),
 UNIQUE(company_id,membership_id), UNIQUE(company_id,id)
);
CREATE TABLE extension_access_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id),
 actor_id uuid NOT NULL REFERENCES users(id), entity_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 kind text NOT NULL CHECK(kind IN('payroll_permissions','company_modules')),
 before_value jsonb NOT NULL, after_value jsonb NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason))>0), UNIQUE(company_id,id)
);
CREATE FUNCTION payroll_allowed(target uuid, capability text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=app,pg_catalog AS $$
 SELECT coalesce(can_read(target) AND capability IN('view','manage','approve') AND
 (member_role(target)='finance_manager' OR EXISTS (
 SELECT 1 FROM company_memberships m JOIN payroll_permissions p
 ON p.company_id=m.company_id AND p.membership_id=m.id
 WHERE m.company_id=target AND m.user_id=current_actor() AND m.active
 AND m.role IN('owner','advisor_accountant') AND
 CASE capability WHEN 'view' THEN p.can_view WHEN 'manage' THEN p.can_manage WHEN 'approve' THEN p.can_approve ELSE false END)),false)
$$;
CREATE FUNCTION guard_payroll_permission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE m company_memberships%ROWTYPE; BEGIN
 IF NOT coalesce(can_own(NEW.company_id),false) OR NEW.changed_by IS DISTINCT FROM current_actor() THEN
 RAISE EXCEPTION 'owner_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO m FROM company_memberships WHERE company_id=NEW.company_id AND id=NEW.membership_id FOR SHARE;
 IF NOT FOUND OR NOT m.active OR m.role NOT IN('owner','advisor_accountant') OR m.row_version<>NEW.membership_version THEN
 RAISE EXCEPTION 'ineligible_payroll_recipient' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.company_id,NEW.membership_id,NEW.id) IS DISTINCT FROM (OLD.company_id,OLD.membership_id,OLD.id) THEN
 RAISE EXCEPTION 'permission_identity_immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payroll_guard BEFORE INSERT OR UPDATE ON payroll_permissions FOR EACH ROW EXECUTE FUNCTION guard_payroll_permission();
CREATE TRIGGER payroll_version BEFORE UPDATE ON payroll_permissions FOR EACH ROW EXECUTE FUNCTION bump_row_version();
CREATE TRIGGER payroll_no_delete BEFORE DELETE ON payroll_permissions FOR EACH ROW EXECUTE FUNCTION immutable_row();
ALTER TABLE payroll_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY read_owner ON payroll_permissions FOR SELECT USING(can_own(company_id));
CREATE POLICY insert_owner ON payroll_permissions FOR INSERT WITH CHECK(can_own(company_id));
CREATE POLICY update_owner ON payroll_permissions FOR UPDATE USING(can_own(company_id)) WITH CHECK(can_own(company_id));
ALTER TABLE extension_access_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE extension_access_events FORCE ROW LEVEL SECURITY;
CREATE POLICY read_owner ON extension_access_events FOR SELECT USING(can_own(company_id));
CREATE TRIGGER extension_event_immutable BEFORE UPDATE OR DELETE ON extension_access_events FOR EACH ROW EXECUTE FUNCTION immutable_row();
GRANT SELECT,INSERT,UPDATE ON payroll_permissions TO didban_app;
GRANT SELECT ON extension_access_events TO didban_app;
REVOKE ALL ON FUNCTION payroll_allowed(uuid,text),guard_payroll_permission() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payroll_allowed(uuid,text) TO didban_app;
CREATE FUNCTION audit_payroll_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
BEGIN
 INSERT INTO extension_access_events(company_id,actor_id,entity_id,kind,before_value,after_value,reason)
 VALUES(NEW.company_id,current_actor(),NEW.membership_id,'payroll_permissions',
 CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE jsonb_build_object('view',OLD.can_view,'manage',OLD.can_manage,'approve',OLD.can_approve,'membership_version',OLD.membership_version) END,
 jsonb_build_object('view',NEW.can_view,'manage',NEW.can_manage,'approve',NEW.can_approve,'membership_version',NEW.membership_version),NEW.reason);
 RETURN NEW;
END $$;
CREATE TRIGGER payroll_audit AFTER INSERT OR UPDATE ON payroll_permissions FOR EACH ROW EXECUTE FUNCTION audit_payroll_change();
REVOKE ALL ON FUNCTION audit_payroll_change() FROM PUBLIC;
-- Revoke on actual eligibility changes, not unrelated report-permission version bumps.
CREATE FUNCTION revoke_payroll_on_membership_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
BEGIN
 IF (NEW.role,NEW.active) IS DISTINCT FROM (OLD.role,OLD.active) AND OLD.active AND OLD.role IN('owner','advisor_accountant') THEN
 UPDATE payroll_permissions SET can_view=false,can_manage=false,can_approve=false,
 membership_version=OLD.row_version,changed_by=current_actor(),reason='membership eligibility changed'
 WHERE company_id=OLD.company_id AND membership_id=OLD.id AND (can_view OR can_manage OR can_approve);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payroll_membership_revoke BEFORE UPDATE ON company_memberships FOR EACH ROW EXECUTE FUNCTION revoke_payroll_on_membership_change();
REVOKE ALL ON FUNCTION revoke_payroll_on_membership_change() FROM PUBLIC;
COMMIT;
