import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import type { SellerStatus } from './useAllSellers';

// Menu do gestor: TODOS os usuários (incl. os marcados "não vendedor") + o
// status atual, e o salvar. Diferente do useAllSellers, que já filtra os
// "não vendedor" pros rankings/metas.
export interface ClassifiableUser {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  /** null = ninguem atribuiu o id do HubSpot; sem ele o vendedor nao recebe
   *  lead nem tarefa. O painel do gestor sinaliza pra alguem preencher. */
  idHubspot?: string | null;
  deactivated: boolean;
  status: SellerStatus;
}

export function useSellerClassification(enabled: boolean) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const query = useQuery<ClassifiableUser[]>({
    queryKey: ['seller_classification_all'],
    queryFn: async () => {
      const [{ data: profs, error }, cls] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, role, id_hubspot').neq('role', 'view').order('full_name', { ascending: true }),
        supabase.from('seller_classification').select('seller_id, status'),
      ]);
      if (error) throw error;
      const statusById = new Map<string, SellerStatus>();
      if (!cls.error) for (const c of (cls.data ?? []) as any[]) statusById.set(c.seller_id, c.status);
      return (profs ?? []).map((p: any) => {
        const raw = (p.full_name?.trim() || p.email || 'Sem nome') as string;
        const deactivated = /DESATIVADO/i.test(raw);
        const name = raw.replace(/\s*\/\s*DESATIVADO\s*$/i, '').trim() || p.email || 'Sem nome';
        return {
          id: p.id as string,
          name,
          email: p.email ?? null,
          role: p.role ?? null,
          idHubspot: (p.id_hubspot ?? null) as string | null,
          deactivated,
          status: (statusById.get(p.id) ?? 'ativo') as SellerStatus,
        };
      });
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const save = useMutation({
    mutationFn: async (rows: { seller_id: string; status: SellerStatus }[]) => {
      const now = new Date().toISOString();
      const payload = rows.map((r) => ({ ...r, updated_at: now, updated_by: profile?.id ?? null }));
      const { error } = await supabase.from('seller_classification').upsert(payload, { onConflict: 'seller_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller_classification_all'] });
      queryClient.invalidateQueries({ queryKey: ['all_sellers'] });
    },
  });

  return { users: query.data ?? [], isLoading: query.isLoading, save };
}
