-- 0275 — Faxina final do banco (20/11/26). Pedido do Julyan: "não quero nada antigo morto".
-- Inventário em memória faxina-final-20-11. Cada item abaixo foi conferido sem chamador
-- no app (App.tsx, src/, api/), no Cockpit (template, api/, lib/, scripts/, workflows),
-- nas Edge Functions, no cron, em gatilhos, políticas, views e nos registros de 24 h.
-- NÃO sai: sync_stage_property_options (o n8n do RPA chama às 20:00 todo dia).
--
-- Antes de apagar, o conteúdo de cada tabela e o código de cada função vão para
-- arquivo.copias (uma linha por objeto). Para desfazer: recriar a partir dali.

begin;

-- 1. Cópia de tudo que sai -------------------------------------------------------
create table if not exists arquivo.copias (
  origem     text primary key,
  conteudo   jsonb not null,
  copiado_em timestamptz not null default now()
);
alter table arquivo.copias enable row level security;
revoke all on arquivo.copias from anon, authenticated, public;

do $$
declare
  t text;
  f regprocedure;
begin
  foreach t in array array[
    'arquivo._backup_bairro_20260927', 'arquivo._backup_etapa_20260927',
    'arquivo._backup_planos_semanais_app_20260924', 'arquivo._reunioes_fechadas_0177',
    'arquivo._update_webhook_backfill_queue', 'arquivo.audit_logs',
    'arquivo.bkp_atualizacao_diaria_20260731', 'arquivo.bkp_etapas_pre_varredura_20260731',
    'arquivo.etapa_corrigida_backup', 'arquivo.import_batches', 'arquivo.import_batches_log',
    'arquivo.stage_change_failures',
    'public._bkp_cachambi_12_11', 'public._bkp_tijuca_12_11', 'public._bkp_vitoria_08_11',
    'public.client_status_history', 'public.import_logs', 'public.resumos_ia',
    'public.target_accounts', 'public.um_a_um_audio', 'public.um_a_um_documentos',
    'public.playbook_copias', 'public.stage_sla', 'public.noticias_setor',
    'public.geocode_repair_cron_state'
  ] loop
    execute format(
      'insert into arquivo.copias (origem, conteudo) select %L, coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from %s x
       on conflict (origem) do update set conteudo = excluded.conteudo, copiado_em = now()', t, t);
  end loop;

  foreach f in array array[
    'public.disputa_da_semana()'::regprocedure,
    'public.etapa_canonica(text)'::regprocedure,
    'public.faixas_comissao()'::regprocedure,
    'public.invocar_motor_contas_alvo(boolean,integer)'::regprocedure,
    'public.sequencia_da_fila_zerada()'::regprocedure,
    'public.anterior_dia_util(date)'::regprocedure,
    'public.generate_client_tasks()'::regprocedure,
    'public.business_days_between(timestamp with time zone,timestamp with time zone)'::regprocedure,
    'public.add_business_days(timestamp with time zone,integer)'::regprocedure,
    'public.invoke_geocode_repair_cron()'::regprocedure,
    'public.sla_estourado_candidates(text,integer)'::regprocedure,
    'public.dias_uteis_entre(timestamp with time zone,timestamp with time zone)'::regprocedure,
    'public.vizinhos_no_ranking(text)'::regprocedure
  ] loop
    insert into arquivo.copias (origem, conteudo)
    values ('funcao:' || f::text, to_jsonb(pg_get_functiondef(f)))
    on conflict (origem) do update set conteudo = excluded.conteudo, copiado_em = now();
  end loop;
end $$;

-- 2. Reparador antigo de pinos: substituído pelo workflow reparar-pinos.yml (19/11).
--    A Edge repair-client-geocodes leva 403 do OSM em tudo; o cron só gastava chamada.
select cron.unschedule(jobid) from cron.job where jobname = 'repair-client-geocodes-every-10-hours';
drop function public.invoke_geocode_repair_cron();
drop table public.geocode_repair_cron_state;

-- 3. Funções sem chamador ---------------------------------------------------------
drop function public.disputa_da_semana();              -- 0210; a Disputa lê disputa_quadro
drop function public.etapa_canonica(text);             -- 0102; o app lê etapa_de_para direto
drop function public.faixas_comissao();                -- 0158; ninguém lê
drop function public.invocar_motor_contas_alvo(boolean, integer); -- a Edge saiu em 05/11
drop function public.sequencia_da_fila_zerada();       -- 0218; nenhuma tela lê
drop function public.anterior_dia_util(date);          -- só a de cima usava
drop function public.generate_client_tasks();          -- sem cron; última tarefa em 05/11
drop function public.business_days_between(timestamptz, timestamptz); -- só a de cima usava
drop function public.add_business_days(timestamptz, integer);         -- idem
drop function public.sla_estourado_candidates(text, integer); -- o app parou de chamar (faxina do app)
drop function public.dias_uteis_entre(timestamptz, timestamptz); -- só a de cima usava
drop function public.vizinhos_no_ranking(text);        -- só o Eu v1 lia; saiu na faxina do app

-- 4. Tabelas sem leitor -----------------------------------------------------------
drop table public.import_logs;                         -- antes do arquivo.import_batches (FK)
drop table public.client_status_history;
drop table public.resumos_ia;                          -- robô de IA desligado em 17/10
drop table public.target_accounts;                     -- motor de contas-alvo saiu
drop table public.um_a_um_audio;
drop table public.um_a_um_documentos;
drop table public.playbook_copias;
drop table public.stage_sla;                           -- só generate_client_tasks lia
drop table public.noticias_setor;                      -- o radar escrevia, ninguém lia
drop table public._bkp_cachambi_12_11;
drop table public._bkp_tijuca_12_11;
drop table public._bkp_vitoria_08_11;

drop table arquivo.import_batches_log;
drop table arquivo.import_batches;
drop table arquivo.audit_logs;
drop table arquivo.stage_change_failures;
drop table arquivo._backup_bairro_20260927;
drop table arquivo._backup_etapa_20260927;
drop table arquivo._backup_planos_semanais_app_20260924;
drop table arquivo._reunioes_fechadas_0177;
drop table arquivo._update_webhook_backfill_queue;
drop table arquivo.bkp_atualizacao_diaria_20260731;
drop table arquivo.bkp_etapas_pre_varredura_20260731;
drop table arquivo.etapa_corrigida_backup;

-- 5. Segredos de quem saiu --------------------------------------------------------
delete from vault.secrets where name in ('motor_contas_alvo', 'repair_geocode_secret');

-- 6. Gatilhos e ajudantes internos não são API -----------------------------------
--    Gatilho não precisa de EXECUTE de quem dispara (o Postgres confere só ao criar
--    o gatilho). Os três _territorio_* só rodam dentro de funções SECURITY DEFINER.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       and (p.prorettype = 'trigger'::regtype
            or p.proname in ('_territorio_ativo', '_territorio_filtro', '_territorio_praca'))
  loop
    execute format('revoke execute on function %s from anon, authenticated, public', f);
  end loop;
end $$;

commit;
