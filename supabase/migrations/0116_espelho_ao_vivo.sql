-- 0116 · Espelho ao vivo do HubSpot no banco do APP (26/09/2026)
--
-- POR QUÊ: o Cockpit lê o funil e a agenda de um snapshot que o robô monta a cada
-- 2 h (e nada no fim de semana). O que o executivo faz no app — mudar etapa,
-- registrar visita, marcar reunião — só aparecia para o gestor na rodada seguinte.
-- Julyan (26/09): "vamos colocar tudo pra rodar direto do banco, o máximo possível".
--
-- COMO: toda escrita do app no HubSpot relê o negócio (e as tarefas/reuniões dele)
-- e grava aqui (supabase/functions/_compartilhado/espelho.ts). O cockpit-dados
-- aplica o que for MAIS NOVO que o snapshot por cima dele, montando o card com o
-- mesmo código do robô (lib/lead-do-funil.js). Depois, um espelhamento periódico
-- dos negócios alterados direto no HubSpot fecha o resto.
--
-- Só o servidor lê e escreve (service role): RLS ligada e sem política, como
-- cockpit_snapshot — é o CRM do time.

create table if not exists public.espelho_negocios (
  deal_id       text primary key,
  owner_id      text,
  dealstage     text,
  pipeline      text,
  props         jsonb not null default '{}'::jsonb,   -- só as propriedades com valor
  tarefas       jsonb not null default '[]'::jsonb,   -- abertas: [{ subject, timestamp }]
  origem        text not null default 'app',          -- 'app' | 'periodico'
  atualizado_em timestamptz not null default now()
);
create index if not exists espelho_negocios_atualizado on public.espelho_negocios (atualizado_em desc);

create table if not exists public.espelho_agenda (
  hs_object_id  text primary key,
  tipo          text not null check (tipo in ('tarefa', 'reuniao')),
  deal_id       text,
  owner_id      text,
  props         jsonb not null,                       -- o mesmo formato de agenda.itens do snapshot
  atualizado_em timestamptz not null default now()
);
create index if not exists espelho_agenda_atualizado on public.espelho_agenda (atualizado_em desc);
create index if not exists espelho_agenda_deal on public.espelho_agenda (deal_id);

alter table public.espelho_negocios enable row level security;
alter table public.espelho_agenda enable row level security;
