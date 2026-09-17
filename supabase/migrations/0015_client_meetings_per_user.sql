-- Restringe SELECT de client_meetings ao proprio criador. Admin (is_field_admin)
-- continua vendo todas. Antes a policy era USING (true) — todo vendedor via
-- agenda dos colegas, o que nao faz sentido pro caso de uso atual.

DROP POLICY IF EXISTS client_meetings_select ON public.client_meetings;
CREATE POLICY client_meetings_select ON public.client_meetings
  FOR SELECT TO authenticated
  USING (auth.uid() = created_by OR public.is_field_admin());
