-- Notas ganham snapshot do autor (nome + email) salvo no insert.
-- Denormalizado de proposito: timeline imutavel mostra "quem escreveu o que
-- na epoca", e nao precisa de join com profiles a cada SELECT.
ALTER TABLE public.client_notes
  ADD COLUMN IF NOT EXISTS created_by_name text,
  ADD COLUMN IF NOT EXISTS created_by_email text;

-- Permite voltar e atualizar notas antigas com o nome do autor quando
-- houver profile correspondente. Roda uma vez por migration; rows novas
-- ja chegam com os campos preenchidos pela mutation no app.
UPDATE public.client_notes n
SET
  created_by_name = p.full_name,
  created_by_email = p.email
FROM public.profiles p
WHERE n.created_by IS NOT NULL
  AND n.created_by = p.id
  AND n.created_by_name IS NULL;
