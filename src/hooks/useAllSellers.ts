import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';

// Lista COMPLETA de vendedores pro filtro do gestor — inclui DESATIVADOS (o
// profile continua; só ganha "/ DESATIVADO" no nome). RLS "Metrics viewers can
// view all profiles" deixa o gestor ler todos. Exclui viewers (não são campo).

export interface SellerOption {
  id: string; // auth uid (= profiles.id = field_routes.seller_id / client_visits.visited_by)
  name: string; // sem o sufixo "/ DESATIVADO"
  deactivated: boolean;
}

export function useAllSellers(enabled: boolean) {
  return useQuery<SellerOption[]>({
    queryKey: ['all_sellers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .neq('role', 'view')
        .order('full_name', { ascending: true });
      if (error) throw error;
      return (data ?? [])
        .map((p: any) => {
          const raw = (p.full_name?.trim() || p.email || 'Sem nome') as string;
          const deactivated = /DESATIVADO/i.test(raw);
          const name = raw.replace(/\s*\/\s*DESATIVADO\s*$/i, '').trim() || p.email || 'Sem nome';
          return { id: p.id as string, name, deactivated };
        })
        // Ativos primeiro, depois desativados; alfabético dentro de cada grupo.
        .sort((a, b) => (a.deactivated === b.deactivated ? a.name.localeCompare(b.name) : a.deactivated ? 1 : -1));
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
