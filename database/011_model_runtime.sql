-- Durable read-only assistant and installation operating-cost boundary.
BEGIN;
SET search_path=app,pg_catalog;
CREATE TABLE model_budget_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 policy_id uuid NOT NULL REFERENCES budget_policies(id)
);
CREATE TABLE model_operations_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 actor_id uuid NOT NULL REFERENCES users(id),action text NOT NULL,target_id uuid NOT NULL,
 safe_details jsonb NOT NULL DEFAULT '{}'
);
ALTER TABLE assistant_questions ADD COLUMN dependency_code text;
ALTER TABLE assistant_questions ADD COLUMN related_path text;
ALTER TABLE assistant_questions ADD COLUMN lease_token uuid;
ALTER TABLE assistant_questions ADD COLUMN lease_expires_at timestamptz;
ALTER TABLE assistant_questions ADD COLUMN fence bigint NOT NULL DEFAULT 0;
ALTER TABLE assistant_questions ADD COLUMN active_model_request_id uuid;
ALTER TABLE model_requests ADD COLUMN assistant_question_id uuid;
ALTER TABLE model_requests ADD COLUMN dispatch_token uuid;
ALTER TABLE model_requests ADD COLUMN provider_response_id text;
ALTER TABLE model_requests ADD COLUMN safe_to_retry boolean NOT NULL DEFAULT false;
ALTER TABLE model_requests ADD COLUMN cost_overrun boolean NOT NULL DEFAULT false;
ALTER TABLE model_requests ADD FOREIGN KEY(company_id,assistant_question_id) REFERENCES assistant_questions(company_id,id);
ALTER TABLE assistant_questions ADD FOREIGN KEY(company_id,active_model_request_id) REFERENCES model_requests(company_id,id);
CREATE INDEX model_dispatch_queue ON outbox_events(available_at,created_at) WHERE published_at IS NULL AND event_kind='assistant.answer';

CREATE POLICY insert_assistant_receipt ON idempotency_records FOR INSERT WITH CHECK(company_id=current_company() AND actor_id=current_actor() AND can_read(company_id) AND (route_key LIKE 'askReadOnlyAssistant:%' OR route_key LIKE 'retryAssistantQuestion:%'));
CREATE POLICY update_expired_assistant_receipt ON idempotency_records FOR UPDATE USING(company_id=current_company() AND actor_id=current_actor() AND can_read(company_id) AND expires_at<=clock_timestamp() AND (route_key LIKE 'askReadOnlyAssistant:%' OR route_key LIKE 'retryAssistantQuestion:%')) WITH CHECK(company_id=current_company() AND actor_id=current_actor() AND can_read(company_id) AND (route_key LIKE 'askReadOnlyAssistant:%' OR route_key LIKE 'retryAssistantQuestion:%'));
CREATE FUNCTION model_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=app,pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM users WHERE id=current_actor() AND is_installation_admin AND disabled_at IS NULL)
$$;
CREATE FUNCTION model_budget_policy(target numeric DEFAULT NULL, expected bigint DEFAULT NULL, create_new boolean DEFAULT false)
RETURNS SETOF budget_policies LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE p budget_policies%ROWTYPE; previous numeric; BEGIN
 IF NOT model_admin() THEN RAISE EXCEPTION 'installation_admin_required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('installation-model-budget',0));
 SELECT b.* INTO p FROM model_budget_settings s JOIN budget_policies b ON b.id=s.policy_id FOR UPDATE OF b;
 IF target IS NULL THEN IF p.id IS NOT NULL THEN RETURN NEXT p; END IF; RETURN; END IF;
 IF target<0 OR scale(target)>8 OR target>=1e12 OR target IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) THEN RAISE EXCEPTION 'invalid_budget' USING ERRCODE='23514'; END IF;
 IF create_new THEN
  IF p.id IS NOT NULL THEN RAISE EXCEPTION 'budget_already_configured' USING ERRCODE='23514'; END IF;
  INSERT INTO budget_policies(scope_company_id,period_kind,ceiling_usd,changed_by) VALUES(NULL,'calendar_month',target,current_actor()) RETURNING * INTO p;
  INSERT INTO model_budget_settings(singleton,policy_id) VALUES(true,p.id);
 ELSE
  IF p.id IS NULL OR p.row_version IS DISTINCT FROM expected THEN RAISE EXCEPTION 'budget_version_conflict' USING ERRCODE='23514'; END IF;
  previous:=p.ceiling_usd;
  PERFORM 1 FROM budget_periods WHERE policy_id=p.id AND starts_at<=clock_timestamp() AND ends_at>clock_timestamp() ORDER BY id FOR UPDATE;
  UPDATE budget_policies SET ceiling_usd=target,changed_by=current_actor(),row_version=row_version+1 WHERE id=p.id RETURNING * INTO p;
  UPDATE budget_periods SET ceiling_usd=target,row_version=row_version+1 WHERE policy_id=p.id AND starts_at<=clock_timestamp() AND ends_at>clock_timestamp();
 END IF;
 INSERT INTO budget_periods(policy_id,starts_at,ends_at,ceiling_usd) VALUES(p.id,date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',(date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')+interval '1 month') AT TIME ZONE 'UTC',target) ON CONFLICT(policy_id,starts_at) DO NOTHING;
 INSERT INTO model_operations_audit(actor_id,action,target_id,safe_details) VALUES(current_actor(),'budget.changed',p.id,jsonb_build_object('previous_ceiling',previous,'ceiling',target,'version',p.row_version));
 RETURN NEXT p;
