-- 0198 (10/10/26): venda do fim de semana conta na semana que terminou. Uma venda fechada
-- no sábado 00:05 não contava em semana nenhuma (o placar é seg–sex). Venda vale de segunda
-- 00:00 a domingo 23:59; visitas e demos seguem seg–sex. O bônus é gravado segunda 08:00, depois do domingo.
-- placar_detalhe só dá a semana como fechada depois do domingo. Resto igual à 0197.

create or replace function public.pontos_da_semana(p_segunda date)
returns table(owner_id text, pessoa uuid, nome text, avatar_url text, vendas integer, reunioes integer,
              visitas integer, visitas_fora_do_teto integer, visitas_lead_novo_sem_foto integer, pontos integer, pos integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  with sem as (select p_segunda as seg, p_segunda + 4 as sex),
  snap as (select s.conteudo from public.cockpit_snapshot s where s.chave = 'hubspot'),
  time_ as (
    select p.id as pessoa, p.id_hubspot as owner_id, coalesce(nullif(e.nome, ''), p.full_name) as nome, p.avatar_url
      from public.equipe_cockpit e join public.profiles p on p.id = e.profile_id
     where e.ativo and e.papel = 'rep' and p.id_hubspot is not null
       and not coalesce(e.so_acesso, false) and not coalesce(e.ignorar_owner, false)
  ),
  vendas as (
    select x->>'ownerId' as owner_id, count(distinct x->>'id')::int as n
      from snap, sem,
           jsonb_array_elements(case when jsonb_typeof(snap.conteudo->'vendasLivro') = 'array' then snap.conteudo->'vendasLivro'
                                     when jsonb_typeof(snap.conteudo->'vendasMes') = 'array' then snap.conteudo->'vendasMes'
                                     else '[]'::jsonb end) x
     where x->>'closedate' is not null
       and ((x->>'closedate')::timestamptz at time zone 'America/Sao_Paulo')::date between sem.seg and sem.seg + 6
     group by 1
  ),
  reunioes as (
    select pe.owner_id, count(distinct pe.negocio_id)::int as n
      from public.pontos_eventos pe, sem
     where pe.tipo = 'demo_realizada' and pe.negocio_id is not null
       and (pe.ref_em at time zone 'America/Sao_Paulo')::date between sem.seg and sem.sex
     group by 1
  ),
  vis as (
    select v.visited_by as pessoa, v.dia, v.client_id
      from sem, public._visitas_com_prova(sem.seg, sem.sex, null) v
     where v.provada
     group by 1, 2, 3
  ),
  vis_ok as (select pessoa, dia, count(*)::int as validas from vis group by 1, 2),
  vis_p as (
    select pessoa, sum(least(validas, 6))::int as n, sum(greatest(validas - 6, 0))::int as fora
      from vis_ok group by 1
  ),
  linhas as (
    select t.owner_id, t.pessoa, t.nome, t.avatar_url,
           coalesce(vd.n, 0) as vendas, coalesce(r.n, 0) as reunioes, coalesce(vp.n, 0) as visitas,
           coalesce(vp.fora, 0) as fora
      from time_ t
      left join vendas vd on vd.owner_id = t.owner_id
      left join reunioes r on r.owner_id = t.owner_id
      left join vis_p vp on vp.pessoa = t.pessoa
  )
  select l.owner_id, l.pessoa, l.nome, l.avatar_url, l.vendas, l.reunioes, l.visitas, l.fora, 0,
         (l.vendas * 100 + l.reunioes * 25 + l.visitas * 3)::int as pontos,
         row_number() over (order by (l.vendas * 100 + l.reunioes * 25 + l.visitas * 3) desc, l.vendas desc, l.reunioes desc, l.visitas desc, l.nome)::int as pos
    from linhas l;
$$;
revoke all on function public.pontos_da_semana(date) from public, anon, authenticated;

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
       and ((x->>'closedate')::timestamptz at time zone 'America/Sao_Paulo')::date between v_seg and v_seg + 6
     group by 1
  ),
  reun as (
    select owner_id, jsonb_agg(jsonb_build_object('cliente', nome, 'dia', dia) order by dia) as lista
      from (select pe.owner_id, pe.negocio_id, min(coalesce(pe.negocio_nome, 'negócio')) as nome,
                   min((pe.ref_em at time zone 'America/Sao_Paulo')::date) as dia
              from public.pontos_eventos pe
             where pe.tipo = 'demo_realizada' and pe.negocio_id is not null
               and (pe.ref_em at time zone 'America/Sao_Paulo')::date between v_seg and v_sex
             group by 1, 2) u
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
    'fechada', (now() at time zone 'America/Sao_Paulo')::date > v_seg + 6,
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
      left join reun re on re.owner_id = rk.owner_id
      left join dias_p dp on dp.pessoa = rk.pessoa
      left join fichas fi on fi.owner_id = rk.owner_id), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$$;
revoke all on function public.placar_detalhe(date) from public, anon;
grant execute on function public.placar_detalhe(date) to authenticated;
