-- 0173 · mapa_negocio devolve também as armas que o robô passou a ler (06/10/26)
--
-- melhor_horario_do_decisor (propriedade do negócio que o app grava) e o decisor do negócio
-- (contato Dono/Gerente, lido pelo robô: decisorNome/decisorPapel). Sem isso o cartão do
-- lead e a folha "Antes da Demo" pediam de novo o que o HubSpot já sabe.
-- Mesma função, mesma regra de acesso (gestor, ou o dono do negócio); só campos a mais.

create or replace function public.mapa_negocio(p_deal text)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with eu as (
    select p.id_hubspot, e.papel
      from public.profiles p
      left join public.equipe_cockpit e on e.profile_id = p.id and e.ativo
     where p.id = auth.uid()
  ),
  negocio as (
    select c.card as x from public.cards_do_funil() c where c.id = p_deal limit 1
  )
  select coalesce((
    select jsonb_strip_nulls(jsonb_build_object(
             'origem_do_lead', n.x->'origem_do_lead',
             'celular', n.x->'celular',
             'gargalo_operacional', n.x->'gargalo_operacional',
             'nome_do_sistema', n.x->'nome_do_sistema',
             'plano_apresentado', n.x->'plano_apresentado',
             'valor_de_mrr', n.x->'valor_de_mrr',
             'data_da_reuniao', n.x->'data_da_reuniao',
             'melhor_horario_do_decisor', n.x->'melhor_horario_do_decisor',
             'decisor_nome', n.x->'decisorNome',
             'decisor_papel', n.x->'decisorPapel'))
      from negocio n, eu
     where eu.papel = 'manager' or (eu.id_hubspot is not null and eu.id_hubspot = n.x->>'ownerId')
  ), '{}'::jsonb)
$function$;
