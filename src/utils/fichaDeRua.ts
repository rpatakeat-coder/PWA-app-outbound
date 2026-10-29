// Ficha de rua (mapa novo, entrega 5; prompt final corrigido §8.3): regras sem React.
//
// A ficha abre depois do check-in e pede SÓ o que falta. Dois campos são
// obrigatórios (Como foi e Próximo passo). Tudo que vai para o HubSpot sai pela
// porta única do Cockpit, POST cockpit-api/negocio-acao (contrato lido no
// bundle em 25/09/2026):
//   - nota da visita: op 'nota' com o bloco DESFECHO_VISITA v1 inteiro;
//   - próximo passo com data: op 'nota' + tipoAcao 'proximo-passo' (cria a
//     tarefa e grava nome_do_sistema/gargalo pela `qualificacao`);
//   - etapa: op 'mudar-etapa', com as regras do servidor espelhadas aqui
//     (não pula fase; Reciclagem/Perdido de qualquer etapa; Ganho proibido;
//     PROPS_OBRIGATORIAS_POR_ETAPA).

import { GARGALOS, montarBlocoDesfecho, proximoDiaUtil, type Desfecho, type Gargalo } from './desfechoVisita';

export { GARGALOS };
export type { Gargalo };

export const COMO_FOI: { id: Desfecho; rotulo: string }[] = [
  { id: 'falou_com_decisor', rotulo: 'Falei com quem decide' },
  { id: 'decisor_ausente', rotulo: 'Quem decide não estava' },
  { id: 'sem_interesse', rotulo: 'Não quis conversar' },
  { id: 'estabelecimento_fechado', rotulo: 'Estava fechado' },
];

/* 'apresentei' (14/10/26, handoff "app menos tela"): a demo foi feita na hora. Não existe em
   fichas_de_rua.proximo (check da 0120): no banco vai como 'reuniao' (é assim que o placar conta
   demo com decisor), com proximo_tipo 'follow-up' e etapa_depois. */
/* A VISITA DE RETORNO (14/10/26, Julyan: "se eu já falei com quem decide na 1ª vez, ele abre as
   mesmas opções de novo"). Com o negócio já em Demo/Proposta ou Negociação, o "E agora?" fala
   da proposta: 'fechou' (vai a Negociação e abre a cobrança), 'negociando' (vai a Negociação,
   retorno num dia escolhido) e 'retorno' (vai pensar, retorno num dia escolhido). Nenhum dos
   três existe no check de fichas_de_rua.proximo: no banco vão null (ver fichaNoBanco). */
export type Proximo = 'reuniao' | 'voltar7' | 'ligar_amanha' | 'sem_interesse' | 'voltar_horario' | 'voltar_amanha' | 'apresentei'
  | 'fechou' | 'negociando' | 'retorno';
export const PROXIMOS: { id: Proximo; rotulo: string }[] = [
  { id: 'reuniao', rotulo: 'Reunião' },
  { id: 'voltar7', rotulo: 'Voltar outro dia' },
  { id: 'ligar_amanha', rotulo: 'Ligar amanhã' },
  { id: 'sem_interesse', rotulo: 'Sem interesse' },
];
/* Toda volta à porta pede o DIA, escolhido por quem esteve lá: o dono que "volta à tarde"
   e o que "só segunda" não cabem num prazo fixo. Dias úteis, como a reunião. */
export const PROXIMOS_DE_VOLTA: Proximo[] = ['voltar7', 'voltar_horario', 'voltar_amanha', 'retorno', 'negociando'];
/** As opções da visita de retorno que levam a Negociação (pedem plano e MRR, como o "Apresentei agora"). */
export const PROXIMOS_PARA_NEGOCIACAO: Proximo[] = ['fechou', 'negociando'];
export const ehVolta = (p: Proximo | null | undefined): boolean => !!p && PROXIMOS_DE_VOLTA.includes(p);
export const DIAS_VOLTA = [
  { dias: 1, rotulo: 'Amanhã' },
  { dias: 2, rotulo: 'Em 2 dias' },
  { dias: 3, rotulo: 'Em 3 dias' },
  { dias: 5, rotulo: 'Em 1 semana' },
] as const;
export { proximoDiaUtil };

export const DIAS_REUNIAO = [
  { dias: 1, rotulo: 'Amanhã' },
  { dias: 3, rotulo: 'Em 3 dias' },
  { dias: 5, rotulo: 'Em 1 semana' },
] as const;

// "E agora?" depende do "Como foi?" (handoff v4.1 §6.4). Reunião vem em três
// chips (amanhã, 3 dias, 1 semana) para caber nos 3 toques.
export type OpcaoAgora = { id: string; rotulo: string; proximo: Proximo; dias?: number; sub?: string };
/* As duas que faltavam (Julyan, 14/10/26: "ele pode ter criado na hora e feito a reunião no
   dia"). Vêm primeiro e maiores, com uma linha dizendo o que acontece. */
