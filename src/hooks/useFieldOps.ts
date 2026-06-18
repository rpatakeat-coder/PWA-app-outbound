import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import type { Client, FieldRoute, FieldRouteStopWithClient } from '../types/client';

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

// Bearing (azimute) entre dois pontos em graus (0..360, 0=norte).
// Usado pra calcular pra onde o usuario esta indo a partir do movimento
// — independente de como ele esta segurando o celular.
export const bearingDegrees = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const φ1 = toRad(aLat);
  const φ2 = toRad(bLat);
  const λ1 = toRad(aLon);
  const λ2 = toRad(bLon);
  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
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
  const { user, isAuthenticated } = useAuth();

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

      return savedRoute;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['field_routes'] });
      queryClient.invalidateQueries({ queryKey: ['field_route_stops'] });
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
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['field_route_stops'] }),
  });

  // Alterna status entre 'done' e 'planned' — usado pelo checkbox da lista
  // de stops, pra permitir desfazer um marcado por engano.
  const toggleStopDone = useMutation({
    mutationFn: async (stop: FieldRouteStopWithClient) => {
      const nextStatus = stop.status === 'done' ? 'planned' : 'done';
      const { error } = await supabase
        .from('field_route_stops')
        .update({ status: nextStatus })
        .eq('id', stop.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['field_route_stops'] }),
  });

  return {
    route,
    stops: stopsQuery.data ?? [],
    isLoading: routesQuery.isLoading || stopsQuery.isLoading,
    saveRoute,
    updateStops,
    removeStop,
    markStopDone,
    toggleStopDone,
  };
}
