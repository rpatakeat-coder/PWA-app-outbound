-- 0118 · O mapa lê o espelho ao vivo antes do snapshot do robô (27/09/2026)
--
-- mapa_contexto (etapa, dias parado, régua, temperatura de cada negócio) e mapa_negocio
-- (o que o negócio já tem preenchido) liam só o snapshot do robô, que roda de 2 em 2
-- horas. O espelho (0116) relê o negócio na hora em que o app escreve, e a cada abertura
-- do Cockpit para o que mudou direto no HubSpot. Agora ele grava também o CARD pronto,
-- montado pelo mesmo código do robô (lib/lead-do-funil.js, portado), e as duas funções
-- preferem esse card quando ele é mais novo que o snapshot.
--
-- card null com card_em preenchido = o negócio foi para uma etapa que o Cockpit não
-- desenha (Backlog, Reciclagem, Conta-alvo): sai do contexto, como sairia no robô.
-- Linha antiga sem card_em (gravada antes desta migration) é ignorada.
alter table public.espelho_negocios add column if not exists card jsonb;
alter table public.espelho_negocios add column if not exists card_em timestamptz;

-- Os cards em vigor: os do snapshot, trocados pelos do espelho mais novos.
create or replace function public.cards_do_funil()
returns table (id text, etapa text, card jsonb)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with snap as (
    select s.atualizado_em, s.conteudo from public.cockpit_snapshot s where s.chave = 'hubspot'
  ),
  esp as (
    select n.deal_id as id, n.dealstage as etapa, n.card
      from public.espelho_negocios n
     where n.card_em is not null
       and n.card_em > coalesce((select snap.atualizado_em from snap), '-infinity'::timestamptz)
       and coalesce(n.pipeline, '916011864') = '916011864'
  ),
  do_snap as (
    select x->>'id' as id, e.key as etapa, x as card
      from snap,
           jsonb_each(case when jsonb_typeof(snap.conteudo->'funilLeads') = 'object' then snap.conteudo->'funilLeads' else '{}'::jsonb end) e,
           jsonb_array_elements(case when jsonb_typeof(e.value) = 'array' then e.value else '[]'::jsonb end) x
     where x->>'id' is not null
  )
  select d.id, d.etapa, d.card from do_snap d where not exists (select 1 from esp where esp.id = d.id)
  union all
  select esp.id, esp.etapa, esp.card from esp where esp.card is not null
$$;
revoke all on function public.cards_do_funil() from public, anon, authenticated;
grant execute on function public.cards_do_funil() to service_role;

create or replace function public.mapa_contexto()
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'tempo', coalesce((
      select jsonb_agg(jsonb_build_array(
               c.id,
               case when c.card->>'dias' ~ '^\d+$' then (c.card->>'dias')::int end,
               coalesce((c.card->>'slaBreach')::boolean, false),
               c.card->>'ultimaInteracao',
               c.etapa,
               c.card->>'tempFaixa',
               coalesce((c.card->>'tempParcial')::boolean, false),
               nullif(c.card->>'origem_do_lead', '')))
        from public.cards_do_funil() c), '[]'::jsonb),
    'donos', coalesce((
      select jsonb_agg(distinct p.id_hubspot)
        from public.equipe_cockpit e join public.profiles p on p.id = e.profile_id
       where e.ativo and not coalesce(e.so_acesso, false) and p.id_hubspot is not null), '[]'::jsonb),
    'limites', coalesce((select c.conteudo from public.cockpit_config c where c.chave = 'mapa_limites'), '[7, 30]'::jsonb),
    -- continua a hora do snapshot: o espelho é por negócio, não diz que o resto é fresco
    'atualizado_em', (select s.atualizado_em from public.cockpit_snapshot s where s.chave = 'hubspot')
  )
$$;

create or replace function public.mapa_negocio(p_deal text)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  with eu as (
    select p.id_hubspot, e.papel
      from public.profiles p
      left join public.equipe_cockpit e on e.profile_id = p.id and e.ativo
     where p.id = auth.uid()
  ),
  negocio as (
    select c.card as x from public.cards_do_funil() c where c.id = p_deal limit 1
  )
  select coalesce((
    select jsonb_strip_nulls(jsonb_build_object(
             'origem_do_lead', n.x->'origem_do_lead',
             'celular', n.x->'celular',
             'gargalo_operacional', n.x->'gargalo_operacional',
             'nome_do_sistema', n.x->'nome_do_sistema',
             'plano_apresentado', n.x->'plano_apresentado',
             'valor_de_mrr', n.x->'valor_de_mrr',
             'data_da_reuniao', n.x->'data_da_reuniao'))
      from negocio n, eu
     where eu.papel = 'manager' or (eu.id_hubspot is not null and eu.id_hubspot = n.x->>'ownerId')
  ), '{}'::jsonb)
$$;

revoke all on function public.mapa_contexto() from public, anon;
grant execute on function public.mapa_contexto() to authenticated, service_role;
revoke all on function public.mapa_negocio(text) from public, anon;
grant execute on function public.mapa_negocio(text) to authenticated, service_role;
