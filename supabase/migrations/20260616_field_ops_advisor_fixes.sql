-- Ajustes apontados pelos advisors apos criar a base de rotas/metas.

CREATE INDEX IF NOT EXISTS field_routes_created_by_idx
  ON public.field_routes(created_by);

CREATE INDEX IF NOT EXISTS field_route_stops_client_id_idx
  ON public.field_route_stops(client_id);

CREATE INDEX IF NOT EXISTS seller_goals_created_by_idx
  ON public.seller_goals(created_by);

CREATE INDEX IF NOT EXISTS field_route_audit_logs_route_id_idx
  ON public.field_route_audit_logs(route_id);

CREATE INDEX IF NOT EXISTS field_route_audit_logs_stop_id_idx
  ON public.field_route_audit_logs(stop_id);

CREATE INDEX IF NOT EXISTS field_route_audit_logs_client_id_idx
  ON public.field_route_audit_logs(client_id);

CREATE INDEX IF NOT EXISTS field_route_audit_logs_created_by_idx
  ON public.field_route_audit_logs(created_by);

DROP POLICY IF EXISTS field_routes_select ON public.field_routes;
CREATE POLICY field_routes_select ON public.field_routes
  FOR SELECT TO authenticated
  USING (seller_id = (select auth.uid()) OR (select public.is_field_admin()));

DROP POLICY IF EXISTS field_routes_insert ON public.field_routes;
CREATE POLICY field_routes_insert ON public.field_routes
  FOR INSERT TO authenticated
  WITH CHECK (seller_id = (select auth.uid()) OR (select public.is_field_admin()));

DROP POLICY IF EXISTS field_routes_update ON public.field_routes;
CREATE POLICY field_routes_update ON public.field_routes
  FOR UPDATE TO authenticated
  USING (seller_id = (select auth.uid()) OR (select public.is_field_admin()))
  WITH CHECK (seller_id = (select auth.uid()) OR (select public.is_field_admin()));

DROP POLICY IF EXISTS field_routes_delete ON public.field_routes;
CREATE POLICY field_routes_delete ON public.field_routes
  FOR DELETE TO authenticated
  USING (seller_id = (select auth.uid()) OR (select public.is_field_admin()));

DROP POLICY IF EXISTS field_route_stops_select ON public.field_route_stops;
CREATE POLICY field_route_stops_select ON public.field_route_stops
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.field_routes r
      WHERE r.id = route_id
        AND (r.seller_id = (select auth.uid()) OR (select public.is_field_admin()))
    )
  );

DROP POLICY IF EXISTS field_route_stops_insert ON public.field_route_stops;
CREATE POLICY field_route_stops_insert ON public.field_route_stops
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.field_routes r
      WHERE r.id = route_id
        AND (r.seller_id = (select auth.uid()) OR (select public.is_field_admin()))
    )
  );

DROP POLICY IF EXISTS field_route_stops_update ON public.field_route_stops;
CREATE POLICY field_route_stops_update ON public.field_route_stops
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.field_routes r
      WHERE r.id = route_id
        AND (r.seller_id = (select auth.uid()) OR (select public.is_field_admin()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.field_routes r
      WHERE r.id = route_id
        AND (r.seller_id = (select auth.uid()) OR (select public.is_field_admin()))
    )
  );

DROP POLICY IF EXISTS field_route_stops_delete ON public.field_route_stops;
CREATE POLICY field_route_stops_delete ON public.field_route_stops
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.field_routes r
      WHERE r.id = route_id
        AND (r.seller_id = (select auth.uid()) OR (select public.is_field_admin()))
    )
  );

DROP POLICY IF EXISTS seller_goals_select ON public.seller_goals;
CREATE POLICY seller_goals_select ON public.seller_goals
  FOR SELECT TO authenticated
  USING (seller_id = (select auth.uid()) OR (select public.is_field_admin()));

DROP POLICY IF EXISTS seller_goals_write_admin ON public.seller_goals;

DROP POLICY IF EXISTS seller_goals_insert_admin ON public.seller_goals;
CREATE POLICY seller_goals_insert_admin ON public.seller_goals
  FOR INSERT TO authenticated
  WITH CHECK ((select public.is_field_admin()));

DROP POLICY IF EXISTS seller_goals_update_admin ON public.seller_goals;
CREATE POLICY seller_goals_update_admin ON public.seller_goals
  FOR UPDATE TO authenticated
  USING ((select public.is_field_admin()))
  WITH CHECK ((select public.is_field_admin()));

DROP POLICY IF EXISTS seller_goals_delete_admin ON public.seller_goals;
CREATE POLICY seller_goals_delete_admin ON public.seller_goals
  FOR DELETE TO authenticated
  USING ((select public.is_field_admin()));

DROP POLICY IF EXISTS field_route_audit_logs_select ON public.field_route_audit_logs;
CREATE POLICY field_route_audit_logs_select ON public.field_route_audit_logs
  FOR SELECT TO authenticated
  USING (
    seller_id = (select auth.uid())
    OR created_by = (select auth.uid())
    OR (select public.is_field_admin())
  );

DROP POLICY IF EXISTS field_route_audit_logs_insert ON public.field_route_audit_logs;
CREATE POLICY field_route_audit_logs_insert ON public.field_route_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (created_by = (select auth.uid()) OR (select public.is_field_admin()));
