-- 0191 (09/10/26): o bônus do melhor executivo da semana (R$ 250), regra aprovada pelo Julyan.
-- Prancha do design v6 (P5–P7, P12) e PROMPT-BONUS-SEMANAL.md.
--
-- UMA conta só: pontos_da_semana(segunda). O app (ranking da semana) e o cockpit (Pessoas ›
-- Melhor da semana) leem a mesma função, pelo placar_da_semana.
--   venda feita  100  negócio em Ganho ou Enviado Onboarding (nunca Ag. Pagamento) com closedate
--                     na semana; lido do snapshot do HubSpot (vendasLivro), que é o estado ATUAL:
--                     negócio que saiu de Fechado antes do fechamento sai da conta.
--   reunião       25  client_meetings 'realizada' (desfecho no app), pela data da reunião,
--                     uma por restaurante na semana.
--   visita         3  visita COM PROVA (a régua do x de y), um restaurante por dia, até 6 por dia;
--                     em lead criado na hora, só com foto da fachada.
-- Semana: segunda 00:00 a sexta 23:59 (Brasília). Desempate: vendas, reuniões, visitas.
-- O ganhador fica gravado em bonus_semanal na segunda às 08:00 e não se recalcula.
-- O mês e a Temporada (pontos_eventos 20/50/200) não mudam.

create or replace function public.pontos_da_semana(p_segunda date)
returns table(owner_id text, pessoa uuid, nome text, avatar_url text, vendas integer, reunioes integer,
              visitas integer, visitas_fora_do_teto integer, visitas_lead_novo_sem_foto integer, pontos integer, pos integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  with sem as (select p_segunda as seg, p_segunda + 4 as sex),
  snap as (select s.conteudo from public.cockpit_snapshot s where s.chave = 'hubspot'),
  time_ as (
    select p.id as pessoa, p.id_hubspot as owner_id, coalesce(nullif(e.nome, ''), p.full_name) as nome, p.avatar_url
      from public.equipe_cockpit e join public.profiles p on p.id = e.profile_id
     where e.ativo and e.papel = 'rep' and p.id_hubspot is not null
       and not coalesce(e.so_acesso, false) and not coalesce(e.ignorar_owner, false)
  ),
  vendas as (
    select x->>'ownerId' as owner_id, count(distinct x->>'id')::int as n
      from snap, sem,
           jsonb_array_elements(case when jsonb_typeof(snap.conteudo->'vendasLivro') = 'array' then snap.conteudo->'vendasLivro'
                                     when jsonb_typeof(snap.conteudo->'vendasMes') = 'array' then snap.conteudo->'vendasMes'
                                     else '[]'::jsonb end) x
     where x->>'closedate' is not null
       and ((x->>'closedate')::timestamptz at time zone 'America/Sao_Paulo')::date between sem.seg and sem.sex
     group by 1
  ),
  reunioes as (
    select m.created_by as pessoa, count(distinct m.client_id)::int as n
      from public.client_meetings m, sem
     where m.status = 'realizada'
       and (m.scheduled_at at time zone 'America/Sao_Paulo')::date between sem.seg and sem.sex
     group by 1
  ),
  vis as (
    select v.visited_by as pessoa, v.dia, v.client_id,
           bool_or(v.foto_id is not null) as tem_foto,
           bool_or(public.lead_criado_na_hora(v.client_id, v.visited_by, v.visited_at)) as lead_novo
      from sem, public._visitas_com_prova(sem.seg, sem.sex, null) v
     where v.provada
     group by 1, 2, 3
  ),
  vis_ok as (
    select pessoa, dia, count(*) filter (where not lead_novo or tem_foto)::int as validas,
           count(*) filter (where lead_novo and not tem_foto)::int as lead_sem_foto
      from vis group by 1, 2
  ),
  vis_p as (
    select pessoa, sum(least(validas, 6))::int as n, sum(greatest(validas - 6, 0))::int as fora,
           sum(lead_sem_foto)::int as lead_sem_foto
      from vis_ok group by 1
  ),
  linhas as (
    select t.owner_id, t.pessoa, t.nome, t.avatar_url,
           coalesce(vd.n, 0) as vendas, coalesce(r.n, 0) as reunioes, coalesce(vp.n, 0) as visitas,
           coalesce(vp.fora, 0) as fora, coalesce(vp.lead_sem_foto, 0) as lead_sem_foto
      from time_ t
      left join vendas vd on vd.owner_id = t.owner_id
      left join reunioes r on r.pessoa = t.pessoa
      left join vis_p vp on vp.pessoa = t.pessoa
  )
  select l.owner_id, l.pessoa, l.nome, l.avatar_url, l.vendas, l.reunioes, l.visitas, l.fora, l.lead_sem_foto,
         (l.vendas * 100 + l.reunioes * 25 + l.visitas * 3)::int as pontos,
         row_number() over (order by (l.vendas * 100 + l.reunioes * 25 + l.visitas * 3) desc, l.vendas desc, l.reunioes desc, l.visitas desc, l.nome)::int as pos
    from linhas l;
$$;
revoke all on function public.pontos_da_semana(date) from public, anon, authenticated;

create table if not exists public.bonus_semanal (
  semana date primary key,
  owner_id text,
  pessoa uuid,
  nome text,
  pontos integer not null,
  detalhe jsonb not null,
  gravado_em timestamptz not null default now()
);
alter table public.bonus_semanal enable row level security;
drop policy if exists bonus_semanal_ler on public.bonus_semanal;
create policy bonus_semanal_ler on public.bonus_semanal for select to authenticated using (true);
revoke insert, update, delete on public.bonus_semanal from anon, authenticated;

-- o ganhador da semana passada, gravado uma vez (segunda 08:00); sem ninguém pontuando, não grava
create or replace function public.gravar_bonus_semanal(p_segunda date default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_seg date; v_lin jsonb; g record;
begin
  v_seg := coalesce(p_segunda, ((now() at time zone 'America/Sao_Paulo')::date
             - (extract(isodow from (now() at time zone 'America/Sao_Paulo'))::int - 1)) - 7);
  if exists (select 1 from public.bonus_semanal where semana = v_seg) then
    return jsonb_build_object('ok', true, 'jaGravado', true, 'semana', v_seg);
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.pos), '[]'::jsonb) into v_lin from public.pontos_da_semana(v_seg) x;
  select * into g from public.pontos_da_semana(v_seg) x where x.pos = 1;
  if g is null or coalesce(g.pontos, 0) <= 0 then
    return jsonb_build_object('ok', true, 'semGanhador', true, 'semana', v_seg);
  end if;
  insert into public.bonus_semanal (semana, owner_id, pessoa, nome, pontos, detalhe)
  values (v_seg, g.owner_id, g.pessoa, g.nome, g.pontos, jsonb_build_object('linhas', v_lin));
  return jsonb_build_object('ok', true, 'semana', v_seg, 'nome', g.nome, 'pontos', g.pontos);
