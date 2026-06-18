-- Protege clientes ativos (cliente) e ex-clientes (churn) de virarem
-- "lead_visitado" ou "lead_nao_visitado" por engano via interface.
--
-- Cenario que motivou: o webhook do HubSpot sincroniza deals com
-- status='lead_nao_visitado' fixo; quem cuida do app marcou um cliente
-- atual como "visitado". O status correto continuou no HubSpot mas no
-- app virou lead_visitado.
--
-- Duas camadas de defesa:
-- 1) Trigger BEFORE UPDATE: qualquer UPDATE direto em clients que tente
--    transitar de cliente/churn -> lead_* eh bloqueado.
-- 2) RPC mark_client_as_visited: alem da validacao de distancia, ja
--    recusa antes se status atual eh cliente/churn.
--
-- O webhook do HubSpot e cadastros manuais via app continuam funcionando
-- normalmente — a regra so bloqueia transicao saindo de cliente/churn.

CREATE OR REPLACE FUNCTION public.guard_client_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- So bloqueia em UPDATE de status; INSERT eh livre (webhook hubspot)
  IF TG_OP = 'UPDATE'
     AND OLD.status IS DISTINCT FROM NEW.status
     AND OLD.status IN ('cliente', 'churn')
     AND NEW.status IN ('lead_nao_visitado', 'lead_visitado') THEN
    RAISE EXCEPTION
      'Cliente ativo ou ex-cliente nao pode ser marcado como lead. Status atual: %, tentou ir pra: %',
      OLD.status, NEW.status
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_client_status_transition ON public.clients;
CREATE TRIGGER guard_client_status_transition
BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.guard_client_status_transition();

-- Atualiza a RPC mark_client_as_visited pra recusar cliente/churn cedo.
-- Mantem todas as outras validacoes existentes (autenticacao, coords, 50m).
CREATE OR REPLACE FUNCTION public.mark_client_as_visited(
  p_client_id uuid, p_user_lat numeric, p_user_lon numeric
)
RETURNS clients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_client public.clients;
  v_distance_m numeric;
  v_caller uuid := auth.uid();
  v_max_distance_m constant numeric := 50;
  v_visited_slug constant text := 'lead_visitado';
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '28000';
  END IF;

  IF p_user_lat IS NULL OR p_user_lon IS NULL THEN
    RAISE EXCEPTION 'Localização do usuário não informada' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id = p_client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead não encontrado' USING ERRCODE = 'P0002';
  END IF;

  -- Novo guard: cliente atual ou ex-cliente nao deve virar lead_visitado.
  IF v_client.status IN ('cliente', 'churn') THEN
    RAISE EXCEPTION
      'Este registro é % e não pode ser marcado como lead visitado.',
      CASE WHEN v_client.status = 'cliente' THEN 'um cliente ativo'
           ELSE 'um ex-cliente' END
      USING ERRCODE = 'P0001';
  END IF;

  IF v_client.latitude IS NULL OR v_client.longitude IS NULL THEN
    RAISE EXCEPTION 'Lead sem coordenadas — impossível validar proximidade.' USING ERRCODE = 'P0001';
  END IF;

  v_distance_m := 2 * 6371000 * asin(sqrt(
    power(sin(radians((p_user_lat - v_client.latitude) / 2)), 2) +
    cos(radians(v_client.latitude)) * cos(radians(p_user_lat)) *
    power(sin(radians((p_user_lon - v_client.longitude) / 2)), 2)
  ));

  IF v_distance_m > v_max_distance_m THEN
    RAISE EXCEPTION 'Você está a % m do lead (limite: % m). Aproxime-se do local para marcar como visitado.',
      round(v_distance_m, 1), v_max_distance_m
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.allow_visit_status_update', 'on', true);

  UPDATE public.clients
     SET status         = v_visited_slug,
         visited_at     = now(),
         visited_at_lat = p_user_lat,
         visited_at_lon = p_user_lon,
         visited_by     = v_caller,
         updated_by     = v_caller,
         updated_at     = now()
   WHERE id = p_client_id
   RETURNING * INTO v_client;

  RETURN v_client;
END;
$function$;
