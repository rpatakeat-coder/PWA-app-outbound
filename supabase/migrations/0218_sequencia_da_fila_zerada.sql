-- 0218 · A SEQUÊNCIA DE DIAS ZERANDO (P3 do handoff "Tarefas do App", 17/10/2026)
--
-- A 0217 criou dias_zerados, mas o fato já tinha casa: fila_zerada_dias (pessoa, dia, criado_em),
-- gravada pelo app via registrar_fila_zerada() quando a fila zera. Duas tabelas para a mesma coisa
-- divergem em silêncio; dias_zerados estava vazia e sai. A sequência lê fila_zerada_dias.
drop table if exists public.dias_zerados;

-- Dias ÚTEIS seguidos em que a fila zerou ANTES DAS 18H (Brasília), até hoje ou até o último dia
-- útil (hoje ainda não zerado não quebra a sequência de ontem), e o recorde da pessoa.
-- Feriado não está no banco: um feriado no meio quebra a conta (raro; a regra do app é a mesma).
create or replace function public.sequencia_da_fila_zerada()
returns table (atual int, recorde int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_eu uuid := (select auth.uid());
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dias date[];
  v_d date; v_ant date := null; v_run int := 0; v_max int := 0; v_atual int := 0;
  v_esperado date;
begin
  if v_eu is null then return; end if;
  select coalesce(array_agg(z.dia order by z.dia), '{}') into v_dias
    from public.fila_zerada_dias z
   where z.pessoa = v_eu and extract(isodow from z.dia) < 6
     and (z.criado_em at time zone 'America/Sao_Paulo')::time < time '18:00';
  foreach v_d in array v_dias loop
    -- o dia útil seguinte ao anterior: sexta → segunda
    v_esperado := case when v_ant is null then null
                       when extract(isodow from v_ant) = 5 then v_ant + 3 else v_ant + 1 end;
    if v_ant is not null and v_d = v_esperado then v_run := v_run + 1; else v_run := 1; end if;
    v_max := greatest(v_max, v_run);
    v_ant := v_d;
  end loop;
  -- a sequência atual só vale se terminou hoje ou no último dia útil antes de hoje
  v_esperado := case when extract(isodow from v_hoje) = 1 then v_hoje - 3
                     when extract(isodow from v_hoje) = 7 then v_hoje - 2
                     when extract(isodow from v_hoje) = 6 then v_hoje - 1
                     else v_hoje - 1 end;
  if v_ant is not null and (v_ant = v_hoje or v_ant = v_esperado) then v_atual := v_run; end if;
  return query select v_atual, v_max;
end $$;
revoke execute on function public.sequencia_da_fila_zerada() from public, anon;
grant execute on function public.sequencia_da_fila_zerada() to authenticated;
