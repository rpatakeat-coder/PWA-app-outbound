-- 1) Tipo da "reunião": distingue reunião de follow up.
--    Ambos vivem na mesma tabela client_meetings (mesma UX/fluxo); só muda o
--    rótulo/organização e o título gerado no Google Agenda (via webhook).
--    Default 'reuniao' mantém todas as linhas existentes como reunião.
ALTER TABLE public.client_meetings
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'reuniao'
  CHECK (type IN ('reuniao', 'follow_up'));

COMMENT ON COLUMN public.client_meetings.type IS
  'reuniao | follow_up — mesmo fluxo de agendamento, organização/título diferentes.';

-- 2) Acesso à área de Gestor (métricas) para usuários específicos SEM torná-los
--    field admin pleno. can_view_metrics() = admin OU e-mails liberados.
--    Usado só pra ampliar SELECT nas tabelas que a tela de métricas lê
--    (profiles, client_meetings). NÃO concede poderes de escrita/admin.
CREATE OR REPLACE FUNCTION public.can_view_metrics()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT (auth.jwt() ->> 'email') IN (
    'arthurgothe.takeat@gmail.com',  -- admin
    'outbound@takeat.app'            -- Julyan (só métricas)
  );
$$;

-- 3) profiles: quem pode ver métricas enxerga todos os perfis (pra montar o
--    ranking de vendedores). Admin já tinha; adicionamos os leitores de métrica.
DROP POLICY IF EXISTS "Metrics viewers can view all profiles" ON public.profiles;
CREATE POLICY "Metrics viewers can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.can_view_metrics());

-- 4) client_meetings: leitor de métricas enxerga todas as reuniões/follow ups
--    (pra agregar por vendedor). Antes só o criador ou is_field_admin().
DROP POLICY IF EXISTS client_meetings_select ON public.client_meetings;
CREATE POLICY client_meetings_select ON public.client_meetings
  FOR SELECT TO authenticated
  USING (auth.uid() = created_by OR public.is_field_admin() OR public.can_view_metrics());
