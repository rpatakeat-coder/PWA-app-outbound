-- 0260 · TERRITÓRIO v5 (design_handoff_territorio_v5, 11/11/26): onde chega × onde anda
--
-- O pedido do Julyan (09/11): "preciso saber de onde eles atuam, onde eu abasteço os leads, qual a inteligência de cada
-- praça". A v5 da aba responde isso por praça, e o resumo guardado (0259) passa a trazer, além de tudo o que a v4 lê
-- (nada sai: a tela no ar continua funcionando até a v5 entrar):
--   · v5_visitas: [praça, dono, chave do bairro, bairro, lat, lng, visitas], visitas com prova de 4 semanas por executivo
--     e bairro, com o centro das contas visitadas (o "onde cada um anda" e as manchas do mapa);
--   · v5_ex: as visitas de 4 semanas de cada executivo (com ou sem bairro) e a ordem em equipe_cockpit (a cor dele);
--   · v5_pracas: por praça, chegaram (30 d), quantos caem onde o time anda (o bairro entre os bairros com visita do time
--     em 4 semanas), ativos e venceram (todos os expirados da Casa dos Dados);
--   · v5_fichas: [praça, sistema, fichas, falou com o decisor, decisor ausente] de 30 dias;
--   · bairros ganha, no fim de cada linha, chegaram (30 d) e venceram, e passa a ter também o bairro onde só chegou lead.
-- O guardado continua igual: territorio_resumo lê o pronto e o pg_cron recalcula a cada 20 min.

create or replace function public._territorio_resumo_calc(p_praca text default null, p_com_ids boolean default false, p_carga integer default null)
 returns jsonb
 language plpgsql stable security definer set search_path = public, pg_temp as
$function$
declare
  v_pr text := public._territorio_filtro(p_praca);
  v_hoje date := public._territorio_hoje();
  v_sem date := public._territorio_semana(public._territorio_hoje());
  v_seg date := date_trunc('week', public._territorio_hoje())::date;
  v_carga integer;
  v jsonb;
