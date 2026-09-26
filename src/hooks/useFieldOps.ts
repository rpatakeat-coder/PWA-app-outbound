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
  stops: Array<{ client: Client; distance_meters?: number | null; mandatory_reason?: string | null }>;
};

// sellerId: de quem carregar a rota. Default = usuario logado. O gestor passa o
// auth uid de OUTRO vendedor pra monitorar a rota dele (o RLS de field_routes
// libera o admin a ler qualquer uma). Sem o filtro por seller_id, o gestor
// (que ve todas via RLS) pegava a rota mais recente de qualquer vendedor.
export function useFieldOps(routeDate = todayKey(), enabled = true, sellerId?: string | null) {
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const targetSeller = sellerId ?? user?.id ?? null;

  const routesQuery = useQuery<FieldRoute[]>({
    queryKey: ['field_routes', routeDate, targetSeller],
    queryFn: async () => {
      let q = supabase.from('field_routes').select('*').eq('route_date', routeDate);
      if (targetSeller) q = q.eq('seller_id', targetSeller);
      const { data, error } = await q.order('created_at', { ascending: false });
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
            mandatory_reason: stop.mandatory_reason ?? null,
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

  // Check-in num lead fora do plano vira parada, já feita, no FIM da rota de
  // hoje (prompt final §5 "Rota = fila viva" e §8.2.4). Insere UMA linha: o
  // saveRoute apaga e regrava todas as paradas, e com isso zerava as já feitas.
  // Sem rota hoje, cria a do dia (mesmo upsert do saveRoute). Só na própria
  // rota: quem monitora a de outro vendedor não mexe nela.
  // Mesmo insert de UMA linha, com o status escolhido: 'done' no check-in fora
  // do plano, 'planned' no "+ Rota de hoje" do mapa novo.
  const inserirParada = async (client: Client, status: 'done' | 'planned') => {
      if (!user?.id || targetSeller !== user.id) return null;
      let rotaId = route?.id ?? null;
      if (!rotaId) {
        const { data: rota, error } = await supabase
          .from('field_routes')
          .upsert({
            seller_id: user.id,
            route_date: routeDate,
            title: 'Rota do dia',
            status: 'planned',
            source: 'manual',
            priority_mode: 'manual',
            created_by: user.id,
          }, { onConflict: 'seller_id,route_date' })
          .select()
          .single();
        if (error) throw error;
        rotaId = (rota as FieldRoute).id;
      }
      const { data: atuais, error: erroAtuais } = await supabase
        .from('field_route_stops')
        .select('client_id, position, status')
        .eq('route_id', rotaId);
      if (erroAtuais) throw erroAtuais;
      const linhas = (atuais ?? []) as Array<{ client_id: string; position: number; status: string }>;
      if (linhas.some((l) => l.client_id === client.id && l.status !== 'removed')) return null;
      const posicao = linhas.reduce((m, l) => Math.max(m, l.position ?? 0), 0) + 1;
      const { error } = await supabase.from('field_route_stops').insert({
        route_id: rotaId,
        client_id: client.id,
        position: posicao,
        planned_at: new Date().toISOString(),
        status,
      });
      if (error) throw error;
      return posicao;
  };
  const invalidarRota = () => {
    queryClient.invalidateQueries({ queryKey: ['field_routes'] });
    queryClient.invalidateQueries({ queryKey: ['field_route_stops'] });
  };
  const adicionarParadaFeita = useMutation({ mutationFn: (client: Client) => inserirParada(client, 'done'), onSuccess: invalidarRota });
  const adicionarParada = useMutation({ mutationFn: (client: Client) => inserirParada(client, 'planned'), onSuccess: invalidarRota });

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
    adicionarParadaFeita,
    adicionarParada,
    markStopDone,
    toggleStopDone,
  };
}
