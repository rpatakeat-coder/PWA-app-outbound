-- 0238 · O combinado 2 mede se o passo marcado é cumprido (auditoria de 01/11/26)
--
-- "Próximo passo e data" media visitas com ficha que tinha próximo passo com data. O app OBRIGA o
-- próximo passo na ficha, então a medida dava sempre o mesmo número que "Ficha na hora" e não dizia
-- nada. O combinado do Playbook é a data valer: agora mede os passos cuja data caiu na semana e se
-- houve toque depois da visita até o dia seguinte à data marcada.
--
--   toque pelo app      ficha nova, visita ou tarefa feita na fila do mesmo cliente/negócio
--   toque pelo HubSpot  a última atividade HUMANA do negócio (hs_lastactivitydate: nota, ligação,
--                       e-mail, reunião) dentro do prazo
--   sem como saber      o último toque do HubSpot é DEPOIS do prazo e o app não viu nada: o HubSpot
--                       só guarda o último, então não dá para dizer se houve um no prazo. Fica fora da
--                       conta (nem a favor, nem contra) e a tela diz quantos são.
--
-- Um passo só é julgado depois do dia seguinte à data (a tolerância). Passo de ficha com motivo de
-- perdido não entra. A conta antiga (comPasso) continua no retorno para quem ainda a lê.
-- Nada aqui escreve no HubSpot.

/* os passos marcados nas fichas de uma pessoa com data entre p_de e p_ate, já julgáveis em p_hoje */
create or replace function public._passos_cumpridos(p_owner text, p_pessoa uuid, p_de date, p_ate date, p_hoje date)
 returns table (proximo_em date, client_id uuid, nome text, marcado date, cumprido boolean, sem_como_saber boolean)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with x as (
    select f.client_id, f.proximo_em, max(f.deal_id) as deal_id,
           min((coalesce(f.ocorrido_em, f.criado_em) at time zone 'America/Sao_Paulo')::date) as marcado
      from public.fichas_de_rua f
     where f.owner_id = p_owner and f.client_id is not null and f.motivo_perdido is null
       and f.proximo_em between p_de and p_ate and f.proximo_em + 1 < p_hoje
     group by f.client_id, f.proximo_em
  ), y as (
    select x.*,
           exists (select 1 from public.fichas_de_rua g
                    where g.owner_id = p_owner and g.client_id = x.client_id
                      and (coalesce(g.ocorrido_em, g.criado_em) at time zone 'America/Sao_Paulo')::date > x.marcado
                      and (coalesce(g.ocorrido_em, g.criado_em) at time zone 'America/Sao_Paulo')::date <= x.proximo_em + 1)
           or exists (select 1 from public.client_visits v
                       where v.visited_by = p_pessoa and v.client_id = x.client_id
                         and (v.visited_at at time zone 'America/Sao_Paulo')::date > x.marcado
                         and (v.visited_at at time zone 'America/Sao_Paulo')::date <= x.proximo_em + 1)
           or exists (select 1 from public.fila_feitas ff
                       where ff.user_id = p_pessoa and x.deal_id is not null and ff.deal_id = x.deal_id and ff.desfeita_em is null
                         and ff.dia > x.marcado and ff.dia <= x.proximo_em + 1) as pelo_app,
           (select (c.hs_last_activity_at at time zone 'America/Sao_Paulo')::date from public.clients c where c.id = x.client_id) as hs
      from x
  )
  select y.proximo_em, y.client_id,
         (select coalesce(nullif(c.empresa, ''), c.nome) from public.clients c where c.id = y.client_id),
         y.marcado,
         y.pelo_app or (y.hs > y.marcado and y.hs <= y.proximo_em + 1),
         not y.pelo_app and y.hs > y.proximo_em + 1
    from y;
$function$;
revoke all on function public._passos_cumpridos(text, uuid, date, date, date) from public, anon, authenticated;

