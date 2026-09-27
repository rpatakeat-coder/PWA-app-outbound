-- 0117 · Rodadas do espelho periódico (26/09/2026)
--
-- O espelho ao vivo (0116) cobre o que o APP escreve. Para o que muda direto no
-- HubSpot, o cockpit-dados, quando alguém abre o Cockpit, busca em segundo plano os
-- negócios do time alterados desde a última rodada e espelha (no máximo a cada 5 min,
-- até 40 negócios). Esta tabela guarda quando rodou — é a trava de frequência e o
-- registro para conferir. Sem cron e sem chave guardada no banco: só roda quando
-- alguém está olhando.
create table if not exists public.espelho_rodadas (
  id         bigserial primary key,
  rodou_em   timestamptz not null default now(),
  desde      timestamptz,
  negocios   int not null default 0,
  erro       text
);
create index if not exists espelho_rodadas_rodou on public.espelho_rodadas (rodou_em desc);
alter table public.espelho_rodadas enable row level security;
