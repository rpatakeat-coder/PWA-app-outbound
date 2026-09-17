-- Adiciona flag `is_default_for_new_leads` em client_statuses.
-- Webhooks externos (ex.: HubSpot) usam o status marcado com esse flag
-- como status inicial de novos leads, sem precisar hardcodar slug em código.
-- Exatamente uma linha pode ter o flag = true por vez.

ALTER TABLE public.client_statuses
  ADD COLUMN IF NOT EXISTS is_default_for_new_leads boolean NOT NULL DEFAULT false;

-- Garante no máximo um único default ativo
CREATE UNIQUE INDEX IF NOT EXISTS client_statuses_one_default_for_new_leads
  ON public.client_statuses ((true))
  WHERE is_default_for_new_leads = true;

COMMENT ON COLUMN public.client_statuses.is_default_for_new_leads IS
  'Quando true, este status é usado como default para leads criados via webhook externo (ex.: HubSpot). No máximo um por vez.';