END $$;
CREATE FUNCTION ensure_model_budget_period() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE p budget_policies%ROWTYPE; BEGIN
 IF NOT coalesce(can_read(current_company()),false) THEN RAISE EXCEPTION 'company_read_required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('installation-model-budget',0));
 SELECT b.* INTO p FROM model_budget_settings s JOIN budget_policies b ON b.id=s.policy_id;
 IF p.id IS NULL THEN RAISE EXCEPTION 'installation_budget_not_configured' USING ERRCODE='23514'; END IF;
 INSERT INTO budget_periods(policy_id,starts_at,ends_at,ceiling_usd) VALUES(p.id,date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',(date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')+interval '1 month') AT TIME ZONE 'UTC',p.ceiling_usd) ON CONFLICT(policy_id,starts_at) DO NOTHING;
END $$;
CREATE FUNCTION read_model_usage(target uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE ceiling numeric:=0; configured boolean:=false; spent numeric:=0; reserved numeric:=0; unknown_usage boolean:=false; start_time timestamptz; end_time timestamptz; BEGIN
 IF target IS NULL THEN IF NOT model_admin() THEN RAISE EXCEPTION 'installation_admin_required' USING ERRCODE='42501'; END IF;
 ELSIF target IS DISTINCT FROM current_company() OR NOT coalesce(can_read(target),false) THEN RAISE EXCEPTION 'company_read_required' USING ERRCODE='42501'; END IF;
 start_time:=date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'; end_time:=start_time+interval '1 month';
 SELECT b.ceiling_usd,true INTO ceiling,configured FROM model_budget_settings s JOIN budget_policies b ON b.id=s.policy_id;
 SELECT coalesce(sum(r.actual_cost_usd),0),coalesce(bool_or(r.billing_status='usage_unknown'),false) INTO spent,unknown_usage FROM model_requests r WHERE (target IS NULL OR r.company_id=target) AND r.created_at>=start_time AND r.created_at<end_time;
 SELECT coalesce(sum(br.reserved_usd),0) INTO reserved FROM budget_reservations br JOIN budget_periods bp ON bp.id=br.budget_period_id JOIN budget_policies pol ON pol.id=bp.policy_id WHERE pol.scope_company_id IS NULL AND (target IS NULL OR br.company_id=target) AND bp.starts_at=start_time AND br.status IN ('held','usage_unknown');
 RETURN jsonb_build_object('period_start',start_time,'period_end',end_time,'currency','USD','ceiling',coalesce(ceiling,0)::text,'reserved',reserved::text,'spent',spent::text,'usage_unknown',unknown_usage,'budget_configured',coalesce(configured,false));
END $$;
CREATE FUNCTION register_model_tariff(provider_name text,model_name text,input_rate numeric,output_rate numeric) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE tariff uuid; BEGIN
 IF NOT coalesce(can_read(current_company()),false) OR provider_name<>'openai' OR length(model_name) NOT BETWEEN 1 AND 200 OR input_rate<0 OR output_rate<0 OR scale(input_rate)>8 OR scale(output_rate)>8 OR input_rate>=1e12 OR output_rate>=1e12 OR input_rate IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) OR output_rate IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) THEN RAISE EXCEPTION 'invalid_model_configuration' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(provider_name||':'||model_name,0));
 SELECT id INTO tariff FROM model_tariffs WHERE provider=provider_name AND model_identifier=model_name AND input_per_million=input_rate AND output_per_million=output_rate ORDER BY effective_at DESC LIMIT 1;
 IF tariff IS NULL THEN INSERT INTO model_tariffs(provider,model_identifier,effective_at,input_per_million,output_per_million) VALUES(provider_name,model_name,clock_timestamp(),input_rate,output_rate) RETURNING id INTO tariff; END IF;
 RETURN tariff;
