-- VOLTAS DO TIME (13/11/26)
--
-- Medido em 13/11: de 180 voltas marcadas na ficha de rua e já vencidas, 134 entraram no plano
-- em até 3 dias e só 50 foram feitas. A volta não se perde no planejamento; ela não é cobrada.
-- Esta leitura devolve, por executivo, as voltas de hoje (feitas e total) e as vencidas, com a
-- lista pelo nome do restaurante, para o Hoje do gestor.
--
-- "Volta" = a última ficha do negócio antes de hoje marcou o próximo passo como visita.
--   · de hoje ... a data marcada é hoje; feita = ficha ou check-in do restaurante hoje
--   · vencida ... a data marcada já passou e ninguém voltou (nem hoje)
-- Só negócio aberto (Prospecção a Negociação) e no nome de quem é do time hoje: o dono é o do
-- pino (clients.vendedor_id_hubspot), não o de quem preencheu a ficha, porque negócio muda de mão.
--
-- Só gestor lê. Uma chamada, só contagem e lista curta: fichas_de_rua tem poucas centenas de
-- linhas por mês e a janela é de 90 dias.

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
           (f.proximo_em at time zone 'America/Sao_Paulo')::date as dia,
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

-- No Supabase, função nova em public nasce executável por anon: tirar de anon e de public.
revoke all on function public.voltas_do_time() from public;
revoke all on function public.voltas_do_time() from anon;
grant execute on function public.voltas_do_time() to authenticated;
