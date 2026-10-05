-- 0164 — Visita do app conta como toque na régua (Julyan, 05/10/2026: "alguns executivos fizeram
-- visita no cliente e mesmo assim aparece como estourado, isso não pode acontecer").
--
-- Os dias parados do Cockpit (e por eles o "estourado", o pino "cobrar" do mapa e a fila) contam
-- da entrada na etapa, da criação ou de notes_last_updated, a "última atividade" do HubSpot. A visita
-- do app vira TAREFA CONCLUÍDA no HubSpot, e tarefa concluída não mexe nessa data: medido em
-- 05/10, a Sayuri Sushi (Kelly) visitada em 01/10 seguia estourada com 8 dias úteis.
--
-- Esta view entrega a última visita do app por negócio (120 dias). O robô do Cockpit e o espelho
-- ao vivo a usam como mais um candidato da conta. Leitura só do servidor (service_role).

create or replace view public.ultima_visita_por_negocio as
  select c.id_hubspot as deal_id, max(v.visited_at) as ultima_visita
    from public.client_visits v
    join public.clients c on c.id = v.client_id
   where nullif(c.id_hubspot, '') is not null
     and v.visited_at > now() - interval '120 days'
   group by c.id_hubspot;

revoke all on public.ultima_visita_por_negocio from public, anon, authenticated;
grant select on public.ultima_visita_por_negocio to service_role;
