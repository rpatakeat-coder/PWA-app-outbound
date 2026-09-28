-- 0138 · Velocidade do banco: regras de acesso, tarefas e índices (28/09/2026)
--
-- Auditoria de velocidade (Julyan: "quero o app mais rápido possível em tudo").
-- O banco quase não trabalha; o que pesa, medido:
--
-- 1. REGRA DE ACESSO POR LINHA. Várias políticas chamam auth.uid() e is_field_admin()
--    etc. sem (select …): o Postgres reavalia a função em CADA linha lida (cada uma é uma
--    consulta a profiles). client_meetings: 15,6 ms para 109 linhas; sinais_ao_vivo: 13 ms
--    para 200. Com (select …) ela vira um valor único por consulta. Mesmo significado.
--    E a leitura de clients (papel public + auth.role()='authenticated') fazia o
--    planejador estimar 46 linhas em vez de 9.325: largava o índice de localização do
--    mapa e ordenava em disco. Vira "to authenticated using (true)" — exatamente o que
--    ela já liberava (anon nunca passou; service_role ignora RLS).
-- 2. generate_client_tasks reescrevia toda tarefa pendente a cada 30 min (716 mil
--    updates para 684 linhas: updated_at = now() sempre). Agora só grava o que mudou.
--    E o app deixou de chamá-la a cada abertura (o cron 7 já cobre).
-- 3. Índices idênticos a outro (cada um custa escrita em todo update de clients).

-- ── 1. Regras de acesso ─────────────────────────────────────────────────────────────
alter policy "All authenticated users can view all clients" on public.clients
  to authenticated using (true);
alter policy "Non-view users can create clients" on public.clients
  to authenticated
  with check ((created_by = (select auth.uid())) and not (select public.is_view_only_user()));
alter policy "Non-view users can update clients" on public.clients
  to authenticated
  using (not (select public.is_view_only_user()))
  with check ((updated_by = (select auth.uid())) and not (select public.is_view_only_user()));
alter policy "Non-view users can delete clients" on public.clients
  to authenticated using (not (select public.is_view_only_user()));

alter policy client_meetings_select on public.client_meetings
  using (((select auth.uid()) = created_by) or (select public.is_field_admin()) or (select public.can_view_metrics()));
alter policy client_meetings_insert on public.client_meetings
  with check (((select auth.uid()) = created_by) and not (select public.is_view_only_user()));
alter policy client_meetings_update on public.client_meetings
  using (((select auth.uid()) = created_by) and not (select public.is_view_only_user()));
alter policy client_meetings_delete on public.client_meetings
  using (((select auth.uid()) = created_by) and not (select public.is_view_only_user()));

alter policy client_notes_insert on public.client_notes
  with check ((created_by = (select auth.uid())) and not (select public.is_view_only_user()));
alter policy client_notes_update on public.client_notes
  using ((created_by = (select auth.uid())) and not (select public.is_view_only_user()))
  with check ((created_by = (select auth.uid())) and not (select public.is_view_only_user()));
alter policy client_notes_delete on public.client_notes
  using ((created_by = (select auth.uid())) and not (select public.is_view_only_user()));

alter policy client_stage_changes_insert_own on public.client_stage_changes
  with check ((created_by = (select auth.uid())) and not (select public.is_view_only_user()));

alter policy sinais_ao_vivo_le_o_time on public.sinais_ao_vivo
  using ((select public.is_field_admin()) or exists (select 1 from public.equipe_cockpit e where e.profile_id = (select auth.uid()) and e.ativo));
alter policy clientes_takeat_time_le on public.clientes_takeat
  using ((select public.is_field_admin()) or exists (select 1 from public.equipe_cockpit e where e.profile_id = (select auth.uid()) and e.ativo));
alter policy clientes_takeat_dia_time_le on public.clientes_takeat_dia
  using ((select public.is_field_admin()) or exists (select 1 from public.equipe_cockpit e where e.profile_id = (select auth.uid()) and e.ativo));
alter policy equipe_cockpit_select on public.equipe_cockpit
  using ((profile_id = (select auth.uid())) or (select public.eh_gestor_cockpit()));

alter policy comunicados_lidos_insert on public.comunicados_lidos
  with check (leitor_id = (select auth.uid()));