END $$;
CREATE FUNCTION claim_assistant_job(claim uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE e outbox_events%ROWTYPE; q assistant_questions%ROWTYPE; BEGIN
 SELECT ev.* INTO e FROM outbox_events ev JOIN assistant_questions a ON a.company_id=ev.company_id AND a.id=(ev.payload->>'question_id')::uuid
 WHERE ev.event_kind='assistant.answer' AND ev.published_at IS NULL AND ev.available_at<=clock_timestamp() AND (ev.lease_expires_at IS NULL OR ev.lease_expires_at<=clock_timestamp()) AND a.status IN ('pending','waiting_dependency') ORDER BY ev.available_at,ev.created_at,ev.id FOR UPDATE OF ev SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO q FROM assistant_questions WHERE company_id=e.company_id AND id=(e.payload->>'question_id')::uuid FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM company_memberships m JOIN users u ON u.id=m.user_id WHERE m.company_id=q.company_id AND m.user_id=q.actor_id AND m.active AND u.disabled_at IS NULL) THEN
  UPDATE assistant_questions SET status='failed',dependency_code='permission_revoked',row_version=row_version+1 WHERE id=q.id;
  UPDATE outbox_events SET published_at=clock_timestamp() WHERE id=e.id; RETURN NULL;
 END IF;
 UPDATE outbox_events SET lease_token=claim,lease_expires_at=clock_timestamp()+interval '120 seconds',delivery_attempts=delivery_attempts+1 WHERE id=e.id;
 UPDATE assistant_questions SET lease_token=claim,lease_expires_at=clock_timestamp()+interval '120 seconds',fence=fence+1 WHERE id=q.id;
 RETURN jsonb_build_object('id',e.id,'question_id',q.id,'company_id',q.company_id,'actor_id',q.actor_id,'claim',claim);
END $$;
-- This narrow worker-only receipt completion is allowed after membership revocation.
-- It can settle a dispatched nonce; it cannot read or publish any financial answer.
CREATE FUNCTION finish_model_receipt(request uuid,token uuid,in_tokens integer,out_tokens integer,actual numeric,response_id text,success boolean,retry_safe boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE req model_requests%ROWTYPE; r budget_reservations%ROWTYPE; BEGIN
 SELECT * INTO req FROM model_requests WHERE id=request AND dispatch_token=token FOR UPDATE;
 IF req.id IS NULL THEN RAISE EXCEPTION 'invalid_dispatch_receipt' USING ERRCODE='42501'; END IF;
 IF req.billing_status='settled' THEN RETURN; END IF;
 IF actual IS NOT NULL AND (actual<0 OR scale(actual)>8 OR actual>=1e12 OR actual IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)) THEN RAISE EXCEPTION 'invalid_actual_cost' USING ERRCODE='23514'; END IF;
 FOR r IN SELECT * FROM budget_reservations WHERE company_id=req.company_id AND model_request_id=req.id AND status IN ('held','usage_unknown') ORDER BY budget_period_id LOOP
  PERFORM 1 FROM budget_periods WHERE id=r.budget_period_id FOR UPDATE;
  IF actual IS NULL THEN UPDATE budget_reservations SET status='usage_unknown' WHERE id=r.id;
  ELSE
   UPDATE budget_periods SET reserved_usd=reserved_usd-r.reserved_usd,spent_usd=spent_usd+actual WHERE id=r.budget_period_id;
   UPDATE budget_reservations SET status='settled' WHERE id=r.id;
  END IF;
 END LOOP;
 UPDATE model_requests SET status=CASE WHEN success THEN 'succeeded' ELSE 'failed' END,billing_status=CASE WHEN actual IS NULL THEN 'usage_unknown' ELSE 'settled' END,input_tokens=in_tokens,output_tokens=out_tokens,actual_cost_usd=actual,provider_response_id=response_id,safe_to_retry=retry_safe,cost_overrun=coalesce(actual>(SELECT max(reserved_usd) FROM budget_reservations WHERE company_id=req.company_id AND model_request_id=req.id),false) WHERE id=req.id;
