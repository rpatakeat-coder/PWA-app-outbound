-- UMA VERDADE SÓ (handoff v6, contrato §0 e linhas 23–29; 28/09/2026).
--
-- Até aqui cada tela contava visita do seu jeito: o app contava toda linha de
-- client_visits, o Cockpit reclassificava no navegador (e aceitava GPS a qualquer
-- distância), a Daily lia tarefas do HubSpot. Agora é uma função no banco para cada
-- conceito, e os dois lados leem dela:
--   visitas_com_prova(de, ate, pessoa) — cada visita, com provada/motivo/foto;
--   visitas_do_dia(pessoa, dia)        — {feitas, provadas};
--   meta_visitas(pessoa, dia)          — promessa da Daily → meta da pessoa → do time → 6;
--   demos_com_decisor(pessoa, de, ate) — ficha "falou com quem decide" + reunião, ou
--                                        reunião agendada no app; uma por lead.
-- Quem não é gestor só lê a si mesmo (a pessoa pedida é trocada por auth.uid()).
--
-- Sinais: actor_id (quem agiu, não o dono do pino — linha 29), e os tipos novos
-- 'daily' (promessa), 'nota' (nota do app) e 'tarefa' (espelho da agenda do HubSpot).
-- O sinal de pino passa a olhar também o descarte da conta-alvo e o motor (linha 26).
-- Os dois leitores ignoram tipo que não conhecem (conferido em 28/09), então tipo novo
-- não derruba tela.

-- ---------------------------------------------------------------- sinais
alter table public.sinais_ao_vivo add column if not exists actor_id text;

