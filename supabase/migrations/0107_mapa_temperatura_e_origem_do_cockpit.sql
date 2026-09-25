-- 0107 — Temperatura e origem do Cockpit no pino (prompt final corrigido, 25/09)
--
-- O prompt corrigido fecha duas regras com o código do Cockpit:
--   - Temperatura = nota 0–100 do Cockpit (lib/temperatura.js), faixa lida do
--     snapshot, não recalculada no app: Q ≥ 70 · M ≥ 55 · F. Nota parcial (sem
--     toque registrado) mostra "F·".
--   - Origem = a picklist origem_do_lead do HubSpot (Rua, GoogleMaps, Casa dos
--     Dados, Indicação, Instagram, Ads, Familia, Eventos). Não um enum paralelo.
-- mapa_contexto passa a entregar, por negócio do snapshot: faixa, parcial e
-- origem_do_lead (posições 6, 7 e 8 do "tempo"). Medido: 317 de 526 com faixa,
-- 60 parciais, 194 com origem.

create or replace function public.mapa_contexto()
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'tempo', coalesce((
      select jsonb_agg(jsonb_build_array(
               x->>'id',
               case when x->>'dias' ~ '^\d+$' then (x->>'dias')::int end,
               coalesce((x->>'slaBreach')::boolean, false),
               x->>'ultimaInteracao',
               e.key,
               x->>'tempFaixa',
               coalesce((x->>'tempParcial')::boolean, false),
               nullif(x->>'origem_do_lead', '')))
        from public.cockpit_snapshot s,
             jsonb_each(case when jsonb_typeof(s.conteudo->'funilLeads') = 'object' then s.conteudo->'funilLeads' else '{}'::jsonb end) e,
             jsonb_array_elements(case when jsonb_typeof(e.value) = 'array' then e.value else '[]'::jsonb end) x
       where s.chave = 'hubspot' and x->>'id' is not null), '[]'::jsonb),
    'donos', coalesce((
      select jsonb_agg(distinct p.id_hubspot)
        from public.equipe_cockpit e join public.profiles p on p.id = e.profile_id
       where e.ativo and not coalesce(e.so_acesso, false) and p.id_hubspot is not null), '[]'::jsonb),
    'limites', coalesce((select c.conteudo from public.cockpit_config c where c.chave = 'mapa_limites'), '[7, 30]'::jsonb),
    'atualizado_em', (select s.atualizado_em from public.cockpit_snapshot s where s.chave = 'hubspot')
  )
$$;
