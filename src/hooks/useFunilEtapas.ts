import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';

// Contagem de leads por etapa na BASE INTEIRA — o funil do painel do gestor.
//
// Nao da' pra derivar do estado `clients` do app: ele so' tem a area visivel
// do mapa (bounds). E o PostgREST corta em 1000 linhas SEM ERRO — por isso a
// paginacao explicita, mesmo padrao do buscarTudo do cockpit.
export function useFunilEtapas(enabled: boolean) {
  return useQuery({
    queryKey: ['funil-etapas'],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const contagem = new Map<string, number>();
      const PASSO = 1000;
      for (let de = 0; ; de += PASSO) {
        const { data, error } = await supabase
          .from('clients')
          .select('etapa')
          .eq('status', 'lead')
          .range(de, de + PASSO - 1);
        if (error) throw error;
        for (const r of (data ?? []) as Array<{ etapa: string | null }>) {
          if (r.etapa) contagem.set(r.etapa, (contagem.get(r.etapa) ?? 0) + 1);
        }
        if (!data || data.length < PASSO) break;
      }
      return contagem;
    },
  });
}
