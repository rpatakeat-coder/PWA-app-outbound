-- 0216 · BANCO ENXUTO E SEGURO (16/10/2026)
--
-- Julyan, 16/10: "vamos mexer no backend do app e cockpit completo ... otimizar tudo, tirar as
-- fiações soltas, arquivos mortos". Auditoria só de leitura no mesmo dia (pg_stat desde 22/04,
-- 177 dias). Tudo aqui é reversível: nada de dado do time é apagado.
--
-- 1. SEGURANÇA. As duas funções da 0215 gravam em planos_semanais e não conferem sessão; eram
--    executáveis por anon. Só o gatilho as chama, e ele roda como dono. Também as funções de
--    gatilho, que ninguém precisa chamar direto.
revoke execute on function public.plano_poe_territorio(uuid) from public, anon, authenticated;
revoke execute on function public.plano_tira_territorio(text, date, uuid, text) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['tg_sinal_nota','tg_sinal_daily','tg_sinal_contato','tg_sinal_tarefa_espelho',
    'tg_territorio_no_plano','tg_visita_fecha_reuniao','tg_negocio_nasceu_poe_agendados','tg_parada_acao_no_plano',
    'tg_pricing_config_versao','pino_com_negocio_avisa_conta_alvo','pino_novo_para_rota'] loop
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = f and pg_get_function_identity_arguments(p.oid) = '') then
      execute format('revoke execute on function public.%I() from public, anon', f);
    end if;
  end loop;
end $$;
alter function public.plano_proposito(text, boolean) set search_path = public, pg_temp;
alter function public.plano_nome_chave(text) set search_path = public, pg_temp;

-- 2. ÍNDICES QUE FALTAM (medidos):
--    fotos_visita: 96 linhas e 2,5 milhões de varreduras pela _visitas_com_prova;
--    leads_prospeccao: "order by data_abertura desc" 2.537 × 121 ms;
--    joins por chave estrangeira sem índice.
create index if not exists fotos_visita_client_autor_em on public.fotos_visita (client_id, criado_por, criado_em);
create index if not exists leads_prospeccao_abertura_idx on public.leads_prospeccao (data_abertura desc nulls last);
create index if not exists clients_lead_etapa_idx on public.clients (etapa) where status = 'lead';
create index if not exists clients_visited_by_idx on public.clients (visited_by) where visited_by is not null;
create index if not exists plano_rota_sinc_client_idx on public.plano_rota_sincronizado (client_id);
create index if not exists plano_rota_sinc_route_idx on public.plano_rota_sincronizado (route_id);
create index if not exists contatos_de_campo_client_idx on public.contatos_de_campo (client_id);

-- 3. ÍNDICES SEM USO (idx_scan 0 em 177 dias) e repetidos (prefixo de um UNIQUE da mesma tabela).
--    Os de clients (12–146 leituras em 6 meses) pesam em cada um dos ~150 mil updates da tabela.
--    Os UNIQUE sem uso ficam: são trava de duplicata. Para voltar, a definição de cada um:
--    eventos_do_mapa_tipo_criado (tipo, criado_em desc) · eventos_do_mapa_user_criado (user_id, criado_em desc)
--    fotos_visita_deal (deal_id) · pauta_do_lider_alvo_idx (alvo_owner_id, criado_em desc)
--    pauta_do_lider_ritual_idx (ritual, criado_em desc) · planos_semanais_promessa_idx (data_segunda desc) where promessa is not null
--    playbook_copias_slug_data (guia_slug, copiado_em desc) · noticias_setor_relevancia_idx (data_semana desc, relevancia desc nulls last, publicado_em desc)
--    noticias_setor_semana_idx (data_semana desc, publicado_em desc) · novidades_mercado_buscado_em_idx (buscado_em desc)
--    restaurantes_osm_buscado_em_idx (buscado_em desc) · idx_import_logs_batch_id (batch_id) · idx_import_logs_status (status)
--    idx_client_status_history_created_at (created_at desc) · idx_audit_logs_user_id (user_id) · idx_audit_logs_table_name (table_name)
--    idx_import_batches_created_at (created_at desc) · idx_import_batches_status (status) · um_a_um_documentos_registro_idx (registro_id, created_at desc)
--    clients: idx_clients_updated_by (updated_by) · idx_clients_geo_approximate (geo_approximate) · clients_origem_lead_idx (origem_lead)
--             idx_clients_origem (origem) · idx_clients_is_archived (is_archived)
--    repetidos: playbook_progresso_user_idx (user_email) · modos_de_agir_semana_idx (data_segunda desc, owner_id)
--               combinados_semana_semana_idx (data_segunda desc) · combinados_cumprimento_combinado_idx (combinado_id)
drop index if exists public.eventos_do_mapa_tipo_criado;
drop index if exists public.eventos_do_mapa_user_criado;
drop index if exists public.fotos_visita_deal;
drop index if exists public.pauta_do_lider_alvo_idx;
drop index if exists public.pauta_do_lider_ritual_idx;
drop index if exists public.planos_semanais_promessa_idx;
drop index if exists public.playbook_copias_slug_data;
drop index if exists public.noticias_setor_relevancia_idx;
drop index if exists public.noticias_setor_semana_idx;
drop index if exists public.novidades_mercado_buscado_em_idx;
drop index if exists public.restaurantes_osm_buscado_em_idx;
drop index if exists public.idx_import_logs_batch_id;
drop index if exists public.idx_import_logs_status;
drop index if exists public.idx_client_status_history_created_at;
drop index if exists public.idx_audit_logs_user_id;
drop index if exists public.idx_audit_logs_table_name;
drop index if exists public.idx_import_batches_created_at;
drop index if exists public.idx_import_batches_status;
drop index if exists public.um_a_um_documentos_registro_idx;
drop index if exists public.idx_clients_updated_by;
drop index if exists public.idx_clients_geo_approximate;
drop index if exists public.clients_origem_lead_idx;
drop index if exists public.idx_clients_origem;
drop index if exists public.idx_clients_is_archived;
drop index if exists public.playbook_progresso_user_idx;
drop index if exists public.modos_de_agir_semana_idx;
drop index if exists public.combinados_semana_semana_idx;
drop index if exists public.combinados_cumprimento_combinado_idx;

