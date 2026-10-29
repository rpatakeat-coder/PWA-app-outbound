import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';

// Nome de clientes POR ID, independente do recorte do mapa.
//
// POR QUE EXISTE
// A lista `clients` do app carrega so' a AREA VISIVEL do mapa (bounds). As
// reunioes da agenda vem da base inteira — entao `clients.find(id)` falha pra
// qualquer lead fora do viewport e a agenda mostrava "Lead" em tudo, como se
// os nomes nao existissem. Este hook resolve os nomes por id, em lotes.
const LOTE = 200; // ids por consulta: limite de tamanho de URL do PostgREST
// o mesmo Map vazio sempre: um novo a cada render quebrava os memos de quem usa (auditoria 15/10/26)
const VAZIO = new Map<string, string>();

export function useNomesDeClientes(ids: string[], enabled: boolean) {
  const query = useQuery<Map<string, string>>({
    // A chave ordena os ids: a MESMA lista em outra ordem nao refaz a busca.
    queryKey: ['nomes_clientes', [...ids].sort().join(',')],
    queryFn: async () => {
      const mapa = new Map<string, string>();
      for (let i = 0; i < ids.length; i += LOTE) {
        const { data, error } = await supabase
          .from('clients')
          .select('id, nome, empresa')
          .in('id', ids.slice(i, i + LOTE));
        // erro não vira 'sem nome' guardado por 5 min: a consulta tenta de novo
        if (error) throw error;
        for (const c of (data ?? []) as any[]) {
          mapa.set(c.id, (c.empresa || '').trim() || c.nome || 'Sem nome');
        }
      }
      return mapa;
    },
    enabled: enabled && ids.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  return query.data ?? VAZIO;
}
