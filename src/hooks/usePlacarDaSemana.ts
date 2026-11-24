// O placar da semana e as demos do mês para o Hoje do executivo (o mesmo do Hoje do Cockpit, 24/11/26).
// placar_da_semana é a leitura que o Cockpit faz (HJ4.lerPlacar), guardada 2 min como lá; as demos do mês são
// o livro de pontos (pontos_eventos demo_realizada), a mesma régua do "demo N de 1" (useDemosDeHoje).
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

/** as demos do mês (para "no seu ritmo, isso pede N portas e M demos"); null se não leu */
export function useDemosDoMes(ownerId: string | null | undefined): number | null {
  const mes = hojeBRT().slice(0, 7);
  const q = useQuery<number>({
    queryKey: ['demos_mes', ownerId, mes],
    enabled: !!ownerId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { count, error } = await supabase.from('pontos_eventos').select('id', { count: 'exact', head: true })
        .eq('owner_id', ownerId!).eq('tipo', 'demo_realizada').gte('ref_em', `${mes}-01T03:00:00.000Z`);
      if (error) throw error;
      return count ?? 0;
    },
  });
  return q.isError ? null : q.data ?? null;
}
