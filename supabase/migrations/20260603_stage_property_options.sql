-- Tabela de configuração das opções de dropdown que cada propriedade
-- obrigatória de etapa do HubSpot recebe. PK (property_name, value) pra
-- upsert idempotente. Source of truth — o app puxa daqui em vez de hardcoded.
CREATE TABLE IF NOT EXISTS public.stage_property_options (
  property_name text NOT NULL,
  property_label text NOT NULL,
  value text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_name, value)
);

ALTER TABLE public.stage_property_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stage_property_options_read" ON public.stage_property_options;
CREATE POLICY "stage_property_options_read"
  ON public.stage_property_options
  FOR SELECT
  TO authenticated
  USING (true);
-- (Sem policy de write — escritas só pela RPC sync_stage_property_options
-- que é SECURITY DEFINER e gateia internamente.)

-- Seed inicial: copia os valores hoje hardcoded no app pra DB não nascer
-- vazia e o app já funcionar logo após a migration.
INSERT INTO public.stage_property_options (property_name, property_label, value, sort_order) VALUES
  ('gargalo_operacional', 'Gargalo Operacional', 'Fila', 0),
  ('gargalo_operacional', 'Gargalo Operacional', 'Falta de Garçom', 1),
  ('gargalo_operacional', 'Gargalo Operacional', 'Falta de Gestão', 2),
  ('gargalo_operacional', 'Gargalo Operacional', 'Sem fidelização', 3),
  ('gargalo_operacional', 'Gargalo Operacional', 'Demora na divisão de contas', 4),
  ('gargalo_operacional', 'Gargalo Operacional', 'Estoque', 5),
  ('origem_do_lead', 'Origem do Lead', 'Rua', 0),
  ('origem_do_lead', 'Origem do Lead', 'Indicação', 1),
  ('origem_do_lead', 'Origem do Lead', 'Casa dos Dados', 2),
  ('origem_do_lead', 'Origem do Lead', 'Instagram', 3),
  ('origem_do_lead', 'Origem do Lead', 'Ads', 4),
  ('origem_do_lead', 'Origem do Lead', 'GoogleMaps', 5),
  ('origem_do_lead', 'Origem do Lead', 'Familia', 6),
  ('origem_do_lead', 'Origem do Lead', 'Eventos', 7),
  ('plano_apresentado', 'Plano Apresentado', 'Básico (PDV + delivery)', 0),
  ('plano_apresentado', 'Plano Apresentado', 'Básico (PDV + mesa + delivery)', 1),
  ('plano_apresentado', 'Plano Apresentado', 'Inovação', 2),
  ('plano_apresentado', 'Plano Apresentado', 'Pro', 3),
  ('plano_apresentado', 'Plano Apresentado', 'Enterprise', 4),
  ('motivo_do_perdido', 'Motivo - Perda (Comercial)', 'Preço', 0),
  ('motivo_do_perdido', 'Motivo - Perda (Comercial)', 'Funcionalidade', 1),
  ('motivo_do_perdido', 'Motivo - Perda (Comercial)', 'Sem retorno', 2),
  ('motivo_do_perdido', 'Motivo - Perda (Comercial)', 'Reembolso', 3),
  ('motivo_do_perdido', 'Motivo - Perda (Comercial)', 'Não quer mudar de sistema', 4),
  ('motivo_do_perdido', 'Motivo - Perda (Comercial)', 'Outros', 5)
ON CONFLICT (property_name, value) DO NOTHING;

-- Habilita realtime pra mobile reagir a mudanças sem precisar de reload manual
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='stage_property_options'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.stage_property_options';
  END IF;
END $$;

-- RPC pra sync idempotente. Recebe o payload no formato que o usuário
-- desenhou ([{data:[{label,name,options:[{value}]}]}]) e:
--   1. Upserta os values novos / atualiza label e sort_order
--   2. Deleta values que não estão mais no payload (dentro da prop)
-- Não toca em propriedades que não estiverem no payload — pra mexer numa
-- propriedade ela precisa estar listada.
CREATE OR REPLACE FUNCTION public.sync_stage_property_options(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  data_arr jsonb;
  prop jsonb;
  opt jsonb;
  v_name text;
  v_label text;
  v_value text;
  v_order int;
  incoming_values text[];
  total_props int := 0;
  total_options int := 0;
  total_deleted int := 0;
  deleted_now int;
BEGIN
  -- Autorização: service_role (curl direto) OU Arthur autenticado.
  IF auth.role() <> 'service_role'
     AND COALESCE(auth.jwt() ->> 'email', '') <> 'arthurgothe.takeat@gmail.com' THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  -- Normaliza payload: aceita array wrap ou objeto direto.
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
      IF v_value IS NULL THEN CONTINUE; END IF;
      INSERT INTO public.stage_property_options
        (property_name, property_label, value, sort_order, updated_at)
      VALUES (v_name, v_label, v_value, v_order, now())
      ON CONFLICT (property_name, value) DO UPDATE
        SET property_label = EXCLUDED.property_label,
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
$func$;

GRANT EXECUTE ON FUNCTION public.sync_stage_property_options(jsonb)
  TO authenticated, service_role;
