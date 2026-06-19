-- Fix-up: a migration anterior unify_lead_status_and_decouple_visit
-- esqueceu de migrar sector_visibility. Setores que viam
-- lead_nao_visitado / lead_visitado tinham que passar a ver o slug 'lead'.
-- Sem isso, a query do useClients filtra por allowedStatuses e como 'lead'
-- nao estava listado, os 341 leads ficavam invisiveis no app pros setores
-- Outbound e RPA.

-- Insere 'lead' em todo sector que ja tinha qualquer dos slugs antigos.
INSERT INTO public.sector_visibility (sector, status_slug)
SELECT DISTINCT sector, 'lead'
FROM public.sector_visibility
WHERE status_slug IN ('lead_nao_visitado', 'lead_visitado')
ON CONFLICT DO NOTHING;

-- Remove os slugs antigos (ja inativados em client_statuses, manter aqui
-- so deixaria lixo de config sem efeito).
DELETE FROM public.sector_visibility
WHERE status_slug IN ('lead_nao_visitado', 'lead_visitado');
