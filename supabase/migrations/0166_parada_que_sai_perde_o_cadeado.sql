-- PARADA QUE SAI PERDE O CADEADO (teste do Confirmar da Agenda do computador, 05/10/2026).
--
-- Tirar uma parada marca status = 'removed' e mantém a linha (rota + lead é único). Se ela
-- voltar ao mesmo dia (pela Agenda, pelo mapa ou pelo Planejamento do Cockpit), a linha
-- ressuscita — e voltava com o horário fixo antigo. No teste: fixar 09:15, soltar e tirar no
-- mesmo Confirmar deixou 09:15 gravado na linha removida.
create or replace function public.tg_parada_sai_sem_cadeado() returns trigger
language plpgsql as $$
begin
  if new.status = 'removed' and new.horario_fixo is not null then
    new.horario_fixo := null;
  end if;
  return new;
end; $$;

drop trigger if exists parada_sai_sem_cadeado on public.field_route_stops;
create trigger parada_sai_sem_cadeado
  before update of status on public.field_route_stops
  for each row execute function public.tg_parada_sai_sem_cadeado();

-- o que já ficou assim (a linha do teste)
update public.field_route_stops set horario_fixo = null where status = 'removed' and horario_fixo is not null;
