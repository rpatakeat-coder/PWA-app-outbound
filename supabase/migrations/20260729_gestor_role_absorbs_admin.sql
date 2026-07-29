-- Papel "gestor" de verdade, substituindo o admin hardcoded por e-mail.
--
-- Antes existiam DOIS tiers, ambos identificados por e-mail no codigo/SQL:
--   - is_field_admin()   = 'arthurgothe.takeat@gmail.com' (poder total)
--   - can_view_metrics() = admin + 'outbound@takeat.app' (so metricas)
-- Agora existe UM tier: role='gestor' no profiles, com todos os poderes que
-- eram do admin. Adicionar/remover gestor = UPDATE numa linha, sem deploy.

-- 1) O CHECK antigo so aceitava 'user' | 'view'; libera 'gestor'.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['user'::text, 'view'::text, 'gestor'::text]));

COMMENT ON COLUMN public.profiles.role IS
  'user = vendedor comum | view = somente leitura | gestor = acesso total (ex-admin)';

-- 2) Promove os dois usuarios. Julyan ja era gestor de fato (so metricas);
--    arthurgothe deixa de ser admin por e-mail e passa a ser gestor por role.
UPDATE public.profiles SET role = 'gestor'
 WHERE email IN ('arthurgothe.takeat@gmail.com', 'outbound@takeat.app');

-- 3) is_field_admin() passa a significar "e' gestor". SECURITY DEFINER porque
--    agora le profiles — sem isso a propria RLS de profiles recursaria.
--    Mantido o nome pra nao reescrever as ~20 policies que ja o referenciam.
CREATE OR REPLACE FUNCTION public.is_field_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'gestor'
  );
$$;

-- 4) can_view_metrics() vira alias de is_field_admin(): os dois tiers viraram um.
CREATE OR REPLACE FUNCTION public.can_view_metrics()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.is_field_admin();
$$;

-- 5) profiles: a policy antiga comparava o e-mail direto. Passa a usar o role.
--    "Metrics viewers can view all profiles" (can_view_metrics) ja cobre o
--    gestor via 4), entao a policy de admin por e-mail sai de cena.
DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;

-- 6) force-reload: era exclusivo do e-mail admin; agora qualquer gestor dispara.
DROP POLICY IF EXISTS app_force_reload_admin_update ON public.app_force_reload;
CREATE POLICY app_force_reload_admin_update ON public.app_force_reload
  FOR UPDATE TO authenticated
  USING (public.is_field_admin())
  WITH CHECK (public.is_field_admin());

-- 7) sync de opcoes de etapa: mesma troca de e-mail por role.
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
     AND public.is_field_admin() IS NOT TRUE THEN
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
