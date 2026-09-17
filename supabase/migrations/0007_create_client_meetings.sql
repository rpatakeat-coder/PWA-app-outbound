-- Reuniões agendadas vinculadas a um lead/cliente.
-- N reuniões por cliente (sem unique em client_id) — preparado pra histórico.
CREATE TABLE IF NOT EXISTS public.client_meetings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  scheduled_at  timestamptz NOT NULL,
  observacoes   text,
  status        text NOT NULL DEFAULT 'agendada',
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_meetings_client_id_idx
  ON public.client_meetings(client_id);

CREATE INDEX IF NOT EXISTS client_meetings_scheduled_at_idx
  ON public.client_meetings(scheduled_at);

ALTER TABLE public.client_meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_meetings_select ON public.client_meetings;
CREATE POLICY client_meetings_select ON public.client_meetings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS client_meetings_insert ON public.client_meetings;
CREATE POLICY client_meetings_insert ON public.client_meetings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS client_meetings_update ON public.client_meetings;
CREATE POLICY client_meetings_update ON public.client_meetings
  FOR UPDATE TO authenticated USING (auth.uid() = created_by);

DROP POLICY IF EXISTS client_meetings_delete ON public.client_meetings;
CREATE POLICY client_meetings_delete ON public.client_meetings
  FOR DELETE TO authenticated USING (auth.uid() = created_by);

CREATE OR REPLACE FUNCTION public.client_meetings_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_meetings_set_updated_at ON public.client_meetings;
CREATE TRIGGER client_meetings_set_updated_at
BEFORE UPDATE ON public.client_meetings
FOR EACH ROW EXECUTE FUNCTION public.client_meetings_set_updated_at();

COMMENT ON TABLE public.client_meetings IS
  'Reuniões agendadas com leads/clientes. Suporta múltiplas reuniões por cliente.';
COMMENT ON COLUMN public.client_meetings.status IS
  'agendada | realizada | cancelada — preparado pra workflow futuro.';
