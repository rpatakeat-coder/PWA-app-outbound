-- 0081 — Remove de client_visits o controle de sync com o HubSpot que ninguém escreve mais
--
-- Por quê: as colunas hs_sync_status, hs_task_id, hs_sync_error e hs_synced_at
-- foram criadas direto no banco (nunca estiveram em migration nem no código
-- deste repositório), com hs_sync_status default 'pending'. Só a função
-- record_visit_hs_sync as atualizava, e nenhuma versão do app neste
-- repositório chama essa função — quem marcava 'ok' até 31/08/2026 era uma
-- versão antiga do app.
--
-- Desde então toda visita nasce 'pending' e fica assim para sempre, mesmo
-- chegando ao HubSpot. Medido em 24/09/2026: 395 visitas 'pending', das quais
-- 290 de setembro ESTÃO no HubSpot como tarefa "Check-in em…". A coluna gerou
-- um diagnóstico inteiro dizendo que as visitas pararam de chegar — o que não
-- era verdade. Coluna que mente é pior que coluna nenhuma.
--
-- A fonte da visita é client_visits (com GPS). A pergunta "chegou ao CRM?"
-- deixa de existir quando a gestão lê daqui, que é o objetivo da unificação.
--
-- O que se perde, medido antes (24/09): 1.025 linhas; 188 com hs_task_id
-- (id da tarefa no HubSpot, de 17/06 a 31/08), 190 com hs_synced_at e 2 com
-- hs_sync_error. O vínculo visita→tarefa continua recuperável no HubSpot pela
-- associação da tarefa ao negócio e pela hora do check-in.
--
-- Dependências conferidas: nenhuma view, nenhuma política; só o índice
-- client_visits_hs_sync_idx e a função record_visit_hs_sync, que saem juntos.
-- Nenhum arquivo do repositório cita as colunas nem a função.
--
-- Idempotente: pode rodar duas vezes.

drop function if exists public.record_visit_hs_sync(uuid, timestamptz, text, text, text);

drop index if exists public.client_visits_hs_sync_idx;

alter table public.client_visits
  drop column if exists hs_sync_status,
  drop column if exists hs_task_id,
  drop column if exists hs_sync_error,
  drop column if exists hs_synced_at;
