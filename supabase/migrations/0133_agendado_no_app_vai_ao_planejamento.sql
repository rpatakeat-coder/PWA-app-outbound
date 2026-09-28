-- 0133 · O que se agenda no app vai para o Planejamento do Cockpit (28/09/2026)
--
-- Julyan: "por que as visitas que agendo no app não estão indo para o Planejamento do
-- Cockpit? se tudo tem que ser sincronizado". Medido: 13 agendamentos futuros do app
-- (client_meetings), nenhum na grade (planos_semanais). A 0131 levou a ROTA DE HOJE do
-- app para a grade; faltavam o "Agendar" do cartão (qualquer dia) e o próximo passo da
-- ficha de rua (que a cockpit-api cria e passa a pôr na grade por plano_poe_slot).
--
-- Duas funções, um lugar só para a regra da grade:
--   plano_poe_slot  — põe o lead na primeira faixa livre do dia, com a hora; se ele já
--                     está no dia, só completa a hora. Segunda a sexta. Id que o
--                     Cockpit já usa: c-<negócio>, r-<negócio> (cliente), n-<conta-alvo>.
--   plano_tira_slot — tira do dia só o que ESTA origem pôs (não mexe no que o executivo
--                     planejou à mão no Cockpit).
-- A faixa nova dispara o plano_mudou → plano_para_rota, e o lead vira parada daquele
-- dia no app, como qualquer faixa do Cockpit.

