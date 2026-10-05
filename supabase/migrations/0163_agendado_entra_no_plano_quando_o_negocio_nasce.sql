-- 0163 — Agendou antes do negócio existir: entra no plano quando ele nasce (Julyan, 05/10/2026).
--
-- "Os leads que puxamos do Google ... tem que criar o lead e ir pro funil, e se ele agendar, tem
-- que ir pro Planejamento também." O agendado já vai ao Planejamento pelo gatilho
-- agendado_no_plano (client_meetings), mas plano_poe_slot só sabe pôr na grade quem tem negócio
-- (id_hubspot) ou é conta-alvo da munição. O lead criado de um restaurante do Google ganha o
-- negócio 1 a 3 s depois (create_pin assíncrono); agendar nesse intervalo — ou com o HubSpot lento
-- — deixava a visita fora do Planejamento, sem erro nenhum.
--
-- Aqui: quando clients.id_hubspot passa de vazio para preenchido, cada agendamento futuro ainda
-- 'agendada' (não follow-up) daquele lead é posto na grade, com a mesma função e a mesma origem do
-- gatilho original. plano_poe_slot já ignora dia passado e fim de semana e não duplica.

create or replace function public.tg_negocio_nasceu_poe_agendados()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare r record; v_owner text;
begin
  if pg_trigger_depth() > 2 then return null; end if;
  for r in
    select m.client_id, m.scheduled_at, m.created_by
      from public.client_meetings m
     where m.client_id = new.id
       and m.status = 'agendada'
       and m.type is distinct from 'follow_up'
       and m.scheduled_at >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
  loop
    select nullif(p.id_hubspot, '') into v_owner from public.profiles p where p.id = r.created_by;
    if v_owner is not null then
      perform public.plano_poe_slot(v_owner, (r.scheduled_at at time zone 'America/Sao_Paulo')::date, r.client_id, null, 'visita',
        to_char(r.scheduled_at at time zone 'America/Sao_Paulo', 'HH24:MI'), 'app-agenda');
    end if;
  end loop;
  return null;
exception when others then
  raise warning 'tg_negocio_nasceu_poe_agendados: %', sqlerrm;
  return null;
end; $$;

drop trigger if exists negocio_nasceu_poe_agendados on public.clients;
create trigger negocio_nasceu_poe_agendados
  after update of id_hubspot on public.clients
  for each row
  when (nullif(old.id_hubspot, '') is null and nullif(new.id_hubspot, '') is not null)
  execute function public.tg_negocio_nasceu_poe_agendados();
