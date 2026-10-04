// O PREPARO DE 10 SEGUNDOS (handoff "Abas do app", 04/10/2026 — docs/12 §1). Antes de entrar
// na porta: em que etapa o negócio está e há quanto tempo (na cor da régua), o último contato,
// quantos contatos já houve (de 4), o que a próxima etapa pede e quem decide. Só leitura e só
// com dado que existe: fichas_de_rua (decisor, horário do dono, sistema, dor), contatos_de_campo
// e client_visits — as mesmas fontes que a fila de Tarefas usa para os contatos.
import { useQuery } from '@tanstack/react-query';

import { supabase } from '../integrations/supabase/client';
import { ETAPA, HORARIOS, PROPS_OBRIGATORIAS_POR_ETAPA, ROTULO_ETAPA, ROTULO_PROP } from './fichaDeRua';

/** As 8 etapas da barra (a mesma ordem do cartão do lead). */
export const FUNIL8 = [ETAPA.prospeccao, ETAPA.visita, ETAPA.decisor, ETAPA.demo, ETAPA.negociacao, ETAPA.pagamento, ETAPA.ganho, ETAPA.onboarding] as const;
const PROXIMA: Record<string, string> = {
  [ETAPA.prospeccao]: ETAPA.visita, [ETAPA.visita]: ETAPA.decisor, [ETAPA.decisor]: ETAPA.demo, [ETAPA.demo]: ETAPA.negociacao,
};
const MINIMO_CONTATOS = 4;

export type FichaDoPreparo = {
  ocorrido_em: string | null; como_foi: string | null; decisor_nome: string | null; decisor_papel: string | null;
  horario_dono: string | null; sistema: string | null; dor: string | null;
};
export type ToqueDoPreparo = { em: string; canal: string; resultado?: string | null };

export type Preparo = {
  /** Índice na barra de 8 (−1 = fora do funil aberto). */
  indice: number;
  etapa: string | null;
  /** "Visita · há 2 dias" (+ " · passou da régua de 3"). */
  etapaTexto: string | null;
  /** 'ok' | 'perto' (≥ 70% da régua) | 'passou'. */
  regua: 'ok' | 'perto' | 'passou' | null;
  ultimo: string;
  contatos: number;
  /** "Para Conversa com decisor: telefone, maior dor" — null quando não há o que pedir. */
  falta: string | null;
  decide: string;
};

const fmtDia = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit' });
const CANAL: Record<string, string> = { visita: 'visita', ligacao: 'ligação', whatsapp: 'WhatsApp', reuniao: 'reunião', email: 'e-mail' };
const COMO_FOI: Record<string, string> = {
  falou_com_decisor: 'falou com quem decide', decisor_ausente: 'quem decide não estava', nao_atendeu: 'não atendeu', sem_interesse: 'sem interesse', estabelecimento_fechado: 'estava fechado',
};

