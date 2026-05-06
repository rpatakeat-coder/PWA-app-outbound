-- Adiciona campos vindos do HubSpot na tabela clients e cria índice único
-- para suportar upsert idempotente por id_hubspot.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS id_hubspot  text,
  ADD COLUMN IF NOT EXISTS bairro      text,
  ADD COLUMN IF NOT EXISTS empresa     text,
  ADD COLUMN IF NOT EXISTS url_hubspot text;

CREATE UNIQUE INDEX IF NOT EXISTS clients_id_hubspot_key
  ON public.clients (id_hubspot)
  WHERE id_hubspot IS NOT NULL;

COMMENT ON COLUMN public.clients.id_hubspot  IS 'ID do registro no HubSpot (deal/contact) — único quando preenchido';
COMMENT ON COLUMN public.clients.bairro      IS 'Bairro do endereço (vindo do HubSpot)';
COMMENT ON COLUMN public.clients.empresa     IS 'Razão social / nome da empresa (derivado do dealname do HubSpot)';
COMMENT ON COLUMN public.clients.url_hubspot IS 'URL para o registro no HubSpot';
