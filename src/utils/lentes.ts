// Lentes e filtros do mapa do executivo.
//
// PRANCHA "MAPA DO EXECUTIVO" (15/10/26, Claude Design, aprovada pelo Julyan): a lente diz O QUE
// ENTRA no mapa; o que não entra não aparece nem como ponto. "Vender mais e tocar menos": no Meu
// dia ficam o plano, os MEUS leads com negócio e os recém-abertos da minha região — os 8.485
// pinos que não decidem a próxima porta (clientes, ex-clientes, conta-alvo antiga, colega) saíram.
// O que vira ponto agora é só o zoom afastado (a lente continua a mesma, o desenho encolhe).
// Quem tira do mapa dentro da lente são os Filtros, que o vendedor escolhe e vê contados.

import type { Client } from '../types/client';
import { COR, type OrigemPick, type Pino } from './pinoP2';

export type Lente = 'dia' | 'novos' | 'carteira' | 'clientes' | 'alvo' | 'rec' | 'queda' | 'semdono' | 'calor';

/** Na ordem da prancha (§2). No celular, as 4 primeiras ficam na fileira; o resto, em Filtros. */
export const LENTES: { id: Lente; rotulo: string }[] = [
  { id: 'dia', rotulo: 'Meu dia' },
  // RECÉM-ABERTOS (15/10/26, Julyan): CNPJ aberto há até 90 dias, que ainda não tem sistema.
  { id: 'novos', rotulo: 'Recém-abertos' },
  { id: 'carteira', rotulo: 'Carteira' },
  // MAIS AVALIADOS (15/10/26): as contas-alvo do Google com nota 4,5+. Era "Contas-alvo".
  { id: 'alvo', rotulo: 'Mais avaliados' },
  { id: 'rec', rotulo: 'Reconquista' },
  // CLIENTES ATIVOS (28/09/2026, Julyan: "quero clientes ativos, não só reduzindo custo").
  { id: 'clientes', rotulo: 'Clientes' },
  { id: 'queda', rotulo: 'Em queda' },
  { id: 'semdono', rotulo: 'Sem dono' },
  { id: 'calor', rotulo: 'Calor' },
];

/** As que cabem na fileira do celular (390 px); as outras moram em Filtros (≡). */
export const LENTES_DA_FILEIRA: Lente[] = ['dia', 'novos', 'carteira', 'alvo'];

/**
 * Entra no mapa nesta lente? (prancha §2, quadro "Lente · Mostra").
 * - Meu dia: o plano + os meus leads com negócio (perdido não) + os meus recém-abertos;
 * - Recém-abertos: os recém-abertos da minha região + o plano;
 * - Carteira: os meus leads, perdidos inclusive;
 * - Mais avaliados: conta-alvo do Google com nota 4,5+ (de quem for);
 * - Clientes / Em queda: só quem paga (Em queda: só os em queda); Reconquista: ex-clientes;
 * - Sem dono: o que dá para assumir (lead, ex-cliente, recém-aberto, mais avaliado);
 * - Calor: nenhum pino.
 * Em qualquer lente: o plano do dia e o pino aberto. Conta-alvo antiga (CNPJ com mais de 90 dias,
 * ou nota abaixo de 4,5) não aparece em lente nenhuma. `verTodos`: gestor e visualizador, que não
 * têm carteira — veem os recém-abertos de todo mundo.
 */
export function visivelNaLente(lente: Lente, p: Pino, noPlano: boolean, aberto: boolean, verTodos = false): boolean {
  if (noPlano || aberto) return true;
  const meu = p.dono === 'meu';
  /* MEU DIA COM O MAPA DE VERDADE (Julyan, 15/10/26: "quero os recém-abertos no mapa já quando
     abre, junto com os clientes ativos; tirar tudo ficou meio ruim"). Ao abrir: o plano, os meus
     leads com negócio, os recém-abertos, os clientes ativos (prova social na porta ao lado) e as
     contas-alvo DISCRETAS (bolinha transparente, ver contaAlvoDiscreta). Colega, ex-cliente e
     perdido seguem nas lentes próprias. */
  if (lente === 'dia') {
    return (meu && p.familia === 'lead' && p.temp !== 'X' && !p.reciclagem) || (p.familia === 'rec' && (meu || verTodos))
      || p.familia === 'cli' || p.familia === 'av' || p.familia === 'alvo';
  }
  if (p.familia === 'alvo') return false;
  switch (lente) {
    case 'novos': return p.familia === 'rec' && (meu || verTodos);
    case 'carteira': return meu && p.familia === 'lead';
    case 'alvo': return p.familia === 'av';
    case 'clientes': return p.familia === 'cli';
    case 'queda': return p.familia === 'cli' && !!p.queda;
    case 'rec': return p.familia === 'ex';
    case 'semdono': return p.dono === 'sem' && p.familia !== 'cli';
    case 'calor': return false;
  }
}

/** Zoom afastado (bairro inteiro ou mais): o pino vira ponto, menos o plano, o aberto e a próxima porta. */
export const DELTA_AFASTADO = 0.05;

