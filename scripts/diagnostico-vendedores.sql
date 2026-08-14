-- ============================================================================
-- Quem e' vendedor de campo, de verdade?
-- ============================================================================
--
-- Somente LEITURA. Nao altera nada.
--
-- Serve pra curar `seller_classification` com evidencia em vez de memoria. A
-- classificacao decide quem aparece em ranking, quem tem meta e quem some dos
-- filtros — e hoje a tabela esta' vazia, o que significa "todo mundo e' ativo"
-- e enche as telas de gestao com gente que nao faz campo.
--
-- COMO LER O RESULTADO
-- A coluna `sugestao` e' um chute baseado em atividade, NAO uma decisao. Ela
-- erra de proposito pra dois lados que voce precisa julgar:
--
--   - Quem fecha sem visitar (inside sales, ou gestor que fecha) aparece como
--     candidato a "nao vendedor" mesmo tendo receita. Olhe `fechou_total` antes
--     de tirar alguem da tela.
--   - Quem entrou faz pouco tempo aparece sem atividade so' porque a janela e'
--     de 90 dias. Olhe `perfil_criado_em`.
--
-- Depois de decidir, marque em: app de campo -> aba Gestor -> "Vendedores &
-- usuarios". A tela ja existe e grava com a permissao certa; nao vale mexer
-- direto na tabela por aqui.
-- ============================================================================

with janela as (
  select (now() at time zone 'America/Sao_Paulo')::date - interval '90 days' as desde
),
visitas as (
  select visited_by as pessoa, count(*) as n, max(visited_at) as ultima
    from public.client_visits, janela
   where visited_at >= janela.desde
   group by visited_by
),
etapas as (
  select created_by as pessoa, count(*) as n
    from public.client_stage_changes, janela
   where created_at >= janela.desde
   group by created_by
),
rotas as (
  select seller_id as pessoa, count(*) as n
    from public.field_routes, janela
   where route_date >= janela.desde
     and status <> 'cancelled'
   group by seller_id
),
carteira as (
  select vendedor_id_hubspot as owner,
         count(*) filter (where etapa is not null) as em_carteira,
         count(*) filter (where won_at is not null) as fechou_total
    from public.clients
   where vendedor_id_hubspot is not null
   group by vendedor_id_hubspot
)
select
  p.full_name                                   as nome,
  p.role,
  coalesce(sc.status, 'ativo')                  as classificacao_hoje,
  (p.id_hubspot is not null)                    as tem_carteira_hubspot,
  coalesce(v.n, 0)                              as visitas_90d,
  v.ultima::date                                as ultima_visita,
  coalesce(r.n, 0)                              as rotas_90d,
  coalesce(e.n, 0)                              as mudancas_etapa_90d,
  coalesce(c.em_carteira, 0)                    as leads_em_carteira,
  coalesce(c.fechou_total, 0)                   as fechou_total,
  case
    when p.full_name ilike '%desativad%'                      then 'desativado — decidir se some'
    when coalesce(v.n,0) = 0 and coalesce(r.n,0) = 0
     and coalesce(e.n,0) = 0 and coalesce(c.fechou_total,0) = 0
     and coalesce(c.em_carteira,0) = 0                        then 'candidato a NAO VENDEDOR'
    when coalesce(v.n,0) = 0 and coalesce(r.n,0) = 0
     and coalesce(c.fechou_total,0) > 0                       then 'fecha sem visitar — inside? decidir'
    when coalesce(v.n,0) = 0 and coalesce(c.em_carteira,0) > 0 then 'tem carteira parada — SEM META?'
    else 'vendedor de campo'
  end                                           as sugestao
from public.profiles p
left join public.seller_classification sc on sc.seller_id = p.id
left join visitas  v on v.pessoa = p.id
left join etapas   e on e.pessoa = p.id
left join rotas    r on r.pessoa = p.id
left join carteira c on c.owner  = p.id_hubspot
where p.role <> 'view'
order by
  -- Quem tem menos sinal de campo primeiro: e' a decisao mais facil e a que
  -- mais limpa as telas.
  (coalesce(v.n,0) + coalesce(r.n,0) + coalesce(e.n,0) + coalesce(c.fechou_total,0)) asc,
  p.full_name;
