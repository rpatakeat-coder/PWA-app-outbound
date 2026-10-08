-- 0183 + 0184 · O plano volta a ser rápido (08/10/2026) — aplicadas
--
-- A 0179 fez itens_do_plano procurar o restaurante pelo nome. Na auditoria do cockpit do gestor
-- (08/10, 12h) o Time mostrou "0 de 7 planos" e todos "sem rota": o planejamento_do_time estourou o
-- statement timeout ("canceling statement due to statement timeout"). Medido: itens_do_plano levava
-- 4,3 s por chamada e o gestor chama o planejamento duas vezes por carga.
-- Duas causas:
--   1. a busca pelo nome rodava para TODO item da grade, calculando a chave linha a linha;
--   2. o "id_hubspot = X OR lead_prospeccao_id::text = Y" nunca usou índice (varria ~9,8 mil
--      clientes por item) — vinha de antes da 0179.
-- Depois: 0,17 s por itens_do_plano e 0,19 s o planejamento_do_time, com os mesmos 246 itens e 17
-- sem lugar na semana de 05/10.

create index if not exists clients_plano_nome_chave_idx
  on public.clients (public.plano_nome_chave(coalesce(nullif(btrim(empresa), ''), nome)))
  where not coalesce(is_archived, false) and latitude is not null;

create or replace function public.plano_cliente_por_nome(p_owner text, p_nome text)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select c.id from public.clients c
   where public.plano_nome_chave(p_nome) is not null
     and public.plano_nome_chave(coalesce(nullif(btrim(c.empresa), ''), c.nome)) = public.plano_nome_chave(p_nome)
     and not coalesce(c.is_archived, false) and c.latitude is not null
     and (c.vendedor_id_hubspot = p_owner
          or c.created_by in (select p.id from public.profiles p where p.id_hubspot = p_owner))
   order by c.updated_at desc nulls last, c.id
   limit 1
$$;

-- 0184: as duas buscas pelo id vão pelos índices únicos; a busca pelo nome roda só para quem
-- não achou cliente, uma vez por (dono, nome).
create or replace function public.itens_do_plano(p_segunda date, p_donos text[])
returns table(owner_id text, dia date, vaga integer, item_id text, proposito text, hora text, client_id uuid, nome text, lat numeric, lng numeric, acao text)
language sql stable security definer set search_path to 'public' as $function$
  with base as (
    select ps.owner_id, p_segunda + (d.i - 1)::int as dia, s.j::int as vaga, it.id, it.p, it.hora, it.a,
      coalesce(c1.id, c2.id) as cl_id, coalesce(c1.nome, c2.nome) as cl_nome, coalesce(c1.empresa, c2.empresa) as cl_empresa,
      coalesce(c1.latitude, c2.latitude) as cl_lat, coalesce(c1.longitude, c2.longitude) as cl_lng,
      lp.nome as lp_nome, lp.lat as lp_lat, lp.lng as lp_lng, en.props->>'dealname' as dealname
    from public.planos_semanais ps
    cross join lateral jsonb_array_elements(case when jsonb_typeof(ps.grade) = 'array' then ps.grade else '[]'::jsonb end) with ordinality d(v, i)
    cross join lateral jsonb_array_elements(case when jsonb_typeof(d.v) = 'array' then d.v else '[]'::jsonb end) with ordinality s(x, j)
    cross join lateral (
      select case when jsonb_typeof(s.x) = 'string' then s.x #>> '{}' else s.x->>'id' end as id,
             case when jsonb_typeof(s.x) = 'object' then s.x->>'p' end as p,
             case when jsonb_typeof(s.x) = 'object' then s.x->>'hora' end as hora,
             case when jsonb_typeof(s.x) = 'object' then s.x->>'a' end as a
    ) it
    cross join lateral (
      select case when left(it.id, 2) in ('c-', 'r-') then substr(it.id, 3) end as hs,
             case when left(it.id, 2) = 'n-' and substr(it.id, 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then substr(it.id, 3)::uuid end as lpid
    ) k
    left join public.clients c1 on c1.id_hubspot = k.hs and not coalesce(c1.is_archived, false)
    left join public.clients c2 on c2.lead_prospeccao_id = k.lpid and not coalesce(c2.is_archived, false)
    left join public.leads_prospeccao lp on lp.id = k.lpid
    left join public.espelho_negocios en on en.deal_id = k.hs
    where ps.data_segunda = p_segunda and ps.owner_id = any(p_donos) and d.i <= 5 and jsonb_typeof(s.x) in ('object', 'string') and coalesce(it.id, '') <> '' and left(it.id, 2) <> '__'
  ),
  achados as materialized (
    select distinct b.owner_id, coalesce(b.dealname, b.lp_nome) as nm,
      public.plano_cliente_por_nome(b.owner_id, coalesce(b.dealname, b.lp_nome)) as cid
    from base b where b.cl_id is null and coalesce(b.dealname, b.lp_nome) is not null
  )
  select b.owner_id, b.dia, b.vaga, b.id, b.p, b.hora, coalesce(b.cl_id, cn.id),
    coalesce(nullif(btrim(b.cl_empresa), ''), nullif(btrim(b.cl_nome), ''), b.lp_nome, b.dealname,
             nullif(btrim(cn.empresa), ''), nullif(btrim(cn.nome), ''), 'sem nome'),
    coalesce(b.cl_lat, b.lp_lat, cn.latitude), coalesce(b.cl_lng, b.lp_lng, cn.longitude), b.a
  from base b
  left join achados a on b.cl_id is null and a.owner_id = b.owner_id and a.nm = coalesce(b.dealname, b.lp_nome)
  left join public.clients cn on cn.id = a.cid;
$function$;
