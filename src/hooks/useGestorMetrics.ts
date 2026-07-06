import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';

export type GestorPeriod = '7d' | '30d' | 'all';

// Lead individual por trás de um número do painel — alimenta o modal
// "quais leads compõem esse dado" quando o gestor toca numa métrica.
export interface MetricLead {
  client_id: string;
  name: string;          // empresa || nome
  status: string | null;
  at: string | null;     // data relevante da ação (criação, visita, reunião...)
}

export type SellerMetricKey =
  | 'created'
  | 'visited'
  | 'meetings'
  | 'follow_ups'
  | 'stage_changes'
  | 'notes'
  | 'assigned';

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
  meetings_scheduled: number;   // client_meetings.type='reuniao', created_by = seller_id, no periodo
  follow_ups_scheduled: number; // client_meetings.type='follow_up', created_by = seller_id, no periodo
  stage_changes: number;        // client_stage_changes.created_by = seller_id e created_at no periodo
  notes_created: number;        // client_notes.created_by = seller_id e created_at no periodo

  // Leads por trás de cada contagem acima — mesma ordem de chegada dos loops.
  details: Record<SellerMetricKey, MetricLead[]>;
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
  follow_ups_in_period: number;
  stage_changes_in_period: number;
  notes_in_period: number;
}

export type GlobalMetricKey =
  | 'created'
  | 'visited'
  | 'meetings'
  | 'follow_ups'
  | 'stage_changes'
  | 'notes';

export interface GestorMetricsResult {
  global: GlobalMetrics;
  // Leads por trás dos cards globais de atividade + snapshot por status.
  globalDetails: Record<GlobalMetricKey, MetricLead[]> & {
    by_status: Record<string, MetricLead[]>;
    all: MetricLead[];
  };
  sellers: SellerMetrics[];
}

