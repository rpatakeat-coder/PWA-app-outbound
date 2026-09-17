ALTER TABLE public.client_meetings
  ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 30
    CHECK (duration_minutes > 0 AND duration_minutes <= 24 * 60);

COMMENT ON COLUMN public.client_meetings.duration_minutes IS
  'Duração da reunião em minutos. Opções padrão na UI: 20, 30, 45, 60, 90, 120.';
