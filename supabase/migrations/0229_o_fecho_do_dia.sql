-- 0229 · O fecho do dia (espinha do dia, item 2.10)
--
-- Às 18h o app pergunta "N portas, J com próximo passo, K sem. Fecha?". Este é
-- o registro desse fecho — e ele existe por causa do item 2.11: o gestor precisa
-- ver quem NÃO fechou, e para isso o "fechou" tem de morar no servidor, não no
-- aparelho.
--
-- POR QUE TABELA NOVA E NÃO `planos_diarios.fechado_em`. Aquela coluna já existe
-- e é tentadora, mas fala de outra coisa: é a Daily do GESTOR sendo fechada no
-- Cockpit (prioridades, bloqueios, daily_snapshot). Guardar nela o fecho da rua
-- do executivo seria dar dois significados à mesma coluna — e quem ler daqui a
-- seis meses não vai saber qual dos dois está vendo.
--
-- O QUE SE GUARDA, e por quê: além do carimbo, o PLACAR do momento em que ele
-- fechou (portas, com e sem próximo passo). Sem isso, "fechou o dia" vira um
-- booleano sem história, e a conversa do gestor no dia seguinte não tem número.

create table if not exists public.fecho_do_dia (
  pessoa uuid not null references auth.users(id),
  dia date not null,
  fechado_em timestamptz not null default now(),
  portas int not null default 0,
  com_passo int not null default 0,
  sem_passo int not null default 0,
  primary key (pessoa, dia)
);

comment on table public.fecho_do_dia is
  'O executivo fechou o dia na rua (espinha do dia 2.10). Uma linha por pessoa por dia; o placar e do momento do fecho.';

alter table public.fecho_do_dia enable row level security;

/* O executivo mexe no proprio dia; o gestor le o de todos — a mesma guarda das
   outras telas de gestao, conferida no servidor e nao na tela. */
drop policy if exists fecho_do_dia_select on public.fecho_do_dia;
create policy fecho_do_dia_select on public.fecho_do_dia for select
  using (pessoa = (select auth.uid()) or (select public.eh_gestor_cockpit()) or (select public.is_field_admin()));

drop policy if exists fecho_do_dia_insert on public.fecho_do_dia;
create policy fecho_do_dia_insert on public.fecho_do_dia for insert
  with check (pessoa = (select auth.uid()));

/* UPDATE existe para o Desfazer de 5 s e para refechar o mesmo dia depois de
   resolver uma pendencia — nunca para mexer no dia de outra pessoa. */
drop policy if exists fecho_do_dia_update on public.fecho_do_dia;
create policy fecho_do_dia_update on public.fecho_do_dia for update
  using (pessoa = (select auth.uid())) with check (pessoa = (select auth.uid()));

drop policy if exists fecho_do_dia_delete on public.fecho_do_dia;
create policy fecho_do_dia_delete on public.fecho_do_dia for delete
  using (pessoa = (select auth.uid()));

revoke all on table public.fecho_do_dia from anon, public;
grant select, insert, update, delete on table public.fecho_do_dia to authenticated;
grant all on table public.fecho_do_dia to service_role;

-- O TIME NA RUA GANHA AS DUAS COLUNAS DO ITEM 2.11: quem nao planejou hoje e quem
-- nao fechou ontem. Os dois avisos da prancha moram no Cockpit; aqui eles viram
-- coluna na tela que o gestor abre no celular, que e onde ele esta quando a
-- informacao importa. Mesma funcao, mesma guarda de papel.
create or replace function public.time_na_rua(p_dia date default null)
 returns table(
   owner_id text, pessoa uuid, nome text, avatar_url text,
   provadas integer, por_gps integer, por_foto integer, foto_fora integer,
   declaradas integer, sem_desfecho integer, ultima text,
   sem_plano boolean, nao_fechou_ontem boolean)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_dia date := coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date);
  v_ontem date := v_dia - 1;
begin
  if not ((select public.is_field_admin()) or (select public.eh_gestor_cockpit())) then
    raise exception 'time_na_rua e so do gestor' using errcode = '42501';
  end if;

  return query
  with v as (select * from public._visitas_com_prova(v_dia, v_dia, null)),
  pessoas as (
    select p.id, p.id_hubspot, coalesce(nullif(e.nome, ''), p.full_name) as nome, p.avatar_url
      from public.equipe_cockpit e join public.profiles p on p.id = e.profile_id
     where e.ativo and e.papel = 'rep' and p.id_hubspot is not null
       and not coalesce(e.so_acesso, false) and not coalesce(e.ignorar_owner, false)
  )
  select
    pe.id_hubspot, pe.id, pe.nome, pe.avatar_url,
    count(v.visit_id) filter (where v.provada)::int,
    count(v.visit_id) filter (where v.motivo = 'gps')::int,
    count(v.visit_id) filter (where v.provada and v.motivo like 'foto%')::int,
    count(v.visit_id) filter (where v.provada and v.foto_distancia_m is not null and v.foto_distancia_m > v.limite_m)::int,
    count(v.visit_id) filter (where v.declarada)::int,
    count(v.visit_id) filter (where v.provada and not exists (
      select 1 from public.fichas_de_rua f
       where f.client_id = v.client_id
         and (f.criado_em at time zone 'America/Sao_Paulo')::date = v.dia))::int,
    to_char(max(v.visited_at) at time zone 'America/Sao_Paulo', 'HH24:MI'),
    -- SEM PLANO: nenhuma parada montada para o dia (aviso das 09:00 da prancha).
    not exists (select 1 from public.field_routes r where r.seller_id = pe.id and r.route_date = v_dia),
    /* NAO FECHOU ONTEM: so conta se houve rua ontem. Cobrar fecho de quem nao
       visitou ninguem seria cobrar silencio — e o gestor perde a confianca na
       coluna no primeiro dia de folga de alguem. */
    (not exists (select 1 from public.fecho_do_dia fd where fd.pessoa = pe.id and fd.dia = v_ontem)
      and exists (select 1 from public.client_visits cv where cv.visited_by = pe.id
                   and (cv.visited_at at time zone 'America/Sao_Paulo')::date = v_ontem))
  from pessoas pe
  left join v on v.visited_by = pe.id
  group by pe.id_hubspot, pe.id, pe.nome, pe.avatar_url
  order by count(v.visit_id) filter (where v.provada) desc, pe.nome;
end $function$;

revoke all on function public.time_na_rua(date) from anon, public;
grant execute on function public.time_na_rua(date) to authenticated, service_role;
