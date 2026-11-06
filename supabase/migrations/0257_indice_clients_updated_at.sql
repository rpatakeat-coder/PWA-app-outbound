-- 0257 · Índice de clients.updated_at (06/11/26, aplicado com CONCURRENTLY)
--
-- O mapa de cada celular relê "o que mudou" a cada 60 s (useClients: updated_at > marca, dentro
-- da caixa do mapa). Sem índice, cada releitura varria os 11 mil clientes com a RLS linha a linha:
-- 4.971 chamadas a 202 ms de média nas estatísticas. Com o índice: 0,06 ms medido como executivo.
create index concurrently if not exists idx_clients_updated_at on public.clients (updated_at);
