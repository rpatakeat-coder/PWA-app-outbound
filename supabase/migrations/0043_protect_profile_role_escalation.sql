-- Impede auto-promocao de papel. A policy "Users can update their own profile"
-- permite o usuario editar a propria linha (nome, telefone, timezone...), e ela
-- nao restringe colunas — entao qualquer vendedor conseguia rodar
--   update profiles set role='gestor' where id = auth.uid()
-- e ganhar acesso total. Isso ja valia pra 'view', mas ficou critico agora que
-- 'gestor' concentra todos os poderes do antigo admin.
--
-- O trigger deixa a mudanca de role passar apenas quando quem edita e' gestor
-- ou service_role. Rodar como BEFORE UPDATE cobre qualquer caminho (app, API
-- REST, script) sem precisar reescrever as policies coluna a coluna.
CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND auth.role() <> 'service_role'
     AND public.is_field_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Somente gestores podem alterar o papel de um usuario';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_role_self_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_role_self_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_self_escalation();
