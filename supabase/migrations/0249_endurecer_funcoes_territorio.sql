-- 0249 · Endurecimento depois do verificador do banco (02/11/26, aplicada)
-- As duas funções auxiliares da 0248 ficaram sem search_path fixo; a função de gatilho do
-- Desenvolvimento v2 podia ser chamada sem login pela API (não fazia nada fora de gatilho, mas não
-- precisa estar exposta).
alter function public._territorio_semana(date) set search_path = public, pg_temp;
alter function public._territorio_chave(text) set search_path = public, pg_temp;
revoke execute on function public._dv2_sinal_conquista() from anon, public;
