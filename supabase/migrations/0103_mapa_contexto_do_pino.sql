-- 0103 — Mapa novo, entrega 2: o que o pino precisa saber além do lead
--
-- O pino "gota escura + anel" mostra tempo parado ("hoje", "5d", "12d
-- parado"), "cobrar" quando o SLA da etapa estourou, e anel tracejado amarelo
-- quando o dono não é do time. A prancha manda tirar o tempo do
-- cockpit_snapshot (a mesma conta do Cockpit), não dos campos hs_* do clients.
--
-- O snapshot inteiro tem 1,7 MB — pesado demais para o celular abrir o mapa.
-- Esta função devolve só o necessário (~27 KB, medido em 25/09/2026: 526
-- negócios abertos):
--   tempo:   [[id do negócio, dias na etapa, sla estourado, última interação]]
--   donos:   hubspot owner id de quem está ativo no time (e não é só acesso)
--   limites: [7, 30] dias — ou o que estiver em cockpit_config 'mapa_limites'
--
-- security definer porque o snapshot e o cadastro do time não têm política
-- de leitura para o vendedor; sai só o que está aqui, nada de valor ou nome.

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
               x->>'ultimaInteracao'))
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

revoke all on function public.mapa_contexto() from public, anon;
grant execute on function public.mapa_contexto() to authenticated, service_role;
