-- ============================================================================
-- client_meetings: guarda o id do engagement do HubSpot criado ao agendar.
--
-- Follow up  -> Task no HubSpot.
-- Demo/reuniao -> Meeting no HubSpot.
--
-- Guardar o id permite ATUALIZAR o engagement ao reagendar (novo horario) e
-- CONCLUIR (task) / CANCELAR (meeting) ao remover a reuniao no app, em vez de
-- criar uma entrada nova/duplicada no CRM. Preenchido pela edge hubspot-sync.
--
-- Aplicada via apply_migration 'client_meetings_add_hs_engagement_id' em 2026-08-04.
-- ============================================================================

alter table public.client_meetings
  add column if not exists hs_engagement_id text;

comment on column public.client_meetings.hs_engagement_id is
  'ID do engagement no HubSpot (task=follow_up, meeting=reuniao). Preenchido pela edge hubspot-sync ao agendar; usado pra update/complete/cancel.';
