-- 0215 · A CONTA APROVADA NO TERRITÓRIO ENTRA NO PLANEJAMENTO DO EXECUTIVO (16/10/2026)
--
-- Julyan, 16/10: "eu tinha colocado leads no planejamento deles no dia 19 e o Sandro não recebeu
-- esses leads ... essa munição tem que ir tanto pro planejamento e caso eu coloque no dia 19, ele tem
-- que aparecer". O Território do gestor (GV2.v9Aprovar / v9PorNaRota) grava em leads_prospeccao
-- status 'na_rota' + data_rota (a segunda) + responsavel_owner_id — e NADA levava isso ao plano da
-- semana (planos_semanais) nem à rota do app: os leitores antigos de data_rota só olham "hoje".
-- Medido: as 7 contas do Sandro para 19/10 tinham pino, e não estavam nem no plano nem na rota.
--
-- Agora, um gatilho: conta aprovada para um dia entra na grade daquele dia (origem 'territorio'), no
-- primeiro lugar vazio ou no fim (o dia não tem limite, 0213). Já sendo negócio (deal da conta ou do
-- pino), entra como c-<negócio>; senão, como n-<conta>. Se já está em qualquer dia da semana, não
-- duplica. A grade gravada dispara plano_mudou → plano_para_rota, que leva à rota do app.
-- Desfazer a aprovação (ou trocar o dia ou o dono) tira o item — SÓ o que o território pôs e SÓ em dia
-- que ainda não passou; negócio que nasceu dele não é tirado.
create or replace function public.plano_poe_territorio(p_lp uuid)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  l public.leads_prospeccao;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_d int; v_seg date; v_hs text; v_sid text; v_ids text[];
  v_grade jsonb; v_col jsonb; v_vazia jsonb; v_i int; v_j int; v_livre int; v_el jsonb; v_el_id text;
begin
  select * into l from public.leads_prospeccao where id = p_lp;
  if l.id is null or l.status <> 'na_rota' or l.data_rota is null or nullif(l.responsavel_owner_id, '') is null then return null; end if;
  if l.data_rota < v_hoje then return null; end if;
  v_d := extract(isodow from l.data_rota)::int - 1;
  if v_d > 4 then return null; end if;
  v_seg := l.data_rota - v_d;

  select nullif(c.id_hubspot, '') into v_hs from public.clients c where c.lead_prospeccao_id = l.id and nullif(c.id_hubspot, '') is not null limit 1;
  v_hs := coalesce(nullif(l.hubspot_deal_id, ''), v_hs);
  v_sid := case when v_hs is not null then 'c-' || v_hs else 'n-' || l.id::text end;
  v_ids := array['n-' || l.id::text] || case when v_hs is not null then array['c-' || v_hs, 'r-' || v_hs] else array[]::text[] end;

  select grade into v_grade from public.planos_semanais where owner_id = l.responsavel_owner_id and data_segunda = v_seg for update;
  v_vazia := (select jsonb_agg(null::jsonb) from generate_series(1, 15));
  if v_grade is null or jsonb_typeof(v_grade) <> 'array' or jsonb_array_length(v_grade) < 5 then
    v_grade := coalesce(case when jsonb_typeof(v_grade) = 'array' then v_grade end, '[]'::jsonb);
    while jsonb_array_length(v_grade) < 5 loop v_grade := v_grade || jsonb_build_array(v_vazia); end loop;
  end if;
  -- já está na semana (ele ou o gestor já pôs): não duplica
  for v_j in 0 .. 4 loop
    if jsonb_typeof(v_grade -> v_j) = 'array' then
      for v_i in 0 .. jsonb_array_length(v_grade -> v_j) - 1 loop
        v_el := v_grade -> v_j -> v_i;
        v_el_id := case jsonb_typeof(v_el) when 'object' then v_el ->> 'id' when 'string' then v_el #>> '{}' end;
        if v_el_id = any (v_ids) then return v_el_id; end if;
      end loop;
    end if;
  end loop;
  if jsonb_typeof(v_grade -> v_d) <> 'array' then v_grade := jsonb_set(v_grade, array[v_d::text], v_vazia); end if;
  v_col := v_grade -> v_d;
  v_livre := null;
  for v_i in 0 .. jsonb_array_length(v_col) - 1 loop
    if jsonb_typeof(v_col -> v_i) = 'null' then v_livre := v_i; exit; end if;
  end loop;
  if v_livre is null then v_livre := jsonb_array_length(v_col); end if;
  v_grade := jsonb_set(v_grade, array[v_d::text, v_livre::text],
    jsonb_build_object('id', v_sid, 'p', case when v_hs is not null then 'funil' else 'nova' end, 'origem', 'territorio'));
  insert into public.planos_semanais (owner_id, data_segunda, grade) values (l.responsavel_owner_id, v_seg, v_grade)
  on conflict (owner_id, data_segunda) do update set grade = excluded.grade, atualizado_em = now();
  return v_sid;
