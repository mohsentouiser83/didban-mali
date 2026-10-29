BEGIN;
SET search_path=app,pg_catalog;
CREATE TABLE actionable_notification_states (
 company_id uuid NOT NULL REFERENCES companies(id),user_id uuid NOT NULL REFERENCES users(id),scope_key text NOT NULL,signature text NOT NULL,
 PRIMARY KEY(company_id,user_id,scope_key)
);
ALTER TABLE actionable_notification_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE actionable_notification_states FORCE ROW LEVEL SECURITY;
CREATE POLICY read_self ON actionable_notification_states FOR SELECT USING(can_read(company_id) AND user_id=current_actor());
GRANT SELECT ON actionable_notification_states TO didban_app;
CREATE TABLE actionable_maintenance_checks (
 proposal_id uuid PRIMARY KEY,company_id uuid NOT NULL REFERENCES companies(id),checked_at timestamptz NOT NULL DEFAULT '-infinity',
 FOREIGN KEY(company_id,proposal_id) REFERENCES actionable_proposals(company_id,id)
);
ALTER TABLE actionable_maintenance_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE actionable_maintenance_checks FORCE ROW LEVEL SECURITY;
CREATE FUNCTION notify_actionable_at(target uuid, observed_on date) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE p actionable_proposals%ROWTYPE; r report_snapshots%ROWTYPE; recipient record; scope text; sig text; bucket text; due date; today date; sent integer:=0; before_sig text; evidence jsonb; deadline_states jsonb; actionable_due jsonb; changed boolean; deadline record; deadline_scope text;
BEGIN
 IF observed_on IS NOT NULL AND NOT pg_has_role(session_user,'didban_worker','MEMBER') THEN RAISE EXCEPTION 'worker_clock_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM actionable_proposals WHERE id=target;
 IF NOT FOUND OR p.axis='payroll' THEN RETURN 0; END IF;
 IF NOT pg_has_role(session_user,'didban_worker','MEMBER') AND NOT coalesce(can_operate(p.company_id),false) THEN RAISE EXCEPTION 'operation_forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM report_snapshots WHERE company_id=p.company_id AND id=p.report_id;
 SELECT coalesce(observed_on,(clock_timestamp() AT TIME ZONE timezone)::date) INTO today FROM companies WHERE id=p.company_id;
 IF EXISTS(SELECT 1 FROM company_module_settings m WHERE m.company_id=p.company_id AND m.modules->>(CASE p.axis WHEN 'cash' THEN 'cash' WHEN 'balances' THEN 'balances' WHEN 'profit' THEN 'accounting' ELSE NULL END)='false') THEN RETURN 0; END IF;
 IF NOT EXISTS(SELECT 1 FROM company_dataset_heads h WHERE h.company_id=p.company_id AND h.dataset_revision_id::text=r.content->'manifest'->>'dataset_revision_id') THEN RETURN 0; END IF;
 IF r.id<>(SELECT id FROM report_snapshots WHERE company_id=p.company_id ORDER BY created_at DESC,id DESC LIMIT 1) THEN RETURN 0; END IF;
 SELECT coalesce(jsonb_agg(e.value),'[]') INTO actionable_due FROM jsonb_array_elements(coalesce(p.content->'due_evidence','[]')) e
 JOIN invoices i ON i.company_id=p.company_id AND i.id::text=e.value->>'invoice_id'
 WHERE NOT EXISTS(SELECT 1 FROM invoice_adjustments a WHERE a.company_id=i.company_id AND a.invoice_id=i.id)
 AND i.gross-coalesce((SELECT sum(a.amount) FROM allocations a JOIN settlement_events v ON v.company_id=a.company_id AND v.id=a.settlement_event_id WHERE a.company_id=i.company_id AND a.invoice_id=i.id AND v.settled_on<=today AND NOT EXISTS(SELECT 1 FROM allocation_reversals x WHERE x.company_id=a.company_id AND x.allocation_id=a.id)),0)>0;

 SELECT coalesce(jsonb_agg(jsonb_build_object('key',value->>'metric_key','value',value->>'value') ORDER BY value->>'metric_key'),'[]') INTO evidence FROM jsonb_array_elements(p.content->'evidence');
 scope=p.axis||':'||(r.content->'manifest'->>'period_id')||':'||coalesce(r.content->'report_scope'->>'starts_on',r.content->'manifest'->>'starts_on','')||':'||coalesce(r.content->'report_scope'->>'as_of_date',r.content->'manifest'->>'as_of_date','')||':'||coalesce(r.content->'report_scope'->>'metric_basis','ledger');
 sig=CASE WHEN p.content->>'priority'='high' THEN md5(jsonb_build_object('condition',p.content->>'condition_key','values',evidence,'limitations',p.content->'limitations')::text) ELSE 'routine' END;
 FOR recipient IN SELECT m.user_id FROM company_memberships m JOIN users u ON u.id=m.user_id WHERE m.company_id=p.company_id AND m.active AND m.role IN('owner','finance_manager','advisor_accountant') AND u.disabled_at IS NULL FOR SHARE OF m,u LOOP
  changed=false;
  PERFORM pg_advisory_xact_lock(hashtextextended(p.company_id::text||recipient.user_id::text||scope,0));
  SELECT signature INTO before_sig FROM actionable_notification_states WHERE company_id=p.company_id AND user_id=recipient.user_id AND scope_key=scope;
  IF before_sig IS DISTINCT FROM sig THEN
   changed=sig<>'routine';
   INSERT INTO actionable_notification_states(company_id,user_id,scope_key,signature) VALUES(p.company_id,recipient.user_id,scope,sig) ON CONFLICT(company_id,user_id,scope_key) DO UPDATE SET signature=excluded.signature;
  END IF;
  FOR deadline IN SELECT value FROM jsonb_array_elements(actionable_due) LOOP
   bucket=CASE WHEN (deadline.value->>'due_on')::date<today THEN 'overdue' WHEN (deadline.value->>'due_on')::date<=today+coalesce((p.settings_snapshot->>'urgency_days')::integer,7) THEN 'approaching' ELSE 'future' END;
   deadline_scope=scope||':invoice:'||(deadline.value->>'invoice_id');
   SELECT signature INTO before_sig FROM actionable_notification_states WHERE company_id=p.company_id AND user_id=recipient.user_id AND scope_key=deadline_scope;
   IF before_sig IS DISTINCT FROM bucket THEN
    IF bucket<>'future' THEN changed=true; END IF;
    INSERT INTO actionable_notification_states(company_id,user_id,scope_key,signature) VALUES(p.company_id,recipient.user_id,deadline_scope,bucket) ON CONFLICT(company_id,user_id,scope_key) DO UPDATE SET signature=excluded.signature;
   END IF;
  END LOOP;
  IF changed THEN
   INSERT INTO notifications(company_id,user_id,manifest_id,title_fa) VALUES(p.company_id,recipient.user_id,r.manifest_id,'بررسی طبق گزارش: '||(p.content->>'title'));
   sent=sent+1;
  END IF;
 END LOOP;
 RETURN sent;