// Usuários de sistema/automação que não devem aparecer no ranking de
// vendedores (ex.: conta "RPA" que cria leads em massa via automação).
// Casa como palavra isolada em full_name ou email ("RPA", "rpa@takeat.app").
const HIDDEN_SELLER_PATTERN = /\brpa\b/i;
function isHiddenSeller(s: { full_name: string | null; email: string | null }): boolean {
  return HIDDEN_SELLER_PATTERN.test(s.full_name ?? '') || HIDDEN_SELLER_PATTERN.test(s.email ?? '');
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
      // listas similares em outras telas. nome/empresa entram pra alimentar
      // os modais de "quais leads compõem esse número".
      const clients = await fetchAll<{
        id: string;
        nome: string | null;
        empresa: string | null;
        status: string;
        vendedor_id_hubspot: string | null;
        created_by: string | null;
        created_at: string | null;
        visited_by: string | null;
        visited_at: string | null;
      }>(() =>
        supabase
          .from('clients')
          .select('id, nome, empresa, status, vendedor_id_hubspot, created_by, created_at, visited_by, visited_at'),
      );

      // Reunioes + follow ups no periodo: created_by + created_at + type.
      // Ambos vivem em client_meetings; separamos pelo `type`.
      let meetingsQuery = supabase
        .from('client_meetings')
        .select('id, client_id, created_by, created_at, scheduled_at, type');
      if (cutoff) meetingsQuery = meetingsQuery.gte('created_at', cutoff);
      const meetings = await fetchAll<{
        client_id: string;
        created_by: string | null;
        created_at: string;
        scheduled_at: string | null;
        type: string | null;
      }>(() => meetingsQuery);

      // Mudancas de etapa no periodo.
      let stageQuery = supabase
        .from('client_stage_changes')
        .select('id, client_id, created_by, created_at');
      if (cutoff) stageQuery = stageQuery.gte('created_at', cutoff);
      const stageChanges = await fetchAll<{ client_id: string; created_by: string | null; created_at: string }>(
        () => stageQuery,
      );

      // Notas no periodo.
      let notesQuery = supabase
        .from('client_notes')
        .select('id, client_id, created_by, created_at');
      if (cutoff) notesQuery = notesQuery.gte('created_at', cutoff);
      const notes = await fetchAll<{ client_id: string; created_by: string | null; created_at: string }>(
        () => notesQuery,
      );

      // Indexa profiles por id_hubspot pra resolver leads_assigned.
      // Cada vendedor com id_hubspot vira uma linha; vendedores SEM id_hubspot
      // ainda aparecem se tiverem feito alguma atividade (created/visited/etc).
      const profileById = new Map(profiles.map(p => [p.id, p]));
      const profileByHubspot = new Map<string, typeof profiles[number]>();
      for (const p of profiles) {
        if (p.id_hubspot) profileByHubspot.set(p.id_hubspot, p);
      }

      // Resolve o "cara" por trás de um client_id nos modais.
      const clientById = new Map(clients.map(c => [c.id, c]));
      const toMetricLead = (clientId: string, at: string | null): MetricLead => {
        const c = clientById.get(clientId);
        return {
          client_id: clientId,
          name: c ? (c.empresa?.trim() || c.nome?.trim() || 'Sem nome') : 'Lead removido',
          status: c?.status ?? null,
          at,
        };
      };

      // Agregacoes por seller_id (auth.users.id).
      const emptyDetails = (): Record<SellerMetricKey, MetricLead[]> => ({
        created: [],
        visited: [],
        meetings: [],
        follow_ups: [],
        stage_changes: [],
        notes: [],
        assigned: [],
      });

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
        follow_ups_scheduled: 0,
        stage_changes: 0,
        notes_created: 0,
        details: emptyDetails(),
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
        follow_ups_in_period: 0,
        stage_changes_in_period: 0,
        notes_in_period: 0,
      };

      const globalDetails: GestorMetricsResult['globalDetails'] = {
        created: [],
        visited: [],
        meetings: [],
        follow_ups: [],
        stage_changes: [],
        notes: [],
        by_status: {},
        all: [],
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

        const asLead = toMetricLead(c.id, c.created_at);
        globalDetails.all.push(asLead);
        if (c.status) {
          (globalDetails.by_status[c.status] ??= []).push(asLead);
        }

        // leads_assigned + status_breakdown por vendedor
        if (c.vendedor_id_hubspot) {
          const sellerProfile = profileByHubspot.get(c.vendedor_id_hubspot);
          if (sellerProfile) {
            const m = sellersMap.get(sellerProfile.id)!;
            m.leads_assigned++;
            m.status_breakdown[c.status] = (m.status_breakdown[c.status] ?? 0) + 1;
            m.details.assigned.push(asLead);
          }
        }

        // created_by no periodo
        if (c.created_by && inPeriod(c.created_at)) {
          global.created_in_period++;
          globalDetails.created.push(asLead);
          let m = sellersMap.get(c.created_by);
          if (!m) {
            const p = profileById.get(c.created_by);
            if (p) {
              m = initMetrics(p);
              sellersMap.set(c.created_by, m);
            }
          }
          if (m) {
            m.created++;
            m.details.created.push(asLead);
          }
        }

        // visited_by no periodo
        if (c.visited_by && inPeriod(c.visited_at)) {
          global.visited_in_period++;
          const visitedLead = toMetricLead(c.id, c.visited_at);
          globalDetails.visited.push(visitedLead);
          let m = sellersMap.get(c.visited_by);
          if (!m) {
            const p = profileById.get(c.visited_by);
            if (p) {
              m = initMetrics(p);
              sellersMap.set(c.visited_by, m);
            }
          }
          if (m) {
            m.visited++;
            m.details.visited.push(visitedLead);
          }
        }
      }

      for (const m of meetings) {
        if (!m.created_by) continue;
        const isFollowUp = m.type === 'follow_up';
        // Data mostrada no modal: quando a reunião VAI acontecer (scheduled_at);
        // a contagem continua sendo por created_at (agendou no período).
        const lead = toMetricLead(m.client_id, m.scheduled_at ?? m.created_at);
        if (isFollowUp) {
          global.follow_ups_in_period++;
          globalDetails.follow_ups.push(lead);
        } else {
          global.meetings_in_period++;
          globalDetails.meetings.push(lead);
        }
        let s = sellersMap.get(m.created_by);
        if (!s) {
          const p = profileById.get(m.created_by);
          if (p) {
            s = initMetrics(p);
            sellersMap.set(m.created_by, s);
          }
        }
        if (s) {
          if (isFollowUp) {
            s.follow_ups_scheduled++;
            s.details.follow_ups.push(lead);
          } else {
            s.meetings_scheduled++;
            s.details.meetings.push(lead);
          }
        }
      }

      for (const sc of stageChanges) {
        if (!sc.created_by) continue;
        global.stage_changes_in_period++;
        const lead = toMetricLead(sc.client_id, sc.created_at);
        globalDetails.stage_changes.push(lead);
        let s = sellersMap.get(sc.created_by);
        if (!s) {
          const p = profileById.get(sc.created_by);
          if (p) {
            s = initMetrics(p);
            sellersMap.set(sc.created_by, s);
          }
        }
        if (s) {
          s.stage_changes++;
          s.details.stage_changes.push(lead);
        }
      }

      for (const n of notes) {
        if (!n.created_by) continue;
        global.notes_in_period++;
        const lead = toMetricLead(n.client_id, n.created_at);
        globalDetails.notes.push(lead);
        let s = sellersMap.get(n.created_by);
        if (!s) {
          const p = profileById.get(n.created_by);
          if (p) {
            s = initMetrics(p);
            sellersMap.set(n.created_by, s);
          }
        }
        if (s) {
          s.notes_created++;
          s.details.notes.push(lead);
        }
      }

      // Ordena: mais ativos primeiro (visited + created como proxy de campo).
      // Contas de automação (RPA) ficam fora do ranking — os totais globais
      // continuam contando a atividade delas.
      const sellers = Array.from(sellersMap.values())
        .filter(s => !isHiddenSeller(s))
        .sort((a, b) => {
          const aScore = a.visited * 3 + a.created * 2 + a.meetings_scheduled + a.follow_ups_scheduled + a.stage_changes + a.notes_created;
          const bScore = b.visited * 3 + b.created * 2 + b.meetings_scheduled + b.follow_ups_scheduled + b.stage_changes + b.notes_created;
          if (bScore !== aScore) return bScore - aScore;
          const an = a.full_name ?? a.email ?? '';
          const bn = b.full_name ?? b.email ?? '';
          return an.localeCompare(bn, 'pt-BR');
        });

      return { global, globalDetails, sellers };
    },
  });
}