END $$;
CREATE FUNCTION reconcile_model_receipt(request uuid,actual numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE req model_requests%ROWTYPE; r budget_reservations%ROWTYPE; BEGIN
 IF NOT model_admin() THEN RAISE EXCEPTION 'installation_admin_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO req FROM model_requests WHERE id=request FOR UPDATE;
 IF req.id IS NULL OR req.billing_status<>'usage_unknown' THEN RAISE EXCEPTION 'usage_not_unknown' USING ERRCODE='23514'; END IF;
 IF actual IS NULL OR actual<0 OR scale(actual)>8 OR actual>=1e12 OR actual IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) THEN RAISE EXCEPTION 'invalid_actual_cost' USING ERRCODE='23514'; END IF;
 FOR r IN SELECT * FROM budget_reservations WHERE company_id=req.company_id AND model_request_id=req.id AND status='usage_unknown' ORDER BY budget_period_id LOOP
  PERFORM 1 FROM budget_periods WHERE id=r.budget_period_id FOR UPDATE;
  UPDATE budget_periods SET reserved_usd=reserved_usd-r.reserved_usd,spent_usd=spent_usd+actual WHERE id=r.budget_period_id;
  UPDATE budget_reservations SET status='settled' WHERE id=r.id;
 END LOOP;
 UPDATE model_requests SET actual_cost_usd=actual,billing_status='settled',cost_overrun=actual>(SELECT max(reserved_usd) FROM budget_reservations WHERE company_id=req.company_id AND model_request_id=req.id) WHERE id=req.id;
 UPDATE assistant_questions SET dependency_code='model_result_unavailable',row_version=row_version+1 WHERE company_id=req.company_id AND active_model_request_id=req.id AND status='failed' AND dependency_code='usage_unknown';
 INSERT INTO model_operations_audit(actor_id,action,target_id,safe_details) VALUES(current_actor(),'model.usage_reconciled',req.id,jsonb_build_object('actual_cost_usd',actual));
