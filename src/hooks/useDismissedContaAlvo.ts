import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';

// Contas-alvo dispensadas ("Não interessa") — pro gestor auditar. Ficam como
// clients (conta_alvo_dismissed=true), escondidas do resto do app.
export interface DismissedContaAlvo {
  id: string;
  nome: string;
  cidade: string | null;
  dismissedById: string | null;
  dismissedByName: string | null;
  dismissedAt: string | null;
  vendedorHubspotId: string | null;
}

export function useDismissedContaAlvo(enabled: boolean) {
  const queryClient = useQueryClient();

  const query = useQuery<DismissedContaAlvo[]>({
    queryKey: ['conta_alvo_dismissed'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, nome, empresa, cidade, conta_alvo_dismissed_by, conta_alvo_dismissed_by_name, conta_alvo_dismissed_at, vendedor_id_hubspot')
        .eq('conta_alvo_dismissed', true)
        .order('conta_alvo_dismissed_at', { ascending: false })
        .limit(300);
      if (error) return [];
      return (data ?? []).map((c: any) => ({
        id: c.id,
        nome: (c.empresa?.trim() || c.nome || 'Sem nome') as string,
        cidade: c.cidade ?? null,
        dismissedById: c.conta_alvo_dismissed_by ?? null,
        dismissedByName: c.conta_alvo_dismissed_by_name ?? null,
        dismissedAt: c.conta_alvo_dismissed_at ?? null,
        vendedorHubspotId: c.vendedor_id_hubspot ?? null,
      }));
    },
    enabled,
    staleTime: 60 * 1000,
  });

  // Restaura (des-dispensa): volta a aparecer no mapa e a ser sugerível.
  const restore = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase.from('clients').update({ conta_alvo_dismissed: false }).eq('id', clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conta_alvo_dismissed'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });

  return { data: query.data ?? [], isLoading: query.isLoading, restore };
}
