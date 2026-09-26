// Sino de Avisos do mapa novo (prompt final §5, §8.10 e §B4 "Coerência").
//
// O sino é para o que NÃO é tarefa — as tarefas já têm o selo na aba Tarefas:
//   - falhas de sincronização: envios da fila offline que não subiram;
//   - recados do gestor dos últimos 14 dias.
// O selo conta as falhas, que valem até serem resolvidas.
//
// O MOTOR DAS CONTAS-ALVO SAIU DO SINO (26/09/2026, Julyan: "lixo de
// informação... quero só os ativos e as contas que o Cockpit sugere"). Conta
// sem negócio com CNPJ baixado, que sumiu do Google ou fechou não aparece para
// ninguém: sai do mapa (filtro em App.tsx), em vez de virar lista para triar.
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';
import { ouvirFila, type ItemFila } from '../utils/filaOffline';

export type AvisoGestor = { id: string; titulo: string; em: string; autor: string | null };

export function useAvisos(ativo: boolean) {
  // DO GESTOR: os recados dos últimos 14 dias. O não lido já abre sozinho
  // (folha na raiz do App); aqui fica o registro para reler.
  const gestor = useQuery<AvisoGestor[]>({
    queryKey: ['avisos_gestor'],
    enabled: ativo,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const desde = new Date(Date.now() - 14 * 86400000).toISOString();
      const { data, error } = await supabase.from('comunicados')
        .select('id, titulo, publicado_em, created_by_name')
        .not('publicado_em', 'is', null)
        .gte('publicado_em', desde)
        .order('publicado_em', { ascending: false })
        .limit(5);
      if (error) return []; // tabela ausente ou sem permissão: sem bloco, sem quebrar
      return ((data ?? []) as any[]).map((c) => ({ id: c.id, titulo: c.titulo, em: c.publicado_em, autor: c.created_by_name ?? null }));
    },
  });

  const [fila, setFila] = useState<ItemFila[]>([]);
  useEffect(() => (ativo ? ouvirFila(setFila) : undefined), [ativo]);
  const falhas = useMemo(() => fila.filter((i) => i.estado === 'falhou'), [fila]);

  return {
    gestor: gestor.data ?? [],
    carregando: gestor.isLoading,
    falhas,
    selo: falhas.length,
  };
}
