-- 0134 · Revisão da sincronização app ⇄ Planejamento (28/09/2026)
--
-- Três defeitos achados na revisão das 0131/0133:
-- 1. Follow-up agendado no app (ligação) entrava na grade e o plano_para_rota o
--    transformava em PARADA DE VISITA no dia. Ligação não é parada: fica na Agenda e nas
--    Tarefas. O que já tinha entrado sai.
-- 2. Lead posto na grade pelo app (0131) não saía da rota quando o Cockpit o tirava do
--    plano: o plano_para_rota só removia parada 'plano_cockpit'. Agora remove qualquer
--    parada ainda planejada que tenha vindo da grade (tem linha em plano_rota_sincronizado).
-- 3. Check-in (parada → done) numa parada que o Cockpit tinha tirado do plano a punha de
--    volta na grade. O gatilho rota_para_plano agora só roda para parada planejada ou
--    removida; concluir não mexe no plano.

-- 1 · o Agendar do app: follow-up não entra na grade
create or replace function public.tg_agendado_no_plano() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner text; v_dia_novo date; v_dia_velho date; v_hora text;
begin
  if pg_trigger_depth() > 2 then return null; end if;
  select nullif(p.id_hubspot, '') into v_owner from public.profiles p
  where p.id = (case when tg_op = 'DELETE' then old.created_by else new.created_by end);
  if v_owner is null then return null; end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_dia_velho := (old.scheduled_at at time zone 'America/Sao_Paulo')::date;
    if tg_op = 'DELETE' or new.status = 'cancelada' or new.scheduled_at is distinct from old.scheduled_at then
      perform public.plano_tira_slot(v_owner, v_dia_velho, old.client_id, 'app-agenda');
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.status = 'agendada' and new.type is distinct from 'follow_up'
     and (tg_op = 'INSERT' or new.scheduled_at is distinct from old.scheduled_at or old.status is distinct from 'agendada') then
    v_dia_novo := (new.scheduled_at at time zone 'America/Sao_Paulo')::date;
    v_hora := to_char(new.scheduled_at at time zone 'America/Sao_Paulo', 'HH24:MI');
    perform public.plano_poe_slot(v_owner, v_dia_novo, new.client_id, null, 'visita', v_hora, 'app-agenda');
  end if;
  return null;
exception when others then
  raise warning 'tg_agendado_no_plano: %', sqlerrm;
  return null;
end; $$;

-- o follow-up que já tinha entrado sai da grade
select public.plano_tira_slot(p.id_hubspot, (m.scheduled_at at time zone 'America/Sao_Paulo')::date, m.client_id, 'app-agenda')
from public.client_meetings m join public.profiles p on p.id = m.created_by
where m.type = 'follow_up' and m.status = 'agendada'
  and (m.scheduled_at at time zone 'America/Sao_Paulo')::date >= (now() at time zone 'America/Sao_Paulo')::date
  and nullif(p.id_hubspot, '') is not null;

-- 3 · concluir a parada (done) não põe nada na grade
drop trigger if exists rota_para_plano on public.field_route_stops;
create trigger rota_para_plano after insert or update of status on public.field_route_stops
  for each row when (new.status in ('planned', 'removed'))
  execute function public.rota_para_plano();

-- 2 · tirar do plano tira a parada que veio da grade, seja do Cockpit ou do app
create or replace function public.plano_para_rota(p_owner text, p_segunda date)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_seller uuid;
  v_grade jsonb;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dia date;
  v_slots jsonb;
  r record;
  t record;
  v_sid text;
  v_cli uuid;
  v_route uuid;
  v_hora text;
  v_quando timestamptz;
  v_ids text[];
  v_clis uuid[];
  v_n integer := 0;
begin
  select p.id into v_seller from public.profiles p where p.id_hubspot = p_owner limit 1;
  if v_seller is null then return 0; end if;
  select grade into v_grade from public.planos_semanais where owner_id = p_owner and data_segunda = p_segunda;

  for d in 0..4 loop
    v_dia := p_segunda + d;
    continue when v_dia < v_hoje;
    v_slots := case when jsonb_typeof(v_grade) = 'array' and jsonb_typeof(v_grade -> d) = 'array' then v_grade -> d else '[]'::jsonb end;
    v_ids := array[]::text[];
    v_clis := array[]::uuid[];

    for r in select e.value as slot, e.ordinality as ord from jsonb_array_elements(v_slots) with ordinality e loop
      continue when jsonb_typeof(r.slot) <> 'object' or nullif(r.slot ->> 'id', '') is null;
      v_sid := r.slot ->> 'id';
      v_ids := v_ids || v_sid;
      v_cli := public.plano_resolver_slot(v_sid);
      if v_cli is not null then v_clis := v_clis || v_cli; end if;
      continue when exists (select 1 from public.plano_rota_sincronizado s
                            where s.owner_id = p_owner and s.dia = v_dia and s.slot_id = v_sid);
      continue when v_cli is null;

      insert into public.field_routes (seller_id, route_date, title, status, source, created_by)
      values (v_seller, v_dia, 'Plano do Cockpit', 'planned', 'manual', v_seller)
      on conflict (seller_id, route_date) do nothing;
      select id into v_route from public.field_routes where seller_id = v_seller and route_date = v_dia;

      v_hora := r.slot ->> 'hora';
      v_quando := case when v_hora ~ '^\d{1,2}:\d{2}$'
                       then ((v_dia::text || ' ' || v_hora)::timestamp at time zone 'America/Sao_Paulo') end;

      insert into public.field_route_stops (route_id, client_id, position, planned_at, status, mandatory_reason)
      values (v_route, v_cli, r.ord, v_quando, 'planned', 'plano_cockpit')
      on conflict (route_id, client_id) do update
        set status = case when field_route_stops.status = 'removed' then 'planned' else field_route_stops.status end,
            planned_at = coalesce(excluded.planned_at, field_route_stops.planned_at),
            updated_at = now();

      insert into public.plano_rota_sincronizado (owner_id, dia, slot_id, client_id, route_id)
      values (p_owner, v_dia, v_sid, v_cli, v_route)
      on conflict (owner_id, dia, slot_id) do nothing;
      v_n := v_n + 1;
    end loop;

    for t in select * from public.plano_rota_sincronizado s
             where s.owner_id = p_owner and s.dia = v_dia and not (s.slot_id = any (v_ids)) loop
      if not (t.client_id = any (v_clis)) then
        -- 0134: qualquer parada ainda planejada que veio da grade (Cockpit ou app) sai;
        -- a feita fica, porque visita que aconteceu não se desfaz.
        update public.field_route_stops
        set status = 'removed', updated_at = now()
        where route_id = t.route_id and client_id = t.client_id and status = 'planned';
      end if;
      delete from public.plano_rota_sincronizado
      where owner_id = t.owner_id and dia = t.dia and slot_id = t.slot_id;
    end loop;
  end loop;
  return v_n;
end;
$function$;
