// A ARMA DO PINO (prancha "Mapa do Executivo", §4 e §4b3, 15/10/26).
//
// "Um dado só, Cockpit ⇄ mapa": o bloco "Para entrar" é montado na hora com o que o negócio
// (HubSpot, pelo snapshot do Cockpit: mapa_negocio) e as fichas de rua já sabem — decisor,
// horário dele, MRR, sistema e dor —, mais o que o pino traz (cobrar, etapa, idade do CNPJ, nota,
// queda). Se o Cockpit mudar o horário do decisor ou o próximo passo, a frase muda na próxima
// leitura: relê a cada 60 s com a folha aberta. Nada é guardado no app além do cache da sessão.
//
// O texto das falas vem do Playbook (página "gatilhos-do-mapa", campo `gatilhos`) quando ele já
// carregou; antes disso, sem sinal ou se a página não existir, vale a cópia v1 do app.
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';
import type { Client } from '../types/client';
import { armasConhecidas, fichasDaFolha, type FichaArmas } from '../utils/armasDaDemo';
import { escolherArma, PAGINAS_GATILHO, type Arma, type GatilhoId, type PaginaGatilho } from '../utils/armasDoMapa';
import type { Pino, TempoDoNegocio } from '../utils/pinoP2';

export type FatosDoNegocio = { decisor: string; papel: string; horario: string; sistema: string; dor: string; mrr: number | null };

const CHAVE_CACHE_PLAYBOOK = 'takeat-playbook-cache';

/** As 9 páginas como estão no Playbook (cache do aparelho), por cima da cópia do app. */
export function paginasDeGatilho(): Record<GatilhoId, PaginaGatilho> {
  try {
    const pb = JSON.parse(window.localStorage.getItem(CHAVE_CACHE_PLAYBOOK) ?? 'null') as { paginas?: { id: string; gatilhos?: Record<string, Partial<PaginaGatilho>> }[] } | null;
    const g = pb?.paginas?.find((p) => p.id === 'gatilhos-do-mapa')?.gatilhos;
    if (!g) return PAGINAS_GATILHO;
    // o Playbook escreve os campos por extenso ("{próximo passo}", "{cliente perto}"); o app usa a chave curta
    const campos = (s: string) => s.replace(/\{próximo passo\}/g, '{proximo}').replace(/\{cliente perto\}/g, '{cliente}').replace(/\{MRR\}/g, '{mrr}');
    const out = { ...PAGINAS_GATILHO };
    for (const k of Object.keys(out).map(Number) as GatilhoId[]) {
      const r = g[String(k)];
      if (!r?.fala) continue;
      out[k] = {
        ...out[k], id: k, fala: campos(r.fala),
        // o título do Playbook traz a explicação entre parênteses: na folha vai só o nome
        ...(r.titulo ? { titulo: r.titulo.replace(/\s*\(.*\)\s*$/, '').trim() || out[k].titulo } : {}),
        ...(r.insistir?.texto ? { insistir: { quando: r.insistir.quando ?? out[k].insistir.quando, texto: campos(r.insistir.texto) } } : {}),
        ...(r.marcar ? { marcar: r.marcar } : {}),
      };
    }
    return out;
  } catch {
    return PAGINAS_GATILHO;
  }
}

/** O que o negócio e as fichas sabem (null = ainda lendo; sem negócio e sem ficha, tudo vazio). */
export function useFatosDoNegocio(c: Client | null, ativo = true) {
  const dealId = c?.id_hubspot ? String(c.id_hubspot) : null;
  return useQuery<FatosDoNegocio>({
    queryKey: ['fatos-do-negocio', c?.id ?? null, dealId],
    enabled: ativo && !!c?.id,
    staleTime: 55 * 1000,
    refetchInterval: 60 * 1000,
    queryFn: async () => {
      const [neg, fichas, folha] = await Promise.all([
        dealId
          ? Promise.resolve(supabase.rpc('mapa_negocio', { p_deal: dealId })).then(({ data }) => (data as Record<string, unknown>) ?? {}, () => ({}))
          : Promise.resolve({} as Record<string, unknown>),
        Promise.resolve(supabase.from('fichas_de_rua').select('ocorrido_em, decisor_nome, decisor_papel, horario_dono, sistema, dor')
          .eq('client_id', c!.id).order('ocorrido_em', { ascending: false }).limit(10))
          .then(({ data }) => (data ?? []) as FichaArmas[], () => [] as FichaArmas[]),
        dealId
          ? Promise.resolve(supabase.from('gv2_falta_etapa').select('criado_em, armas').eq('negocio_id', dealId).order('criado_em', { ascending: false }).limit(5))
            .then(({ data }) => fichasDaFolha((data ?? []) as { criado_em: string; armas: Record<string, unknown> | null }[]), () => [] as FichaArmas[])
          : Promise.resolve([] as FichaArmas[]),
      ]);
      const a = armasConhecidas(neg, [...folha, ...fichas]);
      const mrrBruto = Number(String((neg as Record<string, unknown>).valor_de_mrr ?? '').replace(/[^\d.,]/g, '').replace(',', '.'));
      return { ...a, mrr: Number.isFinite(mrrBruto) && mrrBruto > 0 ? mrrBruto : null };
    },
  });
}

export type ExtrasDaArma = {
  tempo?: TempoDoNegocio | null;
  etapaCodigo?: string | null;
  /** O próximo passo combinado (a tarefa aberta do HubSpot), para a fala 2. */
  proximo?: string | null;
  clientePerto?: string | null;
};

/** O gatilho do pino, com o texto do Playbook. null = nenhum dado: o bloco não aparece. */
export function useArmaDoPino(c: Client | null, p: Pino | null, extras: ExtrasDaArma = {}, ativo = true): { arma: Arma | null; fatos: FatosDoNegocio | null; lendo: boolean } {
  const ehLead = p?.familia === 'lead';
  const fatos = useFatosDoNegocio(c, ativo && ehLead);
  if (!c || !p) return { arma: null, fatos: null, lendo: false };
  // lead: espera a primeira leitura (sem ela, o gatilho 4 apareceria para quem já tem decisor)
  if (ehLead && !fatos.data && fatos.isLoading) return { arma: null, fatos: null, lendo: true };
  const f = fatos.data ?? null;
  const arma = escolherArma({
    familia: p.familia, temp: p.temp, cobrar: p.etiqueta?.texto === 'cobrar', diasNaEtapa: extras.tempo?.diasNaEtapa ?? null,
    etapaCodigo: extras.etapaCodigo ?? extras.tempo?.etapaCodigo ?? null,
    decisor: f?.decisor, horario: f?.horario, mrr: f?.mrr ?? null, proximo: extras.proximo ?? null, sistema: f?.sistema, dor: f?.dor,
    abertoHa: p.abertoHa ?? null, nota: p.nota ?? null, avaliacoes: p.avaliacoes ?? null, queda: p.queda?.motivo ?? null,
    clientePerto: extras.clientePerto ?? null, agora: new Date(),
  }, paginasDeGatilho());
  return { arma, fatos: f, lendo: false };
}
