-- Conta Alvo: guarda a nota e o nº de avaliações do Google (via Serper) na
-- linha do lead, pra o card do lead exibir sem precisar consultar target_accounts.
alter table public.clients
  add column if not exists conta_alvo_rating numeric,
  add column if not exists conta_alvo_reviews integer;

comment on column public.clients.conta_alvo_rating is
  'Nota do Google (via Serper) da conta-alvo materializada. Preenchida pela edge conta-alvo-nearby.';
comment on column public.clients.conta_alvo_reviews is
  'Qtd de avaliações do Google (via Serper) da conta-alvo. Preenchida pela edge conta-alvo-nearby.';

-- Backfill dos leads de conta-alvo ja materializados (a nota/avaliacoes vivem em
-- target_accounts, casadas por place_id).
update public.clients c
   set conta_alvo_rating  = t.rating,
       conta_alvo_reviews = t.reviews_count
  from public.target_accounts t
 where t.place_id = c.conta_alvo_place_id
   and c.conta_alvo_place_id is not null;