/** Puro: monta o preparo com o que veio do banco. Testado sem rede. */
export function montarPreparo(p: {
  codigo: string | null; diasNaEtapa: number | null; reguaDias: number | null;
  telefone: string | null; fichas: FichaDoPreparo[]; toques: ToqueDoPreparo[];
}): Preparo {
  const indice = p.codigo ? (FUNIL8 as readonly string[]).indexOf(p.codigo) : -1;
  const etapa = p.codigo ? ROTULO_ETAPA[p.codigo] ?? null : null;
  let regua: Preparo['regua'] = null;
  let etapaTexto: string | null = null;
  if (etapa && p.diasNaEtapa != null) {
    const d = p.diasNaEtapa;
    etapaTexto = `${etapa} · há ${d} ${d === 1 ? 'dia' : 'dias'}`;
    if (p.reguaDias != null && p.reguaDias > 0) {
      regua = d > p.reguaDias ? 'passou' : d > p.reguaDias * 0.7 ? 'perto' : 'ok';
      if (regua === 'passou') etapaTexto += ` · passou da régua de ${p.reguaDias}`;
    }
  } else if (etapa) etapaTexto = etapa;

  const toques = [...p.toques].sort((a, b) => b.em.localeCompare(a.em));
  const fichas = [...p.fichas].sort((a, b) => (b.ocorrido_em ?? '').localeCompare(a.ocorrido_em ?? ''));
  const u = toques[0];
  const fichaDoUltimo = u ? fichas.find((f) => f.ocorrido_em && f.ocorrido_em.slice(0, 10) === u.em.slice(0, 10)) : null;
  const ultimo = u
    ? `${CANAL[u.canal] ?? u.canal} ${fmtDia.format(new Date(u.em)).replace('.', '')}${fichaDoUltimo?.como_foi && COMO_FOI[fichaDoUltimo.como_foi] ? ` · ${COMO_FOI[fichaDoUltimo.como_foi]}` : ''}`
    : 'nenhum toque ainda';

  // O que a próxima etapa pede e o app já sabe (ficha de rua e telefone do lead).
  let falta: string | null = null;
  const prox = p.codigo ? PROXIMA[p.codigo] : undefined;
  if (prox) {
    const tem: Record<string, string | null> = {
      celular: p.telefone && p.telefone.replace(/\D/g, '').length >= 10 ? p.telefone : null,
      gargalo_operacional: fichas.find((f) => f.dor)?.dor ?? null,
      nome_do_sistema: fichas.find((f) => f.sistema)?.sistema ?? null,
    };
    const pede = (PROPS_OBRIGATORIAS_POR_ETAPA[prox] ?? []).filter((k) => !(k in tem) || !tem[k]);
    if (pede.length) falta = `Para ${ROTULO_ETAPA[prox]}: ${pede.map((k) => ROTULO_PROP[k] ?? k).join(', ')}`;
    if (prox === ETAPA.decisor && !fichas.some((f) => f.como_foi === 'falou_com_decisor')) {
      falta = falta ? `${falta} · e falar com quem decide` : `Para ${ROTULO_ETAPA[prox]}: falar com quem decide`;
    }
  }

  const comDecisor = fichas.find((f) => f.decisor_nome && f.decisor_nome.trim());
  const h = fichas.find((f) => f.horario_dono)?.horario_dono ?? null;
  const horario = h ? (HORARIOS.find((x) => x.valor === h)?.curto ?? h) : null;
  const decide = comDecisor
    ? `${comDecisor.decisor_nome!.trim()}${comDecisor.decisor_papel ? ` (${comDecisor.decisor_papel.toLowerCase()})` : ''}${horario ? ` · melhor horário ${horario}` : ''}`
    : `Decisor não conhecido${horario ? ` · dono costuma estar ${horario}` : ''}`;

  return { indice, etapa, etapaTexto, regua, ultimo, contatos: Math.min(MINIMO_CONTATOS, toques.length), falta, decide };
}

/** Lê fichas, contatos e visitas do lead (120 dias, como a fila). */
export function usePreparo(clientId: string | null, ativo = true) {
  return useQuery<{ fichas: FichaDoPreparo[]; toques: ToqueDoPreparo[] }>({
    queryKey: ['preparo', clientId],
    enabled: ativo && !!clientId,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const desde = new Date(Date.now() - 120 * 86400000).toISOString();
      const [f, c, v] = await Promise.all([
        supabase.from('fichas_de_rua').select('ocorrido_em, como_foi, decisor_nome, decisor_papel, horario_dono, sistema, dor')
          .eq('client_id', clientId!).order('ocorrido_em', { ascending: false }).limit(10),
        supabase.from('contatos_de_campo').select('ocorrido_em, canal, resultado').eq('client_id', clientId!).gte('ocorrido_em', desde),
        supabase.from('client_visits').select('visited_at').eq('client_id', clientId!).gte('visited_at', desde),
      ]);
      const toques: ToqueDoPreparo[] = [
        ...((c.data ?? []) as Array<{ ocorrido_em: string; canal: string; resultado: string | null }>).map((x) => ({ em: x.ocorrido_em, canal: x.canal, resultado: x.resultado })),
        ...((v.data ?? []) as Array<{ visited_at: string }>).map((x) => ({ em: x.visited_at, canal: 'visita' })),
      ];
      return { fichas: (f.data ?? []) as FichaDoPreparo[], toques };
    },
  });
}
