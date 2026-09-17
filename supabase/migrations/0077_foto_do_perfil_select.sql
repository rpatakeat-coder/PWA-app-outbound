-- ============================================================================
-- Foto de perfil: a policy de SELECT que faltou na 0076
-- ============================================================================
--
-- O QUE QUEBROU. Subir a foto morria com "new row violates row-level security
-- policy", que o app mostra como "Sem permissao para salvar a foto".
--
-- POR QUE. A 0076 criou insert, update e delete em `storage.objects` e NAO
-- criou select, com esta justificativa escrita no arquivo:
--
--   "Nao ha' policy de SELECT: o bucket e' publico, a leitura sai pela rota
--    /storage/v1/object/public/... e nao passa por RLS."
--
-- A frase esta' certa sobre o DOWNLOAD e errada sobre o UPLOAD. O app manda
-- `upsert: true` pra trocar a foto sem acumular arquivo, e o upsert vira
-- `INSERT ... ON CONFLICT DO UPDATE`. Esse comando precisa LER a linha em
-- conflito pra decidir se atualiza — e ler linha em tabela com RLS exige policy
-- de select. Sem ela o comando e' barrado antes de chegar ao insert.
--
-- Ou seja: o bucket ser publico dispensa RLS na rota de download, nao na rota
-- de API que o proprio app usa pra escrever. Duas rotas diferentes, e eu tratei
-- as duas como uma.
--
-- O QUE ISSO ABRE. Nada que ja' nao estivesse aberto: o bucket e' publico, e
-- qualquer pessoa com a URL ja' le' o arquivo pela rota publica. Esta policy so'
-- permite LER O METADADO da linha pela API, e apenas para quem esta' logado.
-- Escrever continua amarrado ao dono — as tres policies da 0076 seguem valendo.
-- ============================================================================

drop policy if exists avatares_leitura on storage.objects;
create policy avatares_leitura on storage.objects
  for select to authenticated
  using (bucket_id = 'avatares');

-- ---------------------------------------------------------------------------
-- Conferencia depois de aplicar
-- ---------------------------------------------------------------------------
--   select polname,
--          case polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
--                      when 'w' then 'UPDATE' when 'd' then 'DELETE'
--                      else polcmd::text end as comando
--     from pg_policy
--    where polrelid = 'storage.objects'::regclass
--      and polname like 'avatares%'
--    order by 1;
--
--   -- espera QUATRO linhas:
--   --   avatares_apaga_o_proprio     DELETE
--   --   avatares_atualiza_o_proprio  UPDATE
--   --   avatares_insere_o_proprio    INSERT
--   --   avatares_leitura             SELECT
--
-- Se vierem MENOS de tres das da 0076, aquela migration nao aplicou inteira
-- (criar policy em `storage.objects` pode falhar por falta de owner) — e o
-- caminho e' reaplicar a 0076, que e' idempotente, antes desta.
