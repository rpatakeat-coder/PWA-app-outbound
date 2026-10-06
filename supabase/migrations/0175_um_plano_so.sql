-- 0175 · UM PLANO SÓ, MONTADO NO MAPA (Claude Design "entrega-um-plano-so", 06/10/2026)
--
-- Julyan: "tem que ser um plano só… ele tem que planejar pelo mapa… o agendar é de reunião,
-- tem que ser de prospecção também, follow, outras coisas… e automaticamente não tá indo pro
-- planejamento no cockpit". E: "o executivo também planeja pelo Cockpit".
--
-- O que muda:
--   · a parada (field_route_stops) e o agendamento (client_meetings) ganham `acao`, o chip
--     do "o que vai fazer" — o MESMO rótulo no app, no Planejamento e na Rua › Rotas;
--   · plano_proposito(acao, conta_alvo) é a tabela §2.1 num lugar só;
--   · espelhar_parada_no_plano grava na faixa da grade o chip (a), o propósito (p) e a hora do
--     cadeado; parada que já estava na grade é ATUALIZADA (nunca uma faixa nova);
--   · tg_agendado_no_plano põe no plano todo tipo, menos Ligar (não é parada de rua);
--   · itens_do_plano e rotas_da_semana devolvem o chip (acao).
-- O que o executivo pôs à mão no Cockpit continua dele: o espelho só cria faixa nova com
-- origem 'app' e, quando a faixa já existe, só completa o chip e a hora.
-- Auditoria completa: design_handoff_desktop_web/UM-PLANO-SO-FASE0.md.

