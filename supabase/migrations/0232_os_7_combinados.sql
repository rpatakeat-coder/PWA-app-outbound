-- 0232 · Os 7 combinados (handoff "Acelerar Field Sales v2", telas 2a, 2b e 2c)
--
-- Os 7 combinados e como cada um é medido, com o que JÁ existe no banco:
--   1 A porta é provada        visitas da semana com prova (GPS no pino ou foto) ÷ visitas
--   2 Próximo passo e data     visitas com ficha que tem próximo passo com data (ou perdido com motivo) ÷ visitas
--   3 Ficha na hora            visitas com a ficha feita até 15 min depois do check-in ÷ visitas
--   4 Visita com o dono        das fichas em que o dono não estava, quantas têm a volta no horário dele
--                              (volta marcada = próximo passo visita ou reunião com data; horario_dono conta
--                              quando existe, mas a ficha deixou de perguntá-lo em 14/10)
--   5 Registro verdadeiro      divergências: visita com ficha, sem prova e sem ter sido declarada sem sinal
--                              (o GPS estava longe do endereço). O cockpit aponta; o gestor decide.
--   6 Dia planejado na véspera dias úteis com rota (com paradas) criada até as 20h da véspera
--   7 Presença nos rituais     1:1 (um_a_um), fecho do dia (fecho_do_dia), daily e simulação (marcados
--                              pelo gestor em rituais_presenca: não há outra fonte de presença — a linha de
--                              `dailies` é criada pelo robô todo dia, até no domingo)
--
-- A ocorrência é SEMPRE registrada pelo gestor; nada aqui cria ocorrência sozinho.
-- Registro falso vai direto para o degrau 3 (a constraint garante).
-- Nada aqui escreve no HubSpot.

create table if not exists public.combinados_aceite (
  pessoa uuid not null references auth.users(id),
  versao text not null,
  aceito_em date not null,
  registrado_por text,
  criado_em timestamptz not null default now(),
  primary key (pessoa, versao)
);
comment on table public.combinados_aceite is
  'Leu e aceitou os 7 combinados (uma linha por pessoa e versão do texto do Playbook).';

create table if not exists public.ocorrencias (
  id uuid primary key default gen_random_uuid(),
  pessoa uuid not null references auth.users(id),
  combinado smallint not null check (combinado between 1 and 7),
  degrau smallint not null check (degrau between 1 and 3),
  dia date not null,
  o_que_aconteceu text not null check (length(btrim(o_que_aconteceu)) >= 5),
  evidencia text,
  registro_falso boolean not null default false,
  prazo date,
  registrado_por text,
  criado_em timestamptz not null default now(),
  constraint ocorrencias_registro_falso_e_degrau_3 check (not registro_falso or degrau = 3)
);
comment on table public.ocorrencias is
  'Combinado quebrado registrado pelo gestor: 1 conversa, 2 plano escrito (prazo de 2 semanas), 3 advertência. Registro falso vai direto para o 3.';
create index if not exists ocorrencias_pessoa_dia on public.ocorrencias (pessoa, dia desc);

create table if not exists public.rituais_presenca (
  pessoa uuid not null references auth.users(id),
  dia date not null,
  ritual text not null check (ritual in ('daily', 'simulacao')),
  presente boolean not null,
  marcado_por text,
  marcado_em timestamptz not null default now(),
  primary key (pessoa, dia, ritual)
);
comment on table public.rituais_presenca is
  'Presença na daily e na simulação (seg, qua e sex), marcada pelo gestor. Dia não marcado fica fora da conta.';

alter table public.combinados_aceite enable row level security;
alter table public.ocorrencias enable row level security;
alter table public.rituais_presenca enable row level security;

/* a pessoa lê o que é dela; só o gestor escreve (conferido no servidor) */
drop policy if exists combinados_aceite_select on public.combinados_aceite;
create policy combinados_aceite_select on public.combinados_aceite for select
  using (pessoa = (select auth.uid()) or (select public.eh_gestor_cockpit()));
drop policy if exists combinados_aceite_insert on public.combinados_aceite;
create policy combinados_aceite_insert on public.combinados_aceite for insert
  with check ((select public.eh_gestor_cockpit()));
drop policy if exists combinados_aceite_update on public.combinados_aceite;
create policy combinados_aceite_update on public.combinados_aceite for update
  using ((select public.eh_gestor_cockpit())) with check ((select public.eh_gestor_cockpit()));

drop policy if exists ocorrencias_select on public.ocorrencias;
create policy ocorrencias_select on public.ocorrencias for select
  using (pessoa = (select auth.uid()) or (select public.eh_gestor_cockpit()));
drop policy if exists ocorrencias_insert on public.ocorrencias;
create policy ocorrencias_insert on public.ocorrencias for insert
  with check ((select public.eh_gestor_cockpit()));
