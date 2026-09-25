-- 0105 — Etapa real do HubSpot nos leads que o mapa mostrava com "?"
--
-- Prompt final, correção C3: "? só quando a etapa não casar; acima de 2% é bug
-- de mapeamento". Medido em 25/09/2026: 439 de 1.464 pinos de lead (30%)
-- caíam em "?". Causa: clients.etapa desatualizado.
--   - 221 com o texto antigo "CASA DOS DADOS": conferidos no HubSpot, estão no
--     BACKLOG do pipeline Field Sales (128 de 128 amostrados). O snapshot do
--     Cockpit não traz o Backlog, então nem ele sabia.
--   - 54 conferidos um a um no HubSpot (etapa real abaixo).
-- Ficam como estão: 2 negócios de outro pipeline (87367429) e 5 que o HubSpot
-- não achou mais. Os 127 que o snapshot conhece passam a vir dele no pino
-- (mapa_contexto, mesma migration).
--
-- Reversível: o valor anterior fica em etapa_corrigida_backup.

create table if not exists public.etapa_corrigida_backup (
  client_id uuid not null,
  id_hubspot text,
  etapa_antes text,
  etapa_depois text,
  corrigido_em timestamptz not null default now(),
  motivo text
);
alter table public.etapa_corrigida_backup enable row level security;

create temporary table etapa_real (id_hubspot text primary key, etapa text) on commit drop;
insert into etapa_real values
  ('63067341830','Prospecção'),('63697949204','Prospecção'),('63569005924','Reciclagem'),('63859711285','Perdido'),
  ('63505422480','Reciclagem'),('61169743954','Backlog'),('63719298687','Perdido'),('63919455817','Reciclagem'),
  ('64099540082','Perdido'),('63536061550','Reciclagem'),('64192537969','Reciclagem'),('63260787215','Visita'),
  ('63037190421','Prospecção'),('61019389720','Backlog'),('64636114025','Reciclagem'),('63183303040','Perdido'),
  ('63719846787','Prospecção'),('63429972788','Perdido'),('63549488558','Reciclagem'),('63181851016','Perdido'),
  ('60989279835','Backlog'),('63545219694','Perdido'),('63182895221','Perdido'),('60012449797','Conversa com decisor'),
  ('63565035063','Perdido'),('63181997212','Reciclagem'),('60989737906','Backlog'),('63716609462','Backlog'),
  ('64926992815','Prospecção'),('64625926688','Reciclagem'),('63722661977','Prospecção'),('63934096226','Reciclagem'),
  ('60998792717','Backlog'),('64106223422','Reciclagem'),('63198742821','Perdido'),('63202858852','Perdido'),
  ('63716812368','Prospecção'),('64106839700','Reciclagem'),('63719279944','Perdido'),('63181904307','Perdido'),
  ('63722874766','Prospecção'),('64929527697','Reciclagem'),('63428166162','Perdido'),('63713215383','Backlog'),
  ('64929527700','Reciclagem'),('63927253627','Reciclagem'),('63497012121','Reciclagem'),('63195452784','Perdido'),
  ('63715593072','Prospecção'),('63875585161','Perdido'),('63183098677','Perdido'),('63527440565','Perdido'),
  ('64528928896','Prospecção'),('64536698781','Prospecção');

-- "CASA DOS DADOS" → Backlog (todos, conferido por amostra de 128)
insert into etapa_real
select c.id_hubspot, 'Backlog' from public.clients c
 where c.etapa = 'CASA DOS DADOS' and c.id_hubspot is not null
on conflict (id_hubspot) do nothing;

insert into public.etapa_corrigida_backup (client_id, id_hubspot, etapa_antes, etapa_depois, motivo)
select c.id, c.id_hubspot, c.etapa, r.etapa, '0105: etapa real do HubSpot (C3 do prompt final)'
  from public.clients c join etapa_real r on r.id_hubspot = c.id_hubspot
 where c.etapa is distinct from r.etapa;

-- Sem mexer em updated_at/updated_by: a etapa só foi posta em dia com a fonte.
alter table public.clients disable trigger update_clients_updated_at;
alter table public.clients disable trigger clients_set_updated_by;
update public.clients c set etapa = r.etapa
  from etapa_real r
 where r.id_hubspot = c.id_hubspot and c.etapa is distinct from r.etapa;
alter table public.clients enable trigger update_clients_updated_at;
alter table public.clients enable trigger clients_set_updated_by;

-- mapa_contexto: o pino também sabe a etapa pelo snapshot (5º campo do tempo),
-- para o lead com clients.etapa vazio que o Cockpit conhece.
create or replace function public.mapa_contexto()
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'tempo', coalesce((
      select jsonb_agg(jsonb_build_array(
               x->>'id',
               case when x->>'dias' ~ '^\d+$' then (x->>'dias')::int end,
               coalesce((x->>'slaBreach')::boolean, false),
               x->>'ultimaInteracao',
               e.key))
        from public.cockpit_snapshot s,
             jsonb_each(case when jsonb_typeof(s.conteudo->'funilLeads') = 'object' then s.conteudo->'funilLeads' else '{}'::jsonb end) e,
             jsonb_array_elements(case when jsonb_typeof(e.value) = 'array' then e.value else '[]'::jsonb end) x
       where s.chave = 'hubspot' and x->>'id' is not null), '[]'::jsonb),
    'donos', coalesce((
      select jsonb_agg(distinct p.id_hubspot)
        from public.equipe_cockpit e join public.profiles p on p.id = e.profile_id
       where e.ativo and not coalesce(e.so_acesso, false) and p.id_hubspot is not null), '[]'::jsonb),
    'limites', coalesce((select c.conteudo from public.cockpit_config c where c.chave = 'mapa_limites'), '[7, 30]'::jsonb),
    'atualizado_em', (select s.atualizado_em from public.cockpit_snapshot s where s.chave = 'hubspot')
  )
$$;
