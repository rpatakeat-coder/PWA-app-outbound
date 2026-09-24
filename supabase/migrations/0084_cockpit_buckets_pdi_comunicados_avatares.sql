-- 0084 — Unificação do Cockpit: armazenamento de PDI, imagens de comunicado e avatar
--
-- Por quê: o Cockpit guarda o arquivo do PDI em pdi-documentos/<owner_id>/...,
-- a imagem do comunicado em comunicados-imagens/... e o avatar em
-- avatares/<email>/.... Com as tabelas já no APP (0080, 0082), os arquivos
-- precisam estar aqui também, com as mesmas regras de quem lê e quem grava.
--
-- Regras copiadas do Cockpit (xitmahwxncpdzopmdook) em 24/09/2026, traduzidas
-- como na 0079 (manager = is_field_admin(); o owner = meu_owner_hubspot()):
--   pdi-documentos       privado; lê o dono da pasta (owner_id) ou o gestor;
--                        grava só o gestor.
--   comunicados-imagens  privado; lê quem está logado; grava só o gestor.
--   avatares             já existe no APP (pasta = auth.uid(), usada pelo app
--                        de campo). Soma-se a pasta = e-mail, que é a do
--                        Cockpit. As regras do app de campo ficam intactas.
--
-- Idempotente e aditiva: não apaga bucket, objeto nem política existente.

insert into storage.buckets (id, name, public)
values ('pdi-documentos', 'pdi-documentos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('comunicados-imagens', 'comunicados-imagens', false)
on conflict (id) do nothing;

-- pdi-documentos -------------------------------------------------------------
drop policy if exists pdi_documentos_leitura on storage.objects;
create policy pdi_documentos_leitura on storage.objects
  for select to authenticated
  using (bucket_id = 'pdi-documentos'
         and ((storage.foldername(name))[1] = (select public.meu_owner_hubspot())
              or (select public.is_field_admin())));

drop policy if exists pdi_documentos_upload on storage.objects;
create policy pdi_documentos_upload on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pdi-documentos' and (select public.is_field_admin()));

-- comunicados-imagens --------------------------------------------------------
drop policy if exists comunicados_imagens_leitura on storage.objects;
create policy comunicados_imagens_leitura on storage.objects
  for select to authenticated
  using (bucket_id = 'comunicados-imagens');

drop policy if exists comunicados_imagens_upload on storage.objects;
create policy comunicados_imagens_upload on storage.objects
  for insert to authenticated
  with check (bucket_id = 'comunicados-imagens' and (select public.is_field_admin()));

-- avatares: a pasta por e-mail do Cockpit, ao lado da pasta por uid do APP -----
drop policy if exists avatares_insere_pasta_email on storage.objects;
create policy avatares_insere_pasta_email on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatares'
              and lower((storage.foldername(name))[1]) = lower((select auth.email())));

drop policy if exists avatares_atualiza_pasta_email on storage.objects;
create policy avatares_atualiza_pasta_email on storage.objects
  for update to authenticated
  using (bucket_id = 'avatares'
         and lower((storage.foldername(name))[1]) = lower((select auth.email())))
  with check (bucket_id = 'avatares'
              and lower((storage.foldername(name))[1]) = lower((select auth.email())));