-- 4. TABELAS DE BACKUP saem do schema exposto para o "arquivo" (nem a API nem o time as veem).
--    Nada é apagado: para voltar, "alter table arquivo.X set schema public".
--    _update_webhook_backfill_queue fica: _dispatch_next_update_webhook ainda a lê.
create schema if not exists arquivo;
revoke all on schema arquivo from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['_backup_bairro_20260927','_backup_etapa_20260927','_backup_planos_semanais_app_20260924',
    '_reunioes_fechadas_0177','bkp_atualizacao_diaria_20260731','bkp_etapas_pre_varredura_20260731','etapa_corrigida_backup'] loop
    if to_regclass('public.' || t) is not null then execute format('alter table public.%I set schema arquivo', t); end if;
  end loop;
end $$;
-- função sem gatilho nem chamador: vai junto para o arquivo
do $$ begin
  if to_regprocedure('public.log_client_changes()') is not null then alter function public.log_client_changes() set schema arquivo; end if;
end $$;

-- 5. REALTIME. stage_property_options levou 10.432 updates em 93 linhas: o sync reescrevia toda
--    opção mesmo sem mudança, e cada update vira evento para quem escuta. Agora só grava o que mudou.
create or replace function public.sync_stage_property_options(payload jsonb)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  data_arr jsonb; prop jsonb; opt jsonb;
  v_name text; v_label text; v_value text; v_display_label text; v_order int;
  incoming_values text[];
  total_props int := 0; total_options int := 0; total_deleted int := 0; deleted_now int;
begin
  if auth.role() <> 'service_role' and public.is_field_admin() is not true then
    raise exception 'Não autorizado';
  end if;
  if jsonb_typeof(payload) = 'array' then data_arr := payload->0->'data'; else data_arr := payload->'data'; end if;
  if data_arr is null or jsonb_typeof(data_arr) <> 'array' then
    raise exception 'Payload inválido: esperado [{data:[...]}] ou {data:[...]}';
  end if;
  for prop in select * from jsonb_array_elements(data_arr) loop
    total_props := total_props + 1;
    v_name := prop->>'name'; v_label := prop->>'label';
    if v_name is null or v_label is null then raise exception 'Propriedade sem name ou label'; end if;
    select array_agg(opt_inner->>'value') into incoming_values from jsonb_array_elements(prop->'options') as opt_inner;
    if incoming_values is null then incoming_values := array[]::text[]; end if;
    delete from public.stage_property_options where property_name = v_name and value <> all (incoming_values);
    get diagnostics deleted_now = row_count;
    total_deleted := total_deleted + deleted_now;
    v_order := 0;
    for opt in select * from jsonb_array_elements(prop->'options') loop
      v_value := opt->>'value';
      v_display_label := coalesce(opt->>'display_label', opt->>'label');
      if v_value is null then continue; end if;
      insert into public.stage_property_options (property_name, property_label, value, display_label, sort_order, updated_at)
      values (v_name, v_label, v_value, v_display_label, v_order, now())
      on conflict (property_name, value) do update
        set property_label = excluded.property_label, display_label = excluded.display_label,
            sort_order = excluded.sort_order, updated_at = excluded.updated_at
        where (stage_property_options.property_label, stage_property_options.display_label, stage_property_options.sort_order)
          is distinct from (excluded.property_label, excluded.display_label, excluded.sort_order);
      total_options := total_options + 1;
      v_order := v_order + 1;
    end loop;
  end loop;
  return jsonb_build_object('properties', total_props, 'options_upserted', total_options, 'options_deleted', total_deleted);
end;
$function$;
