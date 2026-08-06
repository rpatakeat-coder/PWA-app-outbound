import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';

// Alimenta o mapa de calor do gestor: todos os check-ins com GPS + a lista de
// vendedores derivada dos proprios pontos (so aparece quem tem visita). O RLS
// de client_visits libera SELECT pra qualquer autenticado (USING true), mas a
// camada so e' exposta ao gestor na UI.

export interface VisitPoint {
  lat: number;
  lon: number;
  sellerId: string | null; // visited_by (auth uid); null em visitas antigas
  sellerName: string | null; // visited_by_name (snapshot do nome na hora)
}

export interface VisitSeller {
  id: string;
  name: string;
  count: number;
}

// PostgREST corta em 1000 linhas por request — paginamos via .range() ate
// acabar. MAX_POINTS e' um teto de seguranca (ordenado por mais recente, entao
// se estourar ficamos com as visitas recentes); evita puxar a tabela inteira
// pro celular caso ela cresca muito.
const PAGE = 1000;
const MAX_POINTS = 8000;

export function useVisitsHeatmap(enabled: boolean) {
  const query = useQuery({
    queryKey: ['visits_heatmap'],
    queryFn: async () => {
      const points: VisitPoint[] = [];
      let from = 0;
      let capped = false;

      for (;;) {
        const { data, error } = await supabase
          .from('client_visits')
          .select('visited_at_lat, visited_at_lon, visited_by, visited_by_name, visited_at')
          .not('visited_at_lat', 'is', null)
          .not('visited_at_lon', 'is', null)
          .order('visited_at', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;

        const rows = (data ?? []) as {
          visited_at_lat: number | string;
          visited_at_lon: number | string;
          visited_by: string | null;
          visited_by_name: string | null;
        }[];

        for (const r of rows) {
          points.push({
            lat: Number(r.visited_at_lat),
            lon: Number(r.visited_at_lon),
            sellerId: r.visited_by ?? null,
            sellerName: r.visited_by_name ?? null,
          });
        }

        if (rows.length < PAGE) break;
        from += PAGE;
        if (points.length >= MAX_POINTS) {
          capped = true;
          break;
        }
      }

      // Vendedores derivados dos proprios pontos (id = visited_by, nome =
      // visited_by_name que ja vem na linha). So aparece quem tem visita.
      const acc = new Map<string, VisitSeller>();
      for (const p of points) {
        if (!p.sellerId) continue;
        const cur = acc.get(p.sellerId);
        if (cur) cur.count += 1;
        else acc.set(p.sellerId, { id: p.sellerId, name: p.sellerName?.trim() || 'Sem nome', count: 1 });
      }
      const sellers: VisitSeller[] = [...acc.values()].sort((a, b) => b.count - a.count);

      return { points, sellers, capped };
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  return {
    points: query.data?.points ?? [],
    sellers: query.data?.sellers ?? [],
    capped: query.data?.capped ?? false,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
