-- Conta Alvo "Não interessa": guarda QUEM dispensou e QUANDO (além do
-- vendedor_id_hubspot atribuído, que já está na linha). A conta-alvo dispensada
-- fica armazenada como o próprio clients (conta_alvo_dismissed=true) — estas
-- colunas dão o rastro pro gestor auditar.
alter table public.clients
  add column if not exists conta_alvo_dismissed_by      uuid,
  add column if not exists conta_alvo_dismissed_by_name text,
  add column if not exists conta_alvo_dismissed_at       timestamptz;

comment on column public.clients.conta_alvo_dismissed_by is
  'Auth uid do usuário (vendedor/gestor) que dispensou a conta-alvo ("Não interessa").';
comment on column public.clients.conta_alvo_dismissed_by_name is
  'Nome (snapshot) de quem dispensou — pra listar sem join.';
comment on column public.clients.conta_alvo_dismissed_at is
  'Quando a conta-alvo foi dispensada.';

-- Índice pra listar as dispensadas rapidamente (parcial: só as marcadas).
create index if not exists clients_conta_alvo_dismissed_idx
  on public.clients (conta_alvo_dismissed_at desc)
  where conta_alvo_dismissed = true;
