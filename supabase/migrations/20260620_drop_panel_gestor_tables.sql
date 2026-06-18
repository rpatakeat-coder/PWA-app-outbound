-- Remove tabelas que serviam exclusivamente as abas Painel + Gestor.
-- Sem UI consumindo e sem outras dependencias.
--
-- seller_goals: 0 rows quando avaliado, nunca foi populada.
-- field_route_audit_logs: 86 rows de logs internos; sem consumo no app
--   e o useFieldOps removeu as chamadas logAudit.
--
-- A funcao is_field_admin() NAO eh removida — ainda usada em policies de
-- field_routes, field_route_stops e client_meetings (admin bypass).

DROP TABLE IF EXISTS public.seller_goals CASCADE;
DROP TABLE IF EXISTS public.field_route_audit_logs CASCADE;
