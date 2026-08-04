-- ============================================================================
-- client_meetings: guarda o id do evento no Google Calendar (demos).
--
-- Migramos a criacao do evento no Google (que ficava no n8n) pra dentro do
-- sistema (edge function google-calendar). Guardar o id permite ATUALIZAR
-- (reagendar) e DELETAR (cancelar) o MESMO evento a partir do app.
--
-- O Meeting no HubSpot continua vindo da sync nativa HubSpot<->Google
-- (bidirectional): quando o evento muda/some no Google, a Meeting acompanha.
--
-- Follow up NAO cria evento no Google (fica so como Task no HubSpot), entao
-- segue com google_event_id nulo.
--
-- Aplicada em 2026-08-04.
-- ============================================================================

alter table public.client_meetings
  add column if not exists google_event_id text;

comment on column public.client_meetings.google_event_id is
  'ID do evento no Google Calendar (demos). Preenchido pela edge google-calendar; usado pra reagendar/cancelar. HubSpot Meeting acompanha via sync HubSpot<->Google.';