-- ── as colunas ──────────────────────────────────────────────────────────────────────
alter table public.field_route_stops add column if not exists acao text;
alter table public.client_meetings add column if not exists acao text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'field_route_stops_acao_valida') then
    alter table public.field_route_stops add constraint field_route_stops_acao_valida
      check (acao is null or acao in ('prosp', 'follow', 'reuniao', 'demo', 'ligar', 'cobrar', 'rel'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'client_meetings_acao_valida') then
    alter table public.client_meetings add constraint client_meetings_acao_valida
      check (acao is null or acao in ('prosp', 'follow', 'reuniao', 'demo', 'ligar', 'cobrar', 'rel'));
  end if;
end $$;
update public.client_meetings set acao = case when type = 'follow_up' then 'follow' else 'reuniao' end where acao is null;

-- ── a tabela §2.1: chip → propósito da grade ───────────────────────────────────────────
create or replace function public.plano_proposito(p_acao text, p_conta_alvo boolean)
returns text language sql immutable as $$
  select case p_acao
    when 'prosp' then case when p_conta_alvo then 'nova' else 'rua' end
    when 'follow' then 'follow'
    when 'ligar' then 'follow'
    when 'reuniao' then 'funil'
    when 'demo' then 'funil'
    when 'cobrar' then 'cobrar'
    when 'rel' then 'relac'
  end
$$;

-- ── o espelho parada → grade, com o chip e a hora ───────────────────────────────────────
create or replace function public.espelhar_parada_no_plano(p_stop uuid, p_fora boolean default false)
returns text
language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  st record;
  v_seller uuid; v_dia date; v_owner text;
  v_hs text; v_prosp uuid; v_status text;
  v_sid text; v_p text; v_ids text[];
  v_d int; v_seg date; v_grade jsonb; v_col jsonb; v_i int; v_livre int; v_el jsonb; v_el_id text;
  v_vazia jsonb; v_mudou boolean := false; v_achou text; v_achou_i int; v_extra jsonb;
begin
  select * into st from public.field_route_stops where id = p_stop;
  if st.id is null then return null; end if;
  select r.seller_id, r.route_date into v_seller, v_dia from public.field_routes r where r.id = st.route_id;
  if v_seller is null or v_dia < v_hoje then return null; end if;
  v_d := extract(isodow from v_dia)::int - 1;
  if v_d > 4 then return null; end if;
  select nullif(p.id_hubspot, '') into v_owner from public.profiles p where p.id = v_seller;
  if v_owner is null then return null; end if;

  select nullif(c.id_hubspot, ''), c.lead_prospeccao_id, c.status into v_hs, v_prosp, v_status
    from public.clients c where c.id = st.client_id;
  if v_hs is not null then
    v_sid := case when v_status in ('cliente', 'ganho_fs') then 'r-' else 'c-' end || v_hs;
    v_p := case when v_status in ('cliente', 'ganho_fs') then 'relac' else 'funil' end;
    v_ids := array['c-' || v_hs, 'r-' || v_hs];
    if v_prosp is not null then v_ids := v_ids || ('n-' || v_prosp::text); end if;
  elsif v_prosp is not null then
    v_sid := 'n-' || v_prosp::text; v_p := 'nova'; v_ids := array[v_sid];
  else
    return null;
  end if;
  /* o chip escolhido no pino decide o propósito (§2.1) */
  if st.acao is not null then v_p := coalesce(public.plano_proposito(st.acao, v_hs is null and v_prosp is not null), v_p); end if;
  v_extra := jsonb_strip_nulls(jsonb_build_object('a', st.acao, 'hora', nullif(st.horario_fixo, '')));

  v_seg := v_dia - v_d;
  select grade into v_grade from public.planos_semanais where owner_id = v_owner and data_segunda = v_seg for update;
  v_col := case when jsonb_typeof(v_grade) = 'array' and jsonb_typeof(v_grade -> v_d) = 'array' then v_grade -> v_d end;

  if st.status = 'removed' then
    delete from public.plano_rota_sincronizado where owner_id = v_owner and dia = v_dia and slot_id = any (v_ids);
    if v_col is null then return null; end if;
    for v_i in 0 .. jsonb_array_length(v_col) - 1 loop
      v_el := v_col -> v_i;
      v_el_id := case jsonb_typeof(v_el) when 'object' then v_el ->> 'id' when 'string' then v_el #>> '{}' end;
      if v_el_id = any (v_ids) then
        v_grade := jsonb_set(v_grade, array[v_d::text, v_i::text], 'null'::jsonb);
        v_mudou := true;
      end if;
    end loop;
    if v_mudou then
      update public.planos_semanais set grade = v_grade, atualizado_em = now() where owner_id = v_owner and data_segunda = v_seg;
    end if;
    return null;
  end if;

  if v_col is not null then
    for v_i in 0 .. jsonb_array_length(v_col) - 1 loop
      v_el := v_col -> v_i;
      v_el_id := case jsonb_typeof(v_el) when 'object' then v_el ->> 'id' when 'string' then v_el #>> '{}' end;
      if v_el_id = any (v_ids) then v_achou := v_el_id; v_achou_i := v_i; exit; end if;
    end loop;
  end if;
  if v_achou is not null then
    insert into public.plano_rota_sincronizado (owner_id, dia, slot_id, client_id, route_id)
    values (v_owner, v_dia, v_achou, st.client_id, st.route_id)
    on conflict (owner_id, dia, slot_id) do nothing;
    /* JÁ ESTÁ NA GRADE: só completa o chip, o propósito e a hora (nunca uma faixa nova) */
    if st.acao is not null or st.horario_fixo is not null then
      v_el := v_col -> v_achou_i;
      if jsonb_typeof(v_el) <> 'object' then v_el := jsonb_build_object('id', v_achou); end if;
      v_el := v_el || v_extra || case when st.acao is not null then jsonb_build_object('p', v_p) else '{}'::jsonb end;
      if v_el is distinct from (v_col -> v_achou_i) then
        v_grade := jsonb_set(v_grade, array[v_d::text, v_achou_i::text], v_el);
        update public.planos_semanais set grade = v_grade, atualizado_em = now() where owner_id = v_owner and data_segunda = v_seg;
      end if;
    end if;
    return v_achou;
  end if;

  v_vazia := (select jsonb_agg(null::jsonb) from generate_series(1, 15));
  if v_grade is null or jsonb_typeof(v_grade) <> 'array' or jsonb_array_length(v_grade) < 5 then
    v_grade := coalesce(case when jsonb_typeof(v_grade) = 'array' then v_grade end, '[]'::jsonb);
    while jsonb_array_length(v_grade) < 5 loop v_grade := v_grade || jsonb_build_array(v_vazia); end loop;
  end if;
  if jsonb_typeof(v_grade -> v_d) <> 'array' then
    v_grade := jsonb_set(v_grade, array[v_d::text], v_vazia);
  end if;
  v_col := v_grade -> v_d;

  v_livre := null;
  for v_i in 0 .. jsonb_array_length(v_col) - 1 loop
    if jsonb_typeof(v_col -> v_i) = 'null' then v_livre := v_i; exit; end if;
  end loop;
  if v_livre is null then return null; end if;

  insert into public.plano_rota_sincronizado (owner_id, dia, slot_id, client_id, route_id)
  values (v_owner, v_dia, v_sid, st.client_id, st.route_id)
  on conflict (owner_id, dia, slot_id) do nothing;

  v_grade := jsonb_set(v_grade, array[v_d::text, v_livre::text],
    jsonb_build_object('id', v_sid, 'p', v_p, 'origem', 'app') || v_extra
    || case when p_fora then jsonb_build_object('fora', true, 'feito', true) else '{}'::jsonb end);
  insert into public.planos_semanais (owner_id, data_segunda, grade)
  values (v_owner, v_seg, v_grade)
  on conflict (owner_id, data_segunda) do update set grade = excluded.grade, atualizado_em = now();
  return v_sid;
end;
$function$;

/* mudar o chip ou o cadeado de uma parada que já está no plano chega à grade */
create or replace function public.tg_parada_acao_no_plano()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if pg_trigger_depth() > 2 then return null; end if;
  if new.status <> 'planned' then return null; end if;
  if new.acao is not distinct from old.acao and new.horario_fixo is not distinct from old.horario_fixo then return null; end if;
  perform public.espelhar_parada_no_plano(new.id, false);
  return null;
exception when others then
  raise warning 'tg_parada_acao_no_plano: %', sqlerrm;
  return null;
end; $$;
drop trigger if exists parada_acao_no_plano on public.field_route_stops;
create trigger parada_acao_no_plano after update of acao, horario_fixo on public.field_route_stops
  for each row execute function public.tg_parada_acao_no_plano();

-- ── o Agendar antigo: todo tipo vai ao plano, menos Ligar ─────────────────────────────────
create or replace function public.tg_agendado_no_plano()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare v_owner text; v_dia_novo date; v_dia_velho date; v_hora text; v_acao text;
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
  if tg_op in ('INSERT', 'UPDATE') then
    v_acao := coalesce(new.acao, case when new.type = 'follow_up' then 'follow' else 'reuniao' end);
    if new.status = 'agendada' and v_acao <> 'ligar'
       and (tg_op = 'INSERT' or new.scheduled_at is distinct from old.scheduled_at or old.status is distinct from 'agendada') then
      v_dia_novo := (new.scheduled_at at time zone 'America/Sao_Paulo')::date;
      v_hora := to_char(new.scheduled_at at time zone 'America/Sao_Paulo', 'HH24:MI');
      perform public.plano_poe_slot(v_owner, v_dia_novo, new.client_id, null, case when v_acao = 'follow' then 'follow' else 'visita' end, v_hora, 'app-agenda');
    end if;
  end if;
  return null;
exception when others then
  raise warning 'tg_agendado_no_plano: %', sqlerrm;
  return null;
end; $function$;

-- ── a leitura do plano devolve o chip ───────────────────────────────────────────────────
drop function if exists public.rotas_da_semana(date, text[]);
drop function if exists public.itens_do_plano(date, text[]);
create function public.itens_do_plano(p_segunda date, p_donos text[])
returns table(owner_id text, dia date, vaga integer, item_id text, proposito text, hora text, client_id uuid, nome text, lat numeric, lng numeric, acao text)
language sql stable security definer set search_path to 'public' as $function$
  select ps.owner_id, p_segunda + (d.i - 1)::int, s.j::int, it.id, it.p, it.hora,
    cl.id,
    coalesce(nullif(btrim(cl.empresa), ''), nullif(btrim(cl.nome), ''), lp.nome, en.props->>'dealname', 'sem nome'),
    coalesce(cl.latitude, lp.lat), coalesce(cl.longitude, lp.lng),
    it.a
  from public.planos_semanais ps
  cross join lateral jsonb_array_elements(case when jsonb_typeof(ps.grade) = 'array' then ps.grade else '[]'::jsonb end) with ordinality d(v, i)
  cross join lateral jsonb_array_elements(case when jsonb_typeof(d.v) = 'array' then d.v else '[]'::jsonb end) with ordinality s(x, j)
  cross join lateral (
    select case when jsonb_typeof(s.x) = 'string' then s.x #>> '{}' else s.x->>'id' end as id,
           case when jsonb_typeof(s.x) = 'object' then s.x->>'p' end as p,
           case when jsonb_typeof(s.x) = 'object' then s.x->>'hora' end as hora,
           case when jsonb_typeof(s.x) = 'object' then s.x->>'a' end as a
  ) it
  left join lateral (
    select c.id, c.nome, c.empresa, c.latitude, c.longitude from public.clients c
     where not coalesce(c.is_archived, false)
       and ((left(it.id, 2) in ('c-', 'r-') and c.id_hubspot = substr(it.id, 3))
         or (left(it.id, 2) = 'n-' and substr(it.id, 3) ~ '^[0-9a-f-]{36}$'
             and c.lead_prospeccao_id::text = substr(it.id, 3)))
     order by c.updated_at desc nulls last, c.id
     limit 1
  ) cl on true
  left join public.leads_prospeccao lp
    on left(it.id, 2) = 'n-' and lp.id::text = substr(it.id, 3)
  left join public.espelho_negocios en
    on left(it.id, 2) in ('c-', 'r-') and en.deal_id = substr(it.id, 3)
  where ps.data_segunda = p_segunda
    and ps.owner_id = any(p_donos)
    and d.i <= 5
    and jsonb_typeof(s.x) in ('object', 'string')
    and coalesce(it.id, '') <> ''
    and left(it.id, 2) <> '__';
$function$;
revoke all on function public.itens_do_plano(date, text[]) from public, anon, authenticated;
grant execute on function public.itens_do_plano(date, text[]) to service_role;

create function public.rotas_da_semana(p_segunda date, p_donos text[])
returns table(owner_id text, dia date, vaga integer, item_id text, proposito text, hora text, client_id uuid, nome text, lat numeric, lng numeric, acao text)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select * from public.itens_do_plano(
    p_segunda,
    case when (select public.eh_gestor_cockpit()) then p_donos
         else array[(select public.meu_owner_hubspot())] end)
$$;
revoke all on function public.rotas_da_semana(date, text[]) from public, anon;
grant execute on function public.rotas_da_semana(date, text[]) to authenticated;
