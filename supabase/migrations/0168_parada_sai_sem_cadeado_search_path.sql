-- Auditoria de 05/10/2026: o gatilho da 0166 nasceu sem search_path fixo (aviso de
-- segurança do Supabase). Fixa o caminho e tira o EXECUTE de quem não precisa: é função de
-- gatilho, só o próprio gatilho a chama.
alter function public.tg_parada_sai_sem_cadeado() set search_path = public, pg_temp;
revoke all on function public.tg_parada_sai_sem_cadeado() from public, anon, authenticated;
