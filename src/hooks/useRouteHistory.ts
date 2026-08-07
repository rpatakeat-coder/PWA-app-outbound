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
  km: number; // soma das distâncias das paradas
  min: number; // soma dos tempos estimados das paradas
}

// Agregado do período (topo da seção).
export interface RouteHistorySummary {
  rotas: number; // dias com rota planejada
  paradas: number; // total de paradas
  concluidas: number; // paradas marcadas como concluídas
  pct: number; // concluidas / paradas (0..100)
  checkins: number; // total de check-ins reais
  km: number;
  min: number;
}

export interface RouteHistoryResult {
  days: RouteHistoryDay[];
  summary: RouteHistorySummary;
}

const nameOf = (c: any): string => {
  const cl = Array.isArray(c) ? c[0] : c;
  return (cl?.empresa?.trim() || cl?.nome || 'Sem nome') as string;
};
const cityOf = (c: any): string | null => {
  const cl = Array.isArray(c) ? c[0] : c;
  return (cl?.cidade ?? null) as string | null;
};

// ===== Ranking: agrega vários vendedores no período (1 query cada) =====
export interface RankingRow {
  sellerId: string;
  rotas: number;
  paradas: number;
  concluidas: number;
  pct: number;
  checkins: number;
  km: number;
  min: number;
}

export function useRouteRanking(
  sellerIds: string[],
  range: { start: string | null; end: string | null },
  enabled: boolean,
) {
  return useQuery<RankingRow[]>({
    queryKey: ['route_ranking', [...sellerIds].sort().join(','), range.start, range.end],
    queryFn: async () => {
      if (sellerIds.length === 0) return [];
      const startDate = range.start ? range.start.slice(0, 10) : '2000-01-01';
      const endDate = range.end ? range.end.slice(0, 10) : new Date().toISOString().slice(0, 10);
      const startISO = range.start ?? new Date(0).toISOString();
      const endISO = range.end ?? new Date().toISOString();

      const { data: routes, error: rErr } = await supabase
        .from('field_routes')
        .select('seller_id, field_route_stops(status, distance_meters, estimated_drive_minutes)')
        .in('seller_id', sellerIds)
        .gte('route_date', startDate)
        .lte('route_date', endDate);
      if (rErr) throw rErr;

      const { data: visits, error: vErr } = await supabase
        .from('client_visits')
        .select('visited_by')
        .in('visited_by', sellerIds)
        .gte('visited_at', startISO)
        .lte('visited_at', endISO);
      if (vErr) throw vErr;

      const acc = new Map<string, RankingRow>();
      const row = (id: string) => {
        if (!acc.has(id)) acc.set(id, { sellerId: id, rotas: 0, paradas: 0, concluidas: 0, pct: 0, checkins: 0, km: 0, min: 0 });
        return acc.get(id)!;
      };
      for (const r of (routes ?? []) as any[]) {
        const stops = (r.field_route_stops ?? []).filter((s: any) => s.status !== 'removed');
        const rr = row(r.seller_id);
        if (stops.length > 0) rr.rotas += 1;
        rr.paradas += stops.length;
        rr.concluidas += stops.filter((s: any) => s.status === 'done').length;
        rr.km += stops.reduce((a: number, s: any) => a + (Number(s.distance_meters) || 0), 0) / 1000;
        rr.min += stops.reduce((a: number, s: any) => a + (Number(s.estimated_drive_minutes) || 0), 0);
      }
      for (const v of (visits ?? []) as any[]) row(v.visited_by).checkins += 1;
      for (const id of sellerIds) row(id); // inclui selecionados sem atividade

      return [...acc.values()]
        .map((r) => ({ ...r, pct: r.paradas > 0 ? Math.round((r.concluidas / r.paradas) * 100) : 0 }))
        .sort((a, b) => b.pct - a.pct || b.checkins - a.checkins || b.paradas - a.paradas);
    },
    enabled: enabled && sellerIds.length > 0,
    staleTime: 60 * 1000,
  });
}

export function useRouteHistory(
  sellerId: string | null,
  range: { start: string | null; end: string | null },
  enabled: boolean,
) {
  return useQuery<RouteHistoryResult>({
    queryKey: ['route_history', sellerId, range.start, range.end],
    queryFn: async () => {
      const empty: RouteHistoryResult = {
        days: [],
        summary: { rotas: 0, paradas: 0, concluidas: 0, pct: 0, checkins: 0, km: 0, min: 0 },
      };
      if (!sellerId) return empty;

      const startDate = range.start ? range.start.slice(0, 10) : '2000-01-01';
      const endDate = range.end ? range.end.slice(0, 10) : new Date().toISOString().slice(0, 10);
      const startISO = range.start ?? new Date(0).toISOString();
      const endISO = range.end ?? new Date().toISOString();

      // Rotas planejadas + paradas.
      const { data: routes, error: rErr } = await supabase
        .from('field_routes')
        .select('id, route_date, source, field_route_stops(status, position, distance_meters, estimated_drive_minutes, client:clients(nome, empresa))')
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
        if (!byDay.has(d)) byDay.set(d, { date: d, routeSource: null, stops: [], visits: [], km: 0, min: 0 });
        return byDay.get(d)!;
      };

      for (const r of (routes ?? []) as any[]) {
        const day = dayOf(String(r.route_date));
        day.routeSource = r.source ?? null;
        const raw = (r.field_route_stops ?? []).filter((s: any) => s.status !== 'removed');
        day.stops = raw
          .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
          .map((s: any) => ({ nome: nameOf(s.client), done: s.status === 'done', position: s.position ?? 0 }));
        day.km = raw.reduce((sum: number, s: any) => sum + (Number(s.distance_meters) || 0), 0) / 1000;
        day.min = raw.reduce((sum: number, s: any) => sum + (Number(s.estimated_drive_minutes) || 0), 0);
      }

      for (const v of (visits ?? []) as any[]) {
        const d = String(v.visited_at).slice(0, 10);
        dayOf(d).visits.push({ at: v.visited_at, nome: nameOf(v.client), cidade: cityOf(v.client) });
      }

      const days = [...byDay.values()].sort((a, b) => (a.date < b.date ? 1 : -1));

      // Agregado do período.
      const paradas = days.reduce((s, d) => s + d.stops.length, 0);
      const concluidas = days.reduce((s, d) => s + d.stops.filter((x) => x.done).length, 0);
      const summary: RouteHistorySummary = {
        rotas: days.filter((d) => d.stops.length > 0).length,
        paradas,
        concluidas,
        pct: paradas > 0 ? Math.round((concluidas / paradas) * 100) : 0,
        checkins: days.reduce((s, d) => s + d.visits.length, 0),
        km: days.reduce((s, d) => s + d.km, 0),
        min: days.reduce((s, d) => s + d.min, 0),
      };

      return { days, summary };
    },
    enabled: enabled && !!sellerId,
    staleTime: 60 * 1000,
  });
}
