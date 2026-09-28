-- 0126 · O mapa sabe quais clientes estão em queda (lente "Clientes em queda", 27/09)
--
-- mapa_contexto ganha 'queda': [client_id, motivo, faturamento do último mês, executivo do
-- território] de cada cliente em queda que tem pino (clientes_takeat, 0122/0125). Igual à 0118
-- no resto. Faturamento de cliente é dado sensível: só vai para quem é do time do Cockpit
-- (mesma regra da RLS de clientes_takeat); os demais recebem a lista vazia.

create or replace function public.mapa_contexto()
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'tempo', coalesce((
      select jsonb_agg(jsonb_build_array(
               c.id,
               case when c.card->>'dias' ~ '^\d+$' then (c.card->>'dias')::int end,
               coalesce((c.card->>'slaBreach')::boolean, false),
               c.card->>'ultimaInteracao',
               c.etapa,
               c.card->>'tempFaixa',
               coalesce((c.card->>'tempParcial')::boolean, false),
               nullif(c.card->>'origem_do_lead', '')))
        from public.cards_do_funil() c), '[]'::jsonb),
    'donos', coalesce((
      select jsonb_agg(distinct p.id_hubspot)
        from public.equipe_cockpit e join public.profiles p on p.id = e.profile_id
       where e.ativo and not coalesce(e.so_acesso, false) and p.id_hubspot is not null), '[]'::jsonb),
    'limites', coalesce((select c.conteudo from public.cockpit_config c where c.chave = 'mapa_limites'), '[7, 30]'::jsonb),
    'atualizado_em', (select s.atualizado_em from public.cockpit_snapshot s where s.chave = 'hubspot'),
    'queda', case when public.is_field_admin()
                    or exists (select 1 from public.equipe_cockpit e where e.profile_id = auth.uid() and e.ativo)
      then coalesce((
        select jsonb_agg(jsonb_build_array(t.client_id, t.motivo_queda, t.faturamento_mes1, t.executivo_owner_id)
                         order by t.faturamento_mes1 desc nulls last)
          from public.clientes_takeat t where t.em_queda and t.client_id is not null), '[]'::jsonb)
      else '[]'::jsonb end
  )
$$;

revoke all on function public.mapa_contexto() from public, anon;
grant execute on function public.mapa_contexto() to authenticated, service_role;
