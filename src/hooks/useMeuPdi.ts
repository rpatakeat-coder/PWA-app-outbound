// O meu plano de desenvolvimento — e o botão que só eu posso apertar.
//
// Quem marca "feito" é a própria pessoa. Isso não é regra de interface: a
// escrita passa pela função `pdi_marcar_feito`, que é SECURITY DEFINER e
// filtra por `seller_id = auth.uid()`. Sem ela a policy de UPDATE da tabela
// deixaria qualquer um dos dois lados escrever qualquer coluna — RLS não
// restringe COLUNA, só linha, e o gestor precisa do UPDATE para validar.
//
// O gestor valida ou devolve com motivo; nada disso é escrito daqui.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';

const TABELA_AUSENTE = 'PGRST205';

export type EstadoDoCompromisso = 'aberto' | 'feito' | 'validado' | 'devolvido';

export type MeuCompromisso = {
  id: string;
  texto: string;
  feito: boolean;
  estado: EstadoDoCompromisso;
  devolvidoMotivo: string | null;
};

export type MeuPdi = { titulo: string; compromissos: MeuCompromisso[] } | null;

export function useMeuPdi(enabled: boolean) {
  const qc = useQueryClient();

  const query = useQuery<MeuPdi>({
    queryKey: ['meu_pdi'],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: sessao } = await supabase.auth.getUser();
      const meuId = sessao?.user?.id;
      if (!meuId) return null;

      const doc = await supabase
        .from('pdi_documentos')
        .select('id, titulo')
        .eq('seller_id', meuId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      // Tabela ausente não pode quebrar a tela de desempenho: o resto dela
      // (visitas, pontos, daily) continua valendo sem o PDI.
      if (doc.error) {
        if (doc.error.code === TABELA_AUSENTE) return null;
        throw doc.error;
      }
      if (!doc.data) return null;

      const comp = await supabase
        .from('pdi_compromissos')
        .select('id, texto, ordem, feito_em, validado_em, devolvido_em, devolvido_motivo')
        .eq('pdi_id', doc.data.id)
        .order('ordem', { ascending: true });
      if (comp.error) throw comp.error;

      return {
        titulo: doc.data.titulo as string,
        compromissos: (comp.data ?? []).map((c) => {
          const feitoEm = (c.feito_em as string | null) ?? null;
          const validadoEm = (c.validado_em as string | null) ?? null;
          const devolvidoEm = (c.devolvido_em as string | null) ?? null;
          // Mesma derivação do cockpit (gestao/src/dados/regras.ts): devolvido
          // vence validado vence feito — a última palavra do gestor é a que
          // vale. Os dois projetos não podem se importar, então a regra está
          // escrita duas vezes; se uma mudar, a outra precisa mudar junto.
          const estado: EstadoDoCompromisso =
            devolvidoEm && (!validadoEm || devolvidoEm > validadoEm)
              ? 'devolvido'
              : validadoEm
                ? 'validado'
                : feitoEm
                  ? 'feito'
                  : 'aberto';
          return {
            id: c.id as string,
            texto: c.texto as string,
            feito: feitoEm != null,
            estado,
            devolvidoMotivo: (c.devolvido_motivo as string | null) ?? null,
          };
        }),
      };
    },
  });

  const marcar = useMutation({
    mutationFn: async ({ id, feito }: { id: string; feito: boolean }) => {
      const { error } = await supabase.rpc('pdi_marcar_feito', {
        p_compromisso: id,
        p_feito: feito,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['meu_pdi'] });
    },
  });

  return { pdi: query.data ?? null, carregando: query.isLoading, marcar };
}
