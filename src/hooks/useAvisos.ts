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

import { supabase, usuarioDaSessao } from '../integrations/supabase/client';
import { ouvirFila, type ItemFila } from '../utils/filaOffline';

export type AvisoGestor = { id: string; titulo: string; em: string; autor: string | null; pessoal?: boolean };

// RECADO DO GESTOR (Cockpit v5, contrato linha 12, 28/09/2026). O que o gestor escreve
// para UMA pessoa no Cockpit (Pessoas → sugestão/recado, tabela sugestoes_planos) nunca
// chegava ao app: o sino só lia comunicados. Agora entra aqui, com selo até ser visto.
const CHAVE_RECADO_VISTO = 'takeat-recado-visto-em';
function recadoVistoEm(): number {
  try { return Number(localStorage.getItem(CHAVE_RECADO_VISTO)) || 0; } catch { return 0; }
}

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

  const recados = useQuery<AvisoGestor[]>({
    queryKey: ['avisos_gestor', 'recados'],
    enabled: ativo,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const desde = new Date(Date.now() - 14 * 86400000).toISOString();
      // a RLS devolve só os meus (owner_id = meu_owner_hubspot()); o gestor vê todos, e
      // para ele isto não é recado: fica de fora.
      const { data: s0 } = await usuarioDaSessao();
      const { data: perfil } = await supabase.from('profiles').select('id_hubspot').eq('id', s0?.user?.id ?? '').maybeSingle();
      const meu = (perfil as { id_hubspot?: string | null } | null)?.id_hubspot;
      if (!meu) return [];
      const { data, error } = await supabase.from('sugestoes_planos')
        .select('id, texto, autor, created_at').eq('owner_id', String(meu))
        .gte('created_at', desde).order('created_at', { ascending: false }).limit(5);
      if (error) return [];
      return ((data ?? []) as any[]).filter((r) => r.texto)
        .map((r) => ({ id: 'r-' + r.id, titulo: String(r.texto), em: r.created_at, autor: r.autor ? 'Recado de ' + r.autor : 'Recado do gestor', pessoal: true }));
    },
  });
  const [vistoEm, setVistoEm] = useState<number>(() => recadoVistoEm());
  const recadosNovos = (recados.data ?? []).filter((r) => Date.parse(r.em) > vistoEm).length;
  const marcarRecadosVistos = () => {
    const agora = Date.now();
    try { localStorage.setItem(CHAVE_RECADO_VISTO, String(agora)); } catch { /* só nesta sessão */ }
    setVistoEm(agora);
  };

  const [fila, setFila] = useState<ItemFila[]>([]);
  useEffect(() => (ativo ? ouvirFila(setFila) : undefined), [ativo]);
  const falhas = useMemo(() => fila.filter((i) => i.estado === 'falhou'), [fila]);

  return {
    gestor: [...(recados.data ?? []), ...(gestor.data ?? [])],
    carregando: gestor.isLoading || recados.isLoading,
    falhas,
    selo: falhas.length + recadosNovos,
    marcarRecadosVistos,
  };
}
