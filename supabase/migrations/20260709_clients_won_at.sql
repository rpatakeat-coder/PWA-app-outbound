-- ============================================================================
-- won_at: data de fechamento do lead ("fechou/pagou").
--
-- Carimbada UMA UNICA VEZ quando o lead entra pela primeira vez em NEGOCIO
-- FECHADO (209405292) OU ENVIADO ONBOARDING (1090779812). O lead passa pelas
-- duas etapas, mas so' conta 1 fechamento — a RPC stamp_won_at so' grava
-- quando won_at ainda e' NULL.
--
-- Base pra metrica "clientes que fecharam no ultimo mes".
-- ============================================================================

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS won_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_clients_won_at ON public.clients (won_at)
  WHERE won_at IS NOT NULL;

COMMENT ON COLUMN public.clients.won_at IS
  'Quando o lead fechou (entrou em Negocio Fechado ou Enviado Onboarding). Carimbado 1x pelo app na mudanca de etapa. Base pra "fechados no ultimo mes".';

-- Carimba won_at de forma idempotente. SECURITY DEFINER pra nao esbarrar no
-- with_check da RLS de clients (updated_by = auth.uid), ja que o carimbo e' um
-- efeito colateral da mudanca de etapa, nao uma edicao do cliente pelo usuario.
CREATE OR REPLACE FUNCTION public.stamp_won_at(p_client_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_won timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = '28000';
  END IF;

  UPDATE public.clients
     SET won_at = now()
   WHERE id = p_client_id AND won_at IS NULL
   RETURNING won_at INTO v_won;

  IF v_won IS NULL THEN
    -- Ja tinha won_at (ou cliente inexistente) — devolve o valor atual.
    SELECT won_at INTO v_won FROM public.clients WHERE id = p_client_id;
  END IF;

  RETURN v_won;
END;
$$;

GRANT EXECUTE ON FUNCTION public.stamp_won_at(uuid) TO authenticated;
