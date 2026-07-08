import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';

export type GestorPeriodPreset = 'today' | '7d' | '30d' | 'all' | 'custom';

export interface GestorPeriod {
  preset: GestorPeriodPreset;
  // Range absoluto (ISO) — usado apenas quando preset === 'custom'.
  startISO?: string | null;
  endISO?: string | null;
}

// Lead individual por trás de um número do painel — alimenta o modal
// "quais leads compõem esse dado" quando o gestor toca numa métrica.
export interface MetricLead {
  client_id: string;
  name: string;          // empresa || nome
  status: string | null;
  at: string | null;     // data relevante da ação (criação, visita, reunião...)
  note?: string | null;  // texto da nota, quando o item vem da métrica "Notas"
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
  created: number;
  visited: number;
  meetings_scheduled: number;
  follow_ups_scheduled: number;
  stage_changes: number;
  notes_created: number;
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
  sellers: SellerMetrics[];
}

// Usuários de sistema/automação que não devem aparecer no ranking de
// vendedores (ex.: conta "RPA" que cria leads em massa via automação).
const HIDDEN_SELLER_PATTERN = /\brpa\b/i;
function isHiddenSeller(s: { full_name: string | null; email: string | null }): boolean {
  return HIDDEN_SELLER_PATTERN.test(s.full_name ?? '') || HIDDEN_SELLER_PATTERN.test(s.email ?? '');
}

// Resolve o período em [start, end] ISO. end=null significa "até agora".
export function periodRange(period: GestorPeriod): { start: string | null; end: string | null } {
  switch (period.preset) {
    case 'all':
      return { start: null, end: null };
    case 'today': {
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { start: midnight.toISOString(), end: null };
    }
    case 'custom':
      return { start: period.startISO ?? null, end: period.endISO ?? null };
    default: {
      const days = period.preset === '7d' ? 7 : 30;
      return { start: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(), end: null };
    }
  }
}

// ============================================================================
// Métricas agregadas NO BANCO (RPC gestor_metrics). Antes o app baixava a
// tabela clients inteira (~4.7k linhas, 5 páginas) + meetings/stage/notes em
// série e agregava em JS a cada troca de filtro — daí a demora. Agora o
// Postgres devolve um JSON pequeno em ~20ms.
// ============================================================================
export function useGestorMetrics(period: GestorPeriod, enabled: boolean) {
  const { start, end } = periodRange(period);
  return useQuery<GestorMetricsResult>({
    queryKey: ['gestor-metrics', period.preset, start, end],
    enabled,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('gestor_metrics', {
        p_start: start,
        p_end: end,
      });
      if (error) throw error;

      const raw = (data ?? {}) as any;
      const global: GlobalMetrics = {
        total_clients: raw.global?.total_clients ?? 0,
        total_leads: raw.global?.total_leads ?? 0,
        total_visited: raw.global?.total_visited ?? 0,
        total_active_clients: raw.global?.total_active_clients ?? 0,
        total_churn: raw.global?.total_churn ?? 0,
        created_in_period: raw.global?.created_in_period ?? 0,
        visited_in_period: raw.global?.visited_in_period ?? 0,
        meetings_in_period: raw.global?.meetings_in_period ?? 0,
        follow_ups_in_period: raw.global?.follow_ups_in_period ?? 0,
        stage_changes_in_period: raw.global?.stage_changes_in_period ?? 0,
        notes_in_period: raw.global?.notes_in_period ?? 0,
      };

      const sellers: SellerMetrics[] = ((raw.sellers ?? []) as any[])
        .map((s) => ({
          seller_id: s.seller_id,
          full_name: s.full_name ?? null,
          email: s.email ?? null,
          id_hubspot: s.id_hubspot ?? null,
          sector: s.sector ?? null,
          leads_assigned: s.leads_assigned ?? 0,
          status_breakdown: (s.status_breakdown ?? {}) as Record<string, number>,
          created: s.created ?? 0,
          visited: s.visited ?? 0,
          meetings_scheduled: s.meetings_scheduled ?? 0,
          follow_ups_scheduled: s.follow_ups_scheduled ?? 0,
          stage_changes: s.stage_changes ?? 0,
          notes_created: s.notes_created ?? 0,
        }))
        .filter((s) => !isHiddenSeller(s))
        .sort((a, b) => {
          const aScore = a.visited * 3 + a.created * 2 + a.meetings_scheduled + a.follow_ups_scheduled + a.stage_changes + a.notes_created;
          const bScore = b.visited * 3 + b.created * 2 + b.meetings_scheduled + b.follow_ups_scheduled + b.stage_changes + b.notes_created;
          if (bScore !== aScore) return bScore - aScore;
          const an = a.full_name ?? a.email ?? '';
          const bn = b.full_name ?? b.email ?? '';
          return an.localeCompare(bn, 'pt-BR');
        });

      return { global, sellers };
    },
  });
}

// ============================================================================
// Leads por trás de UMA métrica — carregado SOB DEMANDA quando o gestor toca
// num card. Uma query pequena e filtrada, em vez de manter 4.7k leads em
// memória o tempo todo.
// ============================================================================
export type MetricLeadsParams = {
  metric:
    | 'created' | 'visited' | 'meetings' | 'follow_ups' | 'stage_changes'
    | 'notes' | 'assigned' | 'status' | 'all';
  period: GestorPeriod;
  sellerId?: string | null;   // auth.users.id — filtra por vendedor
  hubspotId?: string | null;  // usado por 'assigned'
  status?: string | null;     // usado por 'assigned' e 'status'
};

export function useMetricLeads(params: MetricLeadsParams | null, enabled: boolean) {
  const range = params ? periodRange(params.period) : { start: null, end: null };
  return useQuery<MetricLead[]>({
    queryKey: [
      'gestor-metric-leads',
      params?.metric,
      range.start,
      range.end,
      params?.sellerId ?? null,
      params?.hubspotId ?? null,
      params?.status ?? null,
    ],
    enabled: enabled && !!params,
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!params) return [];
      const { data, error } = await supabase.rpc('gestor_metric_leads', {
        p_metric: params.metric,
        p_start: range.start,
        p_end: range.end,
        p_seller_id: params.sellerId ?? null,
        p_hubspot_id: params.hubspotId ?? null,
        p_status: params.status ?? null,
      });
      if (error) throw error;
      return (data ?? []) as MetricLead[];
    },
  });
}
