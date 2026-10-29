BEGIN;
SET search_path=app,pg_catalog;
-- Narrow definer locks the actor's own membership without owner-only UPDATE RLS.
CREATE FUNCTION lock_input_review_actor(target uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
BEGIN
 IF target IS DISTINCT FROM current_company() OR NOT coalesce(can_operate(target),false) THEN RETURN false; END IF;
 PERFORM 1 FROM company_memberships m JOIN users u ON u.id=m.user_id WHERE m.company_id=target AND m.user_id=current_actor() AND m.active AND m.role IN('owner','finance_manager','advisor_accountant') AND u.disabled_at IS NULL FOR SHARE OF m;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION lock_input_review_actor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lock_input_review_actor(uuid) TO didban_app,didban_worker;
-- Worker claim is the cleanup capability; revoked requesters must not leave an
-- undecidable pending proposal or cause an already billed call to be repeated.
CREATE FUNCTION complete_input_review_job(target uuid,claim uuid,outcome text,result jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE e outbox_events%ROWTYPE; changed integer; BEGIN
 IF outcome NOT IN('proposed','ambiguous','unavailable','usage_unknown','stale') THEN RAISE EXCEPTION 'invalid_review_outcome' USING ERRCODE='23514'; END IF;
 SELECT * INTO e FROM outbox_events WHERE id=target AND company_id=current_company() AND event_kind='input_review.propose' AND lease_token=claim AND published_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF outcome IN('proposed','ambiguous') AND NOT coalesce(can_operate(e.company_id),false) THEN
  outcome:='unavailable'; result:=jsonb_build_object('reason','دسترسی ثبت‌کننده تغییر کرده است.');
 END IF;
 UPDATE input_review_proposals SET status=outcome,content=result WHERE company_id=e.company_id AND id=(e.payload->>'proposal_id')::uuid AND status='pending';
 GET DIAGNOSTICS changed=ROW_COUNT;
 UPDATE outbox_events SET published_at=clock_timestamp(),lease_token=NULL,lease_expires_at=NULL WHERE id=e.id;
 IF changed<>1 THEN RETURN NULL; END IF;
 RETURN outcome;
END $$;
REVOKE ALL ON FUNCTION complete_input_review_job(uuid,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_input_review_job(uuid,uuid,text,jsonb) TO didban_worker;
CREATE OR REPLACE FUNCTION input_review_confirmation_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=app,pg_catalog AS $$
DECLARE s processing_sessions%ROWTYPE; BEGIN
 IF NOT lock_input_review_actor(NEW.company_id) THEN RAISE EXCEPTION 'review_confirmation_permission_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM processing_sessions WHERE company_id=NEW.company_id AND id=NEW.session_id FOR UPDATE;
 IF NOT can_operate(NEW.company_id) OR NEW.actor_id IS DISTINCT FROM current_actor() OR s.status<>'waiting_dependency' OR s.manifest_id IS NOT NULL OR s.interpretation_finished_at IS NULL OR NEW.snapshot_hash IS DISTINCT FROM input_review_hash(s.id)
 OR EXISTS(SELECT 1 FROM input_review_comments c WHERE c.company_id=s.company_id AND c.session_id=s.id AND c.status='open')
 OR EXISTS(SELECT 1 FROM processing_issues i WHERE i.company_id=s.company_id AND i.session_id=s.id AND i.required AND i.resolved_at IS NULL AND i.superseded_at IS NULL)
 THEN RAISE EXCEPTION 'input_review_not_confirmable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION claim_input_review_job(claim uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE e outbox_events%ROWTYPE; p input_review_proposals%ROWTYPE; s processing_sessions%ROWTYPE; BEGIN
 SELECT * INTO e FROM outbox_events WHERE event_kind='input_review.propose' AND published_at IS NULL AND available_at<=clock_timestamp() AND (lease_expires_at IS NULL OR lease_expires_at<clock_timestamp()) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO p FROM input_review_proposals WHERE company_id=e.company_id AND id=(e.payload->>'proposal_id')::uuid;
 SELECT * INTO s FROM processing_sessions WHERE company_id=e.company_id AND id=e.session_id;
 IF p.status<>'pending' OR s.status IN('completed','completed_limited','cancelled','failed') THEN UPDATE input_review_proposals SET status='stale' WHERE company_id=e.company_id AND id=p.id AND status='pending'; UPDATE outbox_events SET published_at=clock_timestamp() WHERE id=e.id; RETURN NULL; END IF;
 IF s.status='waiting_input' THEN UPDATE outbox_events SET available_at=clock_timestamp()+interval '10 seconds' WHERE id=e.id; RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM company_memberships m JOIN users u ON u.id=m.user_id WHERE m.company_id=e.company_id AND m.user_id=p.actor_id AND m.active AND m.role IN('owner','finance_manager','advisor_accountant') AND u.disabled_at IS NULL) THEN UPDATE input_review_proposals SET status='unavailable',content=jsonb_build_object('reason','دسترسی ثبت‌کننده تغییر کرده است.') WHERE company_id=e.company_id AND id=p.id AND status='pending'; UPDATE outbox_events SET published_at=clock_timestamp() WHERE id=e.id; RETURN NULL; END IF;
 UPDATE outbox_events SET lease_token=claim,lease_expires_at=clock_timestamp()+interval '120 seconds',delivery_attempts=delivery_attempts+1 WHERE id=e.id;
 RETURN jsonb_build_object('id',e.id,'company_id',e.company_id,'session_id',e.session_id,'actor_id',p.actor_id,'proposal_id',p.id,'claim',claim);
END $$;

COMMIT;