const APRESENTEI: OpcaoAgora = { id: 'apresentei', rotulo: 'Apresentei agora', proximo: 'apresentei', sub: 'vai a Demo/Proposta' };
const REUNIAO_HOJE: OpcaoAgora = { id: 'reuniao0', rotulo: 'Reunião hoje, mais tarde', proximo: 'reuniao', dias: 0, sub: 'só a hora' };
export const HORAS_REUNIAO_HOJE = ['14:00', '15:00', '16:00', '17:00'] as const;
/** A hora como se escreve no WhatsApp ("9", "9h", "9:40", "940", "14h30") → "HH:MM"; null se não é hora. A MESMA regra do Planejamento do Cockpit. */
export function horaLivre(txt: string | null | undefined): string | null {
  const t = String(txt ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return null;
  let h: number; let m = 0;
  if (/^[0-9]{3,4}$/.test(t)) { h = Number(t.slice(0, -2)); m = Number(t.slice(-2)); } else {
    const p = /^([0-9]{1,2})(?:[:h.,]([0-9]{0,2}))?(?:min)?$/.exec(t);
    if (!p) return null;
    h = Number(p[1]);
    m = p[2] ? Number(p[2].length === 1 ? `${p[2]}0` : p[2]) : 0;
  }
  if (!(h >= 0 && h <= 23 && m >= 0 && m <= 59)) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
const REUNIOES: OpcaoAgora[] = [
  { id: 'reuniao1', rotulo: 'Reunião amanhã', proximo: 'reuniao', dias: 1 },
  { id: 'reuniao3', rotulo: 'Reunião em 3 dias', proximo: 'reuniao', dias: 3 },
  { id: 'reuniao5', rotulo: 'Reunião em 1 semana', proximo: 'reuniao', dias: 5 },
];
/* "Voltar em 7 dias" virou "Voltar outro dia" (03/10/26, Julyan: "o executivo tem que
   escolher a data de retorno, 7 dias talvez seja demais"). O id 'voltar7' fica: é o que já
   está gravado em visitas_fichas e o que o Cockpit lê. */
const VOLTAR7: OpcaoAgora = { id: 'voltar7', rotulo: 'Voltar outro dia', proximo: 'voltar7' };
const LIGAR: OpcaoAgora = { id: 'ligar_amanha', rotulo: 'Ligar amanhã', proximo: 'ligar_amanha' };
const SEM: OpcaoAgora = { id: 'sem_interesse', rotulo: 'Sem interesse', proximo: 'sem_interesse' };
const FECHOU: OpcaoAgora = { id: 'fechou', rotulo: 'Fechou', proximo: 'fechou', sub: 'emitir a cobrança' };
const NEGOCIANDO: OpcaoAgora = { id: 'negociando', rotulo: 'Negociando o preço', proximo: 'negociando', sub: 'vai a Negociação' };
const RETORNO: OpcaoAgora = { id: 'retorno', rotulo: 'Vai pensar', proximo: 'retorno', sub: 'retorno no dia que escolher' };
/** "E agora?" depende do "Como foi?" e, na visita de retorno, da etapa em que o negócio já está. */
export function opcoesAgora(comoFoi: Desfecho | null, etapa: string | null = null): OpcaoAgora[] {
  switch (comoFoi) {
    case 'falou_com_decisor':
      if (etapa === ETAPA.demo) return [FECHOU, NEGOCIANDO, RETORNO, VOLTAR7, SEM];
      if (etapa === ETAPA.negociacao) return [FECHOU, RETORNO, VOLTAR7, SEM];
      if (etapa === ETAPA.pagamento) return [VOLTAR7, LIGAR, SEM];
      return [APRESENTEI, REUNIAO_HOJE, ...REUNIOES, VOLTAR7, LIGAR, SEM];
    case 'decisor_ausente': return [{ id: 'voltar_horario', rotulo: 'Voltar no horário do dono', proximo: 'voltar_horario' }, VOLTAR7, LIGAR, SEM];
    case 'sem_interesse': return [VOLTAR7, LIGAR, SEM];
    case 'estabelecimento_fechado': return [{ id: 'voltar_amanha', rotulo: 'Voltar amanhã', proximo: 'voltar_amanha' }, VOLTAR7, LIGAR];
    default: return [];
  }
}

// Melhor horário para achar quem decide. O foodservice tem relógio próprio:
// o dono não atende no rush. `hs` é o valor interno da propriedade
// melhor_horario_do_decisor que o Julyan criou no HubSpot (26/09/2026).
// "Outro horário" (14/10/26): o dono que "só aparece sábado de manhã" não cabe nas 4 faixas,
// e a propriedade é lista fechada (a hubspot-sync recusa o resto). `hs: null` = não vai ao
// HubSpot; o texto digitado fica na ficha (horario_dono) e na nota.
export const HORARIOS: readonly { valor: string; rotulo: string; curto: string; hs: string | null }[] = [
  { valor: 'cedo_antes_10h', rotulo: 'Cedo, antes das 10h', curto: 'antes das 10h', hs: 'Cedo, antes das 10' },
  { valor: '10h_11h30', rotulo: '10h–11h30', curto: '10h–11h30', hs: '10-11:30' },
  { valor: '14h30_17h30', rotulo: '14h30–17h30', curto: '14h30–17h30', hs: '14:30-17:30' },
  { valor: 'noite_apos_17h', rotulo: 'Noite, após 17h', curto: 'após 17h', hs: 'Noite, após as 17' },
  { valor: 'outro', rotulo: 'Outro horário', curto: 'outro', hs: null },
] as const;
export type HorarioDecisor = 'cedo_antes_10h' | '10h_11h30' | '14h30_17h30' | 'noite_apos_17h' | 'outro';
export const HORARIO_OUTRO = 'outro';
/** O horário para a tela: o rótulo da faixa, ou o próprio texto quando foi digitado (horario_dono livre). */
export function rotuloDoHorario(v: string | null | undefined, forma: 'rotulo' | 'curto' = 'rotulo'): string {
  const t = (v ?? '').trim();
  const h = HORARIOS.find((x) => x.valor === t && x.hs);
  return h ? h[forma] : (t === HORARIO_OUTRO ? '' : t);
}

// nome_do_sistema é texto livre no HubSpot; os chips são atalhos (14/10/26: os mais vistos na
// rua do time). "Outro" abre o campo; o que vai ao HubSpot passa por sistemaParaGravar.
export const SISTEMAS = ['Nenhum', 'Saipos', 'Colibri', 'Anota Aí', 'Goomer', 'Frest', 'PDV Legal', 'Consumer', 'Outro'] as const;

// "Outro" nos dois abre um campo curto (14/10/26). clients.categoria e fichas_de_rua.tipo_lugar
// /decisor_papel são texto: o digitado é gravado como está.
export const TIPOS = ['Restaurante', 'Bar', 'Café / Padaria', 'Lanchonete', 'Pizzaria', 'Hamburgueria', 'Japonês', 'Açaí / Sorveteria', 'Delivery', 'Outro'] as const;
export const PAPEIS = ['Dono', 'Gerente', 'Sócio', 'Outro'] as const;
/**
 * O papel que a hubspot-sync `decisor` aceita (PAPEIS_DECISOR: só Dono e Gerente; outro valor é
 * 400 e o contato nem nasce). Sócio é dono no papel; o "Outro" digitado não tem par e vai sem
 * papel — o texto fica na ficha e na nota. 14/10/26.
 */
export function papelParaHubspot(p: string | null | undefined): 'Dono' | 'Gerente' | undefined {
  if (p === 'Dono' || p === 'Gerente') return p;
  if (p === 'Sócio') return 'Dono';
  return undefined;
}

// motivo_do_perdido (VALORES_PERMITIDOS do servidor, enum do HubSpot). UMA lista para todas as
// telas (14/10/26): Ficha, Mudar etapa, Limpar funil, Tarefas e o modal antigo. "Sem retorno"
// voltou, com a regra das 3 tentativas escrita embaixo dos chips.
export const MOTIVOS_PERDIDO: { valor: string; rotulo: string }[] = [
  { valor: 'Preço', rotulo: 'Preço' },
  { valor: 'Funcionalidade', rotulo: 'Funcionalidade' },
  { valor: 'Não quer mudar de sistema', rotulo: 'Não quer mudar de sistema' },
  { valor: 'Sem retorno', rotulo: 'Sem retorno' },
  { valor: 'Reembolso', rotulo: 'Estorno' },
  { valor: 'Outros', rotulo: 'Outros' },
];
export const rotuloDoMotivo = (v: string | null | undefined): string => MOTIVOS_PERDIDO.find((m) => m.valor === v)?.rotulo ?? (v ?? '');
/** A linha pequena sob os chips, quando o motivo escolhido tem regra. */
export const AJUDA_MOTIVO: Record<string, string> = { 'Sem retorno': 'Só depois de 3 tentativas em dias diferentes.' };
/** "O que pesou" (observacao__desqualificado, texto livre no HubSpot): o mesmo limite em toda tela. */
export const MAX_O_QUE_PESOU = 300;

// Maior dor: gargalo_operacional é enum de 6 no HubSpot e os três servidores recusam o resto.
// "Outra" (14/10/26) abre "Qual é a dor?": o texto NUNCA vai como gargalo — fica na ficha, na
// nota e, para a Conversa com decisor, no campo `gargaloOutro` do mudar-etapa.
export const GARGALO_OUTRA = 'Outra';

// ---- Etapas: espelho de lib/acoes-negocio/mudar-etapa-negocio.js ----------
export const ETAPA = {
  prospeccao: '1395880469', visita: '1396005401', decisor: '1395880470', demo: '1395880471',
  negociacao: '1395880472', pagamento: '1395880473', onboarding: '1396006163',
  reciclagem: '1398311191', ganho: '1396006162', perdido: '1396006164',
} as const;
export const ROTULO_ETAPA: Record<string, string> = {
  '1395880469': 'Prospecção', '1396005401': 'Visita', '1395880470': 'Conversa com decisor', '1395880471': 'Demo/Proposta',
  '1395880472': 'Negociação', '1395880473': 'Ag. Pagamento', '1396006163': 'Enviado Onboarding', '1398311191': 'Reciclagem',
  '1396006162': 'Ganho', '1396006164': 'Perdido', '1396007427': 'Backlog', '1413529973': 'Conta Alvo',
};
const ESCADA: string[] = ['1395880469', '1396005401', '1395880470', '1395880471', '1395880472', '1395880473', '1396006163', '1398311191', '1396006162'];
const ISENTAS = new Set<string>([ETAPA.reciclagem, ETAPA.perdido]);

export const PROPS_OBRIGATORIAS_POR_ETAPA: Record<string, string[]> = {
  '1395880469': ['origem_do_lead'],
  '1396005401': [],
  '1395880470': ['celular', 'gargalo_operacional', 'nome_do_sistema'],
  '1395880471': ['valor_de_mrr', 'plano_apresentado', 'data_da_reuniao'],
  '1395880472': ['plano_apresentado', 'valor_de_mrr'],
  '1396006163': [],
  '1396006164': ['motivo_do_perdido'],
  '1398311191': [],
};

/** O servidor aceita ir de `atual` para `destino`? (mesma regra do mudar-etapa). */
export function movimentoPermitido(atual: string | null, destino: string): { ok: boolean; motivo?: string } {
  if (destino === ETAPA.ganho) return { ok: false, motivo: 'Ganho só pelo ASAAS, quando o pagamento confirma.' };
  if (!ESCADA.includes(destino) && destino !== ETAPA.perdido) return { ok: false, motivo: 'Etapa fora do funil aberto.' };
  if (ISENTAS.has(destino) || (atual && ISENTAS.has(atual))) return { ok: true };
  const iAtual = atual ? ESCADA.indexOf(atual) : -1;
  const iNova = ESCADA.indexOf(destino);
  if (iNova > iAtual + 1) return { ok: false, motivo: 'O pipeline não permite pular fases.' };
  return { ok: true };
}

/** Degrau que dá para subir agora rumo a `alvo` (nunca pula fase). */
function degrauRumo(atual: string | null, alvo: string): string | null {
  if (movimentoPermitido(atual, alvo).ok) return alvo;
  const iAtual = atual ? ESCADA.indexOf(atual) : -1;
  const prox = ESCADA[iAtual + 1];
  return prox && movimentoPermitido(atual, prox).ok ? prox : null;
}

/**
 * Os degraus de `atual` até `alvo`, um por vez, como o servidor aceita (não pula fase).
 * Vazio quando já está nele ou além, ou quando a etapa atual é desconhecida.
 */
export function escadaAte(atual: string | null, alvo: string): string[] {
  if (!atual) return [];
  const iAtual = ESCADA.indexOf(atual);
  const iAlvo = ESCADA.indexOf(alvo);
  if (iAtual < 0 || iAlvo < 0 || iAtual >= iAlvo) return [];
  return ESCADA.slice(iAtual + 1, iAlvo + 1);
}

/** Número como o brasileiro escreve: "449", "449,90", "1.200", "1.200,50" → 449 / 449.9 / 1200 / 1200.5. NaN se não é número. */
export function numeroBR(v: unknown): number {
  let s = String(v ?? '').trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return Number(s);
}

/** O valor do CRM conta como resposta? "." , "-", "verificar" e 1 letra são o lixo de quem só queria passar. */
export function valorValido(v: unknown): boolean {
  const s = v == null ? '' : String(v).trim();
  return s.length >= 2 && !/^(verificar|a verificar|n\/a|na|nao sei|não sei|\.+|-+|x+|\?+)$/i.test(s);
}

/**
 * Etapa sugerida (prompt corrigido): Sem interesse → Perdido; "Falei com quem
 * decide" + Reunião → Conversa com Decisor; 1ª visita → Visita; Ligar amanhã /
 * Voltar em 7 dias → mantém. Sempre o degrau que o servidor aceita.
 */
export function etapaSugerida(p: {
  atual: string | null; comoFoi: Desfecho | null; proximo: Proximo | null; primeiraVisita: boolean;
}): string | null {
  const { atual } = p;
  let alvo: string | null = null;
  if (p.proximo === 'sem_interesse') alvo = ETAPA.perdido;
  else if (p.proximo === 'apresentei') alvo = ETAPA.demo;
  else if (p.proximo === 'fechou' || p.proximo === 'negociando') alvo = ETAPA.negociacao;
  else if (p.comoFoi === 'falou_com_decisor' && p.proximo === 'reuniao') alvo = ETAPA.decisor;
  else if (p.primeiraVisita) alvo = ETAPA.visita;
  if (!alvo) return null;
  // Etapa desconhecida no app (pino sem etapa, snapshot sem o negócio): não
  // adivinhar. Chutar o 1º degrau pedia "origem do lead" sem campo na tela e
  // sumia com o Salvar (auditoria 26/09). O servidor sabe a etapa real.
  if (!atual && alvo !== ETAPA.perdido) return null;
  const iAtual = atual ? ESCADA.indexOf(atual) : -1;
  // já está nela ou além (exceto Perdido, que vale de qualquer etapa)
  if (alvo !== ETAPA.perdido && iAtual >= ESCADA.indexOf(alvo) && !ISENTAS.has(atual ?? '')) return null;
  if (alvo === atual) return null;
  const degrau = degrauRumo(atual, alvo);
  return degrau && degrau !== atual ? degrau : null;
}

export type Degrau = { etapa: string; propriedades: Record<string, string>; gargaloOutro?: string };
/**
 * O que a ficha manda de etapa, degrau por degrau (14/10/26). Sobe enquanto cada degrau tem o
 * que o servidor exige; no primeiro que falta, PARA e devolve o que faltou — a visita grava do
 * mesmo jeito. Só vai ao HubSpot o que o negócio ainda não tem válido ou o que foi digitado
 * agora: o celular do cadastro nunca sobrescreve o do negócio.
 */
export function degrausDaFicha(p: {
  degraus: string[]; valores: Record<string, string>; negocio: Record<string, unknown>;
  digitado: Set<string>; dorLivre: string; hoje: string; motivoTexto?: string;
  /** o negócio foi lido do HubSpot? Sem a leitura, só vai o que foi digitado agora (o servidor
      confere contra o que o negócio tem): nada do cadastro ou de ficha velha sobrescreve o CRM */
  negocioLido?: boolean;
}): { vai: Degrau[]; paraEm: string | null; falta: string[] } {
  const vai: Degrau[] = [];
  for (const etapa of p.degraus) {
    const propriedades: Record<string, string> = {};
    const falta: string[] = [];
    let gargaloOutro: string | undefined;
    for (const k of PROPS_OBRIGATORIAS_POR_ETAPA[etapa] ?? []) {
      const manda = p.digitado.has(k) || (p.negocioLido !== false && !valorValido(p.negocio[k]));
      if (k === 'data_da_reuniao') {
        /* a demo foi agora: a reunião é hoje (meia-noite UTC em ms, como o Cockpit grava) */
        propriedades[k] = String(new Date(`${p.hoje}T00:00:00Z`).getTime());
        continue;
      }
      const v = (p.valores[k] ?? '').trim();
      if (k === 'gargalo_operacional') {
        if ((GARGALOS as readonly string[]).includes(v)) { if (manda) propriedades[k] = v; continue; }
        if (valorValido(p.negocio[k])) continue;
        if (p.dorLivre.trim()) { gargaloOutro = p.dorLivre.trim().slice(0, 200); continue; }
        falta.push(k); continue;
      }
      if (k === 'valor_de_mrr') {
        const n = numeroBR(v);
        if (!(isFinite(n) && n > 0)) { if (!valorValido(p.negocio[k])) falta.push(k); continue; }
        if (manda) propriedades[k] = String(n);
        continue;
      }
      if (k === 'plano_apresentado' && v && !(PICKLIST[k] ?? []).includes(v)) { if (!valorValido(p.negocio[k])) falta.push(k); continue; }
      if (!valorValido(v)) { if (!valorValido(p.negocio[k])) falta.push(k); continue; }
      if (manda) propriedades[k] = v;
    }
    if (falta.length) return { vai, paraEm: etapa, falta };
    if (etapa === ETAPA.perdido && p.motivoTexto?.trim()) propriedades.observacao__desqualificado = p.motivoTexto.trim().slice(0, MAX_O_QUE_PESOU);
    vai.push({ etapa, propriedades, ...(gargaloOutro ? { gargaloOutro } : {}) });
  }
  return { vai, paraEm: null, falta: [] };
}

/** Campos que a etapa destino exige e a ficha ainda não tem. */
export function faltandoParaEtapa(destino: string, tem: Record<string, string | null | undefined>): string[] {
  return (PROPS_OBRIGATORIAS_POR_ETAPA[destino] ?? []).filter((k) => !valorValido(tem[k]));
}

export const ROTULO_PROP: Record<string, string> = {
  celular: 'telefone', gargalo_operacional: 'maior dor', nome_do_sistema: 'sistema que usa hoje',
  motivo_do_perdido: 'motivo do perdido', origem_do_lead: 'origem do lead',
  valor_de_mrr: 'valor de MRR', plano_apresentado: 'plano apresentado', data_da_reuniao: 'data da reunião',
};

// ---- Nome de pessoa ---------------------------------------------------------
// Uma palavra, primeiro nome comum (IBGE, Censo 2010), sem termo de comércio.
const PRIMEIROS_NOMES = new Set([
  'maria', 'jose', 'ana', 'joao', 'antonio', 'francisco', 'carlos', 'paulo', 'pedro', 'lucas', 'luiz', 'marcos',
  'luis', 'gabriel', 'rafael', 'daniel', 'marcelo', 'bruno', 'eduardo', 'felipe', 'raimundo', 'rodrigo', 'manoel',
  'mateus', 'andre', 'fernando', 'fabio', 'leonardo', 'gustavo', 'guilherme', 'leandro', 'tiago', 'anderson',
  'ricardo', 'marcio', 'jorge', 'sebastiao', 'alexandre', 'roberto', 'edson', 'diego', 'vitor', 'sergio', 'claudio',
  'julia', 'juliana', 'adriana', 'marcia', 'fernanda', 'patricia', 'aline', 'sandra', 'camila', 'amanda', 'bruna',
  'jessica', 'leticia', 'vanessa', 'mariana', 'gabriela', 'vera', 'vitoria', 'larissa', 'claudia', 'beatriz',
  'luana', 'rita', 'sonia', 'renata', 'eliane', 'josefa', 'simone', 'natalia', 'cristiane', 'carla', 'debora',
  'rosangela', 'jaqueline', 'rosa', 'daniela', 'aparecida', 'marlene', 'terezinha', 'raimunda', 'andreia', 'fabiana',
  'lucia', 'raquel', 'kelly', 'sandro', 'marco', 'renato', 'julio', 'cesar', 'priscila', 'tatiana', 'francisca',
]);
const COMERCIO = /(bar|restaurante|lanch|pizz|cafe|padaria|burg|grill|churrasc|bistro|cozinha|espeto|pastel|acai|sushi|food|delivery|boteco|cantina|emporio|mercad|ltda|eireli)/;
const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function pareceNomeDePessoa(nome: string | null | undefined): boolean {
  const n = norm(nome ?? '');
  if (!n || /\s/.test(n) || COMERCIO.test(n)) return false;
  return PRIMEIROS_NOMES.has(n);
}

// ---- A ficha ---------------------------------------------------------------
export type Ficha = {
  comoFoi: Desfecho | null;
  proximo: Proximo | null;
  diasReuniao: number | null;
  motivoPerdido: string | null;
  nomeDoLugar: string;
  decisor: string;
  papel: (typeof PAPEIS)[number] | null;
  sistema: string;
  dor: Gargalo | null;
  telefone: string;
  tipo: (typeof TIPOS)[number] | null;
  moverEtapa: boolean;
  horario: HorarioDecisor | null;
  /** "Reunião hoje, mais tarde": a hora (HH:MM). */
  horaReuniao: string | null;
  /** "Apresentei agora": plano e MRR (vêm do negócio quando ele já tem). */
  plano: string;
  mrr: string;
  /** Dia da volta (AAAA-MM-DD), escolhido pelo executivo; só vale quando ehVolta(proximo). */
  dataVolta: string | null;
  /* Os textos do "Outro"/"Outra" (14/10/26). dorOutra null = chip "Outra" desmarcado. */
  dorOutra: string | null;
  horarioOutro: string;
  papelOutro: string;
  tipoOutro: string;
  /** "O que pesou" do Sem interesse: obrigatório em MOTIVOS_QUE_EXIGEM_TEXTO. */
  motivoTexto: string;
};

export const FICHA_VAZIA: Ficha = {
  comoFoi: null, proximo: null, diasReuniao: null, motivoPerdido: null, nomeDoLugar: '', decisor: '', papel: null,
  sistema: '', dor: null, telefone: '', tipo: null, moverEtapa: true, horario: null, horaReuniao: null, plano: '', mrr: '', dataVolta: null,
  dorOutra: null, horarioOutro: '', papelOutro: '', tipoOutro: '', motivoTexto: '',
};

/* O valor que a ficha GRAVA (banco e nota) de cada campo com "Outro": o texto digitado no lugar
   do chip. Vazio = não respondido. */
export const dorDaFicha = (f: Ficha): string => (f.dorOutra != null ? f.dorOutra.trim().slice(0, 200) : (f.dor ?? ''));
export const papelDaFicha = (f: Ficha): string => (f.papel === 'Outro' ? f.papelOutro.trim().slice(0, 40) : (f.papel ?? ''));
export const tipoDaFicha = (f: Ficha): string => (f.tipo === 'Outro' ? f.tipoOutro.trim().slice(0, 40) : (f.tipo ?? ''));
/** horario_dono: o valor da faixa ('10h_11h30') ou o texto do "Outro horário". */
export const horarioDaFicha = (f: Ficha): string => (f.horario === HORARIO_OUTRO ? f.horarioOutro.trim().slice(0, 80) : (f.horario ?? ''));

/**
 * Botão Salvar: diz o que falta, ou "Salvar". REGISTRAR A VISITA NUNCA TRAVA pelo que a etapa
 * seguinte exige (14/10/26, handoff "app menos tela"): o "opcional · nunca trava" era mentira
 * quando a ficha sugeria Decisor, e o time escrevia "." no sistema só para passar. O que a
 * etapa pede vira aviso (a visita grava e a etapa fica). Só o que a VISITA precisa trava.
 */
/* O QUE AINDA FALTA PARA O PRÓXIMO PASSO VALER. `null` = vale, ou nem foi escolhido.
   Separado de propósito (29/10/26): estas checagens eram `else if` penduradas no "escolheu um
   próximo passo?" e só rodavam por causa disso. Soltando a obrigatoriedade do próximo passo,
   elas tinham de virar checagens próprias — senão o app passaria a aceitar "Reunião" sem dia,
   que é pior do que travar. */
export function faltaNoProximo(f: Ficha): string | null {
  if (!f.proximo) return null;
  if (f.proximo === 'reuniao' && f.diasReuniao === 0 && !f.horaReuniao) return 'a hora da reunião';
  if (f.proximo === 'reuniao' && f.diasReuniao == null) return 'o dia da reunião';
  if (ehVolta(f.proximo) && !f.dataVolta) return 'o dia da volta';
  if (f.proximo === 'sem_interesse' && !f.motivoPerdido) return 'o motivo';
  if (f.proximo === 'sem_interesse' && MOTIVOS_QUE_EXIGEM_TEXTO.includes(f.motivoPerdido ?? '') && !f.motivoTexto.trim()) return 'o que pesou';
  return null;
}

/* SALVAR NUNCA TRAVA (29/10/26, "a ordem da porta"). Julyan: "o CHEGUEI e marcar o check-in é
   mais importante, depois o próximo passo". A ficha abre quando ele ENCOSTA na porta, antes de
   falar com alguém — exigir ali o "e agora?" é exigir uma resposta que ainda não existe, e foi
   o que produziu 7 de 314 fichas levando a Demo/Proposta desde 14/10, contra 154 demos no mês.
   Agora o botão sempre salva. O que ficou em branco volta na saída, pela faixa pendente.
   `completa` diz se foi inteira: é ela que decide o texto do botão e, no App, se há próximo
   passo para virar tarefa. */
export function rotuloSalvar(f: Ficha): { pode: boolean; texto: string; completa: boolean } {
  const completa = !!f.comoFoi && !!f.proximo && faltaNoProximo(f) == null;
  return { pode: true, texto: completa ? 'Salvar' : 'Salvar o que sei', completa };
}

/** Tarefa do próximo passo (op 'nota' + 'proximo-passo'); null = sem tarefa. */
export function proximoPassoDaFicha(f: Ficha, hoje: string): { data: string; tipo: 'reuniao' | 'visita' | 'follow-up'; texto: string; canal: 'visita' | 'ligacao'; hora?: string } | null {
  /* MEIO PRÓXIMO PASSO NÃO VIRA TAREFA (29/10/26). Agora que salvar não trava, dá para chegar
     aqui com "Reunião" escolhida e sem dia. Uma tarefa sem data é pior que tarefa nenhuma: ela
     some da fila e ninguém cobra. Sem o que falta, a visita grava e o próximo passo fica em
     branco — e a faixa pendente continua pedindo, que é o comportamento certo. */
  if (faltaNoProximo(f) != null) return null;
  /* reunião HOJE: a data é hoje e a hora é a escolhida (proximoDiaUtil anda sempre 1 dia) */
  if (f.proximo === 'reuniao' && f.diasReuniao === 0) return f.horaReuniao ? { data: hoje, tipo: 'reuniao', texto: 'Reunião combinada na visita', canal: 'visita', hora: f.horaReuniao } : null;
  if (f.proximo === 'reuniao' && f.diasReuniao) return { data: proximoDiaUtil(hoje, f.diasReuniao), tipo: 'reuniao', texto: 'Reunião combinada na visita', canal: 'visita' };
  /* demo feita agora: o próximo passo é cobrar a resposta da proposta (sem ele, o negócio
     aparece como "sem próximo passo" no Cockpit) */
  if (f.proximo === 'apresentei') return { data: proximoDiaUtil(hoje, 2), tipo: 'follow-up', texto: 'Retorno da proposta', canal: 'ligacao' };
  /* fechou: o passo é a cobrança, hoje (a tarefa fecha sozinha no Ganho) */
  if (f.proximo === 'fechou') return { data: hoje, tipo: 'follow-up', texto: 'Emitir a cobrança', canal: 'visita' };
  if ((f.proximo === 'retorno' || f.proximo === 'negociando') && f.dataVolta) return { data: f.dataVolta, tipo: 'follow-up', texto: f.proximo === 'negociando' ? 'Retorno da negociação' : 'Retorno da proposta', canal: 'ligacao' };
  /* volta sem o dia escolhido não vira tarefa: o Salvar já pede "o dia da volta" */
  if (ehVolta(f.proximo) && !f.dataVolta) return null;
  if (f.proximo === 'voltar7') return { data: f.dataVolta as string, tipo: 'visita', texto: 'Voltar para nova visita', canal: 'visita' };
  if (f.proximo === 'ligar_amanha') return { data: proximoDiaUtil(hoje, 1), tipo: 'follow-up', texto: 'Ligar', canal: 'ligacao' };
  if (f.proximo === 'voltar_amanha') return { data: f.dataVolta as string, tipo: 'visita', texto: 'Voltar: estava fechado', canal: 'visita' };
  if (f.proximo === 'voltar_horario') {
    /* "Outro horário": o texto digitado entra no lugar da faixa ("só sábado de manhã") */
    const h = rotuloDoHorario(horarioDaFicha(f), 'curto');
    return { data: f.dataVolta as string, tipo: 'visita', texto: h ? `Voltar no horário do dono (${h})` : 'Voltar no horário do dono', canal: 'visita' };
  }
  return null;
}

/** Nota DESFECHO_VISITA v1 (contrato docs/pwa-para-cockpit.md §4). */
export function notaDaVisita(f: Ficha, p: { cliente: string; ocorridoEm: string; hoje: string }): string {
  const passo = proximoPassoDaFicha(f, p.hoje);
  return montarBlocoDesfecho({
    cliente: p.cliente,
    ocorridoEm: p.ocorridoEm,
    canal: 'visita',
    desfecho: f.comoFoi ?? 'outro',
    pessoa: f.decisor || null,
    // os "Outro" (14/10/26) entram com o texto digitado: a nota é onde o gestor lê o que o enum não tem
    papel: papelDaFicha(f) || null,
    // "sim" só quando falou com quem decide; nunca "nao" (vai vazio)
    decisorAlcancado: f.comoFoi === 'falou_com_decisor' ? 'sim' : 'desconhecido',
    dor: dorDaFicha(f) || null,
    observacao: [(f.proximo === 'apresentei' || f.proximo === 'fechou' || f.proximo === 'negociando') && (f.plano || f.mrr.trim()) ? `apresentou: ${[f.plano, f.mrr.trim() ? `MRR R$ ${f.mrr.trim()}` : ''].filter(Boolean).join(' · ')}` : null,
      f.sistema ? `sistema: ${f.sistema}` : null, tipoDaFicha(f) ? `tipo: ${tipoDaFicha(f)}` : null,
      rotuloDoHorario(horarioDaFicha(f)) ? `dono costuma estar: ${rotuloDoHorario(horarioDaFicha(f))}` : null,
      f.proximo === 'sem_interesse' && f.motivoPerdido
        ? `sem interesse: ${f.motivoPerdido}${f.motivoTexto.trim() ? ` (${f.motivoTexto.trim().slice(0, MAX_O_QUE_PESOU)})` : ''}` : null].filter(Boolean).join(' · ') || null,
    proximoPasso: passo ? { canal: passo.canal, dia: passo.data, acao: passo.texto } : null,
  });
}

/** "Ficha N de 5": nome real, decisor, telefone, tipo de lugar, bairro. */
export function completude(dados: { nomeReal: boolean; decisor: boolean; telefone: boolean; tipo: boolean; bairro: boolean }): number {
  return [dados.nomeReal, dados.decisor, dados.telefone, dados.tipo, dados.bairro].filter(Boolean).length;
}

// ---- Campos das etapas (mesmos rótulos, picklists e validação do Cockpit) ----
export const PICKLIST: Record<string, string[]> = {
  origem_do_lead: ['Rua', 'Indicação', 'Casa dos Dados', 'Instagram', 'Ads', 'GoogleMaps', 'Familia', 'Eventos'],
  gargalo_operacional: ['Fila', 'Falta de Garçom', 'Falta de Gestão', 'Sem fidelização', 'Demora na divisão de contas', 'Estoque'],
  plano_apresentado: ['Básico (PDV + delivery)', 'Básico (PDV + mesa + delivery)', 'Inovação', 'Pro', 'Enterprise'],
  motivo_do_perdido: MOTIVOS_PERDIDO.map((m) => m.valor),
};
export type TipoCampo = 'selecao' | 'texto' | 'tel' | 'numero' | 'data';
export const TIPO_CAMPO: Record<string, TipoCampo> = {
  origem_do_lead: 'selecao', gargalo_operacional: 'selecao', plano_apresentado: 'selecao', motivo_do_perdido: 'selecao',
  celular: 'tel', nome_do_sistema: 'texto', valor_de_mrr: 'numero', data_da_reuniao: 'data', observacao__desqualificado: 'texto',
};
// No Cockpit, "Outros" e "Funcionalidade" não explicam sozinhos: pedem o texto.
export const MOTIVOS_QUE_EXIGEM_TEXTO = ['Outros', 'Funcionalidade'];

/** Etapas da folha "Mudar etapa", na ordem do prompt (Reciclagem e Perdido no fim). */
export const ETAPAS_DA_FOLHA: string[] = [
  ETAPA.prospeccao, ETAPA.visita, ETAPA.decisor, ETAPA.demo, ETAPA.negociacao, ETAPA.pagamento, ETAPA.onboarding,
  ETAPA.reciclagem, ETAPA.perdido,
];

/**
 * Valida o que a pessoa digitou e monta `propriedades` no formato que o
 * servidor grava: número > 0 como texto; data como meia-noite UTC em ms
 * (igual ao Cockpit); picklist só com valor da lista.
 */
export function montarPropriedades(destino: string, digitado: Record<string, string>, jaTem: Record<string, unknown>):
  { propriedades: Record<string, string>; erros: Record<string, string>; gargaloOutro?: string } {
  const propriedades: Record<string, string> = {};
  const erros: Record<string, string> = {};
  let gargaloOutro: string | undefined;
  const exigidos = [...(PROPS_OBRIGATORIAS_POR_ETAPA[destino] ?? [])];
  if (destino === ETAPA.perdido && MOTIVOS_QUE_EXIGEM_TEXTO.includes(digitado.motivo_do_perdido ?? '')) exigidos.push('observacao__desqualificado');
  for (const k of exigidos) {
    const v = (digitado[k] ?? '').trim();
    const temNoNegocio = jaTem[k] != null && String(jaTem[k]).trim() !== '';
    if (!v) { if (!temNoNegocio) erros[k] = k === 'observacao__desqualificado' ? 'Este motivo não explica sozinho — escreva o que pesou.' : 'Preencha para mudar a etapa.'; continue; }
    /* Dor "Outra" (14/10/26): o texto vai como `gargaloOutro`, fora das propriedades — o
       servidor aceita no lugar do gargalo obrigatório e o enum do HubSpot nunca recebe texto */
    if (k === 'gargalo_operacional' && v === GARGALO_OUTRA) {
      const t = (digitado.gargalo_outro ?? '').trim().slice(0, 200);
      if (!t) erros[k] = 'Escreva qual é a dor.';
      else gargaloOutro = t;
      continue;
    }
    const tipo = TIPO_CAMPO[k] ?? 'texto';
    if (tipo === 'selecao' && !(PICKLIST[k] ?? []).includes(v)) { erros[k] = 'Escolha uma das opções.'; continue; }
    if (tipo === 'numero') {
      const n = numeroBR(v);
      if (!isFinite(n) || n <= 0) { erros[k] = 'Valor inválido.'; continue; }
      propriedades[k] = String(n); continue;
    }
    if (tipo === 'data') {
      const d = new Date(`${v}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(d.getTime())) { erros[k] = 'Data inválida.'; continue; }
      propriedades[k] = String(d.getTime()); continue;
    }
    propriedades[k] = k === 'observacao__desqualificado' ? v.slice(0, MAX_O_QUE_PESOU) : v;
  }
  /* "O que pesou" opcional (14/10/26): para os motivos que se explicam sozinhos o campo aparece
     igual, e o que foi escrito vai junto — o gestor lê o porquê de todo Perdido, não só de Outros */
  const pesou = (digitado.observacao__desqualificado ?? '').trim();
  if (destino === ETAPA.perdido && pesou && !propriedades.observacao__desqualificado) propriedades.observacao__desqualificado = pesou.slice(0, MAX_O_QUE_PESOU);
  return { propriedades, erros, ...(gargaloOutro ? { gargaloOutro } : {}) };
}