begin
  select tc.carga into v_carga from public.territorio_carga tc where tc.gestor = auth.uid();

  with base as materialized (select * from public._territorio_base() b where (v_pr is null and b.praca in (select t0.praca from public._territorio_time() t0)) or b.praca = v_pr),
  lugar as materialized (select * from public._territorio_lugar()),
  vis4 as materialized (
    select public._territorio_praca(coalesce(lp.cidade, c.cidade)) as praca, vv.owner_id,
           public._territorio_chave(coalesce(lp.cidade, c.cidade)) as km, public._territorio_chave(coalesce(lp.bairro, c.bairro)) as kb,
           coalesce(lp.bairro, c.bairro) as bairro, c.latitude as lat, c.longitude as lng
      from public._visitas_com_prova(v_hoje - 27, v_hoje, null) vv
      join public.clients c on c.id = vv.client_id
      left join public.leads_prospeccao lp on lp.id = c.lead_prospeccao_id
     where vv.provada
  ),
  exp as materialized (
    select public._territorio_praca(lp.cidade) as praca, public._territorio_chave(lp.cidade) as km, public._territorio_chave(lp.bairro) as kb, count(*) as n
      from public.leads_prospeccao lp
     where lp.status = 'expirado' and lp.fonte ilike '%casa dos dados%'
     group by 1, 2, 3
  ),
  tm as materialized (select * from public._territorio_time() t where v_pr is null or t.praca = v_pr),
  f as (select * from base where criado between v_hoje - 29 and v_hoje),
  fx as (
    select f.*, (f.owner_id is not null) as dono,
           f.owner_id is not null and (f.sug_viva or f.status = 'na_rota' or f.na_grade or f.visitado or f.negocio) as sugerido,
           f.owner_id is not null and (f.status = 'na_rota' or f.na_grade or f.visitado or f.negocio) as rota,
           f.owner_id is not null and f.visitado as vis,
           f.owner_id is not null and f.visitado and f.avancou as neg,
           f.owner_id is not null and f.negocio and not f.visitado as neg_sv
      from f
  ),
  pv as (
    select owner_id, percentile_cont(0.5) within group (order by extract(epoch from primeira_visita - criado_em) / 86400.0) as med, count(*) as n
      from base where owner_id is not null and visitado and criado >= v_hoje - 89 and primeira_visita >= criado_em
     group by owner_id
  ),
  por as (
    select owner_id,
           count(*) filter (where vence_semana) as vence_semana,
           count(*) filter (where ativo and not visitado) as fila,
           count(*) filter (where sug_semana and not sug_conf and not negocio and sug_ate is not null) as sug_pend,
           count(*) filter (where sug_semana and (sug_conf or negocio)) as sug_conf
      from base where owner_id is not null group by owner_id
  ),
  ex as (
    select tm.owner_id, tm.nome, tm.praca, tm.ramp,
           count(fx.id) filter (where fx.dono) as chegou,
           count(fx.id) filter (where fx.sugerido) as sugerido,
           count(fx.id) filter (where fx.rota) as na_rota,
           count(fx.id) filter (where fx.vis) as visitado,
           count(fx.id) filter (where fx.neg) as negocio,
           count(fx.id) filter (where fx.neg_sv) as negocio_sem_visita
      from tm left join fx on fx.owner_id = tm.owner_id
     group by 1, 2, 3, 4
  ),
  gr as materialized (
    select distinct substr(s.k, 3) as lead, ps.owner_id, ps.data_segunda
      from public.planos_semanais ps
      cross join lateral jsonb_array_elements(case when jsonb_typeof(ps.grade) = 'array' then ps.grade else '[]'::jsonb end) d
      cross join lateral jsonb_array_elements(case when jsonb_typeof(d.value) = 'array' then d.value else '[]'::jsonb end) e
      cross join lateral (select case when jsonb_typeof(e.value) = 'object' then e.value ->> 'id' else e.value #>> '{}' end as k) s
     where ps.data_segunda >= v_seg - 21 and s.k like 'n-%'
  ),
  wk as (
    select w.seg,
           (select count(*) from base b where b.criado between w.seg and w.seg + 6) as chegou,
           (select count(distinct s.lead_id) from public.territorio_sugestoes s join base b on b.id = s.lead_id
             where s.semana = w.seg and b.owner_id is not null) as sugerido,
           (select count(distinct b.id) from base b join gr on gr.lead = b.id::text and gr.owner_id = b.owner_raw and gr.data_segunda = w.seg
             where b.owner_id is not null) as na_rota,
           (select count(*) from base b where b.owner_id is not null and b.visitado
              and (b.primeira_visita at time zone 'America/Sao_Paulo')::date between w.seg and w.seg + 6) as visitado,
           (select count(*) from base b where b.owner_id is not null and b.visitado and b.avancou
              and (b.primeira_visita at time zone 'America/Sao_Paulo')::date between w.seg and w.seg + 6) as negocio
      from (select (v_seg - 7 * g)::date as seg from generate_series(3, 0, -1) g) w
  ),
  carga as (
    select criado as dia, count(*) as n, max(criado_em) as ultima, count(distinct kb) as bairros
      from base where criado = (select max(criado) from base) group by criado
  ),
  -- o destino de quem vence: dono do bairro; dono do município; quem tem dia lá; quem mais visitou lá; ninguém
  venc as materialized (
    select b.id, b.praca, b.km, b.kb, b.abertura, d.owner_id as para, d.nome as para_nome
      from base b
      left join lateral (
        select u.owner_id, u.nome from lugar u
         where u.nome is not null and u.praca = b.praca
           and ((u.tipo = 'dono' and u.km = b.km and u.kb = b.kb) or (u.tipo = 'municipio' and u.km = b.km)
                or (u.tipo = 'dia' and u.kb = b.kb) or (u.tipo = 'visita' and u.km = b.km and u.kb = b.kb))
         order by case u.tipo when 'dono' then 1 when 'municipio' then 2 when 'dia' then 3 else 4 end, u.n desc, u.owner_id
         limit 1) d on true
     where b.vence14 and b.praca is not null
  ),
  -- o mapa: um ponto por bairro com recém-aberto ativo (o centro dos leads dele), nunca os pinos
  bz as (
    select b.praca, b.km, b.kb,
           mode() within group (order by b.bairro) as bairro_cru, mode() within group (order by b.cidade) as cidade,
           mode() within group (order by b.estado) as uf,
           round(avg(b.lat) filter (where b.lat is not null and b.lat <> 0)::numeric, 5) as lat,
           round(avg(b.lng) filter (where b.lng is not null and b.lng <> 0)::numeric, 5) as lng,
           count(*) filter (where b.status in ('pendente', 'atribuido') and b.idade <= 90) as ativos,
           count(*) filter (where b.status in ('pendente', 'atribuido') and b.idade <= 90 and not b.visitado) as sem_visita,
           count(*) filter (where b.vence14) as vencem,
           count(*) filter (where b.criado >= v_hoje - 29) as chegaram
      from base b
     where b.praca is not null and b.kb <> ''
     group by 1, 2, 3
    having count(*) filter (where b.status in ('pendente', 'atribuido') and b.idade <= 90) > 0 or count(*) filter (where b.criado >= v_hoje - 29) > 0
  ),
  bairros as (
    select bz.*, d.owner_id as dono_id, d.nome as dono_nome, d.rotulo,
           coalesce((select sum(u.n) from lugar u where u.tipo = 'visita' and u.km = bz.km and u.kb = bz.kb), 0) as prova,
           coalesce(ex2.n, 0) as venceram
      from bz
      left join exp ex2 on ex2.praca = bz.praca and ex2.km = bz.km and ex2.kb = bz.kb
      left join lateral (select u.owner_id, u.nome, u.rotulo from lugar u
                          where u.km = bz.km and ((u.tipo = 'dono' and u.kb = bz.kb) or u.tipo = 'municipio')
                          order by (u.tipo = 'municipio'), u.nome limit 1) d on true
  ),
  fichas as (
    select lower(trim(coalesce(fr.sistema, ''))) as sistema, count(*) as fichas,
           count(*) filter (where fr.como_foi = 'falou_com_decisor') as decisor
      from public.fichas_de_rua fr
      left join public._territorio_time() t2 on t2.owner_id = fr.owner_id
     where fr.ocorrido_em >= (v_hoje - 29)::timestamp at time zone 'America/Sao_Paulo'
       and (v_pr is null or coalesce(public._territorio_praca(fr.cidade), t2.praca) = v_pr)
     group by 1
  ),
  saiu as (
    select p.id_hubspot as owner, trim(regexp_replace(p.full_name, '\s*/\s*DESATIVADO\s*$', '', 'i')) as nome
      from public.profiles p where p.full_name ~* 'DESATIVADO' and p.id_hubspot is not null
  ),
  orfa as (
    select s.nome, s.owner,
           (select count(*) from public.leads_prospeccao lp where lp.responsavel_owner_id = s.owner
              and lp.status in ('pendente', 'atribuido', 'na_rota') and nullif(trim(coalesce(lp.hubspot_deal_id, '')), '') is null) as lp,
           (select count(*) from public.clients c where c.vendedor_id_hubspot = s.owner and c.status = 'lead'
              and nullif(trim(coalesce(c.id_hubspot, '')), '') is null) as pinos
      from saiu s
  ),
  vis4b as materialized (
    select v.praca, v.owner_id, v.km, v.kb, mode() within group (order by v.bairro) as bairro,
           round(avg(v.lat) filter (where v.lat is not null and v.lat <> 0)::numeric, 5) as lat,
           round(avg(v.lng) filter (where v.lng is not null and v.lng <> 0)::numeric, 5) as lng, count(*) as n
      from vis4 v
     where v.kb is not null and v.kb <> '' and v.praca is not null and v.owner_id in (select t.owner_id from tm t)
     group by 1, 2, 3, 4
  ),
  vp as materialized (select praca, km, kb from vis4b group by 1, 2, 3),
  visex as (select owner_id, count(*) as n from vis4 group by 1),
  ordem as (select p.id_hubspot as owner_id, min(e.ordem) as ordem from public.equipe_cockpit e join public.profiles p on p.id = e.profile_id group by 1),
  pr5 as (
    select b.praca,
           count(*) filter (where b.criado >= v_hoje - 29) as chegaram,
           count(*) filter (where b.criado >= v_hoje - 29 and vp.kb is not null) as anda,
           count(*) filter (where b.status in ('pendente', 'atribuido') and b.idade <= 90) as ativos
      from base b left join vp on vp.praca = b.praca and vp.km = b.km and vp.kb = b.kb
     where b.praca is not null
     group by 1
  ),
  fp as (
    select coalesce(public._territorio_praca(fr.cidade), t3.praca) as praca, lower(trim(coalesce(fr.sistema, ''))) as sistema, count(*) as n,
           count(*) filter (where fr.como_foi = 'falou_com_decisor') as dec, count(*) filter (where fr.como_foi = 'decisor_ausente') as aus
      from public.fichas_de_rua fr
      left join public._territorio_time() t3 on t3.owner_id = fr.owner_id
     where fr.ocorrido_em >= (v_hoje - 29)::timestamp at time zone 'America/Sao_Paulo'
     group by 1, 2
  ),
  livres as (
    select b.owner_id, b.id,
           row_number() over (partition by b.owner_id order by b.vence14 desc, case when b.vence14 then b.idade end desc nulls last, b.criado_em desc) as r
      from base b
     where p_com_ids and b.owner_id is not null and b.status = 'atribuido' and b.idade <= 90
       and not b.visitado and not b.na_grade and not b.negocio and not b.sug_viva
  )
  select jsonb_build_object(
    'lido_em', now(), 'hoje', v_hoje, 'semana_plano', v_sem, 'praca', coalesce(v_pr, 'todas'), 'carga_gestor', v_carga,
    'carga_de', (select jsonb_build_object('dia', dia, 'n', n, 'ultima', ultima, 'bairros', bairros) from carga limit 1),
    'funil_30d', (select jsonb_build_object(
        'chegou', count(*), 'com_dono', count(*) filter (where dono), 'sugerido', count(*) filter (where sugerido),
        'na_rota', count(*) filter (where rota), 'visitado', count(*) filter (where vis), 'negocio', count(*) filter (where neg),
        'negocio_sem_visita', count(*) filter (where neg_sv)) from fx),
    'semanas_4', (select coalesce(jsonb_agg(jsonb_build_object('semana', seg, 'chegou', chegou, 'sugerido', sugerido, 'na_rota', na_rota,
        'visitado', visitado, 'negocio', negocio) order by seg), '[]'::jsonb) from wk),
    'por_executivo', (select coalesce(jsonb_agg(jsonb_build_object(
        'owner_id', ex.owner_id, 'nome', ex.nome, 'praca', ex.praca, 'ramp', ex.ramp, 'chegou', ex.chegou, 'sugerido', ex.sugerido,
        'na_rota', ex.na_rota, 'visitado', ex.visitado, 'negocio', ex.negocio, 'negocio_sem_visita', ex.negocio_sem_visita,
        'primeira_visita_mediana_d', round(pv.med::numeric, 1), 'primeira_visita_n', coalesce(pv.n, 0),
        'vence_semana', coalesce(por.vence_semana, 0), 'fila', coalesce(por.fila, 0),
        'sug_pendentes', coalesce(por.sug_pend, 0), 'sug_confirmados', coalesce(por.sug_conf, 0))
        order by coalesce(por.vence_semana, 0) desc, ex.chegou desc, ex.nome), '[]'::jsonb)
        from ex left join pv on pv.owner_id = ex.owner_id left join por on por.owner_id = ex.owner_id),
    'primeira_visita_geral', (select jsonb_build_object('mediana_d', round((percentile_cont(0.5) within group (order by extract(epoch from primeira_visita - criado_em) / 86400.0))::numeric, 1), 'n', count(*))
        from base where owner_id is not null and visitado and criado >= v_hoje - 89 and primeira_visita >= criado_em),
    'resgate_14d', (select jsonb_build_object('vencem', count(*), 'redistribuiveis', count(*) filter (where para is not null),
        'sem_dono', count(*) filter (where para is null), 'saem_ate', max(abertura + 91)) from venc),
    'sugestoes', (select jsonb_build_object('semana', v_sem, 'vale_ate', v_sem + 4,
        'sugeridos', count(*) filter (where sug_semana and owner_id is not null),
        'confirmados', count(*) filter (where sug_semana and owner_id is not null and (sug_conf or negocio)),
        'pendentes', count(*) filter (where sug_semana and owner_id is not null and not sug_conf and not negocio and sug_ate is not null)) from base),
    'visitou_semana_passada', (select count(*) from base b where b.owner_id is not null and b.visitado
        and (b.primeira_visita at time zone 'America/Sao_Paulo')::date between v_seg - 7 and v_seg - 1),
    'saiu_sem_visita_semana', (select count(*) from base b where b.status = 'expirado' and b.expirado_em >= v_seg),
    -- o mapa vai em linhas curtas (posição fixa) para pesar pouco:
    -- [chave, bairro, município, uf, praça, lat, lng, ativos, sem visita, vencem 14 d, cobertura, dono id, dono, com prova 4 sem]
    'bairros', (select coalesce(jsonb_agg(jsonb_build_array(
        praca || '|' || km || '|' || kb, coalesce(rotulo, bairro_cru), cidade, upper(uf), praca, lat, lng,
        ativos, sem_visita, vencem, case when dono_id is null then 'sem_dono' when prova >= 4 then 'ok' else 'parcial' end,
        dono_id, dono_nome, prova, chegaram, venceram) order by chegaram desc, sem_visita desc, bairro_cru), '[]'::jsonb) from bairros),
    'v5_pracas', (select coalesce(jsonb_agg(jsonb_build_object('praca', p.praca, 'chegaram', p.chegaram, 'anda', p.anda, 'ativos', p.ativos,
        'venceram', coalesce((select sum(e.n) from exp e where e.praca = p.praca), 0)) order by p.praca), '[]'::jsonb)
        from pr5 p where p.praca in (select t.praca from tm t)),
    'v5_ex', (select coalesce(jsonb_agg(jsonb_build_object('owner_id', t.owner_id, 'visitas', coalesce(x.n, 0), 'ordem', o.ordem) order by o.ordem nulls last), '[]'::jsonb)
        from tm t left join visex x on x.owner_id = t.owner_id left join ordem o on o.owner_id = t.owner_id),
    'v5_visitas', (select coalesce(jsonb_agg(jsonb_build_array(praca, owner_id, praca || '|' || km || '|' || kb, bairro, lat, lng, n) order by n desc), '[]'::jsonb) from vis4b),
    'v5_fichas', (select coalesce(jsonb_agg(jsonb_build_array(praca, sistema, n, dec, aus) order by n desc), '[]'::jsonb) from fp where praca in (select t.praca from tm t)),
    'contra_quem', (select coalesce(jsonb_agg(jsonb_build_array(sistema, fichas, decisor) order by fichas desc), '[]'::jsonb) from fichas),
    'carteira_quem_saiu', (select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'owner', owner, 'lp', lp, 'pinos', pinos) order by greatest(lp, pinos) desc), '[]'::jsonb)
        from orfa where lp + pinos > 0),
    'ids', case when p_com_ids then jsonb_build_object(
        'carga', (select coalesce(jsonb_object_agg(x.owner_id, x.ids), '{}'::jsonb)
                    from (select l.owner_id, jsonb_agg(l.id order by l.r) as ids
                            from livres l left join por on por.owner_id = l.owner_id
                           where l.r <= greatest(0, least(12, coalesce(p_carga, v_carga, 5)) - coalesce(por.sug_pend, 0))
                           group by 1) x),
        'redistribuir', (select coalesce(jsonb_agg(jsonb_build_object('para', g.para, 'nome', g.para_nome, 'ids', g.ids) order by g.n desc), '[]'::jsonb)
                    from (select para, para_nome, jsonb_agg(id) as ids, count(*) as n from venc where para is not null group by 1, 2) g),
        'sair', (select coalesce(jsonb_agg(id), '[]'::jsonb) from venc where para is null)) end
  ) into v;
  return v;
end;
$function$;
-- o guardado da forma antiga sai, para a próxima leitura já vir com os campos novos
delete from public.territorio_resumo_cache;
revoke all on function public._territorio_resumo_calc(text, boolean, integer) from public, anon, authenticated;
