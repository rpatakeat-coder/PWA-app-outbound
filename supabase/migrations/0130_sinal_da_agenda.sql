-- 0130 · O agendamento do app também avisa (28/09/2026)
--
-- O Agendar do app grava em client_meetings e, na demo, só no Google Calendar: o
-- HubSpot nunca fica sabendo, e o Cockpit (que lia só o HubSpot) nunca via. Desde
-- cockpit-unificado f23f757 o Cockpit lê client_meetings ao carregar; este gatilho faz
-- a tela aberta receber o agendamento na hora, igual visita e foto (0128). Mesmo
-- esquema: um sinal pequeno, sem conteúdo; quem recebe relê pela própria sessão.
-- Reagendar e cancelar também avisam (update/delete).

create or replace function public.tg_sinal_agenda() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  perform public.sinal_do_pino('agenda', r.client_id);
  return null;
end; $$;
drop trigger if exists sinal_agenda on public.client_meetings;
create trigger sinal_agenda after insert or update or delete on public.client_meetings
  for each row execute function public.tg_sinal_agenda();