alter policy comunicados_lidos_select on public.comunicados_lidos
  using ((leitor_id = (select auth.uid())) or (select public.eh_gestor_cockpit()));

alter policy dailies_select on public.dailies
  using ((seller_id = (select auth.uid())) or (select public.eh_gestor_cockpit()));
alter policy dailies_insert on public.dailies
  with check ((seller_id = (select auth.uid())) or (select public.eh_gestor_cockpit()));
alter policy dailies_update on public.dailies
  using ((seller_id = (select auth.uid())) or (select public.eh_gestor_cockpit()))
  with check ((seller_id = (select auth.uid())) or (select public.eh_gestor_cockpit()));

alter policy fichas_de_rua_insere_a_propria on public.fichas_de_rua
  with check (criado_por = (select auth.uid()));
alter policy fichas_de_rua_le_a_propria_ou_gestor on public.fichas_de_rua
  using ((criado_por = (select auth.uid())) or (select public.is_field_admin()));

alter policy fila_pwa_select on public.fila_pwa
  using ((seller_id = (select auth.uid())) or (select public.eh_gestor_cockpit()));
alter policy fila_pwa_upsert on public.fila_pwa
  with check (seller_id = (select auth.uid()));
alter policy fila_pwa_update on public.fila_pwa
  using (seller_id = (select auth.uid())) with check (seller_id = (select auth.uid()));
alter policy fila_pwa_delete on public.fila_pwa
  using (seller_id = (select auth.uid()));

alter policy fotos_visita_grava on public.fotos_visita
  with check (criado_por = (select auth.uid()));
alter policy fotos_visita_le on public.fotos_visita
  using ((criado_por = (select auth.uid())) or (select public.is_field_admin()) or (select public.eh_gestor_cockpit()));

alter policy "Metrics viewers can view all profiles" on public.profiles
  using ((select public.can_view_metrics()));

alter policy field_routes_insert on public.field_routes
  with check (((seller_id = (select auth.uid())) or (select public.is_field_admin())) and not (select public.is_view_only_user()));
alter policy field_routes_update on public.field_routes
  using (((seller_id = (select auth.uid())) or (select public.is_field_admin())) and not (select public.is_view_only_user()))
  with check (((seller_id = (select auth.uid())) or (select public.is_field_admin())) and not (select public.is_view_only_user()));
alter policy field_routes_delete on public.field_routes
  using (((seller_id = (select auth.uid())) or (select public.is_field_admin())) and not (select public.is_view_only_user()));

alter policy field_route_stops_insert on public.field_route_stops
  with check (exists (select 1 from public.field_routes r where r.id = field_route_stops.route_id
    and (r.seller_id = (select auth.uid()) or (select public.is_field_admin()))) and not (select public.is_view_only_user()));
alter policy field_route_stops_update on public.field_route_stops
  using (exists (select 1 from public.field_routes r where r.id = field_route_stops.route_id
    and (r.seller_id = (select auth.uid()) or (select public.is_field_admin()))) and not (select public.is_view_only_user()))
  with check (exists (select 1 from public.field_routes r where r.id = field_route_stops.route_id
    and (r.seller_id = (select auth.uid()) or (select public.is_field_admin()))) and not (select public.is_view_only_user()));
alter policy field_route_stops_delete on public.field_route_stops
  using (exists (select 1 from public.field_routes r where r.id = field_route_stops.route_id
    and (r.seller_id = (select auth.uid()) or (select public.is_field_admin()))) and not (select public.is_view_only_user()));

-- ── 2. generate_client_tasks só grava o que mudou ────────────────────────────────────
create or replace function public.generate_client_tasks()
returns integer
language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
DECLARE
  v_pending integer;
  v_activation constant timestamptz := timestamptz '2026-07-08 00:00:00+00';
