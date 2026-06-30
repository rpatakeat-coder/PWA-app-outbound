import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';

export type GestorPeriod = '7d' | '30d' | 'all';

export interface SellerMetrics {
  // Identificacao
  seller_id: string;            // auth.users.id (mesmo de profiles.id)
  full_name: string | null;
  email: string | null;
  id_hubspot: string | null;
  sector: string | null;

  // Snapshot atual (independente do periodo)
  leads_assigned: number;       // clients.vendedor_id_hubspot = id_hubspot
  status_breakdown: Record<string, number>;

  // Atividade no periodo
  created: number;              // clients.created_by = seller_id e created_at no periodo
  visited: number;              // clients.visited_by = seller_id e visited_at no periodo
  meetings_scheduled: number;   // client_meetings.created_by = seller_id e created_at no periodo
  stage_changes: number;        // client_stage_changes.created_by = seller_id e created_at no periodo
}

export interface GlobalMetrics {
  total_clients: number;
  total_leads: number;          // status = 'lead'
  total_visited: number;        // status = 'lead_visitado'
  total_active_clients: number; // status = 'cliente'
  total_churn: number;          // status = 'churn'
  created_in_period: number;
  visited_in_period: number;
  meetings_in_period: number;
  stage_changes_in_period: number;
}

export interface GestorMetricsResult {
  global: GlobalMetrics;
  sellers: SellerMetrics[];
}

function periodCutoff(period: GestorPeriod): string | null {
  if (period === 'all') return null;
  const days = period === '7d' ? 7 : 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return cutoff.toISOString();
}

