-- 0149 · Calculadora de Planos (Propostas do Cockpit) — 02/10/2026
--
-- A tabela de preços passa a morar no banco, igual ao Takeat OS (/inside-sales/precificacao):
-- uma linha só (id = 'current') com quatro colunas JSON. Leitura para qualquer usuário logado;
-- gravação só para gestor do Cockpit (eh_gestor_cockpit), com a trava AQUI e não só no botão.
-- Cada gravação guarda a versão anterior em pricing_config_historico, para dar para voltar.
--
-- Carga inicial: a configuração real exportada do Takeat OS em 02/10/2026 (pacote
-- precificacao-para-replicar/dados/pricing_config.json). Ela NÃO está neste arquivo: o
-- repositório é público e a tabela de preços é informação interna. Foi aplicada direto no
-- banco, com "on conflict (id) do nothing" (rodar de novo não sobrescreve edição do gestor).
-- Três ajustes do Julyan sobre o pacote (02/10/2026): Conciliação Bancária OFX a R$ 99 cheia
-- (R$ 69 é o preço com 30% de desconto), "Cashback + Clube de Fidelidade" R$ 149 entra (já
-- estava no Cockpit) e "Gerente Financeiro (IA)" fica de fora. Totem R$ 319 e TEF Balcão R$ 119
-- como no pacote; as 8 periodicidades do pacote.

create table if not exists public.pricing_config (
  id text primary key default 'current',
  planos jsonb not null,
  periodicidades jsonb not null,
  adicionais jsonb not null,
  funcionalidades jsonb not null,
  updated_by uuid,
  updated_by_name text,
  updated_at timestamptz not null default now(),
  constraint pricing_config_linha_unica check (id = 'current')
);

create table if not exists public.pricing_config_historico (
  id bigserial primary key,
  config jsonb not null,
  trocado_por uuid,
  trocado_por_nome text,
  trocado_em timestamptz not null default now()
);

alter table public.pricing_config enable row level security;
alter table public.pricing_config_historico enable row level security;

drop policy if exists pricing_config_ler on public.pricing_config;
create policy pricing_config_ler on public.pricing_config
  for select to authenticated using (true);

drop policy if exists pricing_config_gestor_grava on public.pricing_config;
create policy pricing_config_gestor_grava on public.pricing_config
  for update to authenticated
  using ((select public.eh_gestor_cockpit()))
  with check ((select public.eh_gestor_cockpit()));

drop policy if exists pricing_config_historico_ler on public.pricing_config_historico;
create policy pricing_config_historico_ler on public.pricing_config_historico
  for select to authenticated using ((select public.eh_gestor_cockpit()));

-- quem gravou e a versão anterior: o navegador não escolhe nenhum dos dois
create or replace function public.tg_pricing_config_versao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
begin
  select coalesce(nullif(trim(p.full_name), ''), p.email) into v_nome
    from public.profiles p where p.id = auth.uid();
  insert into public.pricing_config_historico (config, trocado_por, trocado_por_nome)
  values (jsonb_build_object(
            'planos', old.planos, 'periodicidades', old.periodicidades,
            'adicionais', old.adicionais, 'funcionalidades', old.funcionalidades,
            'updated_at', old.updated_at, 'updated_by_name', old.updated_by_name),
          auth.uid(), v_nome);
  new.updated_by := auth.uid();
  new.updated_by_name := v_nome;
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists pricing_config_versao on public.pricing_config;
create trigger pricing_config_versao
  before update on public.pricing_config
  for each row execute function public.tg_pricing_config_versao();

grant select, update on public.pricing_config to authenticated;
grant select on public.pricing_config_historico to authenticated;
revoke insert, delete on public.pricing_config from authenticated, anon;
revoke all on public.pricing_config from anon;
revoke all on public.pricing_config_historico from anon;
-- o histórico só se lê: quem escreve nele é o gatilho (security definer)
revoke insert, update, delete on public.pricing_config_historico from authenticated;