create or replace function public.sinal_ao_vivo(p_tipo text, p_client uuid, p_deal text, p_owner text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_actor text;
begin
  select p.id_hubspot into v_actor from public.profiles p where p.id = auth.uid();
  insert into public.sinais_ao_vivo (tipo, client_id, deal_id, owner_id, actor_id) values (p_tipo, p_client, p_deal, p_owner, v_actor);
exception when others then
  null;
end;
$function$;

create or replace function public.tg_sinal_pino()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'UPDATE'
     and new.etapa is not distinct from old.etapa
     and new.status is not distinct from old.status
     and new.vendedor_id_hubspot is not distinct from old.vendedor_id_hubspot
     and new.latitude is not distinct from old.latitude
     and new.longitude is not distinct from old.longitude
     and new.conta_alvo_dismissed is not distinct from old.conta_alvo_dismissed
     and new.motor_status is not distinct from old.motor_status then
    return null;
  end if;
  perform public.sinal_ao_vivo(case when tg_op = 'INSERT' then 'pino-novo' else 'pino' end, new.id, new.id_hubspot, new.vendedor_id_hubspot);
  return null;
end; $function$;

create or replace function public.tg_sinal_daily()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_owner text;
begin
  select p.id_hubspot into v_owner from public.profiles p where p.id = new.seller_id;
  perform public.sinal_ao_vivo('daily', null, null, coalesce(v_owner, new.owner_id));
  return null;
end; $function$;
drop trigger if exists sinal_daily on public.dailies;
create trigger sinal_daily after insert or update on public.dailies for each row execute function public.tg_sinal_daily();

create or replace function public.tg_sinal_nota()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin perform public.sinal_do_pino('nota', new.client_id); return null; end; $function$;
drop trigger if exists sinal_nota on public.client_notes;
create trigger sinal_nota after insert on public.client_notes for each row execute function public.tg_sinal_nota();

-- espelho da agenda do HubSpot: só quando a linha mudou de verdade (o robô regrava igual)
create or replace function public.tg_sinal_tarefa_espelho()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'UPDATE' and new.props is not distinct from old.props and new.owner_id is not distinct from old.owner_id then
    return null;
  end if;
  perform public.sinal_ao_vivo('tarefa', null, new.deal_id, new.owner_id);
  return null;
end; $function$;
drop trigger if exists sinal_tarefa_espelho on public.espelho_agenda;
create trigger sinal_tarefa_espelho after insert or update on public.espelho_agenda for each row execute function public.tg_sinal_tarefa_espelho();

-- ---------------------------------------------------------------- visitas
create or replace function public.visitas_com_prova(p_de date, p_ate date, p_pessoa uuid default null)
returns table (
  visit_id uuid, client_id uuid, visited_by uuid, owner_id text, visited_at timestamptz, dia date,
  declarada boolean, distancia_m numeric, limite_m integer, pino_movido_m numeric, serie boolean,
  foto_id uuid, foto_caminho text, provada boolean, motivo text
)
language sql
stable
security definer
set search_path = public
as $$
  with quem as (
    select ((select public.is_field_admin()) or (select public.eh_gestor_cockpit())) as gestor
  ), alvo as (
    select case when q.gestor then p_pessoa else (select auth.uid()) end as pessoa, q.gestor from quem q
  ), v as (
    select cv.*,
      (cv.visited_at at time zone 'America/Sao_Paulo')::date as dia_brt,
      lag(cv.client_id)      over w as ant_client,
      lag(cv.visited_at)     over w as ant_em,
      lag(cv.visited_at_lat) over w as ant_lat,
      lag(cv.visited_at_lon) over w as ant_lon
    from public.client_visits cv, alvo
    where cv.visited_at >= (p_de::timestamp at time zone 'America/Sao_Paulo') - interval '10 minutes'
      and cv.visited_at <  ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
      and ((alvo.pessoa is null and alvo.gestor) or cv.visited_by = alvo.pessoa)
    window w as (partition by cv.visited_by order by cv.visited_at)
  ), c as (
    select v.*,
      case when cl.geo_approximate is true then 500 else 200 end as limite,
      (v.ant_client is not null and v.ant_client <> v.client_id
        and v.visited_at - v.ant_em < interval '3 minutes'
        and v.visited_at_lat is not null and v.ant_lat is not null
        and 2 * 6371000 * asin(sqrt(
              power(sin(radians((v.visited_at_lat - v.ant_lat) / 2)), 2) +
              cos(radians(v.ant_lat)) * cos(radians(v.visited_at_lat)) *
              power(sin(radians((v.visited_at_lon - v.ant_lon) / 2)), 2))) < 50) as em_serie,
      f.id as f_id, f.caminho as f_caminho,
      p.id_hubspot as dono
    from v
    left join public.clients cl on cl.id = v.client_id
    left join public.profiles p on p.id = v.visited_by
    left join lateral (
      select fv.id, fv.caminho from public.fotos_visita fv
       where fv.client_id = v.client_id and fv.criado_por = v.visited_by
         and fv.criado_em >= v.visited_at - interval '30 minutes'
         and fv.criado_em <= v.visited_at + interval '2 hours'
       order by abs(extract(epoch from fv.criado_em - v.visited_at)) limit 1
    ) f on true
    where v.dia_brt between p_de and p_ate
  )
  select c.id, c.client_id, c.visited_by, c.dono, c.visited_at, c.dia_brt,
    coalesce(c.declarada, false), c.distance_m, c.limite, c.pino_corrigido_de_m, c.em_serie,
    c.f_id, c.f_caminho,
    (c.f_id is not null
      or (not coalesce(c.declarada, false) and c.pino_corrigido_de_m is null and c.distance_m is not null
          and c.distance_m <= c.limite and not c.em_serie)) as provada,
    case
      when c.f_id is not null then 'foto'
      when not coalesce(c.declarada, false) and c.pino_corrigido_de_m is null and c.distance_m is not null
           and c.distance_m <= c.limite and not c.em_serie then 'gps'
      when c.em_serie then 'em série (outro lead no mesmo ponto, < 3 min)'
      when c.pino_corrigido_de_m is not null then 'pino movido na hora (' || round(c.pino_corrigido_de_m) || ' m), sem foto'
      when coalesce(c.declarada, false) then 'declarada sem GPS, sem foto'
      when c.distance_m is not null and c.distance_m > c.limite then 'a ' || round(c.distance_m) || ' m do pino (limite ' || c.limite || ' m), sem foto'
      else 'sem prova'
    end as motivo
  from c
  order by c.visited_at;
$$;

create or replace function public.visitas_do_dia(p_pessoa uuid, p_dia date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('feitas', count(*), 'provadas', count(*) filter (where v.provada))
  from public.visitas_com_prova(p_dia, p_dia, p_pessoa) v;
$$;

create or replace function public.meta_visitas(p_pessoa uuid, p_dia date)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select nullif(d.prometido_visitas, 0) from public.dailies d where d.seller_id = p_pessoa and d.data = p_dia limit 1),
    (select nullif(g.meta_visitas_dia, 0) from public.seller_visit_goals g where g.seller_id = p_pessoa),
    (select nullif(r.meta_visitas_dia, 0) from public.route_config r order by r.id limit 1),
    6);
