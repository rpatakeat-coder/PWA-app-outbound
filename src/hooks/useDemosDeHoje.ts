// A demo FEITA hoje: o livro de pontos (pontos_eventos demo_realizada), a mesma régua do Cockpit, da
// Agenda e do placar da semana. Um número só para o placar da aba Hoje e o "HOJE" da aba Eu.
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';

const hojeBRT = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);

/** null enquanto não leu ou se a leitura falhou: o erro não vira "0 demos". */
export function useDemosDeHoje(ownerId: string | null | undefined): number | null {
  const hoje = hojeBRT();
  const q = useQuery<number>({
    queryKey: ['demos_hoje', ownerId, hoje],
    enabled: !!ownerId,
    // 1 min: a demo creditada aparece logo no placar (5 min deixava "0 de 1" depois da demo)
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase.from('pontos_eventos').select('id', { count: 'exact', head: true })
        .eq('owner_id', ownerId!).eq('tipo', 'demo_realizada').gte('ref_em', `${hoje}T03:00:00.000Z`);
      if (error) throw error;
      return count ?? 0;
    },
  });
  return q.isError ? null : q.data ?? null;
}
