-- Historico de visitas: um lead pode ser visitado quantas vezes for preciso.
-- Antes, clients.visited_at guardava so a ULTIMA visita (uma linha por lead),
-- entao revisita sobrescrevia a anterior e o relatorio do gestor via 1 visita
-- por lead. Agora cada visita vira uma linha em client_visits; clients mantem
-- visited_at/visited_by (ultima visita, usado pelos filtros do mapa) + o
-- contador desnormalizado visit_count pra lista/card nao precisar de join.

CREATE TABLE IF NOT EXISTS public.client_visits (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  visited_at     timestamptz NOT NULL DEFAULT now(),
  visited_at_lat numeric,
  visited_at_lon numeric,
  -- Distancia (m) entre o vendedor e o lead no momento do check-in. Guardado
  -- pro gestor auditar visitas no limite do raio.
  distance_m     numeric,
  visited_by     uuid REFERENCES auth.users(id),
  -- Snapshot do vendedor: se a pessoa sair/trocar de nome, a visita antiga
  -- mantem quem era na epoca (mesmo padrao de client_notes).
  visited_by_name  text,
  visited_by_email text,
  -- Etapa do lead ANTES do check-in mover pra Visita — contexto pro relatorio.
  etapa_anterior text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_visits IS
  'Historico completo de visitas (check-ins com GPS). Uma linha por visita — o mesmo lead pode ter varias.';

CREATE INDEX IF NOT EXISTS client_visits_client_id_idx  ON public.client_visits (client_id);
CREATE INDEX IF NOT EXISTS client_visits_visited_at_idx ON public.client_visits (visited_at);
CREATE INDEX IF NOT EXISTS client_visits_visited_by_idx ON public.client_visits (visited_by);

-- Contador desnormalizado no lead (evita join/count na listagem do app).
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS visit_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.clients.visit_count IS
  'Quantidade de visitas registradas (mantido por mark_client_as_visited; espelha count(client_visits)).';

-- ===== RLS =====
ALTER TABLE public.client_visits ENABLE ROW LEVEL SECURITY;

-- Leitura: mesma regra pratica das outras tabelas de atividade do app —
-- qualquer usuario autenticado le (o app ja filtra por vendedor na UI e o
-- gestor precisa ver tudo no relatorio).
DROP POLICY IF EXISTS client_visits_select ON public.client_visits;
CREATE POLICY client_visits_select ON public.client_visits
  FOR SELECT TO authenticated
  USING (true);

-- Escrita: NINGUEM insere direto. A unica porta e' a RPC mark_client_as_visited
-- (SECURITY DEFINER), que valida o GPS. Sem policy de INSERT/UPDATE/DELETE,
-- o RLS nega tudo pro cliente autenticado — igual ao espirito do trigger que
-- ja protegia a transicao de status.

-- ===== RPC: agora registra a visita no historico e move pra etapa Visita =====
-- Mudancas em relacao a versao de 20260506:
--   1) insere em client_visits (historico) e incrementa clients.visit_count
--   2) devolve visit_count/etapa_anterior no retorno pro app mostrar e pro
--      webhook mandar pro HubSpot
--   3) raio ampliado de 20m -> 200m, alinhado com a validacao que o app ja
--      fazia no cliente (App.tsx checava 200m antes de chamar a RPC; com 20m
--      aqui a RPC rejeitava check-ins que o app tinha aprovado)
CREATE OR REPLACE FUNCTION public.mark_client_as_visited(
  p_client_id uuid,
  p_user_lat numeric,
  p_user_lon numeric
)
RETURNS public.clients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client public.clients;
  v_distance_m numeric;
  v_caller uuid := auth.uid();
  v_max_distance_m constant numeric := 200;
  v_visited_slug constant text := 'lead_visitado';
  v_etapa_anterior text;
  v_name text;
  v_email text;
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

  IF v_client.latitude IS NULL OR v_client.longitude IS NULL THEN
    RAISE EXCEPTION 'Lead sem coordenadas — impossível validar proximidade.' USING ERRCODE = 'P0001';
  END IF;

  -- Haversine em metros (raio da Terra = 6.371.000 m)
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

  v_etapa_anterior := v_client.etapa;

  SELECT full_name, email INTO v_name, v_email
    FROM public.profiles WHERE id = v_caller;

  INSERT INTO public.client_visits (
    client_id, visited_at, visited_at_lat, visited_at_lon, distance_m,
    visited_by, visited_by_name, visited_by_email, etapa_anterior
  ) VALUES (
    p_client_id, now(), p_user_lat, p_user_lon, round(v_distance_m, 1),
    v_caller, v_name, v_email, v_etapa_anterior
  );

  PERFORM set_config('app.allow_visit_status_update', 'on', true);

  UPDATE public.clients
     SET status         = v_visited_slug,
         visited_at     = now(),
         visited_at_lat = p_user_lat,
         visited_at_lon = p_user_lon,
         visited_by     = v_caller,
         visit_count    = COALESCE(visit_count, 0) + 1,
         updated_by     = v_caller,
         updated_at     = now()
   WHERE id = p_client_id
   RETURNING * INTO v_client;

  RETURN v_client;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_client_as_visited(uuid, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_client_as_visited(uuid, numeric, numeric) TO authenticated;

COMMENT ON FUNCTION public.mark_client_as_visited(uuid, numeric, numeric) IS
  'Marca um lead como visitado se o usuário autenticado estiver a no máximo 200 m das coordenadas do lead (Haversine). Registra a visita em client_visits e incrementa clients.visit_count. Único caminho válido para a transição -> lead_visitado.';

-- ===== Backfill =====
-- Leads ja visitados antes desta migration viram 1 linha no historico, pra o
-- contador e o relatorio nao comecarem zerados/inconsistentes.
INSERT INTO public.client_visits (client_id, visited_at, visited_at_lat, visited_at_lon, visited_by)
SELECT c.id, c.visited_at, c.visited_at_lat, c.visited_at_lon, c.visited_by
  FROM public.clients c
 WHERE c.visited_at IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.client_visits v WHERE v.client_id = c.id);

UPDATE public.clients c
   SET visit_count = sub.n
  FROM (SELECT client_id, count(*) AS n FROM public.client_visits GROUP BY client_id) sub
 WHERE sub.client_id = c.id
   AND c.visit_count IS DISTINCT FROM sub.n;
