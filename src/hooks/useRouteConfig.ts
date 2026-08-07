import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';

// Config da Rota do dia (route_config, 1 linha). Todos leem; só gestor edita
// (RLS). O app usa meta_visitas_dia + os SLAs; a edge conta-alvo-nearby e a RPC
// de SLA leem direto do banco.
export interface RouteConfig {
  conta_alvo_raio_m: number;
  conta_alvo_nota_min: number;
  conta_alvo_reviews_min: number;
  meta_visitas_dia: number;
  sla_prospeccao: number;
  sla_visita: number;
  sla_conversa: number;
  sla_demo: number;
  sla_negociacao: number;
  sla_ag_pagamento: number;
}

export const ROUTE_CONFIG_DEFAULTS: RouteConfig = {
  conta_alvo_raio_m: 2000,
  conta_alvo_nota_min: 4.5,
  conta_alvo_reviews_min: 100,
  meta_visitas_dia: 6,
  sla_prospeccao: 5,
  sla_visita: 5,
  sla_conversa: 4,
  sla_demo: 3,
  sla_negociacao: 7,
  sla_ag_pagamento: 2,
};

export function useRouteConfig() {
  const queryClient = useQueryClient();
  const { isAuthenticated, profile } = useAuth();

  const query = useQuery<RouteConfig>({
    queryKey: ['route_config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('route_config').select('*').eq('id', 1).maybeSingle();
      // Tabela ainda nao aplicada / sem linha -> defaults (nao quebra a tela).
      if (error) return ROUTE_CONFIG_DEFAULTS;
      return { ...ROUTE_CONFIG_DEFAULTS, ...(data ?? {}) } as RouteConfig;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<RouteConfig>) => {
      const { error } = await supabase
        .from('route_config')
        .update({ ...patch, updated_at: new Date().toISOString(), updated_by: profile?.id ?? null })
        .eq('id', 1);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['route_config'] }),
  });

  return { config: query.data ?? ROUTE_CONFIG_DEFAULTS, isLoading: query.isLoading, save };
}
