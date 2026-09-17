-- Conta Alvo "Não interessa": descarta um alvo de prospecção sem virar deal.
-- Marca a linha materializada (conta_alvo_place_id) como dismissed. O app
-- esconde do mapa/lista e a edge conta-alvo-nearby não reusa mais essa
-- conta-alvo (e o place_id segue excluído das buscas novas por já ser cliente).
alter table public.clients
  add column if not exists conta_alvo_dismissed boolean not null default false;

comment on column public.clients.conta_alvo_dismissed is
  'Conta Alvo descartada pelo vendedor ("Não interessa"): escondida do app e não re-sugerida. Só pra leads de conta-alvo (conta_alvo_place_id).';