create or replace function public.combinados_quadro(p_segunda date default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_gestor boolean := coalesce((select public.eh_gestor_cockpit()), false);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_seg date := coalesce(p_segunda, v_hoje - ((extract(isodow from v_hoje)::int) - 1));
  v_sex date := v_seg + 4;
  v_ate date := least(v_seg + 4, v_hoje);
  /* o fecho do dia só existe desde 30/10/26 (0229): antes disso não há o que cobrar */
  v_piso_fecho constant date := date '2026-10-30';
  v_out jsonb := '[]'::jsonb;
  r record;
  v_vis jsonb;
  v_fic jsonb;
  v_vesp jsonb;
  v_rit jsonb;
  v_pas jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('erro', 'sem sessão');
  end if;
  if v_ate < v_seg then
    return jsonb_build_object('segunda', v_seg, 'sexta', v_sex, 'hoje', v_hoje, 'pessoas', '[]'::jsonb, 'lidoEm', now());
  end if;

  for r in
    select e.profile_id as pessoa, p.id_hubspot as owner_id, coalesce(e.nome, p.full_name) as nome
      from public.equipe_cockpit e
      join public.profiles p on p.id = e.profile_id
     where e.ativo and e.papel = 'rep' and not coalesce(e.so_acesso, false)
       and (v_gestor or e.profile_id = auth.uid())
     order by coalesce(e.nome, p.full_name)
  loop
    /* a porta: o mesmo restaurante duas vezes no dia é uma porta */
    with portas as (
      select v.client_id, v.dia, min(v.visited_at) as em, bool_or(v.provada) as provada, bool_and(coalesce(v.declarada, false)) as declarada,
             max(v.motivo) as motivo
        from public._visitas_com_prova(v_seg, v_ate, r.pessoa) v group by v.client_id, v.dia
    ), fx as (
      select f.client_id, (coalesce(f.ocorrido_em, f.criado_em) at time zone 'America/Sao_Paulo')::date as dia,
             min(coalesce(f.ocorrido_em, f.criado_em)) as em,
             bool_or(f.proximo_em is not null or f.motivo_perdido is not null) as com_passo
        from public.fichas_de_rua f
       where f.owner_id = r.owner_id
         and coalesce(f.ocorrido_em, f.criado_em) >= (v_seg::timestamp at time zone 'America/Sao_Paulo')
         and coalesce(f.ocorrido_em, f.criado_em) < ((v_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
       group by 1, 2
    ), j as (
      select pt.*, fx.em as ficha_em, fx.com_passo from portas pt left join fx on fx.client_id = pt.client_id and fx.dia = pt.dia
    )
    select jsonb_build_object(
      'visitas', count(*),
      'provadas', count(*) filter (where j.provada),
      'comPasso', count(*) filter (where j.com_passo),
      'naHora', count(*) filter (where j.ficha_em is not null and j.ficha_em <= j.em + interval '15 minutes'),
      'divergencias', coalesce(jsonb_agg(jsonb_build_object('dia', j.dia, 'clientId', j.client_id,
            'nome', (select coalesce(nullif(c.empresa, ''), c.nome) from public.clients c where c.id = j.client_id), 'motivo', j.motivo)
            order by j.dia) filter (where j.ficha_em is not null and not j.provada and not j.declarada), '[]'::jsonb))
      into v_vis from j;

    select jsonb_build_object(
      'julgados', count(*) filter (where not p.sem_como_saber),
      'cumpridos', count(*) filter (where p.cumprido),
      'semComoSaber', count(*) filter (where p.sem_como_saber),
      'faltaram', coalesce(jsonb_agg(jsonb_build_object('dia', p.proximo_em, 'clientId', p.client_id, 'nome', p.nome) order by p.proximo_em)
                    filter (where not p.cumprido and not p.sem_como_saber), '[]'::jsonb))
      into v_pas
      from public._passos_cumpridos(r.owner_id, r.pessoa, v_seg, v_sex, v_hoje) p;

    select jsonb_build_object(
      'donoAusente', count(*) filter (where coalesce(f.decisor_papel, '') not in ('Dono', 'Sócio') and f.motivo_perdido is null),
      'voltaMarcada', count(*) filter (where coalesce(f.decisor_papel, '') not in ('Dono', 'Sócio') and f.motivo_perdido is null
            and (nullif(btrim(coalesce(f.horario_dono, '')), '') is not null or (f.proximo_em is not null and f.proximo_tipo in ('visita', 'reuniao')))))
      into v_fic
      from public.fichas_de_rua f
     where f.owner_id = r.owner_id
       and coalesce(f.ocorrido_em, f.criado_em) >= (v_seg::timestamp at time zone 'America/Sao_Paulo')
       and coalesce(f.ocorrido_em, f.criado_em) < ((v_ate + 1)::timestamp at time zone 'America/Sao_Paulo');

    select jsonb_build_object('dias', count(*), 'planejados', count(*) filter (where exists (
             select 1 from public.field_routes fr
              where fr.seller_id = r.pessoa and fr.route_date = d.dia
                and fr.created_at < ((d.dia - 1)::timestamp + interval '20 hours') at time zone 'America/Sao_Paulo'
                and exists (select 1 from public.field_route_stops s where s.route_id = fr.id))),
           'semPlano', coalesce(jsonb_agg(d.dia order by d.dia) filter (where not exists (
             select 1 from public.field_routes fr
              where fr.seller_id = r.pessoa and fr.route_date = d.dia
                and fr.created_at < ((d.dia - 1)::timestamp + interval '20 hours') at time zone 'America/Sao_Paulo'
                and exists (select 1 from public.field_route_stops s where s.route_id = fr.id))), '[]'::jsonb))
      into v_vesp
      from (select g::date as dia from generate_series(v_seg, v_ate, interval '1 day') g where extract(isodow from g) < 6) d;

    select jsonb_build_object(
      'umAUm', (select count(*) from public.um_a_um u where u.owner_id = r.owner_id and u.data between v_seg and v_sex),
      'ultimoUmAUm', (select max(u.data) from public.um_a_um u where u.owner_id = r.owner_id and u.data <= v_sex),
      'fechoDias', (select coalesce(jsonb_agg(jsonb_build_object('dia', d.dia, 'fechou', exists (select 1 from public.fecho_do_dia fd where fd.pessoa = r.pessoa and fd.dia = d.dia)) order by d.dia), '[]'::jsonb)
                      from (select g::date as dia from generate_series(greatest(v_seg, v_piso_fecho), v_ate, interval '1 day') g where extract(isodow from g) < 6) d
                     where d.dia < v_hoje or exists (select 1 from public.fecho_do_dia fd where fd.pessoa = r.pessoa and fd.dia = d.dia)),
      'marcados', (select coalesce(jsonb_agg(jsonb_build_object('dia', rp.dia, 'ritual', rp.ritual, 'presente', rp.presente) order by rp.dia, rp.ritual), '[]'::jsonb)
                     from public.rituais_presenca rp where rp.pessoa = r.pessoa and rp.dia between v_seg and v_sex))
      into v_rit;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'pessoa', r.pessoa, 'ownerId', r.owner_id, 'nome', r.nome,
      'visitas', v_vis, 'passos', v_pas, 'fichas', v_fic, 'vespera', v_vesp, 'rituais', v_rit,
      'aceite', (select jsonb_build_object('versao', a.versao, 'aceitoEm', a.aceito_em, 'registradoPor', a.registrado_por)
                   from public.combinados_aceite a where a.pessoa = r.pessoa order by a.aceito_em desc, a.criado_em desc limit 1),
      'ocorrencias', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'combinado', o.combinado, 'degrau', o.degrau, 'dia', o.dia,
                       'oQue', o.o_que_aconteceu, 'evidencia', o.evidencia, 'registroFalso', o.registro_falso, 'prazo', o.prazo, 'por', o.registrado_por)
                       order by o.dia desc, o.criado_em desc)
                     from public.ocorrencias o where o.pessoa = r.pessoa and o.dia >= v_hoje - 180), '[]'::jsonb)
    ));
  end loop;
  return jsonb_build_object('segunda', v_seg, 'sexta', v_sex, 'ate', v_ate, 'hoje', v_hoje, 'gestor', v_gestor, 'pessoas', v_out, 'lidoEm', now());
