-- 0243 · Limpeza do que está morto (inventário do backend, 02/11/26)
--
-- "O que tiver morto pode apagar" (Julyan, 02/11/26). Cada item abaixo foi conferido no mesmo dia:
-- nenhuma chamada no app, no Cockpit (template, api, lib, scripts), nas Edge Functions, nos crons, nos
-- gatilhos, nas políticas nem nas views. O que ainda tinha leitor ficou: client_status_history e
-- import_logs (delete-lead), playbook_copias (template), webhook_cooldown (api/hubspot-webhook.js).
--
-- As TABELAS não são apagadas: vão para o schema `arquivo` (o mesmo dos backups de 07 a 09/26), com os
-- dados. Volta: `alter table arquivo.<nome> set schema public;`.
-- As FUNÇÕES saem: o código de cada uma segue nas migrations que as criaram.

-- ── tabelas sem leitor e sem escrita ────────────────────────────────────────────────────────────
create schema if not exists arquivo;
alter table if exists public.audit_logs set schema arquivo;
alter table if exists public.import_batches_log set schema arquivo;
alter table if exists public.import_batches set schema arquivo;
alter table if exists public.stage_change_failures set schema arquivo;
-- a fila do backfill do webhook de update: o cron que a consumia se desagendou sozinho em 23/06/26
alter table if exists public._update_webhook_backfill_queue set schema arquivo;

-- ── funções sem chamador ─────────────────────────────────────────────────────────────────────────
-- o consumidor da fila acima
drop function if exists public._dispatch_next_update_webhook;
-- métricas do gestor e do executivo da 1ª versão do app (substituídas pelo Cockpit e pelo Meu desempenho)
drop function if exists public.gestor_metric_leads;
drop function if exists public.gestor_task_metrics;
drop function if exists public.gestor_tasks_list;
drop function if exists public.gestor_metrics;
drop function if exists public.gestor_metrics_guard;
drop function if exists public.my_metric_leads;
drop function if exists public.my_metrics;
-- ranking antigo (o placar é pontos_da_semana) e a importação de linhas que virou stub (receber-linhas-cockpit)
drop function if exists public.ranking_do_time;
drop function if exists public.importar_linhas_cockpit;
-- o uso do produto vinha da Edge hubspot-usage-sync, substituída pela clientes-sync
drop function if exists public.apply_hubspot_uso;
