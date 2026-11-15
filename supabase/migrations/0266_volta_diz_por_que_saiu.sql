-- A VOLTA NÃO FEITA DIZ POR QUE SAIU DO PLANO (15/11/26)
--
-- Desde a 0265 toda parada que sai do plano leva o motivo. Aqui a leitura do Hoje do gestor passa a
-- trazer, em cada volta, o motivo da parada do DIA MARCADO quando ela foi tirada ('tirou'):
-- fechado | sem_tempo | outro_dia | nao_vale | perdido | descartada | desfeito | cockpit, ou
-- 'sem_motivo' para as que saíram antes da pergunta existir. Sem parada tirada, 'tirou' vem nulo.
-- O resto da função é a da 0264, sem outra mudança.

create or replace function public.voltas_do_time()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_out jsonb;
begin
  if not coalesce((select public.is_field_admin()), false) then
    return null;
  end if;

  with ant as (
    -- a última ficha de cada negócio ANTES de hoje: é ela que diz o que foi combinado
    select distinct on (f.deal_id)
           f.deal_id::text as deal,
           f.client_id,
           f.proximo_tipo,
           (f.ocorrido_em at time zone 'America/Sao_Paulo')::date as visitou,
           f.proximo_em as dia,
           f.horario_dono
      from fichas_de_rua f
     where f.deal_id is not null
       and f.ocorrido_em > now() - interval '90 days'
       and (f.ocorrido_em at time zone 'America/Sao_Paulo')::date < v_hoje
     order by f.deal_id, f.ocorrido_em desc
  ),
  hoje_feito as (
    select distinct f.deal_id::text as deal
      from fichas_de_rua f
     where f.deal_id is not null
       and (f.ocorrido_em at time zone 'America/Sao_Paulo')::date = v_hoje
    union
    select distinct c.id_hubspot
      from client_visits v
      join clients c on c.id = v.client_id
     where (v.visited_at at time zone 'America/Sao_Paulo')::date = v_hoje
       and c.id_hubspot is not null
  ),
  base as (
    select a.deal, a.visitou, a.dia, a.horario_dono,
           c.vendedor_id_hubspot as dono,
           trim(coalesce(c.empresa, c.nome, 'sem nome')) as nome,
           c.etapa, c.bairro,
           (hf.deal is not null) as feita,
           t.tirou
      from ant a
      join clients c on c.id_hubspot = a.deal
      left join hoje_feito hf on hf.deal = a.deal
      -- a parada do dia marcado saiu do plano? com que motivo (0265); 'sem_motivo' = saiu calada
      left join lateral (
        select coalesce(s.motivo_remocao, 'sem_motivo') as tirou
          from field_routes r
          join profiles pp on pp.id = r.seller_id
          join field_route_stops s on s.route_id = r.id
         where pp.id_hubspot = c.vendedor_id_hubspot
           and r.route_date = a.dia
           and s.client_id = a.client_id
           and s.status = 'removed'
         limit 1
      ) t on true
     where a.proximo_tipo = 'visita'
       and a.dia is not null
       and a.dia <= v_hoje
       and c.etapa in ('Prospecção', 'Visita', 'Conversa com decisor', 'Demo/Proposta', 'Negociação')
       and c.vendedor_id_hubspot is not null
       and exists (select 1 from equipe_cockpit e join profiles p on p.id = e.profile_id
                    where e.ativo and e.papel = 'rep' and p.id_hubspot = c.vendedor_id_hubspot)
  ),
  por as (
    select dono,
           count(*) filter (where dia = v_hoje) as hoje,
           count(*) filter (where dia = v_hoje and feita) as hoje_feitas,
           count(*) filter (where dia < v_hoje and not feita) as vencidas,
           min(dia) filter (where dia < v_hoje and not feita) as mais_antiga,
           (select jsonb_agg(x order by x.ordem)
              from (select b2.deal, b2.nome, b2.etapa, b2.bairro, b2.dia, b2.visitou, b2.feita, b2.horario_dono, b2.tirou,
                           row_number() over (order by (b2.dia = v_hoje) desc, b2.dia desc, b2.nome) as ordem
                      from base b2
                     where b2.dono = b.dono and (b2.dia = v_hoje or not b2.feita)) x
             where x.ordem <= 40) as lista
      from base b
     group by dono
  )
  select jsonb_build_object(
           'hoje', v_hoje,
           'lido_em', now(),
           'pessoas', coalesce(jsonb_object_agg(dono, jsonb_build_object(
             'hoje', hoje, 'hoje_feitas', hoje_feitas, 'vencidas', vencidas,
             'mais_antiga', mais_antiga, 'lista', coalesce(lista, '[]'::jsonb))), '{}'::jsonb))
    into v_out
    from por;

  return coalesce(v_out, jsonb_build_object('hoje', v_hoje, 'lido_em', now(), 'pessoas', '{}'::jsonb));
end;
$$;
