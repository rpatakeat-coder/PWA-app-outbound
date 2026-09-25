-- 0099 — O que o executivo planeja no Cockpit vira a rota do dia no mapa
--
-- Por quê (Julyan, 25/09/2026): "os leads q eles planejam ja vao pra agenda e
-- tbm para o mapa, visto que somos FIELD sales". O planejamento do time vive na
-- grade semanal do Cockpit (planos_semanais.grade: 5 dias x 15 visitas, cada uma
-- {p, id, hora}; id c-<negócio>, r-<negócio em reciclagem>, n-<lead de munição>).
-- A rota do mapa (field_routes + field_route_stops) é outra tabela, e ninguém
-- ligava as duas: o executivo planejava num lugar e dirigia com o outro vazio.
--
-- Como: cada visita da grade de HOJE EM DIANTE vira parada na rota do dia do
-- dono, apontando para o pin (o de negócio por id_hubspot; o de munição por
-- lead_prospeccao_id, 0098). As paradas do plano levam
-- mandatory_reason = 'plano_cockpit'; as que o executivo pôs no mapa não são tocadas.
--
-- O PLANO MANDA QUANDO MUDA, E SÓ AÍ. O mapa, ao salvar a rota, apaga e regrava
-- todas as paradas (useFieldOps.saveRoute) — daqui não dá para distinguir "tirou
-- de propósito" de "regerou". Por isso cada visita sincronizada fica registrada
-- em plano_rota_sincronizado: visita nova do plano entra; visita tirada do plano
-- sai (se ainda estava só planejada); a parada que o executivo tirou no mapa NÃO
-- volta sozinha. O reconciliador de 15 min só completa visita cujo pin ainda não
-- existia (negócio que o negocio-vira-ponto criou depois, lead reatribuído).
--
-- Nada aqui fala com o HubSpot.

create table if not exists public.plano_rota_sincronizado (
  owner_id text not null,
  dia date not null,
  slot_id text not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  route_id uuid not null references public.field_routes(id) on delete cascade,
  sincronizado_em timestamptz not null default now(),
  primary key (owner_id, dia, slot_id)
);
alter table public.plano_rota_sincronizado enable row level security;
comment on table public.plano_rota_sincronizado is
  'Visitas da grade do Cockpit já levadas para a rota do mapa (0099). Só as funções de sincronização escrevem; sem política de propósito.';

-- O pin de uma visita da grade.
create or replace function public.plano_resolver_slot(p_slot_id text)
returns uuid language plpgsql stable security definer set search_path to 'public' as $function$
declare v_resto text := substr(coalesce(p_slot_id, ''), 3); v_cli uuid;
begin
  if p_slot_id like 'c-%' or p_slot_id like 'r-%' then
    select id into v_cli from public.clients where id_hubspot = v_resto and not is_archived limit 1;
  elsif p_slot_id like 'n-%' and v_resto ~* '^[0-9a-f-]{36}$' then
    select id into v_cli from public.clients where lead_prospeccao_id = v_resto::uuid limit 1;
  end if;
  return v_cli;
end;
$function$;

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
      -- já levada antes: o que o executivo fez com ela no mapa vale
      continue when exists (select 1 from public.plano_rota_sincronizado s
                            where s.owner_id = p_owner and s.dia = v_dia and s.slot_id = v_sid);
      continue when v_cli is null;  -- pin ainda não existe: o reconciliador tenta de novo

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

    -- visita que saiu do plano: sai da rota, se ainda estava só planejada e o
    -- mesmo pin não continua no plano por outra visita (lead que virou negócio
    -- muda de n- para c- e continua sendo o mesmo pin)
    for t in select * from public.plano_rota_sincronizado s
             where s.owner_id = p_owner and s.dia = v_dia and not (s.slot_id = any (v_ids)) loop
      if not (t.client_id = any (v_clis)) then
        update public.field_route_stops
        set status = 'removed', updated_at = now()
        where route_id = t.route_id and client_id = t.client_id
          and status = 'planned' and mandatory_reason = 'plano_cockpit';
      end if;
      delete from public.plano_rota_sincronizado
      where owner_id = t.owner_id and dia = t.dia and slot_id = t.slot_id;
    end loop;
  end loop;
  return v_n;
end;
$function$;

-- O plano mudou no Cockpit: a rota acompanha na hora.
create or replace function public.plano_mudou()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  perform public.plano_para_rota(new.owner_id, new.data_segunda);
  return new;
end;
$function$;

drop trigger if exists plano_mudou on public.planos_semanais;
create trigger plano_mudou
  after insert or update of grade on public.planos_semanais
  for each row execute function public.plano_mudou();

-- A cada 15 min: completa o que dependia de pin que ainda não existia.
create or replace function public.unificacao_reconciliar()
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_pins integer; v_paradas integer := 0; p record;
  v_segunda date := date_trunc('week', (now() at time zone 'America/Sao_Paulo')::date)::date;
begin
  -- munição sem pin ligado: negócio que o reconciliador criou, lead reatribuído,
  -- executivo que entrou na equipe
  select count(public.municao_sincronizar_pino(l.id)) into v_pins
  from public.leads_prospeccao l
  where l.status in ('atribuido', 'na_rota', 'criado_hubspot')
    and not exists (select 1 from public.clients c where c.lead_prospeccao_id = l.id);
  -- planos desta semana e da próxima
  for p in select owner_id, data_segunda from public.planos_semanais
           where data_segunda in (v_segunda, v_segunda + 7) loop
    v_paradas := v_paradas + public.plano_para_rota(p.owner_id, p.data_segunda);
  end loop;
  return jsonb_build_object('pins_ligados_ou_criados', v_pins, 'paradas_novas', v_paradas);
end;
$function$;

revoke all on function public.plano_resolver_slot(text) from public, anon, authenticated;
revoke all on function public.plano_para_rota(text, date) from public, anon, authenticated;
revoke all on function public.plano_mudou() from public, anon, authenticated;
revoke all on function public.unificacao_reconciliar() from public, anon, authenticated;

-- Depois do negocio-vira-ponto (que roda a cada 15 min), para já achar o pin novo.
select cron.unschedule(jobid) from cron.job where jobname = 'unificacao-reconciliar-15min';
select cron.schedule('unificacao-reconciliar-15min', '7,22,37,52 * * * *', 'select public.unificacao_reconciliar();');

-- Carga: os planos desta semana e da próxima.
select public.unificacao_reconciliar();
