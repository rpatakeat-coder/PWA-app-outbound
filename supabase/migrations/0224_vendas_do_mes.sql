-- 0224 · O RESULTADO DO MÊS, SEM PONTOS (Julyan, 20/10/26: "eu preciso só do resultado geral do
-- mês, com ranking MRR e valor, apenas… quero os pontos só pra competição semanal… e uma tabela com
-- todas as vendas desse mês").
--
-- Uma função só para o app e o Cockpit: as vendas do mês corrente pela competência (o mesmo
-- vendasLivro do robô que alimenta o placar da semana e o "Vendas do mês"), o total, o ranking por
-- MRR (desempate: valor, depois nº de vendas) e a lista de cada venda. Nenhum ponto aqui.
-- Quem lê: o time do Cockpit e a gestão (a mesma porta do ranking_executivo). O executivo já vê os
-- totais dos colegas no ranking (autorizado em 03/10/26).

create or replace function public.vendas_do_mes()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with pode as (
    select (select public.is_field_admin()) or (select public.eh_gestor_cockpit())
        or exists (select 1 from public.equipe_cockpit e where e.profile_id = (select auth.uid()) and e.ativo) as ok
  ),
  mes as (select to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM') as m),
  snap as (select s.conteudo, s.atualizado_em from public.cockpit_snapshot s where s.chave = 'hubspot'),
  v as (
    select x->>'id' as id, x->>'nome' as nome, x->>'ownerId' as owner_id,
           (x->>'closedate')::timestamptz as fechou,
           coalesce(nullif(x->>'mrr', '')::numeric, 0) as mrr,
           coalesce(nullif(x->>'receita', '')::numeric, 0) as valor,
           nullif(x->>'ajustado', '') as ajustado
      from snap, mes,
           jsonb_array_elements(case when jsonb_typeof(snap.conteudo->'vendasLivro') = 'array' then snap.conteudo->'vendasLivro'
                                     when jsonb_typeof(snap.conteudo->'vendasMes') = 'array' then snap.conteudo->'vendasMes'
                                     else '[]'::jsonb end) x
     where coalesce(x->>'mesDeCompetencia', to_char(((x->>'closedate')::timestamptz at time zone 'America/Sao_Paulo')::date, 'YYYY-MM')) = mes.m
  ),
  dono as (
    select v.*, coalesce((select coalesce(nullif(e.nome, ''), p.full_name) from public.profiles p
                            left join public.equipe_cockpit e on e.profile_id = p.id
                           where p.id_hubspot = v.owner_id limit 1), 'fora do time') as dono
      from v
  ),
  por as (
    select owner_id, max(dono) as nome, count(*)::int as vendas, sum(mrr) as mrr, sum(valor) as valor
      from dono group by owner_id
  )
  select case when not (select ok from pode) then jsonb_build_object('erro', 'Sem acesso ao resultado do mês.')
  else jsonb_build_object(
    'mes', (select m from mes),
    'lidoEm', (select atualizado_em from snap),
    'total', (select jsonb_build_object('vendas', count(*), 'mrr', coalesce(sum(mrr), 0), 'valor', coalesce(sum(valor), 0)) from dono),
    'ranking', coalesce((select jsonb_agg(jsonb_build_object('pos', pos, 'ownerId', owner_id, 'nome', nome, 'vendas', vendas, 'mrr', mrr, 'valor', valor) order by pos)
                           from (select por.*, row_number() over (order by mrr desc, valor desc, vendas desc, nome) as pos from por) r), '[]'::jsonb),
    'vendas', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'ownerId', owner_id, 'dono', dono, 'fechou', fechou, 'mrr', mrr, 'valor', valor, 'ajustado', ajustado) order by fechou desc)
                          from dono), '[]'::jsonb)
  ) end;
$$;

revoke all on function public.vendas_do_mes() from public, anon;
grant execute on function public.vendas_do_mes() to authenticated;
