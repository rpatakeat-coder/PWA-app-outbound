-- Restringe o índice anti-duplicata clients_unique_nome_geo a cadastros
-- manuais. Leads do HubSpot já têm chave única própria (id_hubspot) e
-- frequentemente compartilham coordenadas de fallback do HubSpot, o que
-- gerava falsos positivos no batch insert do webhook.

DROP INDEX IF EXISTS public.clients_unique_nome_geo;

CREATE UNIQUE INDEX clients_unique_nome_geo
  ON public.clients (
    lower(trim(nome)),
    round(latitude::numeric, 4),
    round(longitude::numeric, 4)
  )
  WHERE is_archived = false
    AND latitude IS NOT NULL
    AND longitude IS NOT NULL
    AND id_hubspot IS NULL;

COMMENT ON INDEX public.clients_unique_nome_geo IS
  'Anti-duplicata por nome+geo apenas para cadastros manuais. Leads vindos do HubSpot dedupam por id_hubspot (clients_id_hubspot_key).';
