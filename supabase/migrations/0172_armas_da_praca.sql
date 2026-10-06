-- 0172 · NA SUA PRAÇA (cartão do lead, "Suas armas pra Demo", 06/10/26)
--
-- O bloco de armas do executivo mostra a dor nº 1 da praça dele e como o time se sai contra
-- o sistema do restaurante. Isso pede os negócios dos COLEGAS de praça, que o executivo não
-- lê (RLS). Esta função devolve só o agregado, sem nome de cliente nem de negócio:
--   praca    = a praça do cadastro (narrativas.reps, o mesmo que o Cockpit usa);
--   dores    = gargalo_operacional por negócio único da praça, contado;
--   fechados = sistema cru + ganho/perda + motivo, dos negócios fechados da praça
--              (a normalização do sistema é feita no app, com a MESMA regra do Cockpit).
-- Fonte: o snapshot do robô (cockpit_snapshot 'hubspot'), o mesmo funil que o gestor vê.
-- p_owner: o gestor pode pedir de qualquer um; o executivo só recebe a própria praça.

create or replace function public.armas_da_praca(p_owner text default null)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with quem as (
    select case when p_owner is not null and (select public.eh_gestor_cockpit()) then p_owner
                else (select public.meu_owner_hubspot()) end as owner
  ),
  reps as (
    select e.key as owner_id, nullif(btrim(e.value->>'praca'), '') as praca
      from public.cockpit_snapshot s, jsonb_each(s.conteudo->'reps') e
     where s.chave = 'narrativas'
  ),
  minha as (select r.praca from reps r, quem q where r.owner_id = q.owner),
  colegas as (select r.owner_id from reps r, minha m where m.praca is not null and r.praca = m.praca),
  negocios as (
    select distinct on (l->>'id') e.key as etapa, l
      from public.cockpit_snapshot s, jsonb_each(s.conteudo->'funilLeads') e, jsonb_array_elements(e.value) l
     where s.chave = 'hubspot' and jsonb_typeof(e.value) = 'array'
       and (l->>'ownerId') in (select owner_id from colegas)
  )
  select jsonb_build_object(
    'praca', (select praca from minha),
    'dores', coalesce((
      select jsonb_agg(jsonb_build_object('dor', d.dor, 'n', d.n) order by d.n desc, d.dor)
        from (select btrim(l->>'gargalo_operacional') as dor, count(*) as n
                from negocios
               where nullif(btrim(l->>'gargalo_operacional'), '') is not null
               group by 1) d), '[]'::jsonb),
    'fechados', coalesce((
      select jsonb_agg(jsonb_build_object('s', l->>'nome_do_sistema', 'g', etapa <> '1396006164', 'm', nullif(btrim(l->>'motivo_do_perdido'), '')))
        from negocios
       where etapa in ('1396006162', '1396006163', '1396006164')), '[]'::jsonb)
  );
$$;

revoke all on function public.armas_da_praca(text) from public, anon;
grant execute on function public.armas_da_praca(text) to authenticated;
