// O placar da semana para o Hoje do executivo (o mesmo do Hoje do Cockpit, 24/11/26): placar_da_semana é a
// leitura que o Cockpit faz (HJ4.lerPlacar), guardada 2 min como lá. As demos do mês vêm na resposta da fila.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import type { Placar } from '../utils/hojeComoCockpit';

const hojeBRT = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const segundaDe = (iso: string) => { const d = new Date(iso + 'T12:00:00Z'); const w = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() - (w - 1)); return d.toISOString().slice(0, 10); };

/** undefined enquanto lê; null se a leitura falhou ou o banco recusou (a tela mostra "fonte fora", nunca 0) */
export function usePlacarDaSemana(enabled: boolean): { placar: Placar | null | undefined; recarregar: () => void } {
  const seg = segundaDe(hojeBRT());
  const q = useQuery<Placar | null>({
    queryKey: ['placar_da_semana', seg],
    enabled,
    staleTime: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('placar_da_semana', { p_segunda: seg });
      if (error) throw error;
      const d = data as (Placar & { erro?: string }) | null;
      if (!d || d.erro || !Array.isArray(d.linhas)) throw new Error(d?.erro || 'sem resposta');
      return d;
    },
  });
  return { placar: q.isError ? null : q.data, recarregar: () => { void q.refetch(); } };
}
