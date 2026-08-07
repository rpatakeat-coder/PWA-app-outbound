import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';

// Meta diária de visitas por vendedor (seller_visit_goals). Map seller_id ->
// meta/dia. RLS: todos leem, só gestor grava.
export function useSellerGoals(enabled: boolean) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const query = useQuery<Map<string, number>>({
    queryKey: ['seller_visit_goals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('seller_visit_goals').select('seller_id, meta_visitas_dia');
      const m = new Map<string, number>();
      if (error) return m; // tabela ainda não aplicada -> sem metas próprias
      for (const r of (data ?? []) as any[]) m.set(r.seller_id, Number(r.meta_visitas_dia));
      return m;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const save = useMutation({
    mutationFn: async (rows: { seller_id: string; meta_visitas_dia: number }[]) => {
      const now = new Date().toISOString();
      const payload = rows.map((r) => ({ ...r, updated_at: now, updated_by: profile?.id ?? null }));
      const { error } = await supabase.from('seller_visit_goals').upsert(payload, { onConflict: 'seller_id' });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['seller_visit_goals'] }),
  });

  return { goals: query.data ?? new Map<string, number>(), isLoading: query.isLoading, save };
}
