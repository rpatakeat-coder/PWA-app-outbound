-- ============================================================================
-- won_at com a DATA REAL do fechamento, vinda do HubSpot
-- ============================================================================
--
-- Problema que motivou esta migration:
--
--   deals em etapa de ganho (HubSpot) ........   440
--   clientes com won_at ......................     0
--   mudancas de etapa pra ganho (de 686) .....     0
--
-- O ganho existia como ESTADO e nunca como EVENTO DATADO. Sem data nao ha'
-- "fechados no mes" — o numero que um gestor comercial mais olha. A causa nao
-- e' bug: o funil do app termina na pratica em Negociacao, e o fechamento
-- acontece direto no HubSpot, entao a RPC stamp_won_at nunca foi chamada.
--
-- NAO confundir com os 2.732 clientes de status='cliente'. Aquele campo e'
-- preenchido pela hubspot-usage-sync a partir das pipelines de Onboarding e
-- Sucesso — e' a base instalada da Takeat, marcada no mapa pra o vendedor saber
-- quem nao prospectar. Nao sao vitorias deste time e nao devem entrar no
-- "fechados no mes". O denominador certo aqui e' 440.
--
-- A correcao le' `closedate` do deal no HubSpot (ver hubspot-sync) e carimba
-- aqui. Duas diferencas em relacao a' stamp_won_at original justificam uma
-- funcao nova em vez de alterar aquela:
--
--   1. DATA REAL, nao now(). A original carimba o instante da chamada, o que
--      so' vale quando o vendedor move a etapa pelo app na hora. Vindo do
--      HubSpot, o fechamento pode ter sido semanas atras.
--
--   2. SEM auth.uid(). A original exige usuario autenticado — correto pra uma
--      acao do vendedor. Aqui quem chama e' a Edge Function com service role,
--      que nao tem auth.uid(): a original levantaria excecao.
--
-- A stamp_won_at original CONTINUA existindo e em uso pelo app (o vendedor que
-- fecha pelo app carimba na hora). As duas convivem.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.stamp_won_at_com_data(
  p_client_id uuid,
  p_won_at    timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_won timestamptz;
BEGIN
  IF p_won_at IS NULL THEN
    RAISE EXCEPTION 'p_won_at obrigatorio' USING ERRCODE = '22004';
  END IF;

  -- Idempotente, igual a' original: so' grava quando ainda esta' NULL. O deal
  -- passa por DUAS etapas de ganho (Ganho e depois Onboarding); sem esta
  -- guarda, a segunda sobrescreveria a data do fechamento pela do onboarding e
  -- o "fechados no mes" deslizaria de mes.
  UPDATE public.clients
     SET won_at = p_won_at
   WHERE id = p_client_id AND won_at IS NULL
   RETURNING won_at INTO v_won;

  IF v_won IS NULL THEN
    SELECT won_at INTO v_won FROM public.clients WHERE id = p_client_id;
  END IF;

  RETURN v_won;
END;
$$;

-- So' o service role: e' funcao de robo. Nao entra pra `authenticated`, senao
-- um usuario poderia carimbar qualquer data em qualquer cliente e inflar o
-- fechamento do mes.
REVOKE ALL ON FUNCTION public.stamp_won_at_com_data(uuid, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stamp_won_at_com_data(uuid, timestamptz) TO service_role;

COMMENT ON FUNCTION public.stamp_won_at_com_data(uuid, timestamptz) IS
  'Carimba clients.won_at com a data real de fechamento vinda do HubSpot (closedate). Idempotente. Uso exclusivo do service role (hubspot-sync e backfill).';
