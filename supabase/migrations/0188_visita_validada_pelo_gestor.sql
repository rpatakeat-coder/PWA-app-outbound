-- 0188 (09/10/26): o gestor valida uma visita sem prova automática.
--
-- Caso que pediu: Marco, Bar e Petiscaria Mesma Turma, 09/10 10:17. O check-in foi no pino
-- duplicado do robô (a 424 m do lugar; o pino original do mesmo restaurante está a 21 m do
-- GPS dele). A regra automática não afrouxa — pino arrastado depois do check-in continua
-- sem prova —, mas o gestor pode validar com motivo escrito, e fica registrado quem e quando.
--
-- visitas_validadas: uma linha por visita validada. Escrita só pelas funções abaixo, que
-- conferem gestor. Leitura: o gestor e o dono da visita.
-- _visitas_com_prova: provada = foto OU validada OU GPS dentro do limite (o resto igual);
-- motivo 'validada pelo gestor'. Tudo que lê visitas_com_prova (Rua, Hoje, Pessoas, Daily,
-- planejamento_do_time) passa a contar a visita validada, com o mesmo número em toda tela.

create table if not exists public.visitas_validadas (
  visit_id uuid primary key references public.client_visits(id) on delete cascade,
  validado_por uuid not null,
  validado_em timestamptz not null default now(),
  motivo text not null check (length(btrim(motivo)) >= 5)
);
alter table public.visitas_validadas enable row level security;
drop policy if exists visitas_validadas_ler on public.visitas_validadas;
create policy visitas_validadas_ler on public.visitas_validadas for select to authenticated
  using ((select public.is_field_admin()) or (select public.eh_gestor_cockpit())
         or exists (select 1 from public.client_visits cv where cv.id = visit_id and cv.visited_by = (select auth.uid())));
revoke insert, update, delete on public.visitas_validadas from anon, authenticated;

create or replace function public.validar_visita(p_visit_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not ((select public.is_field_admin()) or (select public.eh_gestor_cockpit())) then
    raise exception 'só o gestor valida visita' using errcode = '42501';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 5 then
    raise exception 'escreva o motivo (5 letras ou mais)' using errcode = '22023';
  end if;
  if not exists (select 1 from public.client_visits where id = p_visit_id) then
    raise exception 'visita não encontrada' using errcode = 'P0002';
  end if;
  insert into public.visitas_validadas (visit_id, validado_por, motivo)
  values (p_visit_id, auth.uid(), btrim(p_motivo))
  on conflict (visit_id) do update set validado_por = excluded.validado_por, validado_em = now(), motivo = excluded.motivo;
  return jsonb_build_object('ok', true, 'visit_id', p_visit_id);
end;
$$;

create or replace function public.desfazer_validacao_visita(p_visit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not ((select public.is_field_admin()) or (select public.eh_gestor_cockpit())) then
    raise exception 'só o gestor desfaz a validação' using errcode = '42501';
  end if;
  delete from public.visitas_validadas where visit_id = p_visit_id;
  return jsonb_build_object('ok', true, 'visit_id', p_visit_id);
end;
$$;
revoke all on function public.validar_visita(uuid, text) from public, anon;
revoke all on function public.desfazer_validacao_visita(uuid) from public, anon;
grant execute on function public.validar_visita(uuid, text) to authenticated;
grant execute on function public.desfazer_validacao_visita(uuid) to authenticated;

do $mig$
declare d text;
begin
  select pg_get_functiondef('public._visitas_com_prova(date,date,uuid)'::regprocedure) into d;
  if position(E'      p.id_hubspot as dono\n    from v\n' in d) = 0
     or position(E'    (c.f_id is not null\n      or (' in d) = 0
     or position(E'      when c.em_serie then' in d) = 0 then
    raise exception '0188: _visitas_com_prova mudou; revisar à mão';
  end if;
  d := replace(d, E'      p.id_hubspot as dono\n    from v\n',
    E'      p.id_hubspot as dono,\n      vv.visit_id as vv_id\n    from v\n    left join public.visitas_validadas vv on vv.visit_id = v.id\n');
  d := replace(d, E'    (c.f_id is not null\n      or (', E'    (c.f_id is not null or c.vv_id is not null\n      or (');
  d := replace(d, E'      when c.em_serie then', E'      when c.vv_id is not null then ''validada pelo gestor''\n      when c.em_serie then');
  execute d;
end
$mig$;
