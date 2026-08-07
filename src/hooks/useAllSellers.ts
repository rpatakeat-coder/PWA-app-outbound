import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';

// Lista COMPLETA de vendedores pro filtro do gestor — inclui DESATIVADOS (o
// profile continua; só ganha "/ DESATIVADO" no nome). RLS "Metrics viewers can
// view all profiles" deixa o gestor ler todos. Exclui viewers (não são campo).

export type SellerStatus = 'ativo' | 'sem_meta' | 'nao_vendedor';

export interface SellerOption {
  id: string; // auth uid (= profiles.id = field_routes.seller_id / client_visits.visited_by)
  name: string; // sem o sufixo "/ DESATIVADO"
  deactivated: boolean;
  status: SellerStatus; // classificação do gestor (default 'ativo')
}

// Lista de vendedores pra rankings/filtros/metas — já EXCLUI quem o gestor
// marcou como "não é vendedor". Cada um vem com seu status (ativo|sem_meta).
export function useAllSellers(enabled: boolean) {
  return useQuery<SellerOption[]>({
    queryKey: ['all_sellers'],
    queryFn: async () => {
      const [{ data: profs, error }, cls] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, role').neq('role', 'view').order('full_name', { ascending: true }),
        supabase.from('seller_classification').select('seller_id, status'),
      ]);
      if (error) throw error;
      const statusById = new Map<string, SellerStatus>();
      if (!cls.error) for (const c of (cls.data ?? []) as any[]) statusById.set(c.seller_id, c.status);

      return (profs ?? [])
        .map((p: any) => {
          const raw = (p.full_name?.trim() || p.email || 'Sem nome') as string;
          const deactivated = /DESATIVADO/i.test(raw);
          const name = raw.replace(/\s*\/\s*DESATIVADO\s*$/i, '').trim() || p.email || 'Sem nome';
          const status = (statusById.get(p.id) ?? 'ativo') as SellerStatus;
          return { id: p.id as string, name, deactivated, status };
        })
        .filter((s) => s.status !== 'nao_vendedor')
        // Ativos primeiro, depois desativados; alfabético dentro de cada grupo.
        .sort((a, b) => (a.deactivated === b.deactivated ? a.name.localeCompare(b.name) : a.deactivated ? 1 : -1));
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
