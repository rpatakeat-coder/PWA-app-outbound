-- 0137 · A faixa gravada como texto também vira parada (28/09/2026)
--
-- Auditoria de hoje: a grade tem faixas em dois formatos — objeto {id, p, hora...} e
-- texto simples "c-<negócio>" (gravado por telas antigas do Planejamento). O
-- rota_para_plano já lia os dois; o plano_para_rota pulava o texto (`continue when
-- jsonb_typeof(r.slot) <> 'object'`). Resultado medido: Renata (28/09) e André (30/09)
-- tinham um lead planejado no Cockpit que nunca chegou à rota nem à Agenda do app.
--
-- Agora o id sai dos dois formatos; a hora só existe no objeto. Marcações internas da
-- grade (ids que começam com "__", como "__rua") continuam fora.

create or replace function public.plano_para_rota(p_owner text, p_segunda date)
returns integer
language plpgsql security definer set search_path to 'public' as $function$
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
      v_sid := nullif(case jsonb_typeof(r.slot) when 'object' then r.slot ->> 'id' when 'string' then r.slot #>> '{}' end, '');
      continue when v_sid is null or v_sid like '\_\_%';
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

      v_hora := case when jsonb_typeof(r.slot) = 'object' then r.slot ->> 'hora' end;
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

-- As duas faixas em texto que ficaram para trás (Renata 28/09, André 30/09): rodar a
-- sincronização da semana de quem tem faixa em texto de hoje em diante.
select public.plano_para_rota(ps.owner_id, ps.data_segunda)
from public.planos_semanais ps
where ps.data_segunda >= date '2026-09-28'
  and exists (select 1 from jsonb_array_elements(case when jsonb_typeof(ps.grade) = 'array' then ps.grade else '[]'::jsonb end) d,
                            jsonb_array_elements(case when jsonb_typeof(d) = 'array' then d else '[]'::jsonb end) s
              where jsonb_typeof(s) = 'string');
