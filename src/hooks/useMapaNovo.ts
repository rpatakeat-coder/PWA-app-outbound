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
import { DIAS_RECEM_ABERTO, type ContextoPino, type QuedaDoCliente, type TempoDoNegocio } from '../utils/pinoP2';

/** Segunda-feira (Brasília) da semana de hoje, AAAA-MM-DD. */
function segundaBRT(): string {
  const d = new Date(Date.now() - 3 * 3600000);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}

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

  /* RECÉM-ABERTOS (15/10/26): a data de abertura do CNPJ de cada lead da Casa dos Dados. O
     executivo só lê os leads dele (RLS de leads_prospeccao), que são exatamente os pinos dele.
     Uma leitura a cada 30 min; falhou, o mapa segue sem selo (nada some por erro). */
  const aberturas = useQuery<[string, string][]>({
    queryKey: ['abertura-dos-leads'],
    enabled: ligado && isAuthenticated,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const out: [string, string][] = [];
      // ordem fixa: sem ela, acima de 1000 linhas o PostgREST pula ou repete linha na virada da página
      const pagina = (de: number) => supabase.from('leads_prospeccao').select('id, data_abertura')
        .ilike('fonte', '%Casa dos Dados%').not('data_abertura', 'is', null).order('id').range(de, de + 999);
      // EM LOTES DE 4 PÁGINAS EM PARALELO (16/10/26): eram 3 pedidos em fila, ~200 ms cada do
      // Brasil. Um lote cobre a base de hoje (2,9 mil); se a última página vier cheia, outro lote.
      for (let de = 0; de < 20000; de += 4000) {
        const lote = await Promise.all([0, 1000, 2000, 3000].map((k) => pagina(de + k)));
        let acabou = false;
        for (const { data, error } of lote) {
          if (error) throw error;
          (data ?? []).forEach((l: { id: string; data_abertura: string }) => out.push([String(l.id), String(l.data_abertura)]));
          if (!data || data.length < 1000) { acabou = true; break; }
        }
        if (acabou) break;
      }
      return out;
    },
  });

  /* A META DE 5 POR SEMANA: restaurantes recém-abertos que EU visitei com prova desde segunda.
     Mesma régua de visita do Cockpit (visitas_com_prova); o pino diz se o lead é recém-aberto. */
  const meuId = (profile as { id?: string } | null)?.id ?? null;
  const visitasSemana = useQuery<{ client_id: string; dia: string; abertura: string | null }[]>({
    // a segunda na chave: o PWA aberto de domingo para segunda não mostra a semana passada
    queryKey: ['novos-visitados-semana', meuId, segundaBRT()],
    enabled: ligado && isAuthenticated && !!meuId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
      const { data, error } = await supabase.rpc('visitas_com_prova', { p_de: segundaBRT(), p_ate: hoje, p_pessoa: meuId });
      if (error) throw error;
      const minhas = ((data ?? []) as { client_id: string; dia: string; provada: boolean; visited_by?: string }[])
        .filter((v) => v.provada && (!v.visited_by || v.visited_by === meuId));
      if (!minhas.length) return [];
      const ids = [...new Set(minhas.map((v) => v.client_id))];
      const { data: cl, error: e2 } = await supabase.from('clients').select('id, lead_prospeccao_id').in('id', ids);
      if (e2) throw e2;
      const lead = new Map((cl ?? []).map((c: { id: string; lead_prospeccao_id: string | null }) => [c.id, c.lead_prospeccao_id]));
      /* A ABERTURA VEM DO SERVIDOR (0203, auditoria 15/10/26): a RLS de leads_prospeccao só mostra os
         leads de que eu sou o responsável, e a visita a um recém-aberto de outro dono não contava. */
      const leadIds = [...new Set(minhas.map((v) => lead.get(v.client_id)).filter(Boolean) as string[])];
      const abertura = new Map<string, string>();
      if (leadIds.length) {
        const { data: ab, error: e3 } = await supabase.rpc('abertura_dos_leads', { p_ids: leadIds });
        if (e3) throw e3;
        for (const x of (ab ?? []) as { id: string; data_abertura: string }[]) abertura.set(String(x.id), String(x.data_abertura));
      }
      return minhas.filter((v) => lead.get(v.client_id)).map((v) => {
        const id = String(lead.get(v.client_id));
        return { client_id: id, dia: v.dia, abertura: abertura.get(id) ?? null };
      });
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
    const aberturaPorLead = new Map<string, string>(aberturas.data ?? []);
    // recém-aberto na data da visita (até 90 dias), cada restaurante uma vez na semana
    let novosVisitadosSemana: number | null = null;
    if (visitasSemana.data) {
      const vistos = new Set<string>();
      for (const v of visitasSemana.data) {
        const ab = v.abertura ?? aberturaPorLead.get(v.client_id);
        if (!ab) continue;
        const dias = (Date.parse(v.dia + 'T12:00:00Z') - Date.parse(String(ab).slice(0, 10) + 'T12:00:00Z')) / 86400000;
        if (dias <= DIAS_RECEM_ABERTO) vistos.add(v.client_id);
      }
      novosVisitadosSemana = vistos.size;
    }
    return {
      aberturaPorLead,
      novosVisitadosSemana,
      quedaPorCliente,
      meuOwnerId: meuOwnerId ? String(meuOwnerId) : null,
      donosDoTime: new Set((dadosCtx.donos ?? []).map(String)),
      tempoPorNegocio,
      etapaDePara: new Map(dadosEtapas.map((e) => [e.texto_normalizado, e.etapa_codigo])),
      limites: Array.isArray(lim) && lim.length === 2 ? [Number(lim[0]), Number(lim[1])] : [7, 30],
      atualizadoEm: dadosCtx.atualizado_em ?? null,
    };
  }, [ligado, contexto.data, contexto.isError, etapas.data, etapas.isError, meuOwnerId, aberturas.data, visitasSemana.data]);
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
