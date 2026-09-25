// Mapa novo (prancha "mapa comercial"): a chave que liga, e o que o pino P2
// precisa além do lead.
//
// A chave é opt-in enquanto o Julyan aprova: `?mapa=novo` na URL liga e fica
// lembrado no aparelho; `?mapa=antigo` volta. Assim o mapa novo vive ao lado
// do atual, no mesmo app, sem tirar nada de quem está na rua.
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import { ouvirFila, type ItemFila } from '../utils/filaOffline';
import type { ContextoPino, TempoDoNegocio } from '../utils/pinoP2';

const CHAVE = 'takeat-mapa-novo';

function lerChave(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const q = new URLSearchParams(window.location.search).get('mapa');
    if (q === 'novo') window.localStorage.setItem(CHAVE, '1');
    if (q === 'antigo') window.localStorage.removeItem(CHAVE);
    return window.localStorage.getItem(CHAVE) === '1';
  } catch {
    return false;
  }
}

export function useMapaNovo(): boolean {
  const [ligado] = useState(lerChave);
  return ligado;
}

type ContextoBruto = {
  tempo: [string, number | null, boolean, string | null][];
  donos: string[];
  limites: [number, number];
  atualizado_em: string | null;
};

/** Tempo parado + donos do time + limites (RPC mapa_contexto, 0103) e a tabela etapa_de_para (0102). */
export function useContextoDoPino(ligado: boolean): Omit<ContextoPino, 'agora'> | null {
  const { profile, isAuthenticated } = useAuth();

  const contexto = useQuery<ContextoBruto>({
    queryKey: ['mapa-contexto'],
    enabled: ligado && isAuthenticated,
    // O robô do Cockpit escreve o snapshot a cada 15 min.
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mapa_contexto');
      if (error) throw error;
      return data as ContextoBruto;
    },
  });

  const etapas = useQuery<{ texto_normalizado: string; etapa_codigo: string | null }[]>({
    queryKey: ['etapa-de-para'],
    enabled: ligado && isAuthenticated,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('etapa_de_para').select('texto_normalizado, etapa_codigo');
      if (error) throw error;
      return data ?? [];
    },
  });

  const meuOwnerId = (profile as { id_hubspot?: string | null } | null)?.id_hubspot ?? null;

  return useMemo(() => {
    if (!ligado || !contexto.data || !etapas.data) return null;
    const tempoPorNegocio = new Map<string, TempoDoNegocio>();
    for (const [id, dias, sla, ult] of contexto.data.tempo ?? []) {
      tempoPorNegocio.set(String(id), { diasNaEtapa: dias, slaEstourado: !!sla, ultimaInteracao: ult });
    }
    const lim = contexto.data.limites;
    return {
      meuOwnerId: meuOwnerId ? String(meuOwnerId) : null,
      donosDoTime: new Set((contexto.data.donos ?? []).map(String)),
      tempoPorNegocio,
      etapaDePara: new Map(etapas.data.map((e) => [e.texto_normalizado, e.etapa_codigo])),
      limites: Array.isArray(lim) && lim.length === 2 ? [Number(lim[0]), Number(lim[1])] : [7, 30],
      atualizadoEm: contexto.data.atualizado_em ?? null,
    };
  }, [ligado, contexto.data, etapas.data, meuOwnerId]);
}

/** Ids dos leads com check-in esperando sinal (selo ↑ âmbar no pino). */
export function useLeadsNaFila(): Set<string> {
  const [itens, setItens] = useState<ItemFila[]>([]);
  useEffect(() => ouvirFila(setItens), []);
  return useMemo(
    () => new Set(itens.map((i) => String((i.payload as { clientId?: string }).clientId ?? '')).filter(Boolean)),
    [itens],
  );
}
