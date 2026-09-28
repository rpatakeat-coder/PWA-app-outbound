-- MEU PLACAR (28/09/2026, Julyan: "tem que ter quantas visitas com checkin… 6 visitas,
-- a semana pelo menos 30 visitas, quantas demos, quantos clientes ganhos").
--
-- Os números do Meu dia do executivo, de quem chama (auth.uid()), numa ida só:
--   visitas  = check-ins (client_visits) de hoje e da semana (segunda a hoje, Brasília);
--   demos    = leads com reunião marcada na semana: agendada no app (client_meetings
--              tipo 'reuniao') ou combinada na ficha de rua (proximo = 'reuniao'),
--              um por lead;
--   ganhos   = o MESMO número do Cockpit: o robô do HubSpot grava, por dono, em
--              cockpit_snapshot('hubspot').reps[<owner>] — ganhosSemana (com os nomes),
--              fechadosNoMes e metaMensal. O espelho_negocios não serve: o negócio ganho
--              sai do funil do Field Sales depois do Onboarding (2 linhas em setembro).
-- A função é security definer (o snapshot e o espelho não têm política para o app) e só
-- devolve os números do próprio dono.
create or replace function public.meu_placar()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with eu as (
    select p.id, p.id_hubspot from profiles p where p.id = (select auth.uid())
  ), t as (
    select
      ((now() at time zone 'America/Sao_Paulo')::date) as hoje,
      ((now() at time zone 'America/Sao_Paulo')::date
        - (extract(isodow from (now() at time zone 'America/Sao_Paulo'))::int - 1)) as segunda,
      date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date as mes
  ), lim as (
    select hoje, segunda, mes,
      (hoje::timestamp at time zone 'America/Sao_Paulo') as hoje0,
      (segunda::timestamp at time zone 'America/Sao_Paulo') as segunda0,
      (mes::timestamp at time zone 'America/Sao_Paulo') as mes0
    from t
  ), rep as (
    select s.conteudo->'reps'->eu.id_hubspot as r, s.atualizado_em
    from cockpit_snapshot s, eu
    where s.chave = 'hubspot' and eu.id_hubspot is not null
  ), demos as (
    select m.client_id from client_meetings m, eu, lim
     where m.created_by = eu.id and m.type = 'reuniao' and m.created_at >= lim.segunda0
       and coalesce(m.status, '') <> 'cancelada'
    union
    select f.client_id from fichas_de_rua f, eu, lim
     where f.criado_por = eu.id and f.proximo = 'reuniao' and f.ocorrido_em >= lim.segunda0
  )
  select jsonb_build_object(
    'visitas_hoje',  (select count(*) from client_visits v, eu, lim where v.visited_by = eu.id and v.visited_at >= lim.hoje0),
    'visitas_semana',(select count(*) from client_visits v, eu, lim where v.visited_by = eu.id and v.visited_at >= lim.segunda0),
    'demos_semana',  (select count(*) from demos),
    'ganhos_semana', (select (r->>'ganhosSemana')::int from rep),
    'ganhos_semana_nomes', (select r->'ganhosSemanaNomes' from rep),
    'ganhos_mes',    (select (r->>'fechadosNoMes')::int from rep),
    'meta_mes',      (select nullif(r->>'metaMensal', '')::int from rep),
    'ganhos_lidos_em', (select atualizado_em from rep),
    'semana_desde',  (select segunda from lim),
    'tem_dono_hubspot', (select id_hubspot is not null from eu)
  );
$$;

revoke all on function public.meu_placar() from public, anon;
grant execute on function public.meu_placar() to authenticated;