end;
$$;
revoke all on function public.gravar_bonus_semanal(date) from public, anon, authenticated;

-- o que o app e o cockpit leem: a semana corrente (ou a pedida), e o ganhador da semana anterior
create or replace function public.placar_da_semana(p_segunda date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_seg date; v_pode boolean; v_eu uuid := (select auth.uid());
begin
  v_pode := (select public.is_field_admin()) or (select public.eh_gestor_cockpit())
            or exists (select 1 from public.equipe_cockpit e where e.profile_id = v_eu and e.ativo);
  if not v_pode then return jsonb_build_object('erro', 'sem acesso ao placar'); end if;
  v_seg := coalesce(p_segunda, ((now() at time zone 'America/Sao_Paulo')::date
             - (extract(isodow from (now() at time zone 'America/Sao_Paulo'))::int - 1)));
  return jsonb_build_object(
    'segunda', v_seg, 'sexta', v_seg + 4, 'premio', 250,
    'regra', jsonb_build_object('venda', 100, 'reuniao', 25, 'visita', 3, 'tetoVisitasDia', 6),
    'lidoEm', now(),
    'linhas', coalesce((select jsonb_agg(jsonb_build_object('pos', x.pos, 'ownerId', x.owner_id, 'nome', x.nome,
        'avatar', x.avatar_url, 'vendas', x.vendas, 'reunioes', x.reunioes, 'visitas', x.visitas,
        'visitasForaDoTeto', x.visitas_fora_do_teto, 'leadNovoSemFoto', x.visitas_lead_novo_sem_foto,
        'pontos', x.pontos, 'euMesmo', x.pessoa = v_eu) order by x.pos)
      from public.pontos_da_semana(v_seg) x), '[]'::jsonb),
    'anterior', (select jsonb_build_object('semana', b.semana, 'nome', b.nome, 'ownerId', b.owner_id, 'pontos', b.pontos, 'gravadoEm', b.gravado_em)
                   from public.bonus_semanal b where b.semana = v_seg - 7)
  );
end;
$$;
revoke all on function public.placar_da_semana(date) from public, anon;
grant execute on function public.placar_da_semana(date) to authenticated;

-- segunda 08:00 em Brasília = 11:00 UTC
do $mig$
begin
  if exists (select 1 from cron.job where jobname = 'bonus-semanal-segunda-8h') then
    perform cron.unschedule('bonus-semanal-segunda-8h');
  end if;
  perform cron.schedule('bonus-semanal-segunda-8h', '0 11 * * 1', 'select public.gravar_bonus_semanal()');
end
$mig$;
