-- 0092 — Configuração do Cockpit no banco (playbook, precificação, territórios…)
--
-- Por quê: no Cockpit, essas configurações eram arquivos do repositório
-- (data/*.json) empacotados junto da rota /api/dados. Na Edge Function
-- cockpit-dados elas não cabem no pacote de forma sustentável (o playbook
-- compilado sozinho tem 789 KB) e cada ajuste exigiria um deploy. Aqui elas
-- viram linhas de cockpit_config, lidas pela função a cada carga.
--
-- Chaves: playbook, precificacao, leads-referencia, territorios,
-- redes-excluidas, cadencias, comissionamento, temperatura, maptiler-config.
--
-- RLS ligada e SEM política, como o snapshot: só o service_role (a função)
-- lê. O que chega à tela é o que a função recorta — o playbook, por exemplo,
-- desce sem o capítulo Liderança para executivo.
--
-- importar_linhas_cockpit (0090) passa a aceitar cockpit_config, para a carga
-- inicial e para as próximas atualizações pelo mesmo canal conferido.

create table if not exists public.cockpit_config (
  chave text primary key,
  conteudo jsonb not null,
  atualizado_em timestamptz not null default now(),
  origem text
);
alter table public.cockpit_config enable row level security;

create or replace function public.importar_linhas_cockpit(p_tabela text, p_json text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pk text;
  v_set text;
  v_n integer;
begin
  if p_tabela not in (
    'cockpit_snapshot', 'snapshot_farol', 'perfis', 'noticias_setor',
    'novidades_mercado', 'restaurantes_osm', 'planos_semanais', 'planos_diarios',
    'dailies', 'leads_prospeccao', 'registros_rodada', 'pdi_compromissos',
    'pauta_do_lider', 'playbook_progresso', 'comunicados', 'comunicados_lidos',
    'cockpit_config'
  ) then
    raise exception 'tabela fora da lista: %', p_tabela;
  end if;

  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
    into v_pk
  from pg_index i
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
  where i.indrelid = ('public.' || p_tabela)::regclass and i.indisprimary;

  select string_agg(format('%1$I = excluded.%1$I', c.column_name), ', ' order by c.ordinal_position)
    into v_set
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = p_tabela
    and c.column_name not in (
      select a.attname from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
      where i.indrelid = ('public.' || p_tabela)::regclass and i.indisprimary);

  execute format(
    'insert into public.%1$I select * from json_populate_recordset(null::public.%1$I, $1::json) '
    'on conflict (%2$s) do update set %3$s',
    p_tabela, v_pk, v_set)
  using p_json;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.importar_linhas_cockpit(text, text) from public, anon, authenticated;
grant execute on function public.importar_linhas_cockpit(text, text) to service_role;
