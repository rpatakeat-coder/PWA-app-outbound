-- 0108 — O que o negócio já tem preenchido, para a folha "Mudar etapa" pedir
-- SÓ o que falta (prompt final corrigido §8.4: "o sheet mostra só os que
-- faltam, com as picklists exatas").
--
-- Lê o negócio no snapshot do Cockpit (funilLeads) e devolve apenas os campos
-- que as etapas exigem (PROPS_OBRIGATORIAS_POR_ETAPA). Mesma regra de acesso da
-- porta única: o dono do negócio (profiles.id_hubspot = ownerId) ou um gestor do
-- time. Negócio fora do snapshot (Backlog, Reciclagem, fechados) volta vazio —
-- o servidor confere de novo na hora de gravar.

create or replace function public.mapa_negocio(p_deal text)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  with eu as (
    select p.id_hubspot, e.papel
      from public.profiles p
      left join public.equipe_cockpit e on e.profile_id = p.id and e.ativo
     where p.id = auth.uid()
  ),
  negocio as (
    select x
      from public.cockpit_snapshot s,
           jsonb_each(case when jsonb_typeof(s.conteudo->'funilLeads') = 'object' then s.conteudo->'funilLeads' else '{}'::jsonb end) e,
           jsonb_array_elements(case when jsonb_typeof(e.value) = 'array' then e.value else '[]'::jsonb end) x
     where s.chave = 'hubspot' and x->>'id' = p_deal
     limit 1
  )
  select coalesce((
    select jsonb_strip_nulls(jsonb_build_object(
             'origem_do_lead', n.x->'origem_do_lead',
             'celular', n.x->'celular',
             'gargalo_operacional', n.x->'gargalo_operacional',
             'nome_do_sistema', n.x->'nome_do_sistema',
             'plano_apresentado', n.x->'plano_apresentado',
             'valor_de_mrr', n.x->'valor_de_mrr',
             'data_da_reuniao', n.x->'data_da_reuniao'))
      from negocio n, eu
     where eu.papel = 'manager' or (eu.id_hubspot is not null and eu.id_hubspot = n.x->>'ownerId')
  ), '{}'::jsonb)
$$;

revoke all on function public.mapa_negocio(text) from public, anon;
grant execute on function public.mapa_negocio(text) to authenticated, service_role;
