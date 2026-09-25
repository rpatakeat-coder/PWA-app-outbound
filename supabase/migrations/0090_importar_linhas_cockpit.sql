-- 0090 — Canal de cópia do Cockpit para o APP que preserva o dado exato
--
-- Por quê: na cópia dos leads (24/09/2026) o JSON passou pelo JavaScript e o
-- numeric perdeu a escala (5.0 virou 5) — o hash denunciou 4 notas. Esta
-- função grava a partir do TEXTO JSON original (json_populate_recordset no
-- Postgres), então número, data e texto chegam como saíram do Cockpit. Serve
-- para a carga do snapshot agora e para a ressincronização da virada (planos,
-- dailies, leads, que seguem vivos no Cockpit até lá).
--
-- Upsert pela chave primária: linha nova entra, linha existente é
-- SOBRESCRITA com o valor do Cockpit (é o que a ressincronização precisa —
-- até a virada, o Cockpit é a fonte).
--
-- Segurança:
--   - lista fechada de tabelas (as que o Cockpit tem e o APP recebeu);
--   - SECURITY DEFINER, executável só pelo service_role (Edge Functions);
--   - quem chama é uma Edge Function descartável que aceita só blocos cujo
--     SHA-256 está numa lista fechada (mesmo canal dos leads).

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
    'pauta_do_lider', 'playbook_progresso', 'comunicados', 'comunicados_lidos'
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
