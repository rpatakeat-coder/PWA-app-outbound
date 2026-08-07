import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';

// Histórico de rotas do gestor: pra um vendedor + período, junta a rota
// PLANEJADA (field_routes/stops, com concluídas) e as VISITAS REAIS (check-ins
// client_visits) por dia. RLS: gestor (is_field_admin) lê as rotas; client_visits
// é USING(true). Só a aba Gestor (gestor) usa isto.

export interface HistoryStop {
  nome: string;
  done: boolean;
  position: number;
}
export interface HistoryVisit {
  at: string; // ISO
  nome: string;
  cidade: string | null;
}
export interface RouteHistoryDay {
  date: string; // YYYY-MM-DD (UTC, igual ao route_date)
  routeSource: string | null; // 'suggested' | 'manual' | null
  stops: HistoryStop[];
  visits: HistoryVisit[];
}

const nameOf = (c: any): string => {
  const cl = Array.isArray(c) ? c[0] : c;
  return (cl?.empresa?.trim() || cl?.nome || 'Sem nome') as string;
};
const cityOf = (c: any): string | null => {
  const cl = Array.isArray(c) ? c[0] : c;
  return (cl?.cidade ?? null) as string | null;
};

export function useRouteHistory(
  sellerId: string | null,
  range: { start: string | null; end: string | null },
  enabled: boolean,
) {
  return useQuery<RouteHistoryDay[]>({
    queryKey: ['route_history', sellerId, range.start, range.end],
    queryFn: async () => {
      if (!sellerId) return [];

      const startDate = range.start ? range.start.slice(0, 10) : '2000-01-01';
      const endDate = range.end ? range.end.slice(0, 10) : new Date().toISOString().slice(0, 10);
      const startISO = range.start ?? new Date(0).toISOString();
      const endISO = range.end ?? new Date().toISOString();

      // Rotas planejadas + paradas.
      const { data: routes, error: rErr } = await supabase
        .from('field_routes')
        .select('id, route_date, source, field_route_stops(status, position, client:clients(nome, empresa))')
        .eq('seller_id', sellerId)
        .gte('route_date', startDate)
        .lte('route_date', endDate)
        .order('route_date', { ascending: false });
      if (rErr) throw rErr;

      // Visitas reais (check-ins).
      const { data: visits, error: vErr } = await supabase
        .from('client_visits')
        .select('visited_at, client:clients(nome, empresa, cidade)')
        .eq('visited_by', sellerId)
        .gte('visited_at', startISO)
        .lte('visited_at', endISO)
        .order('visited_at', { ascending: false });
      if (vErr) throw vErr;

      const byDay = new Map<string, RouteHistoryDay>();
      const dayOf = (d: string) => {
        if (!byDay.has(d)) byDay.set(d, { date: d, routeSource: null, stops: [], visits: [] });
        return byDay.get(d)!;
      };

      for (const r of (routes ?? []) as any[]) {
        const day = dayOf(String(r.route_date));
        day.routeSource = r.source ?? null;
        const stops = (r.field_route_stops ?? [])
          .filter((s: any) => s.status !== 'removed')
          .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
          .map((s: any) => ({ nome: nameOf(s.client), done: s.status === 'done', position: s.position ?? 0 }));
        day.stops = stops;
      }

      for (const v of (visits ?? []) as any[]) {
        const d = String(v.visited_at).slice(0, 10);
        dayOf(d).visits.push({ at: v.visited_at, nome: nameOf(v.client), cidade: cityOf(v.client) });
      }

      return [...byDay.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
    },
    enabled: enabled && !!sellerId,
    staleTime: 60 * 1000,
  });
}
