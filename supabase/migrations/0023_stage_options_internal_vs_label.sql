-- stage_property_options ganha display_label pra distinguir entre o
-- internal value (vai no payload pro HubSpot) e o label de exibicao
-- (mostrado no app).
--
-- Antes: 1 coluna `value` continha tanto internal quanto display, e a
-- sync mandava o LABEL como `value` — o webhook enviava "Inovação" em vez
-- de "inovacao". HubSpot rejeitava ou setava o deal com valor errado.
--
-- Backward compat: display_label nullable. Quando NULL, a UI usa `value`
-- (estado atual). Re-rodar sync_stage_property_options com payload que
-- inclui {value, label} popula tudo correto.

ALTER TABLE public.stage_property_options
  ADD COLUMN IF NOT EXISTS display_label text;

CREATE OR REPLACE FUNCTION public.sync_stage_property_options(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  data_arr jsonb;
  prop jsonb;
  opt jsonb;
  v_name text;
  v_label text;
  v_value text;
  v_display_label text;
  v_order int;
  incoming_values text[];
  total_props int := 0;
  total_options int := 0;
  total_deleted int := 0;
  deleted_now int;
BEGIN
  IF auth.role() <> 'service_role'
     AND COALESCE(auth.jwt() ->> 'email', '') <> 'arthurgothe.takeat@gmail.com' THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  IF jsonb_typeof(payload) = 'array' THEN
    data_arr := payload->0->'data';
  ELSE
    data_arr := payload->'data';
  END IF;

  IF data_arr IS NULL OR jsonb_typeof(data_arr) <> 'array' THEN
    RAISE EXCEPTION 'Payload inválido: esperado [{data:[...]}] ou {data:[...]}';
  END IF;

  FOR prop IN SELECT * FROM jsonb_array_elements(data_arr) LOOP
    total_props := total_props + 1;
    v_name := prop->>'name';
    v_label := prop->>'label';

    IF v_name IS NULL OR v_label IS NULL THEN
      RAISE EXCEPTION 'Propriedade sem name ou label';
    END IF;

    SELECT array_agg(opt_inner->>'value')
      INTO incoming_values
      FROM jsonb_array_elements(prop->'options') AS opt_inner;
    IF incoming_values IS NULL THEN
      incoming_values := ARRAY[]::text[];
    END IF;

    DELETE FROM public.stage_property_options
     WHERE property_name = v_name
       AND value <> ALL (incoming_values);
    GET DIAGNOSTICS deleted_now = ROW_COUNT;
    total_deleted := total_deleted + deleted_now;

    v_order := 0;
    FOR opt IN SELECT * FROM jsonb_array_elements(prop->'options') LOOP
      v_value := opt->>'value';
      -- Aceita tanto opt.label quanto opt.display_label como fonte do display.
      -- Se nao vier nada, deixa NULL (UI cai pro value mesmo — backward compat).
      v_display_label := COALESCE(opt->>'display_label', opt->>'label');
      IF v_value IS NULL THEN CONTINUE; END IF;
      INSERT INTO public.stage_property_options
        (property_name, property_label, value, display_label, sort_order, updated_at)
      VALUES (v_name, v_label, v_value, v_display_label, v_order, now())
      ON CONFLICT (property_name, value) DO UPDATE
        SET property_label = EXCLUDED.property_label,
            display_label  = EXCLUDED.display_label,
            sort_order     = EXCLUDED.sort_order,
            updated_at     = EXCLUDED.updated_at;
      total_options := total_options + 1;
      v_order := v_order + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'properties', total_props,
    'options_upserted', total_options,
    'options_deleted', total_deleted
  );
END;
$function$;
