-- 0170 · PESSOAS DO GESTOR v2: 1:1 conferido sozinho e a rotação de campo (06/10/26)
--
-- Pacote pessoa.zip (Claude Design). O pacote propunha quatro tabelas novas; aqui vão
-- três colunas numa tabela que já existe e UMA tabela nova:
--
-- um_a_um (já existe, o executivo já lê os seus pela RLS):
--   canal       'video' (1:1 a distância) | 'campo' (devolutiva do dia de campo)
--   combinados  [{texto, regra, alvo, prazo}] — o compromisso VERIFICÁVEL. A regra é uma
--               de plano_diario | visitas_dia | travados_com_data | decisao_em_negocio | livre,
--               e o status é calculado na carga, nunca digitado.
--   devolutiva  {foco, observados[], faz_bem, mudar} — só nas linhas de campo.
--   `compromissos` (text[]) continua sendo gravado com os mesmos textos: é o que a tela de
--   Desenvolvimento lê hoje.
--
-- gestor_idas_campo (nova): a rotação — uma praça por semana, quem o gestor encontra e o
-- dia de cada um. Nada no banco registrava ida do gestor a campo.

alter table public.um_a_um
  add column if not exists canal text not null default 'video',
  add column if not exists combinados jsonb not null default '[]'::jsonb,
  add column if not exists devolutiva jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'um_a_um_canal_valido') then
    alter table public.um_a_um add constraint um_a_um_canal_valido check (canal in ('video', 'campo'));
  end if;
end $$;

create table if not exists public.gestor_idas_campo (
  id uuid primary key default gen_random_uuid(),
  gestor_owner_id text not null,
  praca text not null,
  inicio date not null,
  owner_ids text[] not null default '{}',
  dia_por_owner jsonb not null default '{}'::jsonb,
  status text not null default 'planejada' check (status in ('planejada', 'confirmada', 'feita')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists gestor_idas_campo_inicio on public.gestor_idas_campo (inicio);

alter table public.gestor_idas_campo enable row level security;

drop policy if exists gestor_idas_campo_gestor on public.gestor_idas_campo;
create policy gestor_idas_campo_gestor on public.gestor_idas_campo
  for all to authenticated
  using ((select public.eh_gestor_cockpit()))
  with check ((select public.eh_gestor_cockpit()));

-- o executivo vê as idas em que ele está (para o app mostrar "Julyan vem dia X")
drop policy if exists gestor_idas_campo_executivo_le on public.gestor_idas_campo;
create policy gestor_idas_campo_executivo_le on public.gestor_idas_campo
  for select to authenticated
  using ((select public.meu_owner_hubspot()) = any (owner_ids));
