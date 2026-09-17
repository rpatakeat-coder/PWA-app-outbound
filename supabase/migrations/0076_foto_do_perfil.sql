-- ============================================================================
-- Foto de perfil: coluna + bucket + quem pode escrever
-- ============================================================================
--
-- O tipo `Profile` (src/integrations/supabase/types.ts) ja' declarava
-- `avatar_url` ha' muito tempo, mas a coluna nunca apareceu em migration
-- nenhuma deste repo — como varias outras coisas de `profiles`, ela pode ter
-- nascido pelo painel. O `if not exists` resolve os dois casos sem eu precisar
-- adivinhar qual e'.
--
-- BUCKET PUBLICO, e isso e' escolha, nao descuido. A foto aparece no cabecalho
-- de toda tela, na lista do time, na tabela do cockpit e na barra lateral —
-- URL assinada expira em uma hora e obrigaria meia duzia de componentes a
-- renovar link em tela. O caminho carrega o UUID do perfil, que nao se
-- adivinha, e o conteudo e' foto de trabalho de quem ja' aparece para o time
-- inteiro. E' o mesmo arranjo que Slack e HubSpot usam para avatar.
--
-- O bucket `um-a-um` continua PRIVADO, com URL assinada de uma hora — la' o
-- conteudo e' gravacao de conversa entre gestor e subordinado. Os dois
-- coexistem de proposito: o criterio e' o conteudo, nao a conveniencia.
-- ============================================================================

alter table public.profiles
  add column if not exists avatar_url text;

comment on column public.profiles.avatar_url is
  'URL publica da foto de perfil, com ?v=<epoch> pra furar cache do navegador. Arquivo em storage/avatares/<uid>/foto.<ext>.';

-- ---------------------------------------------------------------------------
-- O bucket
-- ---------------------------------------------------------------------------
-- `on conflict do update` em vez de `do nothing`: se o bucket ja' existir com
-- outro limite ou sem os mime types, reaplicar este arquivo tem que deixar a
-- configuracao no estado descrito aqui, nao no que estava antes.
--
-- 2 MB e' teto de seguranca do servidor. O app manda ~512x512 em JPEG, que da'
-- algo entre 30 e 120 KB — o limite existe pro caso de alguem chamar a API
-- direto, nao pro caminho normal.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatares',
  'avatares',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Quem escreve: SO' a propria pessoa, no proprio diretorio
-- ---------------------------------------------------------------------------
-- O caminho e' `<uid>/foto.<ext>`, entao a primeira pasta E' o dono. Sem esta
-- amarra qualquer pessoa logada poderia sobrescrever a foto de qualquer outra
-- — e o estrago seria a cara de alguem no cabecalho do app do time.
--
-- A policy de SELECT veio na 0077, e a ausencia dela aqui foi ERRO MEU. O
-- raciocinio escrito nesta linha era: "o bucket e' publico, a leitura sai pela
-- rota /storage/v1/object/public/... e nao passa por RLS". Verdade para o
-- DOWNLOAD, falso para o UPLOAD — `upsert: true` vira
-- `INSERT ... ON CONFLICT DO UPDATE`, que precisa LER a linha em conflito, e
-- ler exige policy de select. O upload morria com "violates row-level security
-- policy". Ver 0077_foto_do_perfil_select.sql.

drop policy if exists avatares_insere_o_proprio on storage.objects;
create policy avatares_insere_o_proprio on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- O app manda `upsert: true` pra trocar a foto sem acumular arquivo, e upsert
-- vira UPDATE quando o objeto ja' existe. Sem esta policy a primeira foto
-- subiria e a troca falharia.
drop policy if exists avatares_atualiza_o_proprio on storage.objects;
create policy avatares_atualiza_o_proprio on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Remover a propria foto e voltar pras iniciais.
drop policy if exists avatares_apaga_o_proprio on storage.objects;
create policy avatares_apaga_o_proprio on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- Conferencia depois de aplicar
-- ---------------------------------------------------------------------------
--   select id, public, file_size_limit, allowed_mime_types
--     from storage.buckets where id = 'avatares';
--   -- espera: public = true, 2097152, {image/jpeg,image/png,image/webp}
--
--   select polname from pg_policy
--    where polrelid = 'storage.objects'::regclass
--      and polname like 'avatares%';
--   -- espera: as tres (insere / atualiza / apaga)
--
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'profiles'
--      and column_name = 'avatar_url';
--   -- espera: uma linha
