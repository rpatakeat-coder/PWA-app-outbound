-- Historico de mudancas de etapa do lead. Cada vez que alguem move o lead
-- numa etapa pelo modal, gravamos uma linha aqui com quem fez, quando e
-- pra onde foi. Imutavel — historico nao edita nem apaga (so admin via SQL).
-- Junto com client_notes, monta a timeline cronologica no bottom sheet.

CREATE TABLE IF NOT EXISTS public.client_stage_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  -- from_stage eh a etapa em que o lead estava ANTES da mudanca. Nullable
  -- porque na primeira mudanca o lead pode nao ter etapa nenhuma.
  from_stage text,
  -- to_stage eh o label legivel (ex.: "NEGOCIACAO"). Guardamos o label e
  -- nao o id pra timeline continuar legivel se a config de etapa mudar.
  to_stage text NOT NULL,
  -- to_stage_id eh o id HubSpot da etapa (referencia tecnica, opcional).
  to_stage_id text,
  -- Snapshot dos sub-fields preenchidos no modal (gargalo, mrr, etc).
  -- Util pra auditoria de "por que essa etapa foi escolhida".
  sub_values jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Snapshot do autor: nome/email no momento da mudanca. Mesmo padrao
  -- de client_notes — imutavel, nao precisa join com profiles.
  created_by_name text,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_stage_changes_client_created_idx
  ON public.client_stage_changes (client_id, created_at DESC);

ALTER TABLE public.client_stage_changes ENABLE ROW LEVEL SECURITY;

-- Todos os autenticados leem todo o historico (timeline compartilhada).
DROP POLICY IF EXISTS "client_stage_changes_select_all_auth"
  ON public.client_stage_changes;
CREATE POLICY "client_stage_changes_select_all_auth"
  ON public.client_stage_changes
  FOR SELECT
  TO authenticated
  USING (true);

-- Insert: qualquer autenticado pode registrar uma mudanca, desde que
-- created_by seja o proprio uid (impede falsificacao de autor).
DROP POLICY IF EXISTS "client_stage_changes_insert_own"
  ON public.client_stage_changes;
CREATE POLICY "client_stage_changes_insert_own"
  ON public.client_stage_changes
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Sem update/delete via policy: historico eh imutavel. Correcao so via
-- SQL direto (service_role) se algo entrar errado.