create or replace function public.plano_poe_slot(
  p_owner text, p_dia date, p_client uuid, p_deal text, p_tipo text, p_hora text, p_origem text
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hs text; v_prosp uuid; v_status text;
  v_sid text; v_p text; v_ids text[];
  v_d int; v_seg date; v_grade jsonb; v_col jsonb; v_i int; v_livre int; v_el jsonb; v_el_id text; v_vazia jsonb;
begin
  if nullif(p_owner, '') is null or p_dia is null then return null; end if;
  if p_dia < (now() at time zone 'America/Sao_Paulo')::date then return null; end if;
  v_d := extract(isodow from p_dia)::int - 1;
  if v_d > 4 then return null; end if;

  if p_client is not null then
    select nullif(c.id_hubspot, ''), c.lead_prospeccao_id, c.status into v_hs, v_prosp, v_status from public.clients c where c.id = p_client;
  end if;
  if v_hs is null and nullif(p_deal, '') is not null then
    v_hs := p_deal;
    select c.status into v_status from public.clients c where c.id_hubspot = p_deal and not c.is_archived limit 1;
  end if;
  if v_hs is not null then
    v_sid := case when v_status in ('cliente', 'ganho_fs') then 'r-' else 'c-' end || v_hs;
    v_ids := array['c-' || v_hs, 'r-' || v_hs];
    v_p := case when v_status in ('cliente', 'ganho_fs') then 'relac' when p_tipo = 'follow' then 'follow' else 'funil' end;
  elsif v_prosp is not null then
    v_sid := 'n-' || v_prosp::text; v_ids := array[v_sid]; v_p := 'nova';
  else
    return null;
  end if;

  v_seg := p_dia - v_d;
  select grade into v_grade from public.planos_semanais where owner_id = p_owner and data_segunda = v_seg for update;
  v_vazia := (select jsonb_agg(null::jsonb) from generate_series(1, 15));
  if v_grade is null or jsonb_typeof(v_grade) <> 'array' or jsonb_array_length(v_grade) < 5 then
    v_grade := coalesce(case when jsonb_typeof(v_grade) = 'array' then v_grade end, '[]'::jsonb);
    while jsonb_array_length(v_grade) < 5 loop v_grade := v_grade || jsonb_build_array(v_vazia); end loop;
  end if;
  if jsonb_typeof(v_grade -> v_d) <> 'array' then v_grade := jsonb_set(v_grade, array[v_d::text], v_vazia); end if;
  v_col := v_grade -> v_d;

  for v_i in 0 .. jsonb_array_length(v_col) - 1 loop
    v_el := v_col -> v_i;
    v_el_id := case jsonb_typeof(v_el) when 'object' then v_el ->> 'id' when 'string' then v_el #>> '{}' end;
    if v_el_id = any (v_ids) then
      if nullif(p_hora, '') is not null and jsonb_typeof(v_el) = 'object' and nullif(v_el ->> 'hora', '') is null then
        v_grade := jsonb_set(v_grade, array[v_d::text, v_i::text], v_el || jsonb_build_object('hora', p_hora));
        update public.planos_semanais set grade = v_grade, atualizado_em = now() where owner_id = p_owner and data_segunda = v_seg;
      end if;
      return v_sid;
    end if;
  end loop;

  v_livre := null;
  for v_i in 0 .. jsonb_array_length(v_col) - 1 loop
    if jsonb_typeof(v_col -> v_i) = 'null' then v_livre := v_i; exit; end if;
  end loop;
  if v_livre is null then return null; end if;

  v_grade := jsonb_set(v_grade, array[v_d::text, v_livre::text],
    jsonb_strip_nulls(jsonb_build_object('id', v_sid, 'p', v_p, 'hora', nullif(p_hora, ''), 'origem', p_origem)));
  insert into public.planos_semanais (owner_id, data_segunda, grade)
  values (p_owner, v_seg, v_grade)
  on conflict (owner_id, data_segunda) do update set grade = excluded.grade, atualizado_em = now();
  return v_sid;
end; $$;

create or replace function public.plano_tira_slot(p_owner text, p_dia date, p_client uuid, p_origem text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_hs text; v_prosp uuid; v_ids text[]; v_d int; v_seg date; v_grade jsonb; v_col jsonb; v_i int; v_el jsonb; v_mudou boolean := false;
begin
  if nullif(p_owner, '') is null or p_dia is null or p_client is null then return; end if;
  v_d := extract(isodow from p_dia)::int - 1;
  if v_d > 4 then return; end if;
  select nullif(c.id_hubspot, ''), c.lead_prospeccao_id into v_hs, v_prosp from public.clients c where c.id = p_client;
  v_ids := array_remove(array['c-' || v_hs, 'r-' || v_hs, 'n-' || v_prosp::text], null);
  v_seg := p_dia - v_d;
  select grade into v_grade from public.planos_semanais where owner_id = p_owner and data_segunda = v_seg for update;
  if jsonb_typeof(v_grade) <> 'array' or jsonb_typeof(v_grade -> v_d) <> 'array' then return; end if;
  v_col := v_grade -> v_d;
  for v_i in 0 .. jsonb_array_length(v_col) - 1 loop
    v_el := v_col -> v_i;
    if jsonb_typeof(v_el) = 'object' and (v_el ->> 'id') = any (v_ids) and (v_el ->> 'origem') = p_origem then
      v_grade := jsonb_set(v_grade, array[v_d::text, v_i::text], 'null'::jsonb); v_mudou := true;
    end if;
  end loop;
  if v_mudou then
    update public.planos_semanais set grade = v_grade, atualizado_em = now() where owner_id = p_owner and data_segunda = v_seg;
  end if;
end; $$;

revoke all on function public.plano_poe_slot(text, date, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.plano_tira_slot(text, date, uuid, text) from public, anon, authenticated;

-- O "Agendar" do app: criar, reagendar e cancelar mexem na grade.
create or replace function public.tg_agendado_no_plano() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_owner text; v_dia_novo date; v_dia_velho date; v_hora text; v_tipo text;
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
  if tg_op in ('INSERT', 'UPDATE') and new.status = 'agendada'
     and (tg_op = 'INSERT' or new.scheduled_at is distinct from old.scheduled_at or old.status is distinct from 'agendada') then
    v_dia_novo := (new.scheduled_at at time zone 'America/Sao_Paulo')::date;
    v_hora := to_char(new.scheduled_at at time zone 'America/Sao_Paulo', 'HH24:MI');
    v_tipo := case when new.type = 'follow_up' then 'follow' else 'visita' end;
    perform public.plano_poe_slot(v_owner, v_dia_novo, new.client_id, null, v_tipo, v_hora, 'app-agenda');
  end if;
  return null;
exception when others then
  raise warning 'tg_agendado_no_plano: %', sqlerrm;
  return null;
end; $$;

drop trigger if exists agendado_no_plano on public.client_meetings;
create trigger agendado_no_plano after insert or update of scheduled_at, status or delete on public.client_meetings
  for each row execute function public.tg_agendado_no_plano();