/* DELETE existe para desfazer um registro feito por engano */
drop policy if exists ocorrencias_delete on public.ocorrencias;
create policy ocorrencias_delete on public.ocorrencias for delete
  using ((select public.eh_gestor_cockpit()));

drop policy if exists rituais_presenca_select on public.rituais_presenca;
create policy rituais_presenca_select on public.rituais_presenca for select
  using (pessoa = (select auth.uid()) or (select public.eh_gestor_cockpit()));
drop policy if exists rituais_presenca_insert on public.rituais_presenca;
create policy rituais_presenca_insert on public.rituais_presenca for insert
  with check ((select public.eh_gestor_cockpit()));
drop policy if exists rituais_presenca_update on public.rituais_presenca;
create policy rituais_presenca_update on public.rituais_presenca for update
  using ((select public.eh_gestor_cockpit())) with check ((select public.eh_gestor_cockpit()));
drop policy if exists rituais_presenca_delete on public.rituais_presenca;
create policy rituais_presenca_delete on public.rituais_presenca for delete
  using ((select public.eh_gestor_cockpit()));

revoke all on table public.combinados_aceite, public.ocorrencias, public.rituais_presenca from anon, public;
grant select, insert, update on table public.combinados_aceite to authenticated;
grant select, insert, delete on table public.ocorrencias to authenticated;
grant select, insert, update, delete on table public.rituais_presenca to authenticated;
-- RLS nao protege TRUNCATE: os default privileges do Supabase dao TRUNCATE a authenticated.
revoke truncate, references, trigger on table public.combinados_aceite, public.ocorrencias, public.rituais_presenca from authenticated;
grant all on table public.combinados_aceite, public.ocorrencias, public.rituais_presenca to service_role;

/* O QUADRO DOS COMBINADOS DA SEMANA (seg a sex de p_segunda; sem ela, a semana corrente).
   Só contagens: o semáforo (95 / 80) e o sinal são da tela. O gestor recebe o time ativo; o
   executivo, só a própria linha. */
