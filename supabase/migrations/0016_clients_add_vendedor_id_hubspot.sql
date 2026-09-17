-- Adiciona vendedor_id_hubspot na tabela clients pra associar o lead ao
-- vendedor responsavel. O ID eh o mesmo `profiles.id_hubspot`. NULL = lead
-- sem responsavel (ainda nao distribuido ou vendedor sem cadastro no app).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS vendedor_id_hubspot text;

COMMENT ON COLUMN public.clients.vendedor_id_hubspot IS
  'id_hubspot do vendedor responsavel pelo lead — bate com profiles.id_hubspot. NULL = sem responsavel';

-- Indice pra filtrar "meus leads" (clients.vendedor_id_hubspot = me.id_hubspot)
-- sem fazer seq scan na tabela inteira.
CREATE INDEX IF NOT EXISTS clients_vendedor_id_hubspot_idx
  ON public.clients (vendedor_id_hubspot)
  WHERE vendedor_id_hubspot IS NOT NULL;
