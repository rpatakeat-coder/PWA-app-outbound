-- Base operacional para sugestao/montagem de rotas, agenda, metas e auditoria.

CREATE TABLE IF NOT EXISTS public.field_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route_date date NOT NULL DEFAULT CURRENT_DATE,
  title text NOT NULL DEFAULT 'Rota do dia',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'planned', 'in_progress', 'completed', 'cancelled')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'suggested')),
  priority_mode text NOT NULL DEFAULT 'proximity',
  base_lat double precision,
  base_lon double precision,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS field_routes_seller_date_idx
  ON public.field_routes(seller_id, route_date);

CREATE INDEX IF NOT EXISTS field_routes_route_date_idx
  ON public.field_routes(route_date);

CREATE TABLE IF NOT EXISTS public.field_route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES public.field_routes(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  position integer NOT NULL,
  planned_at timestamptz,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'done', 'skipped', 'removed')),
  notes text,
  distance_meters integer,
  estimated_drive_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS field_route_stops_route_client_idx
  ON public.field_route_stops(route_id, client_id);

CREATE INDEX IF NOT EXISTS field_route_stops_route_position_idx
  ON public.field_route_stops(route_id, position);

CREATE TABLE IF NOT EXISTS public.seller_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  closed_clients_goal integer NOT NULL DEFAULT 0,
  visits_goal integer NOT NULL DEFAULT 0,
  demos_goal integer NOT NULL DEFAULT 0,
  proposals_goal integer NOT NULL DEFAULT 0,
  mrr_goal numeric(12,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS seller_goals_seller_period_idx
  ON public.seller_goals(seller_id, period_start, period_end);

CREATE TABLE IF NOT EXISTS public.field_route_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid REFERENCES public.field_routes(id) ON DELETE SET NULL,
  stop_id uuid REFERENCES public.field_route_stops(id) ON DELETE SET NULL,
  seller_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS field_route_audit_logs_created_at_idx
  ON public.field_route_audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS field_route_audit_logs_seller_created_idx
  ON public.field_route_audit_logs(seller_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.field_ops_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS field_routes_set_updated_at ON public.field_routes;
CREATE TRIGGER field_routes_set_updated_at
BEFORE UPDATE ON public.field_routes
FOR EACH ROW EXECUTE FUNCTION public.field_ops_set_updated_at();

DROP TRIGGER IF EXISTS field_route_stops_set_updated_at ON public.field_route_stops;
CREATE TRIGGER field_route_stops_set_updated_at
BEFORE UPDATE ON public.field_route_stops
FOR EACH ROW EXECUTE FUNCTION public.field_ops_set_updated_at();

DROP TRIGGER IF EXISTS seller_goals_set_updated_at ON public.seller_goals;
CREATE TRIGGER seller_goals_set_updated_at
BEFORE UPDATE ON public.seller_goals
FOR EACH ROW EXECUTE FUNCTION public.field_ops_set_updated_at();

CREATE OR REPLACE FUNCTION public.is_field_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (auth.jwt() ->> 'email') = 'arthurgothe.takeat@gmail.com';
$$;

ALTER TABLE public.field_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_route_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS field_routes_select ON public.field_routes;
CREATE POLICY field_routes_select ON public.field_routes
  FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR public.is_field_admin());

DROP POLICY IF EXISTS field_routes_insert ON public.field_routes;
CREATE POLICY field_routes_insert ON public.field_routes
  FOR INSERT TO authenticated
  WITH CHECK (seller_id = auth.uid() OR public.is_field_admin());

DROP POLICY IF EXISTS field_routes_update ON public.field_routes;
CREATE POLICY field_routes_update ON public.field_routes
  FOR UPDATE TO authenticated
  USING (seller_id = auth.uid() OR public.is_field_admin())
  WITH CHECK (seller_id = auth.uid() OR public.is_field_admin());

DROP POLICY IF EXISTS field_routes_delete ON public.field_routes;
CREATE POLICY field_routes_delete ON public.field_routes
  FOR DELETE TO authenticated
  USING (seller_id = auth.uid() OR public.is_field_admin());

DROP POLICY IF EXISTS field_route_stops_select ON public.field_route_stops;
CREATE POLICY field_route_stops_select ON public.field_route_stops
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.field_routes r
      WHERE r.id = route_id
        AND (r.seller_id = auth.uid() OR public.is_field_admin())
    )
  );

DROP POLICY IF EXISTS field_route_stops_insert ON public.field_route_stops;
CREATE POLICY field_route_stops_insert ON public.field_route_stops
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.field_routes r
      WHERE r.id = route_id
        AND (r.seller_id = auth.uid() OR public.is_field_admin())
    )
  );

DROP POLICY IF EXISTS field_route_stops_update ON public.field_route_stops;
CREATE POLICY field_route_stops_update ON public.field_route_stops
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.field_routes r
      WHERE r.id = route_id
        AND (r.seller_id = auth.uid() OR public.is_field_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.field_routes r
      WHERE r.id = route_id
        AND (r.seller_id = auth.uid() OR public.is_field_admin())
    )
  );

DROP POLICY IF EXISTS field_route_stops_delete ON public.field_route_stops;
CREATE POLICY field_route_stops_delete ON public.field_route_stops
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.field_routes r
      WHERE r.id = route_id
        AND (r.seller_id = auth.uid() OR public.is_field_admin())
    )
  );

DROP POLICY IF EXISTS seller_goals_select ON public.seller_goals;
CREATE POLICY seller_goals_select ON public.seller_goals
  FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR public.is_field_admin());

DROP POLICY IF EXISTS seller_goals_write_admin ON public.seller_goals;
CREATE POLICY seller_goals_write_admin ON public.seller_goals
  FOR ALL TO authenticated
  USING (public.is_field_admin())
  WITH CHECK (public.is_field_admin());

DROP POLICY IF EXISTS field_route_audit_logs_select ON public.field_route_audit_logs;
CREATE POLICY field_route_audit_logs_select ON public.field_route_audit_logs
  FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR created_by = auth.uid() OR public.is_field_admin());

DROP POLICY IF EXISTS field_route_audit_logs_insert ON public.field_route_audit_logs;
CREATE POLICY field_route_audit_logs_insert ON public.field_route_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR public.is_field_admin());

COMMENT ON TABLE public.field_routes IS 'Rotas planejadas por vendedor e data.';
COMMENT ON TABLE public.field_route_stops IS 'Leads/clientes incluídos em uma rota, com ordem e horario planejado.';
COMMENT ON TABLE public.seller_goals IS 'Metas comerciais definidas pelo gestor por vendedor e periodo.';
COMMENT ON TABLE public.field_route_audit_logs IS 'Auditoria operacional de criacao, alteracao e execucao de rotas.';
