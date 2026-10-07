-- 0177 · A visita fecha a reunião do dia (07/10/2026)
--
-- Medido em 07/10: 550 reuniões 'agendada' com a data já passada. 83 delas tiveram check-in do
-- mesmo executivo no mesmo cliente no mesmo dia: aconteceram, só ninguém marcou. O app não tinha
-- lugar para dar o desfecho de reunião que passou (só "Registrar" na Agenda, no dia escolhido).
--
-- Regra: check-in (client_visits) ou ficha de visita (fichas_de_rua) do dono da reunião, no
-- mesmo cliente e no mesmo dia (Brasília) de uma reunião ainda 'agendada' → 'realizada'.
-- Remarcar e "não aconteceu" continuam na mão de quem marcou (RPC reuniao_desfecho, 0176).

create or replace function public.tg_visita_fecha_reuniao()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_dono uuid; v_quando timestamptz;
begin
  if tg_table_name = 'client_visits' then v_dono := new.visited_by; v_quando := new.visited_at;
  else v_dono := new.criado_por; v_quando := new.ocorrido_em; end if;
  if v_dono is null or new.client_id is null or v_quando is null then return null; end if;
  update public.client_meetings m set status = 'realizada'
   where m.client_id = new.client_id and m.created_by = v_dono and m.status = 'agendada'
     and (m.scheduled_at at time zone 'America/Sao_Paulo')::date = (v_quando at time zone 'America/Sao_Paulo')::date;
  return null;
exception when others then raise warning 'tg_visita_fecha_reuniao: %', sqlerrm; return null;
end; $$;

drop trigger if exists visita_fecha_reuniao on public.client_visits;
create trigger visita_fecha_reuniao after insert on public.client_visits
  for each row execute function public.tg_visita_fecha_reuniao();
drop trigger if exists ficha_fecha_reuniao on public.fichas_de_rua;
create trigger ficha_fecha_reuniao after insert on public.fichas_de_rua
  for each row execute function public.tg_visita_fecha_reuniao();

-- o passado com prova: só onde houve check-in ou ficha do mesmo dono, cliente e dia.
-- Os ids ficam guardados para desfazer (update ... set status='agendada' where id in (...)).
create table if not exists public._reunioes_fechadas_0177 (id uuid primary key, em timestamptz default now());
alter table public._reunioes_fechadas_0177 enable row level security;
with fechadas as (
update public.client_meetings m set status = 'realizada'
 where m.status = 'agendada' and m.scheduled_at < now()
   and (exists (select 1 from public.client_visits v where v.client_id = m.client_id and v.visited_by = m.created_by
                 and (v.visited_at at time zone 'America/Sao_Paulo')::date = (m.scheduled_at at time zone 'America/Sao_Paulo')::date)
     or exists (select 1 from public.fichas_de_rua f where f.client_id = m.client_id and f.criado_por = m.created_by
                 and (f.ocorrido_em at time zone 'America/Sao_Paulo')::date = (m.scheduled_at at time zone 'America/Sao_Paulo')::date))
 returning m.id)
insert into public._reunioes_fechadas_0177 (id) select id from fechadas on conflict do nothing;
