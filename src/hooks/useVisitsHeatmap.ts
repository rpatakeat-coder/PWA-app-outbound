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
  at: string | null; // visited_at (data/hora da visita, ISO)
  cidade: string | null; // do lead (clients.cidade, via client_id)
  bairro: string | null; // do lead (clients.bairro, via client_id)
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
          // cidade/bairro vem do lead (embed clients via client_id). RLS de
          // clients aplica no embed — ok, o heatmap so' roda pro gestor.
          .select('visited_at_lat, visited_at_lon, visited_by, visited_by_name, visited_at, client:clients(cidade, bairro)')
          .not('visited_at_lat', 'is', null)
          .not('visited_at_lon', 'is', null)
          // Visita declarada (0109) guarda o GPS de onde o executivo ESTAVA,
          // longe do lead: na mancha ela pintaria o lugar errado.
          .eq('declarada', false)
          .order('visited_at', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;

        const rows = (data ?? []) as {
          visited_at_lat: number | string;
          visited_at_lon: number | string;
          visited_by: string | null;
          visited_by_name: string | null;
          visited_at: string | null;
          client: { cidade: string | null; bairro: string | null } | { cidade: string | null; bairro: string | null }[] | null;
        }[];

        for (const r of rows) {
          // Embed to-one pode vir como objeto ou array (1 elemento) conforme a versao.
          const c = Array.isArray(r.client) ? r.client[0] : r.client;
          points.push({
            lat: Number(r.visited_at_lat),
            lon: Number(r.visited_at_lon),
            sellerId: r.visited_by ?? null,
            sellerName: r.visited_by_name ?? null,
            at: r.visited_at ?? null,
            cidade: c?.cidade ?? null,
            bairro: c?.bairro ?? null,
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

      // Lente Calor do mapa novo (prompt final §5): nome do CADASTRO e o apelido
      // antigo ("Wericles Andrade · era 'Whell Andrade'"), e quantos check-ins dos
      // últimos 30 dias não têm GPS no local (declarados ou sem coordenada) —
      // ficam fora da mancha, e a tela diz quantos. Falha aqui não derruba o
      // calor: some só o complemento.
      const nomes: Record<string, { nome: string; apelidos: string[] }> = {};
      let semGps30d: number | null = null;
      try {
        const ids = [...acc.keys()];
        const desde = new Date(Date.now() - 30 * 86400000).toISOString();
        const [perfis, apelidos, semGps] = await Promise.all([
          ids.length ? supabase.from('profiles').select('id, full_name').in('id', ids) : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
          ids.length ? supabase.from('vendedor_apelido').select('profile_id, apelido').in('profile_id', ids) : Promise.resolve({ data: [] as { profile_id: string; apelido: string }[] }),
          supabase.from('client_visits').select('id', { count: 'exact', head: true })
            .gte('visited_at', desde).or('declarada.eq.true,visited_at_lat.is.null'),
        ]);
        for (const p of (perfis.data ?? []) as { id: string; full_name: string | null }[]) {
          nomes[p.id] = { nome: (p.full_name ?? '').replace(/\s*\/\s*DESATIVADO\s*$/i, '').trim() || 'Sem nome', apelidos: [] };
        }
        for (const a of (apelidos.data ?? []) as { profile_id: string; apelido: string }[]) {
          const n = nomes[a.profile_id];
          if (n && a.apelido && a.apelido.trim().toLowerCase() !== n.nome.toLowerCase()) n.apelidos.push(a.apelido.trim());
        }
        semGps30d = typeof semGps.count === 'number' ? semGps.count : null;
      } catch { /* complemento opcional */ }

      return { points, sellers, capped, nomes, semGps30d };
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  return {
    points: query.data?.points ?? [],
    sellers: query.data?.sellers ?? [],
    capped: query.data?.capped ?? false,
    nomes: query.data?.nomes ?? {},
    semGps30d: query.data?.semGps30d ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
