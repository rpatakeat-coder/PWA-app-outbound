-- 0097 — Canal de carga para a virada: radar_pracas e dailies por (dono, dia)
--
-- Por quê: em 25/09/2026 o robô do Cockpit passa a gravar no APP. Antes da
-- troca, o que o time escreveu no Cockpit desde a cópia de 24/09 precisa estar
-- aqui. A comparação linha a linha achou duas coisas que o canal não cobria:
--   - radar_pracas (40 linhas no Cockpit, 0 aqui) não estava na lista;
--   - dailies tem ids diferentes nos dois bancos (o APP tem os próprios); a
--     chave real é (owner_id, data). Casar pelo id duplicaria o dia de todo
--     mundo e bateria na unique (owner_id, data). Agora dailies casa por
--     (owner_id, data) e preserva id, seller_id e created_at do APP; a ponte
--     dailies_ponte_identidade preenche o seller_id das linhas novas.
-- As outras tabelas seguem como antes: upsert pela chave primária.

create or replace function public.importar_linhas_cockpit(p_tabela text, p_json text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_alvo text; v_fora text[]; v_set text; v_n integer;
begin
  if p_tabela not in ('cockpit_snapshot','snapshot_farol','perfis','noticias_setor','novidades_mercado','restaurantes_osm','planos_semanais','planos_diarios','dailies','leads_prospeccao','registros_rodada','pdi_compromissos','pauta_do_lider','playbook_progresso','comunicados','comunicados_lidos','cockpit_config','radar_pracas') then
    raise exception 'tabela fora da lista: %', p_tabela;
  end if;
  if p_tabela = 'dailies' then
    v_alvo := 'owner_id, data';
    v_fora := array['id', 'owner_id', 'data', 'seller_id', 'created_at'];
  else
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum), array_agg(a.attname::text)
      into v_alvo, v_fora
    from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
    where i.indrelid = ('public.' || p_tabela)::regclass and i.indisprimary;
  end if;
  select string_agg(format('%1$I = excluded.%1$I', c.column_name), ', ' order by c.ordinal_position) into v_set
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = p_tabela and c.column_name <> all (v_fora);
  execute format('insert into public.%1$I select * from json_populate_recordset(null::public.%1$I, $1::json) on conflict (%2$s) do update set %3$s',
    p_tabela, v_alvo, v_set) using p_json;
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

revoke all on function public.importar_linhas_cockpit(text, text) from public, anon, authenticated;
grant execute on function public.importar_linhas_cockpit(text, text) to service_role;
