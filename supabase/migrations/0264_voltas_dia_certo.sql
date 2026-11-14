-- CORREÇÃO DE UM DIA NAS VOLTAS (14/11/26)
--
-- A 0262 e a 0263 liam o dia da volta com `(f.proximo_em at time zone 'America/Sao_Paulo')::date`.
-- `proximo_em` é DATE: o Postgres o converte para meia-noite UTC e, ao passar para Brasília, cai às
-- 21h do dia ANTERIOR. Toda volta era lida um dia antes: a de amanhã virava "de hoje" e a de hoje
-- virava "vencida". Medido: `(date '2026-11-16' at time zone 'America/Sao_Paulo')::date` = 15/11.
-- O Hoje do gestor mostrou assim de 13/11 18:05 até esta correção; o aviso das 8h não chegou a sair.
-- A correção é ler a data como ela é. As duas funções são recriadas inteiras, sem outra mudança.

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
           (hf.deal is not null) as feita
      from ant a
      join clients c on c.id_hubspot = a.deal
      left join hoje_feito hf on hf.deal = a.deal
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
              from (select b2.deal, b2.nome, b2.etapa, b2.bairro, b2.dia, b2.visitou, b2.feita, b2.horario_dono,
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

create or replace function public.voltas_de(p_pessoa uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with eu as (select id_hubspot as dono from profiles where id = p_pessoa and id_hubspot is not null),
  hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  ant as (
    select distinct on (f.deal_id)
           f.deal_id::text as deal,
           f.proximo_tipo,
           (f.ocorrido_em at time zone 'America/Sao_Paulo')::date as visitou,
           f.proximo_em as dia,
           f.horario_dono
      from fichas_de_rua f, hoje
     where f.deal_id is not null
       and f.ocorrido_em > now() - interval '90 days'
       and (f.ocorrido_em at time zone 'America/Sao_Paulo')::date < hoje.d
     order by f.deal_id, f.ocorrido_em desc
  ),
  hoje_feito as (
    select distinct f.deal_id::text as deal
      from fichas_de_rua f, hoje
     where f.deal_id is not null
       and (f.ocorrido_em at time zone 'America/Sao_Paulo')::date = hoje.d
  ),
  base as (
    select a.deal, a.visitou, a.dia, a.horario_dono,
           trim(coalesce(c.empresa, c.nome, 'sem nome')) as nome, c.bairro
      from ant a
      join clients c on c.id_hubspot = a.deal
      join eu on eu.dono = c.vendedor_id_hubspot
      cross join hoje
     where a.proximo_tipo = 'visita'
       and a.dia is not null
       and a.dia <= hoje.d
       and c.etapa in ('Prospecção', 'Visita', 'Conversa com decisor', 'Demo/Proposta', 'Negociação')
       and not exists (select 1 from hoje_feito hf where hf.deal = a.deal)
  )
  select jsonb_build_object(
    'hoje', (select d from hoje),
    'de_hoje', coalesce((select jsonb_agg(jsonb_build_object('deal', deal, 'nome', nome, 'bairro', bairro, 'visitou', visitou, 'dia', dia, 'horario_dono', horario_dono) order by nome)
                           from base, hoje where base.dia = hoje.d), '[]'::jsonb),
    'vencidas', coalesce((select jsonb_agg(x order by x.ordem)
                            from (select deal, nome, bairro, visitou, dia, horario_dono, row_number() over (order by dia desc, nome) as ordem
                                    from base, hoje where base.dia < hoje.d) x
                           where x.ordem <= 3), '[]'::jsonb),
    'n_vencidas', (select count(*) from base, hoje where base.dia < hoje.d)
  );
$$;