end $$;

create or replace function public.plano_tira_territorio(p_owner text, p_dia date, p_lp uuid, p_deal text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_d int; v_seg date; v_grade jsonb; v_i int; v_el jsonb; v_ids text[]; v_mudou boolean := false;
begin
  if nullif(p_owner, '') is null or p_dia is null or p_dia < (now() at time zone 'America/Sao_Paulo')::date then return; end if;
  v_d := extract(isodow from p_dia)::int - 1;
  if v_d > 4 then return; end if;
  v_seg := p_dia - v_d;
  v_ids := array['n-' || p_lp::text] || case when nullif(p_deal, '') is not null then array['c-' || p_deal] else array[]::text[] end;
  select grade into v_grade from public.planos_semanais where owner_id = p_owner and data_segunda = v_seg for update;
  if v_grade is null or jsonb_typeof(v_grade -> v_d) <> 'array' then return; end if;
  for v_i in 0 .. jsonb_array_length(v_grade -> v_d) - 1 loop
    v_el := v_grade -> v_d -> v_i;
    if jsonb_typeof(v_el) = 'object' and v_el ->> 'origem' = 'territorio' and (v_el ->> 'id') = any (v_ids) then
      v_grade := jsonb_set(v_grade, array[v_d::text, v_i::text], 'null'::jsonb); v_mudou := true;
    end if;
  end loop;
  if v_mudou then update public.planos_semanais set grade = v_grade, atualizado_em = now() where owner_id = p_owner and data_segunda = v_seg; end if;
end $$;

create or replace function public.tg_territorio_no_plano()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and old.status = 'na_rota' and old.data_rota is not null
     and (new.status is distinct from 'na_rota' or new.data_rota is distinct from old.data_rota
          or new.responsavel_owner_id is distinct from old.responsavel_owner_id)
     and nullif(new.hubspot_deal_id, '') is null then
    perform public.plano_tira_territorio(old.responsavel_owner_id, old.data_rota, old.id, null);
  end if;
  if new.status = 'na_rota' and new.data_rota is not null and nullif(new.responsavel_owner_id, '') is not null
     and (tg_op = 'INSERT' or old.status is distinct from new.status or old.data_rota is distinct from new.data_rota
          or old.responsavel_owner_id is distinct from new.responsavel_owner_id) then
    perform public.plano_poe_territorio(new.id);
  end if;
  return null;
end $$;

drop trigger if exists territorio_no_plano on public.leads_prospeccao;
create trigger territorio_no_plano
  after insert or update of status, data_rota, responsavel_owner_id on public.leads_prospeccao
  for each row execute function public.tg_territorio_no_plano();

-- as contas já aprovadas para hoje em diante (as 7 do Sandro para 19/10, entre elas)
select public.plano_poe_territorio(id)
  from public.leads_prospeccao
 where status = 'na_rota' and data_rota >= (now() at time zone 'America/Sao_Paulo')::date and nullif(responsavel_owner_id, '') is not null;
