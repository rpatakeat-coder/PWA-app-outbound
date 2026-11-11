-- 0261 · TERRITÓRIO: o dono do município inteiro (todoOMunicipio) não casava (11/11/26)
--
-- _territorio_chave(null) devolve '' e não null. Em _territorio_cobre, a área "todo o município" saía com o bairro ''
-- em vez de null; _territorio_lugar a classificava como "dono" de um bairro vazio e nenhum bairro de Vitória (Rodrigo),
-- Serra (Jean) e Vila Velha (Marco) tinha dono no Território. Pior: o resgate do v3/v4 (O que vence) mandava "deixar
-- sair" recém-abertos que têm dono, porque o destino "dono do município" nunca era achado. Achado na conferência do
-- Território v5 (ES com todo bairro tracejado). Agora o bairro vazio é null = o município todo.
create or replace function public._territorio_cobre()
 returns table (owner_id text, nome text, km text, kb text, bairro text)
 language sql stable security definer set search_path = public, pg_temp as
$$
  select t.owner_id, t.nome, public._territorio_chave(a.value ->> 'municipio'), nullif(public._territorio_chave(b.b), ''), b.b
    from public._territorio_time() t
    cross join lateral jsonb_array_elements(t.areas) a
    cross join lateral (
      select null::text as b where coalesce((a.value ->> 'todoOMunicipio')::boolean, false)
      union all
      select x from jsonb_array_elements_text(case when jsonb_typeof(a.value -> 'bairros') = 'array' then a.value -> 'bairros' else '[]'::jsonb end) x
       where not coalesce((a.value ->> 'todoOMunicipio')::boolean, false)
    ) b
$$;
revoke all on function public._territorio_cobre() from public, anon, authenticated;
delete from public.territorio_resumo_cache;
