-- 0230 · A regra da foto começa hoje, não em 1º de novembro
--
-- Julyan, 29/10: "pode adiantar tudo pra hj, n precisa esperar dia 1".
--
-- A 0227 tinha posto o corte em 01/11 por um motivo concreto: `sincronizar_pontos`
-- olha 40 dias para trás e ESTORNA visita que deixou de valer, e eu não queria
-- mexer nas três semanas de bônus já gravadas em `bonus_semanal` (05/10, 12/10 e
-- 19/10) — dinheiro já pago.
--
-- MEDIDO ANTES DE ADIANTAR, que é o que torna a decisão barata:
--
--     26/10   19 visitas   0 com a foto fora do raio
--     27/10   37 visitas   1
--     28/10   28 visitas   1
--     29/10   12 visitas   1
--
-- Com o corte em 29/10 (hoje), só UMA visita perde a prova, e ela está na semana
-- ABERTA — nenhum bônus fechado se mexe. É a visita da Kelly no Cachorro do Bonfá
-- - Cidade Baixa, com a foto a **2.082 m** do pino (o limite ali é 500 m porque o
-- pino é aproximado). Não é deriva de GPS; é dois quilômetros.
--
-- `sincronizar_pontos` rodado em seguida devolveu `estornos: 1`, exatamente essa.
--
-- A segunda data: o "não fechou ontem" de `time_na_rua` também passa a valer de
-- 29/10, porque é hoje que a tela do fecho existe. O piso continua lá pela mesma
-- razão de antes — sem ele, a coluna acusaria o time inteiro de não ter fechado
-- um dia que ninguém podia fechar.
--
-- Só as duas datas mudam. O resto das duas funções é idêntico à 0227 e à 0229.

create or replace function public._visitas_com_prova(p_de date, p_ate date, p_pessoa uuid DEFAULT NULL::uuid)
 returns table(visit_id uuid, client_id uuid, visited_by uuid, owner_id text, visited_at timestamp with time zone, dia date, declarada boolean, distancia_m numeric, limite_m integer, pino_movido_m numeric, serie boolean, foto_id uuid, foto_caminho text, provada boolean, motivo text, foto_distancia_m numeric)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with v as (
    select cv.*,
      (cv.visited_at at time zone 'America/Sao_Paulo')::date as dia_brt,
      lag(cv.client_id)      over w as ant_client,
      lag(cv.visited_at)     over w as ant_em,
      lag(cv.visited_at_lat) over w as ant_lat,
      lag(cv.visited_at_lon) over w as ant_lon
    from public.client_visits cv
    where cv.visited_at >= (p_de::timestamp at time zone 'America/Sao_Paulo') - interval '10 minutes'
      and cv.visited_at <  ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
      and (p_pessoa is null or cv.visited_by = p_pessoa)
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
      case when f.lat is not null and f.lng is not null and cl.latitude is not null and cl.longitude is not null
           then 2 * 6371000 * asin(sqrt(
                  power(sin(radians((f.lat - cl.latitude) / 2)), 2) +
                  cos(radians(cl.latitude)) * cos(radians(f.lat)) *
                  power(sin(radians((f.lng - cl.longitude) / 2)), 2)))
      end as foto_dist,
      p.id_hubspot as dono,
      vv.visit_id as vv_id
    from v
    left join public.visitas_validadas vv on vv.visit_id = v.id
    left join public.clients cl on cl.id = v.client_id
    left join public.profiles p on p.id = v.visited_by
    left join lateral (
      select fv.id, fv.caminho, fv.lat, fv.lng from public.fotos_visita fv
       where fv.client_id = v.client_id and fv.criado_por = v.visited_by
         and fv.criado_em >= v.visited_at - interval '30 minutes'
         and fv.criado_em <= v.visited_at + interval '2 hours'
       order by abs(extract(epoch from fv.criado_em - v.visited_at)) limit 1
    ) f on true
    where v.dia_brt between p_de and p_ate
  ), j as (
    select c.*,
      -- A ÚNICA MUDANÇA DESTA MIGRATION: 2026-11-01 virou 2026-10-29.
      (c.f_id is not null and (
         c.dia_brt < date '2026-10-29'
         or c.foto_dist is null
         or c.foto_dist <= c.limite)) as foto_vale,
      (not coalesce(c.declarada, false) and c.pino_corrigido_de_m is null and c.distance_m is not null
         and c.distance_m <= c.limite and not c.em_serie) as gps_vale
    from c
  )
  select j.id, j.client_id, j.visited_by, j.dono, j.visited_at, j.dia_brt,
    coalesce(j.declarada, false), j.distance_m, j.limite, j.pino_corrigido_de_m, j.em_serie,
    j.f_id, j.f_caminho,
    (j.foto_vale or j.vv_id is not null or j.gps_vale) as provada,
    case
      when j.foto_vale and j.foto_dist is not null then 'foto a ' || round(j.foto_dist) || ' m do pino'
      when j.foto_vale then 'foto sem coordenada'
      when j.gps_vale then 'gps'
      when j.vv_id is not null then 'validada pelo gestor'
      when j.f_id is not null and j.foto_dist is not null
        then 'foto a ' || round(j.foto_dist) || ' m do pino (limite ' || j.limite || ' m)'
      when j.em_serie then 'em serie (outro lead no mesmo ponto, < 3 min)'
      when j.pino_corrigido_de_m is not null then 'pino movido na hora (' || round(j.pino_corrigido_de_m) || ' m), sem foto'
      when coalesce(j.declarada, false) and j.distance_m is not null
        then 'declarada a ' || round(j.distance_m) || ' m do pino'
             || case when j.accuracy_m is not null then ' (GPS de ' || round(j.accuracy_m) || ' m)' else '' end
      when coalesce(j.declarada, false) then 'declarada sem GPS, sem foto'
      when j.distance_m is not null and j.distance_m > j.limite then 'a ' || round(j.distance_m) || ' m do pino (limite ' || j.limite || ' m), sem foto'
      else 'sem prova'
    end as motivo,
    j.foto_dist
  from j
  order by j.visited_at;