// ---- Filtros -------------------------------------------------------------

export type StatusFiltro = 'lead' | 'cliente' | 'ex' | 'alvo' | 'ganho_fs';
export type TempFiltro = 'Q' | 'M' | 'F' | 'fechado' | 'perdido' | 'alvo';
export type OrigemFiltro = OrigemPick | 'nao_informado';

// DONO, ETAPA E ÚLTIMA VISITA (28/09/2026). O painel prometia "etapa, tempo sem toque,
// dono, visitado" e só filtrava status, temperatura e origem.
export type DonoFiltro = 'meu' | 'colega' | 'sem';
export type VisitaFiltro = 'semana' | 'mes' | 'mais' | 'nunca';
export const ETAPAS_FILTRO = ['Prospecção', 'Visita', 'Conversa com decisor', 'Demo/Proposta', 'Negociação', 'Ag. Pagamento', 'Reciclagem'] as const;
export type EtapaFiltro = (typeof ETAPAS_FILTRO)[number];

export type FiltrosNovos = {
  status: Set<StatusFiltro>;
  temp: Set<TempFiltro>;
  origem: Set<OrigemFiltro>;
  dono: Set<DonoFiltro>;
  etapa: Set<EtapaFiltro>;
  visita: Set<VisitaFiltro>;
};

export const FILTROS_VAZIOS: FiltrosNovos = { status: new Set(), temp: new Set(), origem: new Set(), dono: new Set(), etapa: new Set(), visita: new Set() };

export const ROTULO_DONO: Record<DonoFiltro, string> = { meu: 'Meus', colega: 'De colega', sem: 'Sem dono' };
export const ROTULO_VISITA: Record<VisitaFiltro, string> = { semana: 'Nesta semana (≤ 7 dias)', mes: '8 a 30 dias', mais: 'Há mais de 30 dias', nunca: 'Nunca visitado' };

export function visitaDoFiltro(c: Client, agora = Date.now()): VisitaFiltro {
  if (!c.visited_at) return 'nunca';
  const dias = (agora - Date.parse(c.visited_at)) / 86400000;
  if (!Number.isFinite(dias)) return 'nunca';
  return dias <= 7 ? 'semana' : dias <= 30 ? 'mes' : 'mais';
}
export function etapaDoFiltro(c: Client): EtapaFiltro | null {
  // Só LEAD está no funil: cliente e ex-cliente não têm etapa para filtrar, e
  // conta-alvo sem negócio ainda não entrou nele.
  if (c.status !== 'lead') return null;
  if (!c.id_hubspot && (c.lead_prospeccao_id || c.conta_alvo_place_id)) return null;
  const e = (c.etapa ?? '').trim();
  if (e === 'Pagamento') return 'Ag. Pagamento';
  return (ETAPAS_FILTRO as readonly string[]).includes(e) ? (e as EtapaFiltro) : null;
}

export const ROTULO_STATUS: Record<StatusFiltro, string> = {
  lead: 'Lead', cliente: 'Cliente', ex: 'Ex-Cliente', alvo: 'Conta Alvo', ganho_fs: 'Ganho - Field Sales',
};
export const ROTULO_TEMP: Record<TempFiltro, string> = {
  Q: 'Quente', M: 'Morno', F: 'Frio', fechado: 'Fechado', perdido: 'Perdido', alvo: 'Conta Alvo',
};

// Picklist origem_do_lead do HubSpot, com as cores do prompt final (fundo / texto).
export const ORIGEM: Record<OrigemFiltro, { rotulo: string; fundo: string; tinta: string }> = {
  Rua: { rotulo: 'Rua', fundo: '#3F1D1D', tinta: '#FECACA' },
  'Casa dos Dados': { rotulo: 'Casa dos Dados', fundo: '#1E3A5F', tinta: '#BFDBFE' },
  GoogleMaps: { rotulo: 'Google Maps · motor', fundo: '#3B2A0B', tinta: '#FDE68A' },
  'Indicação': { rotulo: 'Indicação', fundo: '#14532D', tinta: '#BBF7D0' },
  Instagram: { rotulo: 'Instagram', fundo: '#3B1D3A', tinta: '#F5D0FE' },
  Ads: { rotulo: 'Ads', fundo: '#312E81', tinta: '#C7D2FE' },
  Familia: { rotulo: 'Família', fundo: '#1F3A34', tinta: '#A7F3D0' },
  Eventos: { rotulo: 'Eventos', fundo: '#3A2410', tinta: '#FDBA74' },
  nao_informado: { rotulo: 'Origem não informada', fundo: '#2A2F38', tinta: '#C9CED6' },
};

export function statusDoFiltro(c: Client, p: Pino): StatusFiltro {
  if (c.status === 'ganho_fs') return 'ganho_fs';
  if (p.tipo === 'alvo') return 'alvo';
  if (p.tipo === 'ex') return 'ex';
  if (c.status === 'cliente') return 'cliente';
  return 'lead';
}

