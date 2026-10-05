-- HORÁRIO FIXO NA PARADA (Agenda no computador, 05/10/2026).
--
-- A prancha separa ORDEM de HORÁRIO: a ordem manda e o horário de cada parada é estimado pelo
-- caminho (início + rua + 20 min por visita). Só o que tem cadeado fica parado no relógio:
-- reunião ou horário combinado. A reunião já vem com hora da grade do Cockpit (planned_at da
-- faixa); o cadeado que o executivo põe na Agenda precisa de um lugar próprio, porque
-- planned_at é gravado como "agora" em toda parada nova e não diz horário nenhum.
--
-- 'HH:MM' em Brasília. Nulo = estimado. Coluna nova, nula, sem default: nenhuma linha muda.
alter table public.field_route_stops
  add column if not exists horario_fixo text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'field_route_stops_horario_fixo_formato') then
    alter table public.field_route_stops
      add constraint field_route_stops_horario_fixo_formato
      check (horario_fixo is null or horario_fixo ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
  end if;
end $$;

comment on column public.field_route_stops.horario_fixo is
  'Horário com cadeado (HH:MM, Brasília) posto na Agenda do computador. Nulo = estimado pela ordem.';
