-- 0195 (09/10/26): o ranking completo da semana para o gestor (Julyan: "quem merece a bonificação
-- semanal com tudo detalhado, visitas, etc... preciso reconhecer os melhores executivos").
-- placar_detalhe(segunda): os mesmos totais de pontos_da_semana (uma conta só) e, por pessoa, o que
-- está por trás deles — os negócios fechados, as reuniões com desfecho, as visitas dia a dia (GPS,
-- foto, validada pelo gestor, sem prova, acima do teto, pino movido) e as fichas (decisor). Só gestor.
create or replace function public.placar_detalhe(p_segunda date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_seg date; v_sex date; v_res jsonb;
begin
  if not ((select public.is_field_admin()) or (select public.eh_gestor_cockpit())) then
    return jsonb_build_object('erro', 'o ranking detalhado é do gestor');
  end if;
  v_seg := coalesce(p_segunda, ((now() at time zone 'America/Sao_Paulo')::date
             - (extract(isodow from (now() at time zone 'America/Sao_Paulo'))::int - 1)));
  v_sex := v_seg + 4;
  with rk as (select * from public.pontos_da_semana(v_seg)),
  snap as (select s.conteudo from public.cockpit_snapshot s where s.chave = 'hubspot'),
  vendas as (
    select x->>'ownerId' as owner_id,
           jsonb_agg(distinct jsonb_build_object('id', x->>'id', 'nome', x->>'nome', 'mrr', nullif(x->>'mrr', '')::numeric,
             'dia', ((x->>'closedate')::timestamptz at time zone 'America/Sao_Paulo')::date)) as lista
      from snap, jsonb_array_elements(case when jsonb_typeof(snap.conteudo->'vendasLivro') = 'array' then snap.conteudo->'vendasLivro'
                                           when jsonb_typeof(snap.conteudo->'vendasMes') = 'array' then snap.conteudo->'vendasMes' else '[]'::jsonb end) x
     where x->>'closedate' is not null
       and ((x->>'closedate')::timestamptz at time zone 'America/Sao_Paulo')::date between v_seg and v_sex
     group by 1
  ),
  reun as (
    select r.created_by as pessoa, jsonb_agg(jsonb_build_object('cliente', r.nome, 'dia', r.dia) order by r.dia) as lista
      from (select distinct on (m.created_by, m.client_id) m.created_by, m.client_id,
                   coalesce(nullif(btrim(c.empresa), ''), c.nome, 'cliente') as nome,
                   (m.scheduled_at at time zone 'America/Sao_Paulo')::date as dia
              from public.client_meetings m left join public.clients c on c.id = m.client_id
             where m.status = 'realizada' and (m.scheduled_at at time zone 'America/Sao_Paulo')::date between v_seg and v_sex
             order by m.created_by, m.client_id, m.scheduled_at) r
     group by 1
  ),
  vis as (select v.* from public._visitas_com_prova(v_seg, v_sex, null) v),
  dias as (
    select d.visited_by as pessoa, d.dia,
           count(*) filter (where d.provada) as provadas,
           count(distinct d.client_id) filter (where d.provada) as restaurantes,
           count(*) filter (where d.provada and d.motivo = 'gps') as gps,
           count(*) filter (where d.provada and d.motivo = 'foto') as foto,
           count(*) filter (where d.provada and d.motivo = 'validada pelo gestor') as validada,
           count(*) filter (where not d.provada) as sem_prova,
           count(*) filter (where coalesce(d.pino_movido_m, 0) >= 50) as pinos
      from vis d group by 1, 2
  ),
  dias_p as (
    select pessoa, jsonb_agg(jsonb_build_object('dia', dia, 'provadas', provadas, 'pontuadas', least(restaurantes, 6),
             'foraDoTeto', greatest(restaurantes - 6, 0), 'gps', gps, 'foto', foto, 'validada', validada, 'semProva', sem_prova, 'pinos', pinos) order by dia) as lista
      from dias group by 1
  ),
  fichas as (
    select f.owner_id, count(*) as total,
           count(*) filter (where f.como_foi = 'falou_com_decisor') as decisor,
           count(*) filter (where nullif(btrim(f.decisor_nome), '') is not null) as decisor_nome
      from public.fichas_de_rua f
     where (f.ocorrido_em at time zone 'America/Sao_Paulo')::date between v_seg and v_sex
     group by 1
  )
  select jsonb_build_object(
    'segunda', v_seg, 'sexta', v_sex, 'premio', 250, 'lidoEm', now(),
    'fechada', (now() at time zone 'America/Sao_Paulo')::date > v_sex,
    'gravado', (select jsonb_build_object('nome', b.nome, 'ownerId', b.owner_id, 'pontos', b.pontos, 'gravadoEm', b.gravado_em)
                  from public.bonus_semanal b where b.semana = v_seg),
    'linhas', coalesce((select jsonb_agg(jsonb_build_object(
        'pos', rk.pos, 'ownerId', rk.owner_id, 'nome', rk.nome, 'pontos', rk.pontos,
        'vendas', rk.vendas, 'reunioes', rk.reunioes, 'visitas', rk.visitas, 'foraDoTeto', rk.visitas_fora_do_teto,
        'vendasLista', coalesce(vd.lista, '[]'::jsonb), 'reunioesLista', coalesce(re.lista, '[]'::jsonb),
        'dias', coalesce(dp.lista, '[]'::jsonb),
        'fichas', jsonb_build_object('total', coalesce(fi.total, 0), 'decisor', coalesce(fi.decisor, 0), 'decisorNome', coalesce(fi.decisor_nome, 0))
      ) order by rk.pos)
      from rk
      left join vendas vd on vd.owner_id = rk.owner_id
      left join reun re on re.pessoa = rk.pessoa
      left join dias_p dp on dp.pessoa = rk.pessoa
      left join fichas fi on fi.owner_id = rk.owner_id), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$$;
revoke all on function public.placar_detalhe(date) from public, anon;
grant execute on function public.placar_detalhe(date) to authenticated;
