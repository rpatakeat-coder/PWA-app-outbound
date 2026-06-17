-- Historico de notas/observacoes por cliente. Cada entrada eh imutavel
-- (so o autor pode editar/deletar) e fica como timeline no bottom sheet do pin.
-- Substitui o uso da clients.observacoes como "diario", liberando aquele campo
-- pra ficar como descricao principal sincronizada com o HubSpot.

CREATE TABLE IF NOT EXISTS public.client_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(trim(body)) > 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_notes_client_created_idx
  ON public.client_notes(client_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.client_notes_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_notes_set_updated_at ON public.client_notes;
CREATE TRIGGER client_notes_set_updated_at
BEFORE UPDATE ON public.client_notes
FOR EACH ROW EXECUTE FUNCTION public.client_notes_set_updated_at();

ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;

-- Qualquer usuario autenticado pode LER todas as notas (vendedor ve o que
-- o colega registrou no lead). Escrita/edicao/delete sao restritas ao autor.
DROP POLICY IF EXISTS client_notes_select ON public.client_notes;
CREATE POLICY client_notes_select ON public.client_notes
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS client_notes_insert ON public.client_notes;
CREATE POLICY client_notes_insert ON public.client_notes
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS client_notes_update ON public.client_notes;
CREATE POLICY client_notes_update ON public.client_notes
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS client_notes_delete ON public.client_notes;
CREATE POLICY client_notes_delete ON public.client_notes
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

COMMENT ON TABLE public.client_notes IS 'Historico de notas/observacoes de campo por cliente, criado por vendedores durante visitas.';
