-- 0171 · AVANÇOU SEM PREENCHER (Raio X › Praça, 06/10/26)
--
-- Ao avançar um negócio para Demo/Proposta ou Negociação pela folha do app, o executivo
-- pode seguir sem dizer o sistema, a dor, quem decide ou o horário ("obrigatório é
-- avisar, não travar"). Cada avanço pela folha vira uma linha aqui:
--   faltou = o que ficou de fora ('{}' quando foi completo);
--   armas  = o que se sabia no momento (sistema, dor, decisor, papel, horario) — o decisor
--            digitado vira contato no HubSpot, e contato não desce para o Cockpit; sem esta
--            coluna o gestor veria "sem decisor" num negócio que acabou de ser preenchido.
-- O gestor lê tudo no Raio X › Praça (coluna "Avançou sem preencher"); o executivo só grava
-- e lê as próprias linhas. Ninguém altera nem apaga.

create table if not exists public.gv2_falta_etapa (
  id         uuid primary key default gen_random_uuid(),
  negocio_id text not null,
  exec_id    text not null,
  etapa      text not null,
  faltou     text[] not null default '{}',
  armas      jsonb,
  criado_em  timestamptz not null default now()
);

create index if not exists gv2_falta_etapa_criado_em on public.gv2_falta_etapa (criado_em desc);
create index if not exists gv2_falta_etapa_negocio on public.gv2_falta_etapa (negocio_id, criado_em desc);

alter table public.gv2_falta_etapa enable row level security;

drop policy if exists gv2_falta_etapa_le on public.gv2_falta_etapa;
create policy gv2_falta_etapa_le on public.gv2_falta_etapa
  for select to authenticated
  using ((select public.eh_gestor_cockpit()) or exec_id = (select public.meu_owner_hubspot()));

drop policy if exists gv2_falta_etapa_grava on public.gv2_falta_etapa;
create policy gv2_falta_etapa_grava on public.gv2_falta_etapa
  for insert to authenticated
  with check (exec_id = (select public.meu_owner_hubspot()) or (select public.eh_gestor_cockpit()));

revoke all on public.gv2_falta_etapa from anon;
grant select, insert on public.gv2_falta_etapa to authenticated;
