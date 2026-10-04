-- 0154 · Conquistas da temporada — docs/10 §2.6 C (04/10/2026)
--
-- Cinco conquistas, todas de comportamento, todas medidas no servidor (nada no cliente):
--   na_rua            dias úteis seguidos, até hoje, com visita PROVADA        (5)
--   fila_zerada       dias úteis seguidos em que a fila de Tarefas zerou       (5)
--   primeiro_contrato contrato no mês civil                                    (1)
--   quentes_4         quentes da carteira com 4+ contatos / total de quentes   (todos)
--   demo_seguidas     dias úteis seguidos com demo realizada                   (3)
-- "Fila zerada" não existia em lugar nenhum: a tela de Tarefas grava o dia em que zerou
-- (registrar_fila_zerada, idempotente por pessoa+dia). Sem dado, a conquista diz
-- "não medido" — nunca um número inventado.
-- Dias úteis aqui = segunda a sexta (a rua não acontece no fim de semana); feriado
-- nacional não quebra a sequência porque também não conta como dia.
-- Idempotente.

create table if not exists public.fila_zerada_dias (
  pessoa uuid not null default auth.uid(),
  dia date not null,
  criado_em timestamptz not null default now(),
  primary key (pessoa, dia)
);
alter table public.fila_zerada_dias enable row level security;
drop policy if exists fila_zerada_le_a_sua on public.fila_zerada_dias;
create policy fila_zerada_le_a_sua on public.fila_zerada_dias for select to authenticated
  using (pessoa = (select auth.uid()) or (select public.is_field_admin()) or (select public.eh_gestor_cockpit()));

create or replace function public.registrar_fila_zerada()
returns void language sql security definer set search_path to 'public' as $$
  insert into public.fila_zerada_dias (pessoa, dia)
  select (select auth.uid()), (now() at time zone 'America/Sao_Paulo')::date
  where (select auth.uid()) is not null
  on conflict do nothing;
$$;
revoke all on function public.registrar_fila_zerada() from public, anon;
grant execute on function public.registrar_fila_zerada() to authenticated;

-- sequência de dias úteis (seg–sex) terminando hoje ou no último dia útil, dado um conjunto de dias
create or replace function public._sequencia_util(p_dias date[])
returns integer language plpgsql stable set search_path to 'public' as $$
declare d date := (now() at time zone 'America/Sao_Paulo')::date; n int := 0; tolerancia boolean := true;
begin
  for i in 1..60 loop
    if extract(isodow from d) < 6 then
      if d = any(p_dias) then n := n + 1; tolerancia := false;
      elsif tolerancia then tolerancia := false;  -- hoje ainda pode acontecer: não quebra
      else exit; end if;
    end if;
    d := d - 1;
  end loop;
  return n;
end $$;

create or replace function public.minhas_conquistas()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_uid uuid := (select auth.uid()); v_owner text; v_rua int; v_fila int; v_tem_fila boolean; v_contrato boolean;
  v_demo int; v_q_total int; v_q_ok int; v_mes timestamptz;
begin
  select p.id_hubspot into v_owner from public.profiles p where p.id = v_uid;
  if v_uid is null then return '[]'::jsonb; end if;
  v_mes := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';

  select public._sequencia_util(coalesce(array_agg(distinct x.dia), '{}'::date[])) into v_rua
    from public._visitas_com_prova(((now() at time zone 'America/Sao_Paulo')::date - 40), (now() at time zone 'America/Sao_Paulo')::date, v_uid) x
   where x.provada;
  select exists (select 1 from public.fila_zerada_dias where pessoa = v_uid) into v_tem_fila;
  select public._sequencia_util(coalesce(array_agg(dia), '{}'::date[])) into v_fila from public.fila_zerada_dias where pessoa = v_uid;
  select exists (select 1 from public.pontos_eventos where owner_id = v_owner and tipo = 'contrato' and ref_em >= v_mes) into v_contrato;
  select public._sequencia_util(coalesce(array_agg(distinct (ref_em at time zone 'America/Sao_Paulo')::date), '{}'::date[])) into v_demo
    from public.pontos_eventos where owner_id = v_owner and tipo = 'demo_realizada';

  -- quentes da carteira (snapshot do robô) com 4+ contatos (contatos_de_campo + visitas)
  with q as (
    select (x->>'id') as deal from public.cockpit_snapshot s,
      jsonb_array_elements(case jsonb_typeof(s.conteudo->'reps'->v_owner->'quentes') when 'array' then s.conteudo->'reps'->v_owner->'quentes' else '[]'::jsonb end) x
     where s.chave = 'hubspot'
  ), c as (
    select q.deal,
      (select count(*) from public.contatos_de_campo cc where cc.deal_id = q.deal)
      + (select count(*) from public.client_visits v join public.clients cl on cl.id = v.client_id where cl.id_hubspot = q.deal) as n
    from q
  ) select count(*), count(*) filter (where n >= 4) into v_q_total, v_q_ok from c;

  return jsonb_build_array(
    jsonb_build_object('id', 'na_rua', 'titulo', 'Na rua 5 dias seguidos', 'feito', v_rua >= 5, 'progresso', least(v_rua, 5), 'alvo', 5, 'unidade', 'dias'),
    jsonb_build_object('id', 'fila_zerada', 'titulo', 'Fila zerada 5 dias', 'feito', v_fila >= 5, 'progresso', least(v_fila, 5), 'alvo', 5, 'unidade', 'dias', 'medido', v_tem_fila),
    jsonb_build_object('id', 'primeiro_contrato', 'titulo', 'Primeiro contrato do mês', 'feito', v_contrato, 'progresso', case when v_contrato then 1 else 0 end, 'alvo', 1, 'unidade', 'contrato'),
    jsonb_build_object('id', 'quentes_4', 'titulo', '4 contatos em todos os quentes', 'feito', v_q_total > 0 and v_q_ok = v_q_total, 'progresso', v_q_ok, 'alvo', v_q_total, 'unidade', 'quentes', 'medido', v_q_total > 0),
    jsonb_build_object('id', 'demo_seguidas', 'titulo', 'Demo realizada 3 dias seguidos', 'feito', v_demo >= 3, 'progresso', least(v_demo, 3), 'alvo', 3, 'unidade', 'dias')
  );
end $$;
revoke all on function public.minhas_conquistas() from public, anon;
grant execute on function public.minhas_conquistas() to authenticated;
