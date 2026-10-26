-- Keep provider-specific historical tariffs separate; existing requests are unchanged.
BEGIN;
SET search_path=app,pg_catalog;
CREATE OR REPLACE FUNCTION register_model_tariff(provider_name text,model_name text,input_rate numeric,output_rate numeric) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
DECLARE tariff uuid; BEGIN
 IF NOT coalesce(can_read(current_company()),false) OR provider_name IS NULL OR provider_name NOT IN ('openai','avalai') OR length(model_name) NOT BETWEEN 1 AND 200 OR input_rate<0 OR output_rate<0 OR scale(input_rate)>8 OR scale(output_rate)>8 OR input_rate>=1e12 OR output_rate>=1e12 OR input_rate IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) OR output_rate IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) THEN RAISE EXCEPTION 'invalid_model_configuration' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(provider_name||':'||model_name,0));
 SELECT id INTO tariff FROM model_tariffs WHERE provider=provider_name AND model_identifier=model_name AND input_per_million=input_rate AND output_per_million=output_rate ORDER BY effective_at DESC LIMIT 1;
 IF tariff IS NULL THEN INSERT INTO model_tariffs(provider,model_identifier,effective_at,input_per_million,output_per_million) VALUES(provider_name,model_name,clock_timestamp(),input_rate,output_rate) RETURNING id INTO tariff; END IF;
 RETURN tariff;
END $$;
COMMIT;