// Pagina .select() para escapar do cap default de 1000 do PostgREST.
async function fetchAll<T = any>(
  build: () => any,
): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export function useGestorMetrics(period: GestorPeriod, enabled: boolean) {
  return useQuery<GestorMetricsResult>({
    queryKey: ['gestor-metrics', period],
    enabled,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const cutoff = periodCutoff(period);

      // Vendedores conhecidos: profiles. Admin tem RLS pra ler todos.
      const profiles = await fetchAll<{
        id: string;
        full_name: string | null;
        email: string | null;
        id_hubspot: string | null;
        sector: string | null;
      }>(() =>
        supabase
          .from('profiles')
          .select('id, full_name, email, id_hubspot, sector')
          .order('full_name', { ascending: true }),
      );

      // Snapshot completo de clients pra montar leads_assigned + status_breakdown.
      // status_breakdown depende de TODOS os status conhecidos, por isso
      // ressaltamos clients aqui mesmo sendo grande — o admin ja carrega
      // listas similares em outras telas.
      const clients = await fetchAll<{
        id: string;
        status: string;
        vendedor_id_hubspot: string | null;
        created_by: string | null;
        created_at: string | null;
        visited_by: string | null;
        visited_at: string | null;
      }>(() =>
        supabase
          .from('clients')
          .select('id, status, vendedor_id_hubspot, created_by, created_at, visited_by, visited_at'),
      );

      // Reunioes no periodo: created_by + created_at.
      let meetingsQuery = supabase
        .from('client_meetings')
        .select('id, created_by, created_at');
      if (cutoff) meetingsQuery = meetingsQuery.gte('created_at', cutoff);
      const meetings = await fetchAll<{ created_by: string | null; created_at: string }>(
        () => meetingsQuery,
      );

      // Mudancas de etapa no periodo.
      let stageQuery = supabase
        .from('client_stage_changes')
        .select('id, created_by, created_at');
      if (cutoff) stageQuery = stageQuery.gte('created_at', cutoff);
      const stageChanges = await fetchAll<{ created_by: string | null; created_at: string }>(
        () => stageQuery,
      );

      // Indexa profiles por id_hubspot pra resolver leads_assigned.
      // Cada vendedor com id_hubspot vira uma linha; vendedores SEM id_hubspot
      // ainda aparecem se tiverem feito alguma atividade (created/visited/etc).
      const profileById = new Map(profiles.map(p => [p.id, p]));
      const profileByHubspot = new Map<string, typeof profiles[number]>();
      for (const p of profiles) {
        if (p.id_hubspot) profileByHubspot.set(p.id_hubspot, p);
      }

      // Status conhecidos no resultado pra status_breakdown
      const allStatuses = new Set<string>();
      for (const c of clients) {
        if (c.status) allStatuses.add(c.status);
      }

      // Agregacoes por seller_id (auth.users.id).
      const initMetrics = (p: typeof profiles[number]): SellerMetrics => ({
        seller_id: p.id,
        full_name: p.full_name,
        email: p.email,
        id_hubspot: p.id_hubspot,
        sector: p.sector,
        leads_assigned: 0,
        status_breakdown: {},
        created: 0,
        visited: 0,
        meetings_scheduled: 0,
        stage_changes: 0,
      });

      const sellersMap = new Map<string, SellerMetrics>();
      for (const p of profiles) sellersMap.set(p.id, initMetrics(p));

      // Atividade global agregada
      const global: GlobalMetrics = {
        total_clients: clients.length,
        total_leads: 0,
        total_visited: 0,
        total_active_clients: 0,
        total_churn: 0,
        created_in_period: 0,
        visited_in_period: 0,
        meetings_in_period: 0,
        stage_changes_in_period: 0,
      };

      const cutoffMs = cutoff ? new Date(cutoff).getTime() : null;
      const inPeriod = (iso: string | null) => {
        if (!iso) return false;
        if (cutoffMs === null) return true;
        return new Date(iso).getTime() >= cutoffMs;
      };

      for (const c of clients) {
        // Totais globais de status
        if (c.status === 'lead') global.total_leads++;
        else if (c.status === 'lead_visitado') global.total_visited++;
        else if (c.status === 'cliente') global.total_active_clients++;
        else if (c.status === 'churn') global.total_churn++;

        // leads_assigned + status_breakdown por vendedor
        if (c.vendedor_id_hubspot) {
          const sellerProfile = profileByHubspot.get(c.vendedor_id_hubspot);
          if (sellerProfile) {
            const m = sellersMap.get(sellerProfile.id)!;
            m.leads_assigned++;
            m.status_breakdown[c.status] = (m.status_breakdown[c.status] ?? 0) + 1;
          }
        }

        // created_by no periodo
        if (c.created_by && inPeriod(c.created_at)) {
          global.created_in_period++;
          let m = sellersMap.get(c.created_by);
          if (!m) {
            const p = profileById.get(c.created_by);
            if (p) {
              m = initMetrics(p);
              sellersMap.set(c.created_by, m);
            }
          }
          if (m) m.created++;
        }

        // visited_by no periodo
        if (c.visited_by && inPeriod(c.visited_at)) {
          global.visited_in_period++;
          let m = sellersMap.get(c.visited_by);
          if (!m) {
            const p = profileById.get(c.visited_by);
            if (p) {
              m = initMetrics(p);
              sellersMap.set(c.visited_by, m);
            }
          }
          if (m) m.visited++;
        }
      }

      for (const m of meetings) {
        if (!m.created_by) continue;
        global.meetings_in_period++;
        let s = sellersMap.get(m.created_by);
        if (!s) {
          const p = profileById.get(m.created_by);
          if (p) {
            s = initMetrics(p);
            sellersMap.set(m.created_by, s);
          }
        }
        if (s) s.meetings_scheduled++;
      }

      for (const sc of stageChanges) {
        if (!sc.created_by) continue;
        global.stage_changes_in_period++;
        let s = sellersMap.get(sc.created_by);
        if (!s) {
          const p = profileById.get(sc.created_by);
          if (p) {
            s = initMetrics(p);
            sellersMap.set(sc.created_by, s);
          }
        }
        if (s) s.stage_changes++;
      }

      // Ordena: mais ativos primeiro (visited + created como proxy de campo).
      const sellers = Array.from(sellersMap.values()).sort((a, b) => {
        const aScore = a.visited * 3 + a.created * 2 + a.meetings_scheduled + a.stage_changes;
        const bScore = b.visited * 3 + b.created * 2 + b.meetings_scheduled + b.stage_changes;
        if (bScore !== aScore) return bScore - aScore;
        const an = a.full_name ?? a.email ?? '';
        const bn = b.full_name ?? b.email ?? '';
        return an.localeCompare(bn, 'pt-BR');
      });

      return { global, sellers };
    },
  });
}
