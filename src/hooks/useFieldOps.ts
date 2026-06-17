import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import type { Client, FieldRoute, FieldRouteAuditLog, FieldRouteStopWithClient, SellerGoal } from '../types/client';

export const todayKey = () => new Date().toISOString().slice(0, 10);

const toRad = (deg: number) => (deg * Math.PI) / 180;

export const distanceMeters = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const r = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * r * Math.asin(Math.sqrt(a)));
};

export const routeEtaMinutes = (meters: number) => Math.max(4, Math.round((meters / 1000 / 22) * 60));

type RoutePayload = {
  routeDate: string;
  title: string;
  source: 'manual' | 'suggested';
  priorityMode: string;
  base?: { latitude: number; longitude: number } | null;
  stops: Array<{ client: Client; distance_meters?: number | null }>;
};

export function useFieldOps(routeDate = todayKey(), enabled = true) {
  const queryClient = useQueryClient();
  const { user, profile, isAuthenticated } = useAuth();

  const routesQuery = useQuery<FieldRoute[]>({
    queryKey: ['field_routes', routeDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('field_routes')
        .select('*')
        .eq('route_date', routeDate)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as FieldRoute[];
    },
    enabled: isAuthenticated && enabled,
  });

  const route = routesQuery.data?.[0] ?? null;

  const stopsQuery = useQuery<FieldRouteStopWithClient[]>({
    queryKey: ['field_route_stops', route?.id],
    queryFn: async () => {
      if (!route?.id) return [];
      const { data, error } = await supabase
        .from('field_route_stops')
        .select('*, client:clients(*)')
        .eq('route_id', route.id)
        .neq('status', 'removed')
        .order('position', { ascending: true });
      if (error) throw error;
      return (data ?? []) as FieldRouteStopWithClient[];
    },
    enabled: isAuthenticated && enabled && !!route?.id,
  });

  const goalsQuery = useQuery<SellerGoal[]>({
    queryKey: ['seller_goals', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('seller_goals')
        .select('*')
        .lte('period_start', routeDate)
        .gte('period_end', routeDate)
        .order('period_end', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SellerGoal[];
    },
    enabled: isAuthenticated && enabled && !!profile,
  });

  const auditQuery = useQuery<FieldRouteAuditLog[]>({
    queryKey: ['field_route_audit_logs', routeDate],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('field_route_audit_logs')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as FieldRouteAuditLog[];
    },
    enabled: isAuthenticated && enabled,
  });

  const profilesQuery = useQuery<any[]>({
    queryKey: ['field_profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,email,full_name,sector')
        .order('full_name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: isAuthenticated && enabled,
  });

  const logAudit = async (payload: Partial<FieldRouteAuditLog> & { action: string }) => {
    await supabase.from('field_route_audit_logs').insert({
      route_id: payload.route_id ?? null,
      stop_id: payload.stop_id ?? null,
      seller_id: payload.seller_id ?? user?.id ?? null,
      client_id: payload.client_id ?? null,
      action: payload.action,
      details: payload.details ?? {},
      created_by: user?.id ?? null,
    });
  };

  const saveRoute = useMutation({
    mutationFn: async (payload: RoutePayload) => {
      if (!user?.id) throw new Error('Usuario nao autenticado');

      const { data: routeRow, error: routeError } = await supabase
        .from('field_routes')
        .upsert({
          seller_id: user.id,
          route_date: payload.routeDate,
          title: payload.title,
          status: 'planned',
          source: payload.source,
          priority_mode: payload.priorityMode,
          base_lat: payload.base?.latitude ?? null,
          base_lon: payload.base?.longitude ?? null,
          created_by: user.id,
        }, { onConflict: 'seller_id,route_date' })
        .select()
        .single();
      if (routeError) throw routeError;

      const savedRoute = routeRow as FieldRoute;
      const { error: clearError } = await supabase
        .from('field_route_stops')
        .delete()
        .eq('route_id', savedRoute.id);
      if (clearError) throw clearError;

      if (payload.stops.length > 0) {
        const start = new Date(`${payload.routeDate}T09:00:00`);
        const rows = payload.stops.map((stop, index) => {
          const planned = new Date(start.getTime() + index * 75 * 60_000);
          const meters = stop.distance_meters ?? null;
          return {
            route_id: savedRoute.id,
            client_id: stop.client.id,
            position: index + 1,
            planned_at: planned.toISOString(),
            distance_meters: meters,
            estimated_drive_minutes: meters != null ? routeEtaMinutes(meters) : null,
          };
        });
        const { error: insertError } = await supabase.from('field_route_stops').insert(rows);
        if (insertError) throw insertError;
      }

      await logAudit({
        route_id: savedRoute.id,
        action: payload.source === 'suggested' ? 'suggested_route_saved' : 'manual_route_saved',
        details: { stops: payload.stops.length, priorityMode: payload.priorityMode },
      });

      return savedRoute;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['field_routes'] });
      queryClient.invalidateQueries({ queryKey: ['field_route_stops'] });
      queryClient.invalidateQueries({ queryKey: ['field_route_audit_logs'] });
    },
  });

  const updateStops = useMutation({
    mutationFn: async (stops: FieldRouteStopWithClient[]) => {
      if (!route?.id) throw new Error('Nenhuma rota ativa');
      for (const [index, stop] of stops.entries()) {
        const { error } = await supabase
          .from('field_route_stops')
          .update({ position: index + 1 })
          .eq('id', stop.id);
        if (error) throw error;
      }
      await logAudit({ route_id: route.id, action: 'route_reordered', details: { stops: stops.length } });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['field_route_stops'] }),
  });

  const removeStop = useMutation({
    mutationFn: async (stop: FieldRouteStopWithClient) => {
      const { error } = await supabase
        .from('field_route_stops')
        .update({ status: 'removed' })
        .eq('id', stop.id);
      if (error) throw error;
      await logAudit({
        route_id: stop.route_id,
        stop_id: stop.id,
        client_id: stop.client_id,
        action: 'stop_removed',
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['field_route_stops'] }),
  });

  const markStopDone = useMutation({
    mutationFn: async (stop: FieldRouteStopWithClient) => {
      const { error } = await supabase
        .from('field_route_stops')
        .update({ status: 'done' })
        .eq('id', stop.id);
      if (error) throw error;
      await logAudit({
        route_id: stop.route_id,
        stop_id: stop.id,
        client_id: stop.client_id,
        action: 'stop_done',
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['field_route_stops'] }),
  });

  const saveGoal = useMutation({
    mutationFn: async (goal: Omit<SellerGoal, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => {
      const { data, error } = await supabase
        .from('seller_goals')
        .upsert({ ...goal, created_by: user?.id ?? null }, { onConflict: 'seller_id,period_start,period_end' })
        .select()
        .single();
      if (error) throw error;
      return data as SellerGoal;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['seller_goals'] }),
  });

  return {
    route,
    stops: stopsQuery.data ?? [],
    goals: goalsQuery.data ?? [],
    auditLogs: auditQuery.data ?? [],
    profiles: profilesQuery.data ?? [],
    isLoading: routesQuery.isLoading || stopsQuery.isLoading,
    saveRoute,
    updateStops,
    removeStop,
    markStopDone,
    saveGoal,
  };
}
