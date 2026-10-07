-- 0176 · Cockpit do gestor: Pessoas e Raio X v4 (07/10/2026)
--
-- 1. reuniao_desfecho: o gestor (e o próprio executivo) fecha uma reunião que já passou:
--    Aconteceu (realizada), Não aconteceu (nao_aconteceu) ou Remarcar (nova data, continua
--    agendada). Antes só o dono podia mexer em client_meetings (RLS created_by), e a tabela
--    tinha 557 'agendada' e nenhuma 'realizada'. A RPC abre SÓ o desfecho; a policy de UPDATE
--    continua do dono.
-- 2. fila_feitas: o gestor lê os "Feito" do time (Pessoas › Disciplina). Sem isto a leitura
--    devolvia vazio com sucesso e a tela diria "0 Feito" para todos.
-- 3. gestor_v4_leituras: prospecção por pessoa (atribuídas → visitadas com prova → avançaram
--    depois da visita) e a fonte do lead (porta → avanço, por origem), numa ida ao banco.

create or replace function public.reuniao_desfecho(p_id uuid, p_status text, p_quando timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_dono uuid; v_status text;
begin
  select created_by, status into v_dono, v_status from public.client_meetings where id = p_id;
  if not found then raise exception 'Reunião não encontrada.'; end if;
  if not ((select auth.uid()) = v_dono or (select public.is_field_admin()) or (select public.eh_gestor_cockpit())) then
    raise exception 'Sem permissão para fechar esta reunião.';
  end if;
  if v_status <> 'agendada' then
    return jsonb_build_object('ok', true, 'status', v_status, 'jaFechada', true);
  end if;
  if p_status in ('realizada', 'nao_aconteceu') then
    update public.client_meetings set status = p_status where id = p_id;
  elsif p_status = 'remarcar' then
    if p_quando is null then raise exception 'Remarcar precisa da nova data.'; end if;
    update public.client_meetings set scheduled_at = p_quando where id = p_id;
  else
    raise exception 'Desfecho inválido: %', p_status;
  end if;
  return jsonb_build_object('ok', true, 'status', case when p_status = 'remarcar' then 'agendada' else p_status end);
end; $$;
revoke all on function public.reuniao_desfecho(uuid, text, timestamptz) from public, anon;
grant execute on function public.reuniao_desfecho(uuid, text, timestamptz) to authenticated;

drop policy if exists fila_feitas_gestor_le on public.fila_feitas;
create policy fila_feitas_gestor_le on public.fila_feitas for select to authenticated
  using ((select public.is_field_admin()) or (select public.eh_gestor_cockpit()));

create or replace function public.gestor_v4_leituras(p_donos text[])
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v jsonb;
begin
  if not ((select public.is_field_admin()) or (select public.eh_gestor_cockpit())) then
    raise exception 'Só o gestor lê isto.';
  end if;
  with
  donos as (select p.id uid, p.id_hubspot::text dono from public.profiles p where p.id_hubspot::text = any(p_donos)),
  /* PROSPECÇÃO: a conta-alvo atribuída (sem as sem fit), se ganhou visita com prova e se
     avançou para Decisor ou adiante DEPOIS da primeira visita */
  lp as (
    select l.responsavel_owner_id::text dono, l.id, c.id cid
    from public.leads_prospeccao l left join public.clients c on c.lead_prospeccao_id = l.id
    where l.responsavel_owner_id::text = any(p_donos) and coalesce(l.status, '') <> 'sem_fit'
  ),
  lpv as (
    select lp.dono, lp.id, (select min(v.visited_at) from public.client_visits v where v.client_id = lp.cid and not coalesce(v.declarada, false)) prim
    from lp
  ),
  prosp as (
    select dono, count(distinct id) atribuidas, count(distinct id) filter (where prim is not null) visitadas,
      count(distinct id) filter (where prim is not null and exists (
        select 1 from public.client_stage_changes s join lp x on x.cid = s.client_id
        where x.id = lpv.id and s.created_at > lpv.prim
          and (s.to_stage ilike '%decisor%' or s.to_stage ilike '%demo%' or s.to_stage ilike '%negocia%' or s.to_stage ilike '%pagamento%' or s.to_stage ilike '%ganho%'))) avancaram
    from lpv group by dono
  ),
  /* FONTE DO LEAD: portas dos últimos 30 dias por origem (conta-alvo, criado na rua no dia
     da visita, carteira) e quantas avançaram depois da visita */
  pv as (
    select d.dono, v.client_id, min(v.visited_at) prim
    from public.client_visits v join donos d on d.uid = v.visited_by
    where v.visited_at >= now() - interval '30 days' and not coalesce(v.declarada, false)
    group by 1, 2
  ),
  po as (
    select pv.dono, pv.client_id, pv.prim,
      case when c.lead_prospeccao_id is not null then 'alvo' when c.created_at >= pv.prim - interval '1 day' then 'rua' else 'carteira' end origem,
      exists (select 1 from public.client_stage_changes s where s.client_id = pv.client_id and s.created_at > pv.prim
        and (s.to_stage ilike '%decisor%' or s.to_stage ilike '%demo%' or s.to_stage ilike '%negocia%' or s.to_stage ilike '%pagamento%' or s.to_stage ilike '%ganho%')) avancou
    from pv join public.clients c on c.id = pv.client_id
  ),
  fonte as (
    select dono, origem, count(*) portas, count(*) filter (where avancou) avancaram from po group by 1, 2
  )
  select jsonb_build_object(
    'prospeccao', coalesce((select jsonb_object_agg(dono, jsonb_build_object('atribuidas', atribuidas, 'visitadas', visitadas, 'avancaram', avancaram)) from prosp), '{}'::jsonb),
    'fonte', coalesce((select jsonb_agg(jsonb_build_object('dono', dono, 'origem', origem, 'portas', portas, 'avancaram', avancaram)) from fonte), '[]'::jsonb)
  ) into v;
  return v;
end; $$;
revoke all on function public.gestor_v4_leituras(text[]) from public, anon;
grant execute on function public.gestor_v4_leituras(text[]) to authenticated;
