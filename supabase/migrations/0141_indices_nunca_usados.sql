-- 0141 · Índices de clients que nunca foram usados (28/09/2026)
--
-- pg_stat_user_indexes desde que o banco subiu (stats_reset nulo): zero leituras em
-- cada um. clients tem ~25 índices e 60% dos seus 102 mil updates não são HOT — cada
-- índice a mais é escrita a mais em todo check-in, sincronização e mudança de etapa.
-- A busca do app é ilike, que não usa o GIN de to_tsvector.
-- Fica clients_unique_nome_geo: também zero leituras, mas é UNIQUE — ele impede pino
-- duplicado (mesmo nome no mesmo ponto), não serve para leitura.
-- Para desfazer (definições tiradas de pg_indexes antes do drop):
--   create index idx_clients_search on public.clients using gin (to_tsvector('portuguese'::regconfig, ((((coalesce(nome, ''::text) || ' '::text) || coalesce(email, ''::text)) || ' '::text) || coalesce(telefone, ''::text))));
--   create index idx_clients_tags on public.clients using gin (tags);
--   create index idx_clients_estado on public.clients using btree (estado);
--   create index idx_clients_cidade on public.clients using btree (cidade);
--   create index idx_clients_import_batch_id on public.clients using btree (import_batch_id);
drop index if exists public.idx_clients_search;          -- gin (to_tsvector('portuguese', nome || email || telefone))
drop index if exists public.idx_clients_tags;            -- gin (tags)
drop index if exists public.idx_clients_estado;          -- btree (estado)
drop index if exists public.idx_clients_cidade;          -- btree (cidade)
drop index if exists public.idx_clients_import_batch_id; -- btree (import_batch_id)