export function tempDoFiltro(p: Pino): TempFiltro | null {
  if (p.tipo === 'alvo') return 'alvo';
  if (p.tipo === 'cliente') return 'fechado';
  if (p.temp === 'X') return 'perdido';
  if (p.temp === 'Q' || p.temp === 'M' || p.temp === 'F') return p.temp;
  return null; // ex-cliente e etapa desconhecida não têm temperatura
}

export function origemDoFiltro(p: Pino): OrigemFiltro {
  return p.origem ?? 'nao_informado';
}

/** Cada grupo marcado é um OU dentro dele; grupos diferentes se somam (E). */
export function passaNosFiltros(c: Client, p: Pino, f: FiltrosNovos): boolean {
  if (f.status.size && !f.status.has(statusDoFiltro(c, p))) return false;
  if (f.temp.size) {
    const t = tempDoFiltro(p);
    if (!t || !f.temp.has(t)) return false;
  }
  if (f.origem.size && !f.origem.has(origemDoFiltro(p))) return false;
  if (f.dono?.size && !f.dono.has(p.dono)) return false;
  if (f.etapa?.size) {
    const e = etapaDoFiltro(c);
    if (!e || !f.etapa.has(e)) return false;
  }
  if (f.visita?.size && !f.visita.has(visitaDoFiltro(c))) return false;
  return true;
}

export function quantosFiltros(f: FiltrosNovos): number {
  return f.status.size + f.temp.size + f.origem.size + (f.dono?.size ?? 0) + (f.etapa?.size ?? 0) + (f.visita?.size ?? 0);
}

/**
 * Contagem de cada chip: quantos passariam se o chip fosse o único do seu
 * grupo, respeitando os OUTROS grupos (é o número que o chip entrega ao tocar).
 */
export function contarChips(itens: { c: Client; p: Pino }[], f: FiltrosNovos) {
  const semStatus = { ...f, status: new Set<StatusFiltro>() };
  const semTemp = { ...f, temp: new Set<TempFiltro>() };
  const semOrigem = { ...f, origem: new Set<OrigemFiltro>() };
  const semDono = { ...f, dono: new Set<DonoFiltro>() };
  const semEtapa = { ...f, etapa: new Set<EtapaFiltro>() };
  const semVisita = { ...f, visita: new Set<VisitaFiltro>() };
  const status = new Map<StatusFiltro, number>();
  const temp = new Map<TempFiltro, number>();
  const origem = new Map<OrigemFiltro, number>();
  const dono = new Map<DonoFiltro, number>();
  const etapa = new Map<EtapaFiltro, number>();
  const visita = new Map<VisitaFiltro, number>();
  for (const { c, p } of itens) {
    if (passaNosFiltros(c, p, semStatus)) { const k = statusDoFiltro(c, p); status.set(k, (status.get(k) ?? 0) + 1); }
    if (passaNosFiltros(c, p, semTemp)) { const k = tempDoFiltro(p); if (k) temp.set(k, (temp.get(k) ?? 0) + 1); }
    if (passaNosFiltros(c, p, semOrigem)) { const k = origemDoFiltro(p); origem.set(k, (origem.get(k) ?? 0) + 1); }
    if (passaNosFiltros(c, p, semDono)) { const k = p.dono; dono.set(k, (dono.get(k) ?? 0) + 1); }
    if (passaNosFiltros(c, p, semEtapa)) { const k = etapaDoFiltro(c); if (k) etapa.set(k, (etapa.get(k) ?? 0) + 1); }
    if (passaNosFiltros(c, p, semVisita)) { const k = visitaDoFiltro(c); visita.set(k, (visita.get(k) ?? 0) + 1); }
  }
  return { status, temp, origem, dono, etapa, visita };
}

/** Zoom afastado (prancha §1, "Zoom afastado"): o recém-aberto vira losango de 9 px (preto e
 *  branco, conforme o tema); o lead, ponto de 10 px na cor da temperatura; o resto, ponto de 9 px
 *  na cor da família. `claro`: tema claro (o losango inverte). */
export function pontoDe(p: Pino, claro = false): { cor: string; borda: string; forma: 'bola' | 'losango'; tamanho: number; opacidade: number } {
  void claro; // o limão neon lê nos dois temas (era preto e branco, invertido no claro)
  if (p.familia === 'rec') return { cor: COR.rec, borda: COR.recTinta, forma: 'losango', tamanho: 10, opacidade: 1 };
  return { cor: p.cor, borda: '#FFFFFF', forma: 'bola', tamanho: p.familia === 'lead' ? 10 : 9, opacidade: p.dono === 'colega' ? 0.55 : 1 };
}

/** Conta-alvo que vai como bolinha transparente (no Meu dia e em qualquer lente que não a dela,
 *  "Mais avaliados"): está no mapa, mas não compete com o lead, o recém-aberto e o cliente. */
export function contaAlvoDiscreta(lente: Lente, p: Pino): boolean {
  return p.familia === 'alvo' || (p.familia === 'av' && lente !== 'alvo');
}