END $$;
REVOKE ALL ON FUNCTION notify_actionable_at(uuid,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION notify_actionable_at(uuid,date) TO didban_worker;
CREATE FUNCTION notify_actionable(target uuid) RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path=app,pg_catalog AS $$ SELECT notify_actionable_at(target,NULL) $$;
REVOKE ALL ON FUNCTION notify_actionable(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION notify_actionable(uuid) TO didban_app,didban_worker;
CREATE FUNCTION maintain_actionable_due() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE p record; sent integer:=0;
BEGIN
 FOR p IN SELECT a.id,a.company_id FROM actionable_proposals a JOIN report_snapshots r ON r.company_id=a.company_id AND r.id=a.report_id LEFT JOIN actionable_maintenance_checks c ON c.proposal_id=a.id WHERE a.axis<>'payroll' AND jsonb_array_length(coalesce(a.content->'due_evidence','[]'))>0 AND coalesce(c.checked_at,'-infinity')<clock_timestamp()-interval '1 hour' AND r.id=(SELECT rr.id FROM report_snapshots rr WHERE rr.company_id=r.company_id ORDER BY rr.created_at DESC,rr.id DESC LIMIT 1) AND NOT EXISTS(SELECT 1 FROM actionable_followups f WHERE f.company_id=a.company_id AND f.proposal_id=a.id AND f.version=(SELECT max(ff.version) FROM actionable_followups ff WHERE ff.company_id=f.company_id AND ff.proposal_id=f.proposal_id) AND f.status IN('done','rejected')) ORDER BY coalesce(c.checked_at,'-infinity'),a.id LIMIT 20 LOOP
  sent=sent+notify_actionable(p.id);
  INSERT INTO actionable_maintenance_checks(proposal_id,company_id,checked_at) VALUES(p.id,p.company_id,clock_timestamp()) ON CONFLICT(proposal_id) DO UPDATE SET checked_at=excluded.checked_at;
 END LOOP;
 RETURN sent;
END $$;
REVOKE ALL ON FUNCTION maintain_actionable_due() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION maintain_actionable_due() TO didban_worker;
COMMIT;
