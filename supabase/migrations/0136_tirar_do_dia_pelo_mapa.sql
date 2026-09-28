-- 0136 · Tirar do dia pelo mapa tira do Planejamento do Cockpit (28/09/2026)
--
-- Julyan: "quero algo ali pra ajudar o planejamento deles, escolhendo direto do mapa
-- (...) app e Cockpit têm que ser um só, tudo tem que ir". O modo Planejar do mapa põe
-- e tira leads de qualquer dia da semana, e o rota_para_plano (0131) leva à grade.
--
-- Três furos do 0131, medidos lendo a função no ar:
--   1. Parada que VEIO do Cockpit (mandatory_reason = 'plano_cockpit') e o executivo
--      tira no app: o gatilho saía na primeira linha. A grade continuava com o lead, e o
--      próximo plano_para_rota revivia a parada (on conflict → 'planned'). Tirar não
--      tirava. Agora a remoção vale para qualquer parada.
--   2. A mesma parada, tirada e posta de volta no app: também saía na primeira linha e
--      o Cockpit nunca via a volta. Agora só o INSERT do próprio plano_para_rota é pulado
--      (a faixa já está na grade); a volta de 'removed' para 'planned' entra.
--   3. Conta-alvo com negócio: o Cockpit pode ter guardado a faixa como 'n-<munição>' e
--      o gatilho procurava só 'c-/r-<negócio>' — não achava para tirar, e para pôr
--      duplicava. Agora procura os três ids.
-- E a remoção só regrava a grade quando algo saiu dela: regravar igual disparava o
-- plano_mudou à toa (o plano_para_rota que remove uma parada caía aqui de novo).

create or replace function public.rota_para_plano() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_seller uuid; v_dia date; v_owner text;
  v_hs text; v_prosp uuid; v_status text;
  v_sid text; v_p text; v_ids text[];
  v_d int; v_seg date; v_grade jsonb; v_col jsonb; v_i int; v_livre int; v_el jsonb; v_el_id text;
  v_vazia jsonb; v_mudou boolean := false;
begin
  if pg_trigger_depth() > 2 then return null; end if;
  -- a parada que o plano_para_rota acabou de criar: a faixa já está na grade
  if tg_op = 'INSERT' and coalesce(new.mandatory_reason, '') = 'plano_cockpit' then return null; end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return null; end if;

  select r.seller_id, r.route_date into v_seller, v_dia from public.field_routes r where r.id = new.route_id;
  if v_seller is null or v_dia < v_hoje then return null; end if;
  v_d := extract(isodow from v_dia)::int - 1;
  if v_d > 4 then return null; end if;
  select nullif(p.id_hubspot, '') into v_owner from public.profiles p where p.id = v_seller;
  if v_owner is null then return null; end if;

  select nullif(c.id_hubspot, ''), c.lead_prospeccao_id, c.status into v_hs, v_prosp, v_status
  from public.clients c where c.id = new.client_id;
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

  v_seg := v_dia - v_d;
  select grade into v_grade from public.planos_semanais where owner_id = v_owner and data_segunda = v_seg for update;
  v_col := case when jsonb_typeof(v_grade) = 'array' and jsonb_typeof(v_grade -> v_d) = 'array' then v_grade -> v_d end;

  if new.status = 'removed' then
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
      if v_el_id = any (v_ids) then return null; end if;
    end loop;
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
  if v_livre is null then return null; end if;  -- dia cheio: o Cockpit continua com o que tem

  insert into public.plano_rota_sincronizado (owner_id, dia, slot_id, client_id, route_id)
  values (v_owner, v_dia, v_sid, new.client_id, new.route_id)
  on conflict (owner_id, dia, slot_id) do nothing;

  v_grade := jsonb_set(v_grade, array[v_d::text, v_livre::text],
    jsonb_build_object('id', v_sid, 'p', v_p, 'origem', 'app'));
  insert into public.planos_semanais (owner_id, data_segunda, grade)
  values (v_owner, v_seg, v_grade)
  on conflict (owner_id, data_segunda) do update set grade = excluded.grade, atualizado_em = now();
  return null;
exception when others then
  -- o espelho nunca derruba a parada que o executivo acabou de mexer
  raise warning 'rota_para_plano: %', sqlerrm;
  return null;
end; $$;