$$;

create or replace function public.demos_com_decisor(p_pessoa uuid, p_de date, p_ate date)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with alvo as (
    select case when (select public.is_field_admin()) or (select public.eh_gestor_cockpit()) then p_pessoa else (select auth.uid()) end as pessoa
  )
  select count(*)::int from (
    select f.client_id from public.fichas_de_rua f, alvo
     where f.criado_por = alvo.pessoa and f.como_foi = 'falou_com_decisor' and f.proximo = 'reuniao'
       and (f.ocorrido_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
    union
    select m.client_id from public.client_meetings m, alvo
     where m.created_by = alvo.pessoa and m.type = 'reuniao' and coalesce(m.status, '') <> 'cancelada'
       and (m.created_at at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  ) x;
$$;

-- meu_placar (0142) passa a ler das funções únicas
create or replace function public.meu_placar()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with eu as (
    select p.id, p.id_hubspot from profiles p where p.id = (select auth.uid())
  ), lim as (
    select ((now() at time zone 'America/Sao_Paulo')::date) as hoje,
      ((now() at time zone 'America/Sao_Paulo')::date
        - (extract(isodow from (now() at time zone 'America/Sao_Paulo'))::int - 1)) as segunda
  ), rep as (
    select s.conteudo->'reps'->eu.id_hubspot as r, s.atualizado_em
    from cockpit_snapshot s, eu
    where s.chave = 'hubspot' and eu.id_hubspot is not null
  ), hoje as (
    select public.visitas_do_dia(eu.id, lim.hoje) as j from eu, lim
  ), semana as (
    select count(*) as feitas, count(*) filter (where v.provada) as provadas
    from eu, lim, public.visitas_com_prova(lim.segunda, lim.hoje, eu.id) v
  )
  select jsonb_build_object(
    'visitas_hoje',   (select (j->>'feitas')::int from hoje),
    'provadas_hoje',  (select (j->>'provadas')::int from hoje),
    'meta_hoje',      (select public.meta_visitas(eu.id, lim.hoje) from eu, lim),
    'visitas_semana', (select feitas from semana),
    'provadas_semana',(select provadas from semana),
    'demos_semana',   (select public.demos_com_decisor(eu.id, lim.segunda, lim.hoje) from eu, lim),
    'ganhos_semana', (select (r->>'ganhosSemana')::int from rep),
    'ganhos_semana_nomes', (select r->'ganhosSemanaNomes' from rep),
    'ganhos_mes',    (select (r->>'fechadosNoMes')::int from rep),
    'meta_mes',      (select nullif(r->>'metaMensal', '')::int from rep),
    'ganhos_lidos_em', (select atualizado_em from rep),
    'semana_desde',  (select segunda from lim),
    'tem_dono_hubspot', (select id_hubspot is not null from eu)
  );
$$;

revoke all on function public.visitas_com_prova(date, date, uuid) from public, anon;
revoke all on function public.visitas_do_dia(uuid, date) from public, anon;
revoke all on function public.meta_visitas(uuid, date) from public, anon;
revoke all on function public.demos_com_decisor(uuid, date, date) from public, anon;
grant execute on function public.visitas_com_prova(date, date, uuid) to authenticated;
grant execute on function public.visitas_do_dia(uuid, date) to authenticated;
grant execute on function public.meta_visitas(uuid, date) to authenticated;
grant execute on function public.demos_com_decisor(uuid, date, date) to authenticated;
