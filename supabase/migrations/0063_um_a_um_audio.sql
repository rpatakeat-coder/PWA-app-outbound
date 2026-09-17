-- ============================================================================
-- 1:1 com audio e transcricao
-- ============================================================================
--
-- O registro de 1:1 (um_a_um) ja' guardava pauta e combinado digitados. Isto
-- adiciona o audio da conversa e a transcricao dele.
--
-- POR QUE O AUDIO E A TRANSCRICAO CONVIVEM COM OS CAMPOS DIGITADOS
-- A transcricao NAO substitui a pauta. Ela e' a materia-prima; a pauta e o
-- combinado continuam sendo o que o gestor decidiu que importa. Uma conversa
-- de 40 minutos transcrita e' um paredao de texto que ninguem rele' — o valor
-- de "o que combinamos?" esta' na frase curta, nao no verbatim.
--
-- PRIVACIDADE
-- Bucket PRIVADO, sem excecao: e' a gravacao de uma conversa entre um gestor e
-- um subordinado. Nada de URL publica; o acesso e' sempre por URL assinada de
-- vida curta, e so' pra quem e' gestor (is_field_admin).
--
-- Nao ha' politica de DELETE em cascata do arquivo: apagar a linha em um_a_um
-- NAO apaga o audio no storage. E' de proposito — some o registro, some tambem
-- a forma de auditar o que foi dito. A limpeza do bucket, se um dia precisar, e'
-- um trabalho consciente e nao um efeito colateral.
-- ============================================================================

alter table public.um_a_um
  -- Caminho dentro do bucket: '<seller_id>/<id do registro>.<ext>'.
  add column if not exists audio_caminho text,
  -- MIME real do arquivo. Guardado porque a extensao mente: o MediaRecorder do
  -- Chrome grava 'audio/webm;codecs=opus' e o do Safari 'audio/mp4', e quem
  -- transcreve precisa saber o que esta' mandando.
  add column if not exists audio_tipo text,
  add column if not exists audio_bytes bigint,
  add column if not exists transcricao text,
  -- Mensagem de erro da ultima tentativa. Mesmo padrao de resumos_ia: falha
  -- vira dado visivel, e nao silencio com texto velho na tela.
  add column if not exists transcricao_erro text,
  add column if not exists transcrito_em timestamptz;

comment on column public.um_a_um.audio_caminho is
  'Caminho no bucket privado um-a-um. Acesso SO por signed URL; nunca publico.';
comment on column public.um_a_um.transcricao is
  'Texto gerado a partir do audio. Materia-prima — a pauta e o combinado continuam sendo o que o gestor escreveu.';

-- ===== Bucket privado ========================================================
insert into storage.buckets (id, name, public)
values ('um-a-um', 'um-a-um', false)
on conflict (id) do nothing;

-- ===== Politicas do bucket ===================================================
-- Mesma funcao que ja' guarda um_a_um, seller_visit_goals e route_config: nao
-- inventamos um segundo conceito de "quem e' gestor".
drop policy if exists um_a_um_audio_select on storage.objects;
create policy um_a_um_audio_select on storage.objects
  for select to authenticated
  using (bucket_id = 'um-a-um' and (select public.is_field_admin()));

drop policy if exists um_a_um_audio_insert on storage.objects;
create policy um_a_um_audio_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'um-a-um' and (select public.is_field_admin()));

drop policy if exists um_a_um_audio_update on storage.objects;
create policy um_a_um_audio_update on storage.objects
  for update to authenticated
  using (bucket_id = 'um-a-um' and (select public.is_field_admin()))
  with check (bucket_id = 'um-a-um' and (select public.is_field_admin()));

drop policy if exists um_a_um_audio_delete on storage.objects;
create policy um_a_um_audio_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'um-a-um' and (select public.is_field_admin()));
