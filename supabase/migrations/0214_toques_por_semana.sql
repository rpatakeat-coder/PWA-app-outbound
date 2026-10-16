-- 0214 · OS TOQUES DAS ÚLTIMAS 6 SEMANAS, POR NEGÓCIO (16/10/2026, Planejamento v2)
--
-- O handoff do Planejamento v2 (plal.zip) mostra em cada conta 6 quadradinhos: verde = teve toque
-- registrado naquela semana. É a cadência visível — um buraco no meio quer dizer que a conta esfriou.
-- O Cockpit não tinha essa série (o snapshot traz só o último toque). Esta função a monta, SÓ DE
-- LEITURA, das quatro fontes que o time de fato usa (medido: ninguém liga nem manda e-mail pelo CRM):
--   · visita com check-in (client_visits, pelo pino do negócio);
--   · ficha de rua (fichas_de_rua.deal_id);
--   · ligação/WhatsApp registrado no app (contatos_de_campo.deal_id);
--   · registro da aba Tarefas (fila_feitas.deal_id, não desfeito).
-- A semana é a de Brasília (segunda a domingo); a posição 6 é a semana atual.
-- Devolve só os negócios do próprio executivo (dono do pino = id_hubspot dele); o gestor vê todos.
create or replace function public.toques_por_semana(p_deals text[])
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
  v_eu text;
  v_admin boolean;
  v_seg0 date := date_trunc('week', now() at time zone 'America/Sao_Paulo')::date - 35;
  v_out jsonb;
begin
  if v_uid is null or p_deals is null or cardinality(p_deals) = 0 then return '{}'::jsonb; end if;
  select nullif(p.id_hubspot, '') into v_eu from profiles p where p.id = v_uid;
  v_admin := coalesce(public.is_field_admin(), false);
  if not v_admin and not exists (select 1 from equipe_cockpit e where e.profile_id = v_uid and e.ativo) then return '{}'::jsonb; end if;

  with meus as (
    select distinct c.id_hubspot deal, c.id client_id
      from clients c
     where c.id_hubspot = any (p_deals)
       and (v_admin or c.vendedor_id_hubspot = v_eu)
  ),
  t as (
    select m.deal, (v.visited_at at time zone 'America/Sao_Paulo')::date dia
      from meus m join client_visits v on v.client_id = m.client_id
     where v.visited_at >= (v_seg0::timestamp at time zone 'America/Sao_Paulo')
    union all
    select f.deal_id, (f.ocorrido_em at time zone 'America/Sao_Paulo')::date from fichas_de_rua f
     where f.deal_id in (select deal from meus) and f.ocorrido_em >= (v_seg0::timestamp at time zone 'America/Sao_Paulo')
    union all
    select k.deal_id, (k.ocorrido_em at time zone 'America/Sao_Paulo')::date from contatos_de_campo k
     where k.deal_id in (select deal from meus) and k.ocorrido_em >= (v_seg0::timestamp at time zone 'America/Sao_Paulo')
    union all
    select q.deal_id, (q.criada_em at time zone 'America/Sao_Paulo')::date from fila_feitas q
     where q.deal_id in (select deal from meus) and q.desfeita_em is null and q.criada_em >= (v_seg0::timestamp at time zone 'America/Sao_Paulo')
  ),
  s as (
    select deal, ((dia - v_seg0) / 7)::int sem from t where dia >= v_seg0
  )
  select coalesce(jsonb_object_agg(m.deal, (
           select jsonb_agg(exists (select 1 from s where s.deal = m.deal and s.sem = w) order by w)
             from generate_series(0, 5) w)), '{}'::jsonb)
    into v_out
    from (select distinct deal from meus) m;
  return v_out;
end $$;
revoke all on function public.toques_por_semana(text[]) from public, anon;
grant execute on function public.toques_por_semana(text[]) to authenticated;
