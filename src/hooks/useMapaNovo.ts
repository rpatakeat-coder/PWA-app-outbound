// Mapa novo (prancha "mapa comercial"): a chave que liga, e o que o pino P2
// precisa além do lead.
//
// PADRÃO NO CELULAR desde 26/09/2026 (decisão do Julyan): o mapa novo abre
// sozinho em tela de celular. `?mapa=antigo` é a saída de emergência e fica
// lembrada no aparelho; `?mapa=novo` desfaz a saída.
// PADRÃO NO COMPUTADOR TAMBÉM desde 28/09/2026 (Julyan: "acessando o pwa já
// tem que ir direto"): o time atualizou o app e o desktop continuava no antigo.
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../context/AuthContext';
import { ouvirFila, type ItemFila } from '../utils/filaOffline';
import type { ContextoPino, QuedaDoCliente, TempoDoNegocio } from '../utils/pinoP2';

const CHAVE = 'takeat-mapa-novo';
const CHAVE_ANTIGO = 'takeat-mapa-antigo';

function lerChave(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const q = new URLSearchParams(window.location.search).get('mapa');
    if (q === 'novo') { window.localStorage.setItem(CHAVE, '1'); window.localStorage.removeItem(CHAVE_ANTIGO); }
    if (q === 'antigo') { window.localStorage.removeItem(CHAVE); window.localStorage.setItem(CHAVE_ANTIGO, '1'); }
    if (window.localStorage.getItem(CHAVE_ANTIGO) === '1') return false;
    if (window.localStorage.getItem(CHAVE) === '1') return true;
    return true;
  } catch {
    return false;
  }
}

export function useMapaNovo(): boolean {
  const [ligado] = useState(lerChave);
  return ligado;
}

type ContextoBruto = {
  tempo: [string, number | null, boolean, string | null, string | null, string | null, boolean, string | null][];
  donos: string[];
  limites: [number, number];
  atualizado_em: string | null;
  /** Clientes em queda (0126): [client_id, motivo, faturamento do último mês, executivo do território]. */
  queda?: [string, string | null, number | null, string | null][];
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
    if (!ligado) return null;
    // Falhou a leitura: contexto vazio em vez de nada — o pino sai com a
    // classificação básica (sem tempo parado nem dono do time) e não some.
    const dadosCtx = contexto.data ?? (contexto.isError ? { tempo: [], donos: [], limites: [7, 30] as [number, number], atualizado_em: null } : null);
    const dadosEtapas = etapas.data ?? (etapas.isError ? [] : null);
    if (!dadosCtx || !dadosEtapas) return null;
    const tempoPorNegocio = new Map<string, TempoDoNegocio>();
    for (const [id, dias, sla, ult, etapa, faixa, parcial, origem] of dadosCtx.tempo ?? []) {
      tempoPorNegocio.set(String(id), {
        diasNaEtapa: dias, slaEstourado: !!sla, ultimaInteracao: ult, etapaCodigo: etapa ?? null,
        faixa: faixa ?? null, parcial: !!parcial, origemHs: origem ?? null,
      });
    }
    const lim = dadosCtx.limites;
    const quedaPorCliente = new Map<string, QuedaDoCliente>();
    for (const [id, motivo, fat, dono] of dadosCtx.queda ?? []) {
      quedaPorCliente.set(String(id), { motivo: motivo ?? 'em queda', faturamento: fat == null ? null : Number(fat), dono: dono ?? null });
    }
    return {
      quedaPorCliente,
      meuOwnerId: meuOwnerId ? String(meuOwnerId) : null,
      donosDoTime: new Set((dadosCtx.donos ?? []).map(String)),
      tempoPorNegocio,
      etapaDePara: new Map(dadosEtapas.map((e) => [e.texto_normalizado, e.etapa_codigo])),
      limites: Array.isArray(lim) && lim.length === 2 ? [Number(lim[0]), Number(lim[1])] : [7, 30],
      atualizadoEm: dadosCtx.atualizado_em ?? null,
    };
  }, [ligado, contexto.data, contexto.isError, etapas.data, etapas.isError, meuOwnerId]);
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