END $$;
CREATE FUNCTION enqueue_assistant_question(question_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE q assistant_questions%ROWTYPE; BEGIN
 SELECT * INTO q FROM assistant_questions WHERE id=question_id AND company_id=current_company() AND actor_id=current_actor() FOR UPDATE;
 IF q.id IS NULL OR NOT coalesce(can_read(q.company_id),false) OR q.status NOT IN ('pending','waiting_dependency') THEN RAISE EXCEPTION 'assistant_question_not_authorized' USING ERRCODE='42501'; END IF;
 INSERT INTO audit_events(company_id,actor_id,action,entity_type,entity_id) VALUES(q.company_id,q.actor_id,'assistant.queued','assistant_question',q.id);
 INSERT INTO outbox_events(company_id,event_kind,dedupe_key,payload) VALUES(q.company_id,'assistant.answer','assistant:'||q.id,jsonb_build_object('question_id',q.id)) ON CONFLICT(company_id,dedupe_key) DO UPDATE SET available_at=clock_timestamp(),published_at=NULL,lease_token=NULL,lease_expires_at=NULL;
END $$;
CREATE FUNCTION complete_assistant_job(event_id uuid,claim uuid,answer text,refs uuid[],path text,dependency text,terminal boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE e outbox_events%ROWTYPE; q assistant_questions%ROWTYPE; live boolean; BEGIN
 SELECT * INTO e FROM outbox_events WHERE id=event_id AND event_kind='assistant.answer' AND lease_token=claim AND lease_expires_at>clock_timestamp() AND published_at IS NULL FOR UPDATE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'stale_assistant_lease' USING ERRCODE='40001'; END IF;
 SELECT * INTO q FROM assistant_questions WHERE company_id=e.company_id AND id=(e.payload->>'question_id')::uuid AND lease_token=claim FOR UPDATE;
 IF q.id IS NULL OR q.actor_id IS DISTINCT FROM current_actor() THEN RAISE EXCEPTION 'stale_assistant_actor' USING ERRCODE='40001'; END IF;
 live:=coalesce(can_read(q.company_id),false);
 IF answer IS NOT NULL AND live THEN
  IF length(answer)>4000 OR EXISTS(SELECT 1 FROM unnest(refs) ref WHERE NOT EXISTS(SELECT 1 FROM evidence ev WHERE ev.company_id=q.company_id AND ev.manifest_id=q.manifest_id AND ev.id=ref)) THEN RAISE EXCEPTION 'invalid_assistant_evidence' USING ERRCODE='23514'; END IF;
  UPDATE assistant_questions SET answer_fa=answer,evidence_ids=refs,related_path=path,status='ready',dependency_code=NULL,lease_token=NULL,lease_expires_at=NULL,row_version=row_version+1 WHERE id=q.id;
 ELSIF NOT live THEN
  UPDATE assistant_questions SET status='failed',dependency_code='permission_revoked',lease_token=NULL,lease_expires_at=NULL,row_version=row_version+1 WHERE id=q.id;
 ELSE
  UPDATE assistant_questions SET status=CASE WHEN terminal THEN 'failed' ELSE 'waiting_dependency' END,dependency_code=dependency,lease_token=NULL,lease_expires_at=NULL,row_version=row_version+1 WHERE id=q.id;
 END IF;
 UPDATE outbox_events SET published_at=CASE WHEN answer IS NOT NULL OR terminal OR NOT live THEN clock_timestamp() ELSE NULL END,available_at=clock_timestamp()+interval '60 seconds',lease_token=NULL,lease_expires_at=NULL WHERE id=e.id;
END $$;
REVOKE ALL ON FUNCTION enqueue_assistant_question(uuid),complete_assistant_job(uuid,uuid,text,uuid[],text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION enqueue_assistant_question(uuid) TO didban_app;
GRANT EXECUTE ON FUNCTION complete_assistant_job(uuid,uuid,text,uuid[],text,text,boolean) TO didban_worker;
CREATE FUNCTION list_uncertain_model_requests(position_time timestamptz,position_id uuid,n integer) RETURNS TABLE(id uuid,created_at timestamptz,reserved_usd numeric) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=app,pg_catalog AS $$
BEGIN
 IF NOT model_admin() THEN RAISE EXCEPTION 'installation_admin_required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT r.id,r.created_at,coalesce((SELECT max(b.reserved_usd) FROM budget_reservations b WHERE b.company_id=r.company_id AND b.model_request_id=r.id),0) FROM model_requests r WHERE r.billing_status='usage_unknown' AND (position_time IS NULL OR (r.created_at,r.id)>(position_time,position_id)) ORDER BY r.created_at,r.id LIMIT least(greatest(n,1),101);
END $$;
REVOKE ALL ON FUNCTION list_uncertain_model_requests(timestamptz,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_uncertain_model_requests(timestamptz,uuid,integer) TO didban_identity;
REVOKE ALL ON FUNCTION model_admin(),model_budget_policy(numeric,bigint,boolean),ensure_model_budget_period(),read_model_usage(uuid),register_model_tariff(text,text,numeric,numeric),claim_assistant_job(uuid),finish_model_receipt(uuid,uuid,integer,integer,numeric,text,boolean,boolean),reconcile_model_receipt(uuid,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION model_admin(),model_budget_policy(numeric,bigint,boolean),read_model_usage(uuid),reconcile_model_receipt(uuid,numeric) TO didban_identity;
GRANT EXECUTE ON FUNCTION read_model_usage(uuid) TO didban_app;
GRANT EXECUTE ON FUNCTION ensure_model_budget_period(),register_model_tariff(text,text,numeric,numeric),claim_assistant_job(uuid),finish_model_receipt(uuid,uuid,integer,integer,numeric,text,boolean,boolean) TO didban_worker;
COMMIT;