end;
$function$;

revoke all on function public.combinados_quadro(date) from anon, public;
grant execute on function public.combinados_quadro(date) to authenticated;


create or replace function public.disputa_quadro()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_de date := (now() at time zone 'America/Sao_Paulo')::date - 42;
  v_out jsonb := '[]'::jsonb;
  r record;
  v_dias jsonb;
begin
  if auth.uid() is null or not coalesce((select public.eh_gestor_cockpit()), false) then
    return jsonb_build_object('erro', 'só o gestor');
  end if;
  for r in
    select e.profile_id as pessoa, p.id_hubspot as owner_id, coalesce(e.nome, p.full_name) as nome,
           coalesce(e.ramp_stage, '') = 'preparacao'
             or exists (select 1 from public.rampa_pessoas rp where rp.pessoa = e.profile_id and rp.encerrada_em is null) as em_rampa
      from public.equipe_cockpit e
      join public.profiles p on p.id = e.profile_id
     where e.ativo and e.papel = 'rep' and not coalesce(e.so_acesso, false)
     order by coalesce(e.nome, p.full_name)
  loop
    with portas as (
      select v.client_id, v.dia, min(v.visited_at) as em, bool_or(v.provada) as provada
        from public._visitas_com_prova(v_de, v_hoje, r.pessoa) v group by v.client_id, v.dia
    ), fx as (
      select f.client_id, (coalesce(f.ocorrido_em, f.criado_em) at time zone 'America/Sao_Paulo')::date as dia,
             min(coalesce(f.ocorrido_em, f.criado_em)) as em,
             bool_or(f.proximo_em is not null or f.motivo_perdido is not null) as com_passo,
             bool_or(f.como_foi = 'falou_com_decisor') as dono
        from public.fichas_de_rua f
       where f.owner_id = r.owner_id
         and coalesce(f.ocorrido_em, f.criado_em) >= (v_de::timestamp at time zone 'America/Sao_Paulo')
         and coalesce(f.ocorrido_em, f.criado_em) < ((v_hoje + 1)::timestamp at time zone 'America/Sao_Paulo')
       group by 1, 2
    ), pv as (
      select pt.dia, count(*) as v, count(*) filter (where pt.provada) as p,
             count(*) filter (where fx.com_passo) as cp,
             count(*) filter (where fx.em is not null and fx.em <= pt.em + interval '15 minutes') as nh
        from portas pt left join fx on fx.client_id = pt.client_id and fx.dia = pt.dia
       group by pt.dia
    ), pf as (
      select fx.dia, count(*) as f, count(*) filter (where fx.dono) as o from fx group by fx.dia
    ), pm as (
      select (coalesce(pe.ref_em, pe.criado_em) at time zone 'America/Sao_Paulo')::date as dia, count(*) as m
        from public.pontos_eventos pe
       where pe.owner_id = r.owner_id and pe.tipo = 'demo_realizada'
         and coalesce(pe.ref_em, pe.criado_em) >= (v_de::timestamp at time zone 'America/Sao_Paulo')
         and coalesce(pe.ref_em, pe.criado_em) < ((v_hoje + 1)::timestamp at time zone 'America/Sao_Paulo')
       group by 1
    ), pp as (
      select x.proximo_em as dia, count(*) filter (where not x.sem_como_saber) as pv, count(*) filter (where x.cumprido) as pc
        from public._passos_cumpridos(r.owner_id, r.pessoa, v_de, v_hoje, v_hoje) x group by 1
    ), d as (
      select g::date as dia from generate_series(v_de, v_hoje, interval '1 day') g
    )
    select coalesce(jsonb_agg(jsonb_build_object('d', d.dia, 'v', coalesce(pv.v, 0), 'p', coalesce(pv.p, 0), 'cp', coalesce(pv.cp, 0),
             'nh', coalesce(pv.nh, 0), 'f', coalesce(pf.f, 0), 'o', coalesce(pf.o, 0), 'm', coalesce(pm.m, 0),
             'pv', coalesce(pp.pv, 0), 'pc', coalesce(pp.pc, 0)) order by d.dia)
             filter (where pv.dia is not null or pf.dia is not null or pm.dia is not null or pp.dia is not null), '[]'::jsonb)
      into v_dias
      from d left join pv on pv.dia = d.dia left join pf on pf.dia = d.dia left join pm on pm.dia = d.dia left join pp on pp.dia = d.dia;

    v_out := v_out || jsonb_build_array(jsonb_build_object('pessoa', r.pessoa, 'ownerId', r.owner_id, 'nome', r.nome, 'emRampa', r.em_rampa, 'dias', v_dias));
  end loop;
  return jsonb_build_object('hoje', v_hoje, 'de', v_de,
    'disputas', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'taxa', x.taxa, 'times', x.times, 'inicio', x.inicio, 'fim', x.fim,
                   'criadaPor', x.criada_por) order by x.inicio desc)
                 from public.disputas x where x.cancelada_em is null and x.fim >= v_hoje - 35), '[]'::jsonb),
    'auditorias', coalesce((select jsonb_agg(jsonb_build_object('segunda', a.segunda, 'em', a.auditada_em, 'por', a.auditada_por, 'nota', a.nota) order by a.segunda desc)
                 from public.auditorias_semana a where a.segunda >= v_hoje - 56), '[]'::jsonb),
    'pessoas', v_out, 'lidoEm', now());
end;
$function$;
revoke all on function public.disputa_quadro() from anon, public;
grant execute on function public.disputa_quadro() to authenticated;

