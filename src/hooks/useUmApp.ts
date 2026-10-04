// "Um app só" (handoff tizer, 04/10/2026): a chave por pessoa e o placar com uma conta só.
//
// useUmApp — liga as fases novas para quem tem a chave `um_app` (feature_flags, 0156: a
// linha da pessoa vence a de todos). `?nav=antiga` desliga neste aparelho (saída de
// emergência, lembrada) e `?nav=nova` desfaz a saída. Sem resposta do banco: desligado —
// quem está na rua não pode ganhar tela nova por falha de rede.
//
// usePlacar — placar_executivo() (0156): visitas provadas ao vivo, demos, contratos e
// pontos do livro da temporada, mês × variável, régua e posição. Uma definição por número.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';

const CHAVE_ANTIGA = 'takeat-nav-antiga';

function navAntigaNoAparelho(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const q = new URLSearchParams(window.location.search).get('nav');
    if (q === 'antiga') window.localStorage.setItem(CHAVE_ANTIGA, '1');
    if (q === 'nova') window.localStorage.removeItem(CHAVE_ANTIGA);
    return window.localStorage.getItem(CHAVE_ANTIGA) === '1';
  } catch {
    return false;
  }
}

export function useUmApp(ativo: boolean): boolean {
  const [antiga] = useState(navAntigaNoAparelho);
  const q = useQuery<Record<string, boolean>>({
    queryKey: ['meus_recursos'],
    enabled: ativo && !antiga,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('meus_recursos');
      if (error) throw error;
      return (data ?? {}) as Record<string, boolean>;
    },
  });
  return !antiga && q.data?.um_app === true;
}

export type Placar = {
  sem_carteira: boolean;
  erro?: string;
  hoje?: { provadas: number; sem_prova: number; meta: number; dia: string };
  semana?: {
    de: string; ate: string; provadas: number; meta: number; demos: number; contratos: number;
    pts: number; meta_pts: number; piso_faltam_provadas: number; piso_faltam_demos: number;
  };
  mes?: {
    fechados: number; meta: number; variavel: number | null; por_cliente: number | null; proxima_venda: number | null;
    degrau: { clientes: number; faltam: number; por_cliente: number; extra: number } | null;
  };
  regua?: { abertos: number; com_passo: number; visitas_semana: number; visitas_registradas_no_dia: number };
  temporada?: {
    pos: number | null; pct: number | null; pts: number | null; faltam: string | null; proximo: string | null;
    podio: Array<{ pos: number; nome: string; pct: number; pts: number; avatar_url: string | null }> | null;
  } | null;
  hubspot_em?: string | null;
};

export function usePlacar(ativo: boolean) {
  return useQuery<Placar>({
    queryKey: ['placar_executivo'],
    enabled: ativo,
    staleTime: 60 * 1000,
    placeholderData: (anterior) => anterior,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('placar_executivo');
      if (error) throw error;
      return data as Placar;
    },
  });
}

export { textoDoPiso } from '../utils/umApp';

export const reais = (v: number | null | undefined) =>
  v == null ? '—' : `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
