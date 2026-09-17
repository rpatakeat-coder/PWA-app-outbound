-- Tabela singleton usada como "campainha" pra forçar recarga de OTA
-- em todos os clients conectados via Supabase Realtime.
-- Quando triggered_at muda, todos os apps abertos:
--   1. Verificam se há novo bundle no canal production do EAS
--   2. Baixam e disparam Updates.reloadAsync() imediatamente
--
-- Disparadores:
--   - Botão no app, visível só pro arthurgothe.takeat@gmail.com
--   - Cron diário 02:00 BRT (= 05:00 UTC)

CREATE TABLE IF NOT EXISTS public.app_force_reload (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  triggered_at timestamptz NOT NULL DEFAULT now(),
  triggered_by uuid REFERENCES public.profiles(id),
  triggered_reason text
);

INSERT INTO public.app_force_reload (id, triggered_at, triggered_reason)
VALUES (1, now(), 'initial')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_force_reload ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário autenticado (precisa ler o triggered_at inicial
-- e receber os UPDATEs via realtime).
DROP POLICY IF EXISTS "app_force_reload_read" ON public.app_force_reload;
CREATE POLICY "app_force_reload_read"
  ON public.app_force_reload
  FOR SELECT
  TO authenticated
  USING (true);

-- Escrita: hardcoded no email do Arthur. Pra adicionar mais admins depois,
-- migrar pra checagem por profiles.role (ou claim no JWT).
DROP POLICY IF EXISTS "app_force_reload_admin_update" ON public.app_force_reload;
CREATE POLICY "app_force_reload_admin_update"
  ON public.app_force_reload
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'email') = 'arthurgothe.takeat@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'arthurgothe.takeat@gmail.com');

-- Habilita realtime na tabela (idempotente — ignora se já estiver na publicação).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'app_force_reload'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.app_force_reload';
  END IF;
END
$$;

-- Cron diário às 02:00 BRT (= 05:00 UTC). Só cria o job se pg_cron estiver
-- habilitada no projeto (Database > Extensions no painel do Supabase).
-- Sem pg_cron, o reload diário não acontece automaticamente, mas o cold-start
-- check no app já cobre o caso "usuário abre o app pela manhã".
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove job antigo se existir (pra permitir re-run idempotente da migration)
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'app_force_reload_daily_2am_brt') THEN
      PERFORM cron.unschedule('app_force_reload_daily_2am_brt');
    END IF;

    PERFORM cron.schedule(
      'app_force_reload_daily_2am_brt',
      '0 5 * * *',
      $cron$
        UPDATE public.app_force_reload
        SET triggered_at = now(),
            triggered_reason = 'daily-2am-cron'
        WHERE id = 1
      $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron não está instalado — refresh diário 2am não foi agendado. Habilite em Database > Extensions e rode esta migration novamente pra ativar.';
  END IF;
END
$$;
