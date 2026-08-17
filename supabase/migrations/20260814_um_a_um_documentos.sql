-- ============================================================================
-- Documentos apresentados no 1:1
-- ============================================================================
--
-- O que foi mostrado na conversa — PDI em PDF, slide de resultado, print de
-- meta. Fica junto do registro, e nao solto numa pasta: a pergunta que isto
-- responde e' "o que eu mostrei pra essa pessoa naquele dia?".
--
-- TABELA PROPRIA, E NAO UMA COLUNA
-- Um 1:1 pode ter varios documentos, e cada um tem nome, tipo e tamanho
-- proprios. Numa coluna (array ou jsonb) nao daria pra apagar um sem reescrever
-- o resto, nem pra saber quem anexou o que.
--
-- BUCKET COMPARTILHADO COM O AUDIO ('um-a-um')
-- As politicas de storage ja' existem e sao as mesmas: privado, so' gestor,
-- acesso por URL assinada. Criar um segundo bucket seria um segundo conjunto de
-- politicas pra manter em sincronia — e divergencia entre copias da mesma regra
-- foi o erro que mais apareceu neste projeto.
--
-- APAGAR O 1:1 apaga a LINHA do documento (cascade), mas NAO o arquivo no
-- storage. Mesma escolha do audio: some o registro, sumiria tambem a prova do
-- que foi apresentado.
-- ============================================================================

create table if not exists public.um_a_um_documentos (
  id           uuid primary key default gen_random_uuid(),
  registro_id  uuid not null references public.um_a_um(id) on delete cascade,
  -- Caminho no bucket: '<seller_id>/<registro_id>/docs/<id>-<nome higienizado>'.
  caminho      text not null,
  -- Nome ORIGINAL, com acento e espaco, pra exibir e pra baixar. O caminho no
  -- bucket e' higienizado; este campo preserva o que a pessoa reconhece.
  nome         text not null,
  tipo         text,
  bytes        bigint,
  enviado_por      uuid references auth.users(id) on delete set null,
  -- Snapshot do autor, mesmo padrao de client_notes e um_a_um.
  enviado_por_nome text,
  created_at   timestamptz not null default now()
);

create index if not exists um_a_um_documentos_registro_idx
  on public.um_a_um_documentos (registro_id, created_at desc);

alter table public.um_a_um_documentos enable row level security;

-- Mesma trava do um_a_um: documento de 1:1 e' material da conversa entre gestor
-- e subordinado.
drop policy if exists um_a_um_documentos_select on public.um_a_um_documentos;
create policy um_a_um_documentos_select on public.um_a_um_documentos
  for select to authenticated using ((select public.is_field_admin()));

drop policy if exists um_a_um_documentos_insert on public.um_a_um_documentos;
create policy um_a_um_documentos_insert on public.um_a_um_documentos
  for insert to authenticated with check ((select public.is_field_admin()));

drop policy if exists um_a_um_documentos_delete on public.um_a_um_documentos;
create policy um_a_um_documentos_delete on public.um_a_um_documentos
  for delete to authenticated using ((select public.is_field_admin()));

comment on table public.um_a_um_documentos is
  'Arquivos apresentados num 1:1. Bucket privado um-a-um, acesso SO por signed URL. Apagar o 1:1 apaga a linha, nao o arquivo.';
