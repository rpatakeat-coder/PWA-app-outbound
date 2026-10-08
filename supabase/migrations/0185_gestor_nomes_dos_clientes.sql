-- 0185 · Os nomes dos clientes do gestor numa consulta só (08/10/2026)
--
-- Auditoria do cockpit do gestor v5: depois da carga principal, o painel fazia uma SEGUNDA ida ao
-- banco para buscar o nome de cada cliente por trás do funil (entradas em Negociação, visitas com
-- prova, fichas com decisor, reuniões sem desfecho) — até 12 consultas de 150 ids, e só depois que
-- as primeiras voltavam. Com o banco em Oregon, cada ida custa ~0,4 s.
--
-- Esta função devolve o MESMO conjunto numa consulta, que o painel pede em paralelo com o resto.
-- SECURITY INVOKER (o padrão): roda com a permissão de quem chama, então o RLS de clients vale como
-- valia na consulta direta. Nada fica visível a mais.

create or replace function public.gestor_nomes_dos_clientes(p_mes date, p_desde date, p_hoje date)
returns table(id uuid, nome text, empresa text, bairro text, id_hubspot text, vendedor_id_hubspot text)
language sql
stable
set search_path to 'public'
as $$
  with ids as (
    -- entrou em Negociação no mês
    select s.client_id from public.client_stage_changes s
     where s.to_stage = 'Negociação' and s.created_at >= (p_mes::timestamp at time zone 'America/Sao_Paulo')
    union
    -- visitas com prova do mês e da janela recente (a semana da Rua e os 7 dias das Pessoas)
    select v.client_id from public.visitas_com_prova(least(p_mes, p_desde), p_hoje, null) v
     where v.provada
    union
    -- fichas em que falou com o decisor, no mês
    select f.client_id from public.fichas_de_rua f
     where f.como_foi = 'falou_com_decisor' and f.ocorrido_em >= (p_mes::timestamp at time zone 'America/Sao_Paulo')
    union
    -- reuniões que passaram sem desfecho (as 3.000 mais recentes, como o painel lê)
    select m.client_id from (
      select cm.client_id from public.client_meetings cm
       where cm.status = 'agendada' and cm.scheduled_at < now() - interval '2 hours'
       order by cm.scheduled_at desc limit 3000
    ) m
  )
  select c.id, c.nome, c.empresa, c.bairro, c.id_hubspot, c.vendedor_id_hubspot
    from public.clients c
    join ids on ids.client_id = c.id;
$$;

revoke all on function public.gestor_nomes_dos_clientes(date, date, date) from public, anon;
grant execute on function public.gestor_nomes_dos_clientes(date, date, date) to authenticated;