create or replace function public.combinados_quadro(p_segunda date default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_gestor boolean := coalesce((select public.eh_gestor_cockpit()), false);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_seg date := coalesce(p_segunda, v_hoje - ((extract(isodow from v_hoje)::int) - 1));
  v_sex date := v_seg + 4;
  v_ate date := least(v_seg + 4, v_hoje);
  /* o fecho do dia só existe desde 30/10/26 (0229): antes disso não há o que cobrar */
  v_piso_fecho constant date := date '2026-10-30';
  v_out jsonb := '[]'::jsonb;
  r record;
  v_vis jsonb;
  v_fic jsonb;
  v_vesp jsonb;
  v_rit jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('erro', 'sem sessão');
  end if;
  if v_ate < v_seg then
    return jsonb_build_object('segunda', v_seg, 'sexta', v_sex, 'hoje', v_hoje, 'pessoas', '[]'::jsonb, 'lidoEm', now());
  end if;

  for r in
    select e.profile_id as pessoa, p.id_hubspot as owner_id, coalesce(e.nome, p.full_name) as nome
      from public.equipe_cockpit e
      join public.profiles p on p.id = e.profile_id
     where e.ativo and e.papel = 'rep' and not coalesce(e.so_acesso, false)
       and (v_gestor or e.profile_id = auth.uid())
     order by coalesce(e.nome, p.full_name)
  loop
    /* a porta: o mesmo restaurante duas vezes no dia é uma porta */
    with portas as (
      select v.client_id, v.dia, min(v.visited_at) as em, bool_or(v.provada) as provada, bool_and(coalesce(v.declarada, false)) as declarada,
             max(v.motivo) as motivo
        from public._visitas_com_prova(v_seg, v_ate, r.pessoa) v group by v.client_id, v.dia
    ), fx as (
      select f.client_id, (coalesce(f.ocorrido_em, f.criado_em) at time zone 'America/Sao_Paulo')::date as dia,
             min(coalesce(f.ocorrido_em, f.criado_em)) as em,
             bool_or(f.proximo_em is not null or f.motivo_perdido is not null) as com_passo
        from public.fichas_de_rua f
       where f.owner_id = r.owner_id
         and coalesce(f.ocorrido_em, f.criado_em) >= (v_seg::timestamp at time zone 'America/Sao_Paulo')
         and coalesce(f.ocorrido_em, f.criado_em) < ((v_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
       group by 1, 2
    ), j as (
      select pt.*, fx.em as ficha_em, fx.com_passo from portas pt left join fx on fx.client_id = pt.client_id and fx.dia = pt.dia
    )
    select jsonb_build_object(
      'visitas', count(*),
      'provadas', count(*) filter (where j.provada),
      'comPasso', count(*) filter (where j.com_passo),
      'naHora', count(*) filter (where j.ficha_em is not null and j.ficha_em <= j.em + interval '15 minutes'),
      'divergencias', coalesce(jsonb_agg(jsonb_build_object('dia', j.dia, 'clientId', j.client_id,
            'nome', (select coalesce(nullif(c.empresa, ''), c.nome) from public.clients c where c.id = j.client_id), 'motivo', j.motivo)
            order by j.dia) filter (where j.ficha_em is not null and not j.provada and not j.declarada), '[]'::jsonb))
      into v_vis from j;

    select jsonb_build_object(
      'donoAusente', count(*) filter (where coalesce(f.decisor_papel, '') not in ('Dono', 'Sócio') and f.motivo_perdido is null),
      'voltaMarcada', count(*) filter (where coalesce(f.decisor_papel, '') not in ('Dono', 'Sócio') and f.motivo_perdido is null
            and (nullif(btrim(coalesce(f.horario_dono, '')), '') is not null or (f.proximo_em is not null and f.proximo_tipo in ('visita', 'reuniao')))))
      into v_fic
      from public.fichas_de_rua f
     where f.owner_id = r.owner_id
       and coalesce(f.ocorrido_em, f.criado_em) >= (v_seg::timestamp at time zone 'America/Sao_Paulo')
       and coalesce(f.ocorrido_em, f.criado_em) < ((v_ate + 1)::timestamp at time zone 'America/Sao_Paulo');

    select jsonb_build_object('dias', count(*), 'planejados', count(*) filter (where exists (
             select 1 from public.field_routes fr
              where fr.seller_id = r.pessoa and fr.route_date = d.dia
                and fr.created_at < ((d.dia - 1)::timestamp + interval '20 hours') at time zone 'America/Sao_Paulo'
                and exists (select 1 from public.field_route_stops s where s.route_id = fr.id))),
           'semPlano', coalesce(jsonb_agg(d.dia order by d.dia) filter (where not exists (
             select 1 from public.field_routes fr
              where fr.seller_id = r.pessoa and fr.route_date = d.dia
                and fr.created_at < ((d.dia - 1)::timestamp + interval '20 hours') at time zone 'America/Sao_Paulo'
                and exists (select 1 from public.field_route_stops s where s.route_id = fr.id))), '[]'::jsonb))
      into v_vesp
      from (select g::date as dia from generate_series(v_seg, v_ate, interval '1 day') g where extract(isodow from g) < 6) d;

    select jsonb_build_object(
      'umAUm', (select count(*) from public.um_a_um u where u.owner_id = r.owner_id and u.data between v_seg and v_sex),
      'ultimoUmAUm', (select max(u.data) from public.um_a_um u where u.owner_id = r.owner_id and u.data <= v_sex),
      'fechoDias', (select coalesce(jsonb_agg(jsonb_build_object('dia', d.dia, 'fechou', exists (select 1 from public.fecho_do_dia fd where fd.pessoa = r.pessoa and fd.dia = d.dia)) order by d.dia), '[]'::jsonb)
                      from (select g::date as dia from generate_series(greatest(v_seg, v_piso_fecho), v_ate, interval '1 day') g where extract(isodow from g) < 6) d
                     where d.dia < v_hoje or exists (select 1 from public.fecho_do_dia fd where fd.pessoa = r.pessoa and fd.dia = d.dia)),
      'marcados', (select coalesce(jsonb_agg(jsonb_build_object('dia', rp.dia, 'ritual', rp.ritual, 'presente', rp.presente) order by rp.dia, rp.ritual), '[]'::jsonb)
                     from public.rituais_presenca rp where rp.pessoa = r.pessoa and rp.dia between v_seg and v_sex))
      into v_rit;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'pessoa', r.pessoa, 'ownerId', r.owner_id, 'nome', r.nome,
      'visitas', v_vis, 'fichas', v_fic, 'vespera', v_vesp, 'rituais', v_rit,
      'aceite', (select jsonb_build_object('versao', a.versao, 'aceitoEm', a.aceito_em, 'registradoPor', a.registrado_por)
                   from public.combinados_aceite a where a.pessoa = r.pessoa order by a.aceito_em desc, a.criado_em desc limit 1),
      'ocorrencias', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'combinado', o.combinado, 'degrau', o.degrau, 'dia', o.dia,
                       'oQue', o.o_que_aconteceu, 'evidencia', o.evidencia, 'registroFalso', o.registro_falso, 'prazo', o.prazo, 'por', o.registrado_por)
                       order by o.dia desc, o.criado_em desc)
                     from public.ocorrencias o where o.pessoa = r.pessoa and o.dia >= v_hoje - 180), '[]'::jsonb)
    ));
  end loop;
  return jsonb_build_object('segunda', v_seg, 'sexta', v_sex, 'ate', v_ate, 'hoje', v_hoje, 'gestor', v_gestor, 'pessoas', v_out, 'lidoEm', now());
end;
$function$;

revoke all on function public.combinados_quadro(date) from anon, public;
grant execute on function public.combinados_quadro(date) to authenticated;
