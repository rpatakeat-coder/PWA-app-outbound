// O quadro do Desenvolvimento v2 e os ganchos que o Hoje, a folha da manhã, o fecho do dia e as
// entradas leem na abertura (auditoria 02/11/26). Saíram de MeuDesempenhoV2 para a tela carregar
// sob demanda (React.lazy): com eles lá, qualquer import estático puxava a tela inteira.
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';
import { buscarPlaybook } from '../screens/PlaybookScreen';
import type { Capitulo, Quadro } from '../../supabase/functions/_compartilhado/desenvolvimentoV2';

export type OrigemAbertura = 'toast' | 'pilula' | 'push_seg' | 'push_sex' | 'menu' | 'selo_menu';

/** O quadro do Desenvolvimento v2: a mesma chave para a tela, a pílula do Hoje e o toast. */
export function useDesenvolvimentoQuadro(enabled: boolean) {
  return useQuery<Quadro>({
    queryKey: ['desenvolvimento_quadro'],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('desenvolvimento_quadro');
      if (error) throw error;
      return data as Quadro;
    },
  });
}
/** Os capítulos do Playbook para o nível: os mesmos do Cockpit (categoria = capítulo, sem Liderança). */
export function useCapitulos(enabled: boolean): Capitulo[] {
  const pb = useQuery({ queryKey: ['playbook'], queryFn: buscarPlaybook, enabled, staleTime: 10 * 60 * 1000 });
  return useMemo(() => {
    const d = pb.data;
    if (!d) return [];
    return d.categorias.filter((c) => c !== 'Liderança').map((c) => ({ titulo: c, paginas: d.paginas.filter((p) => p.categoria === c).map((p) => p.id) }))
      .filter((c) => c.paginas.length > 0);
  }, [pb.data]);
}

/* as conquistas mostradas pelo toast nesta sessão continuam destacadas na coleção ("novo · hoje"), mesmo
   depois que o toast gravou em conquistas_vistas e o quadro foi relido */
export const destaqueDaSessao = new Set<string>();
export async function marcarVistas(ids: string[], onde: 'toast' | 'colecao') {
  if (!ids.length) return;
  await supabase.rpc('marcar_conquistas_vistas', { p_ids: ids, p_onde: onde }).then(() => undefined, () => undefined);
}
export function registrarAbertura(origem: OrigemAbertura) {
  void supabase.rpc('registrar_abertura', { p_tela: 'meu_desempenho', p_origem: origem }).then(() => undefined, () => undefined);
}

/** "reduzir movimento": a celebração aparece direto, sem escala (regra 7 do README). */
export function useReduzirMovimento() {
  const [r, setR] = useState(false);
  useEffect(() => {
    let vivo = true;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia) {
      const m = window.matchMedia('(prefers-reduced-motion: reduce)');
      setR(m.matches);
      const f = () => setR(m.matches);
      m.addEventListener?.('change', f);
      return () => { vivo = false; m.removeEventListener?.('change', f); };
    }
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (vivo) setR(!!v); }, () => undefined);
    return () => { vivo = false; };
  }, []);
  return r;
}