$function$;

-- A outra data: o piso do "nao fechou ontem" passa de 30/10 para 29/10.
create or replace function public.time_na_rua(p_dia date default null)
 returns table(
   owner_id text, pessoa uuid, nome text, avatar_url text,
   provadas integer, por_gps integer, por_foto integer, foto_fora integer,
   declaradas integer, sem_desfecho integer, ultima text,
   sem_plano boolean, nao_fechou_ontem boolean)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_dia date := coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date);
  v_ontem date := v_dia - 1;
  v_desde constant date := date '2026-10-29';
begin
  if not ((select public.is_field_admin()) or (select public.eh_gestor_cockpit())) then
    raise exception 'time_na_rua e so do gestor' using errcode = '42501';
  end if;

  return query
  with v as (select * from public._visitas_com_prova(v_dia, v_dia, null)),
  pessoas as (
    select p.id, p.id_hubspot, coalesce(nullif(e.nome, ''), p.full_name) as nome, p.avatar_url
      from public.equipe_cockpit e join public.profiles p on p.id = e.profile_id
     where e.ativo and e.papel = 'rep' and p.id_hubspot is not null
       and not coalesce(e.so_acesso, false) and not coalesce(e.ignorar_owner, false)
  )
  select
    pe.id_hubspot, pe.id, pe.nome, pe.avatar_url,
    count(v.visit_id) filter (where v.provada)::int,
    count(v.visit_id) filter (where v.motivo = 'gps')::int,
    count(v.visit_id) filter (where v.provada and v.motivo like 'foto%')::int,
    count(v.visit_id) filter (where v.foto_distancia_m is not null and v.foto_distancia_m > v.limite_m)::int,
    count(v.visit_id) filter (where v.declarada)::int,
    count(v.visit_id) filter (where v.provada and not exists (
      select 1 from public.fichas_de_rua f
       where f.client_id = v.client_id
         and (f.criado_em at time zone 'America/Sao_Paulo')::date = v.dia))::int,
    to_char(max(v.visited_at) at time zone 'America/Sao_Paulo', 'HH24:MI'),
    not exists (select 1 from public.field_routes r where r.seller_id = pe.id and r.route_date = v_dia),
    (v_ontem >= v_desde
      and not exists (select 1 from public.fecho_do_dia fd where fd.pessoa = pe.id and fd.dia = v_ontem)
      and exists (select 1 from public.client_visits cv where cv.visited_by = pe.id
                   and (cv.visited_at at time zone 'America/Sao_Paulo')::date = v_ontem))
  from pessoas pe
  left join v on v.visited_by = pe.id
  group by pe.id_hubspot, pe.id, pe.nome, pe.avatar_url
  order by count(v.visit_id) filter (where v.provada) desc, pe.nome;
end $function$;
