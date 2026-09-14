// Os recados do gestor que esta pessoa ainda não confirmou que leu.
//
// A confirmação é DELA: o banco só aceita `leitor_id = auth.uid()`, então nem
// o gestor marca por alguém. Sem isso o número de leitura do cockpit viraria
// enfeite — e a diferença entre "avisei" e "eles souberam" é onde nasce metade
// dos desencontros de operação.
//
// A tabela pode não existir (as migrations são aplicadas fora deste código).
// Nesse caso a lista volta VAZIA, não quebra: um app de campo que não abre
// porque falta uma tabela de recado seria muito pior do que ficar sem recado.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';

export type ComunicadoNaoLido = {
  id: string;
  titulo: string;
  mensagem: string;
  publicadoEm: string;
  autor: string | null;
};

/** PostgREST: tabela ausente do schema cache. */
const TABELA_AUSENTE = 'PGRST205';

export function useComunicadosNaoLidos(enabled: boolean) {
  const qc = useQueryClient();

  const query = useQuery<ComunicadoNaoLido[]>({
    queryKey: ['comunicados_nao_lidos'],
    enabled,
    // Recado não é dado quente: uma leitura por sessão basta, e o `useVivo` do
    // cockpit não existe aqui.
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: sessao } = await supabase.auth.getUser();
      const meuId = sessao?.user?.id;
      if (!meuId) return [];

      const publicados = await supabase
        .from('comunicados')
        .select('id, titulo, mensagem, publicado_em, created_by_name')
        .not('publicado_em', 'is', null)
        .order('publicado_em', { ascending: false })
        .limit(20);
      if (publicados.error) {
        if (publicados.error.code === TABELA_AUSENTE) return [];
        throw publicados.error;
      }

      const lidos = await supabase
        .from('comunicados_lidos')
        .select('comunicado_id')
        .eq('leitor_id', meuId);
      if (lidos.error) {
        if (lidos.error.code === TABELA_AUSENTE) return [];
        throw lidos.error;
      }
      const jaLi = new Set((lidos.data ?? []).map((l) => l.comunicado_id as string));

      return (publicados.data ?? [])
        .filter((c) => !jaLi.has(c.id as string))
        .map((c) => ({
          id: c.id as string,
          titulo: c.titulo as string,
          mensagem: c.mensagem as string,
          publicadoEm: c.publicado_em as string,
          autor: (c.created_by_name as string | null) ?? null,
        }));
    },
  });

  const confirmar = useMutation({
    mutationFn: async (comunicadoId: string) => {
      const { data: sessao } = await supabase.auth.getUser();
      const meuId = sessao?.user?.id;
      if (!meuId) throw new Error('sem sessão');
      const { error } = await supabase
        .from('comunicados_lidos')
        .insert({ comunicado_id: comunicadoId, leitor_id: meuId });
      // Confirmar duas vezes é confirmar uma: a PK (comunicado, leitor) já
      // garante isso, e o 23505 aqui é um toque repetido, não um erro.
      if (error && error.code !== '23505') throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['comunicados_nao_lidos'] });
    },
  });

  return { naoLidos: query.data ?? [], carregando: query.isLoading, confirmar };
}