BEGIN
  -- REGRA: agendar_demo — leads em Conversa com decisor (ex-Diagnóstico),
  -- sem reuniao futura, D2/D5 em dias uteis.
  WITH stage_entry AS (
    SELECT client_id, max(created_at) AS entered_at
    FROM public.client_stage_changes
    WHERE to_stage IN ('Conversa com decisor','Diagnóstico')
    GROUP BY client_id
  ),
  eligible AS (
    SELECT c.id AS client_id, c.vendedor_id_hubspot,
      public.business_days_between(COALESCE(se.entered_at, greatest(c.created_at, v_activation)), now()) AS days_in_stage
    FROM public.clients c LEFT JOIN stage_entry se ON se.client_id = c.id
    WHERE c.etapa IN ('Conversa com decisor','Diagnóstico') AND c.status = 'lead'
      AND NOT EXISTS (SELECT 1 FROM public.client_meetings m
        WHERE m.client_id = c.id AND m.type = 'reuniao' AND m.status = 'agendada' AND m.scheduled_at > now())
      -- Concluida/dispensada neste episodio da etapa bloqueia recriacao.
      AND NOT EXISTS (SELECT 1 FROM public.client_tasks r
        WHERE r.client_id = c.id AND r.task_type = 'agendar_demo'
          AND r.status IN ('concluida','dispensada')
          AND r.resolved_at >= COALESCE(se.entered_at, greatest(c.created_at, v_activation)))
  ),
  targeted AS (
    SELECT client_id, vendedor_id_hubspot, days_in_stage,
      CASE WHEN days_in_stage >= 5 THEN 'D5' WHEN days_in_stage >= 2 THEN 'D2' ELSE NULL END AS severity
    FROM eligible
  ),
  to_upsert AS (SELECT * FROM targeted WHERE severity IS NOT NULL)
  INSERT INTO public.client_tasks (client_id, task_type, severity, title, status, vendedor_id_hubspot, meta)
  SELECT t.client_id, 'agendar_demo', t.severity, t.severity || ' Agendar Demo', 'pendente', t.vendedor_id_hubspot,
    jsonb_build_object('days_in_stage', t.days_in_stage, 'etapa', 'Conversa com decisor', 'dias_uteis', true)
  FROM to_upsert t
  ON CONFLICT (client_id, task_type) WHERE (status = 'pendente')
  DO UPDATE SET severity = CASE WHEN EXCLUDED.severity='D5' THEN 'D5' ELSE public.client_tasks.severity END,
    title = CASE WHEN EXCLUDED.severity='D5' THEN 'D5 Agendar Demo' ELSE public.client_tasks.title END,
    vendedor_id_hubspot = EXCLUDED.vendedor_id_hubspot, meta = EXCLUDED.meta, updated_at = now()
  -- só grava o que mudou (0138): antes reescrevia toda pendente a cada 30 min
  WHERE (public.client_tasks.severity, public.client_tasks.title, public.client_tasks.vendedor_id_hubspot, public.client_tasks.meta)
    IS DISTINCT FROM (
      CASE WHEN EXCLUDED.severity='D5' THEN 'D5' ELSE public.client_tasks.severity END,
      CASE WHEN EXCLUDED.severity='D5' THEN 'D5 Agendar Demo' ELSE public.client_tasks.title END,
      EXCLUDED.vendedor_id_hubspot, EXCLUDED.meta);

  -- Auto-resolucao agendar_demo: pendente cujo lead nao esta mais elegivel.
  UPDATE public.client_tasks ct SET status='resolvida_auto', resolved_at=now()
  WHERE ct.task_type='agendar_demo' AND ct.status='pendente'
    AND ct.client_id NOT IN (
      SELECT c.id FROM public.clients c
      LEFT JOIN (SELECT client_id, max(created_at) entered_at FROM public.client_stage_changes
                 WHERE to_stage IN ('Conversa com decisor','Diagnóstico') GROUP BY client_id) se ON se.client_id=c.id
      WHERE c.etapa IN ('Conversa com decisor','Diagnóstico') AND c.status='lead'
        AND public.business_days_between(COALESCE(se.entered_at, greatest(c.created_at, v_activation)), now()) >= 2
        AND NOT EXISTS (SELECT 1 FROM public.client_meetings m
          WHERE m.client_id=c.id AND m.type='reuniao' AND m.status='agendada' AND m.scheduled_at>now())
        AND NOT EXISTS (SELECT 1 FROM public.client_tasks r
          WHERE r.client_id = c.id AND r.task_type = 'agendar_demo'
            AND r.status IN ('concluida','dispensada')
            AND r.resolved_at >= COALESCE(se.entered_at, greatest(c.created_at, v_activation)))
    );

  -- REGRA: SLAs por etapa (stage_sla) — prazos em dias uteis.
  WITH sla AS (
    SELECT stage_id, stage_label, sla_days, task_title, task_type
    FROM public.stage_sla
    WHERE is_active AND sla_days IS NOT NULL AND task_type <> 'agendar_demo'
  ),
  entry AS (
    -- Normaliza o label antigo no historico pro novo, pra entrada na etapa
    -- renomeada continuar valendo.
    SELECT client_id,
           CASE WHEN to_stage = 'Diagnóstico' THEN 'Conversa com decisor' ELSE to_stage END AS stage_label,
           max(created_at) AS entered_at
    FROM public.client_stage_changes
    GROUP BY client_id, CASE WHEN to_stage = 'Diagnóstico' THEN 'Conversa com decisor' ELSE to_stage END
  ),
  eligible AS (
    SELECT c.id AS client_id, c.vendedor_id_hubspot, s.task_type, s.task_title, s.stage_label, s.sla_days,
      public.business_days_between(COALESCE(e.entered_at, greatest(c.created_at, v_activation)), now()) AS days_in_stage,
      public.add_business_days(COALESCE(e.entered_at, greatest(c.created_at, v_activation)), s.sla_days) AS due_date
    FROM public.clients c
    JOIN sla s ON s.stage_label = c.etapa
    LEFT JOIN entry e ON e.client_id = c.id AND e.stage_label = s.stage_label
    WHERE c.status = 'lead'
      AND NOT EXISTS (SELECT 1 FROM public.client_tasks r
        WHERE r.client_id = c.id AND r.task_type = s.task_type
          AND r.status IN ('concluida','dispensada')
          AND r.resolved_at >= COALESCE(e.entered_at, greatest(c.created_at, v_activation)))
  ),
  to_upsert AS (SELECT * FROM eligible WHERE days_in_stage >= sla_days)
  INSERT INTO public.client_tasks (client_id, task_type, severity, title, status, vendedor_id_hubspot, meta)
  SELECT t.client_id, t.task_type, 'SLA', t.task_title, 'pendente', t.vendedor_id_hubspot,
    jsonb_build_object('days_in_stage', t.days_in_stage, 'etapa', t.stage_label, 'sla_days', t.sla_days, 'due_date', t.due_date, 'dias_uteis', true)
  FROM to_upsert t
  ON CONFLICT (client_id, task_type) WHERE (status = 'pendente')
  DO UPDATE SET vendedor_id_hubspot = EXCLUDED.vendedor_id_hubspot, meta = EXCLUDED.meta, updated_at = now()
  WHERE (public.client_tasks.vendedor_id_hubspot, public.client_tasks.meta)
    IS DISTINCT FROM (EXCLUDED.vendedor_id_hubspot, EXCLUDED.meta);

  -- Auto-resolucao SLA: pendente sobrevive so se o lead segue elegivel E nao
  -- houve conclusao/dispensa manual neste episodio.
  UPDATE public.client_tasks ct SET status='resolvida_auto', resolved_at=now()
  WHERE ct.severity = 'SLA' AND ct.status = 'pendente'
    AND NOT EXISTS (
      SELECT 1
      FROM public.clients c
      JOIN public.stage_sla s ON s.stage_label = c.etapa AND s.task_type = ct.task_type
      LEFT JOIN LATERAL (
        SELECT max(sc.created_at) AS entered_at
        FROM public.client_stage_changes sc
        WHERE sc.client_id = c.id
          AND (sc.to_stage = c.etapa OR (c.etapa = 'Conversa com decisor' AND sc.to_stage = 'Diagnóstico'))
      ) e ON true
      WHERE c.id = ct.client_id AND c.status = 'lead' AND s.is_active
        AND NOT EXISTS (SELECT 1 FROM public.client_tasks r
          WHERE r.client_id = c.id AND r.task_type = ct.task_type
            AND r.status IN ('concluida','dispensada')
            AND r.resolved_at >= COALESCE(e.entered_at, greatest(c.created_at, v_activation)))
    );

  SELECT count(*) INTO v_pending FROM public.client_tasks WHERE status = 'pendente';
  RETURN v_pending;
END;
$function$;

-- ── 3. Índices idênticos a outro ────────────────────────────────────────────────────
drop index if exists public.clients_id_hubspot_idx;      -- = clients_id_hubspot_key (único, mesma coluna e filtro)
drop index if exists public.planos_semanais_owner_idx;   -- = planos_semanais_owner_id_data_segunda_key (lido nos dois sentidos)
