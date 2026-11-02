// A LISTA DO QUE ESTÁ FILTRADO NO MAPA (Julyan, 27/10/26: "quando os executivos filtrarem,
// não aparecer só no mapa e virar lista também, com a distância e etc, ou bairro").
//
// O mapa responde ONDE estão; a lista responde QUAL É O PRÓXIMO. Por isso ela ordena por
// distância de onde a pessoa está AGORA (não do centro da tela) e cada linha diz o que falta
// ali — distância sozinha manda o executivo para o lugar mais perto que ele visitou ontem.
//
// Duas honestidades que a lista tem de carregar, medidas em 27/10/26 na base
// (11.251 cadastros): 2.138 têm coordenada APROXIMADA (19%) — geocodificação da rua, não da
// porta — e 426 não têm bairro. Número exato em cima de coordenada aproximada é mentira que
// parece precisa: essas linhas saem com "~" e `aproximado: true`.
//
// Regra pura, testada em listaDoMapa.teste.ts.
import { distanciaTexto } from './cardNovo';

export type ItemDaLista = {
  id: string;
  nome: string;
  bairro: string | null | undefined;
  lat: number | null;
  lng: number | null;
  /** Coordenada da rua, não da porta: a distância é estimativa. */
  aproximado: boolean;
  /** Cor do pino — a bolinha da linha, para a lista falar a mesma língua do mapa. */
  cor: string;
  /** Posição no plano do dia (1, 2, 3…); null = não está no plano. */
  plano: number | null;
  /** `clients.visited_at` — última visita com prova. */
  visitadoEm: string | null | undefined;
  /** Dias parados na etapa, do snapshot do Cockpit. */
  diasNaEtapa: number | null;
  /** Rótulo curto da etapa/estado (a etiqueta do pino). */
  etiqueta: string | null;
  /* ── O MAPA NA RUA (prancha "Mapa na rua" §6, 02/11/26): o que saiu do mapa vem para a linha ── */
  /** Família do pino (o marcador da linha é o mesmo do pino). */
  familia?: 'lead' | 'rec' | 'av' | 'cli' | 'ex' | 'alvo';
  /** Letra/número do pino (Q, M, F, nota). */
  glifo?: string;
  /** Recém-aberto: dias de CNPJ. */
  abertoHa?: number | null;
  /** Passo vencido / prazo estourado (a regra do "cobrar" de hoje). */
  cobrar?: boolean;
  /** Dias sem toque (a última interação ou visita, o que for mais recente). */
  diasSemToque?: number | null;
  /** Cliente em queda: o porquê. */
  queda?: string | null;
  /** O próximo passo combinado (a tarefa aberta). */
  proximo?: { texto: string; quando: string | null; vencido?: boolean } | null;
  /** Parada do plano já feita (ou visitado hoje). */
  feito?: boolean;
};

export type LinhaDaLista = {
  id: string;
  nome: string;
  cor: string;
  /** "Praia do Canto · nunca visitado" */
  sub: string;
  /** "1,2 km", "~350 m" ou null (sem coordenada, ou sem GPS). */
  distancia: string | null;
  aproximado: boolean;
  /** Metros, para ordenar; null vai para o fim. */
  metros: number | null;
  /** Nunca visitado — o que separa os dois blocos na ordem "Nunca visitado". */
  nunca: boolean;
  /* POSIÇÃO NO PLANO (prancha "Mapa limpo" §6, 29/10/26). O dado já entrava em `ItemDaLista` e
     morria aqui; agora sai, porque a Lista passa a separar "NO PLANO" de "FORA DO PLANO, PERTO".
     A parada combinada e o CNPJ que eu nunca vi não podem disputar atenção em pé de igualdade. */
  plano: number | null;
  /* ── O MAPA NA RUA (§6): a linha fala a língua do pino e diz por quê ── */
  marcador: { familia: ItemDaLista['familia'] | null; cor: string; glifo: string; plano: number | null; abertoHa: number | null; feito: boolean };
  /** Por que visitar ("88 dias sem toque", "Recém-aberto há 12 dias", "Parada 4 do plano"). */
  porque: string;
  /** O porquê é de cobrar (âmbar na tela). */
  porqueCobra: boolean;
  /** "Próximo: retorno com o dono · venceu 14/10" ou null. */
  proximo: string | null;
  /** Minutos a pé (80 m/min), null sem distância. */
  minutos: number | null;
};

/** POR QUE VISITAR (prancha "Mapa na rua" §6): a razão que o N2 usa, por extenso. Precedência: a
 *  parada do plano, o que cobra (sem toque, passo vencido), o recém-aberto, a queda, e só então a
 *  situação de sempre ("nunca visitado", "última visita há N dias"). */
export function porqueVisitar(it: ItemDaLista, agora: Date): { texto: string; cobra: boolean } {
  if (it.plano != null) return { texto: it.feito ? `Parada ${it.plano} do plano · feita` : `Parada ${it.plano} do plano`, cobra: false };
  if (it.cobrar || (it.diasSemToque != null && it.etiqueta != null && /parado/.test(it.etiqueta))) {
    if (it.diasSemToque != null && it.diasSemToque > 0) return { texto: `${it.diasSemToque} ${it.diasSemToque === 1 ? 'dia' : 'dias'} sem toque`, cobra: true };
    return { texto: 'Prazo da etapa estourou', cobra: true };
  }
  if (it.proximo?.vencido) return { texto: 'Passo vencido', cobra: true };
  if (it.familia === 'rec' && it.abertoHa != null) {
    return { texto: it.abertoHa === 0 ? 'Recém-aberto hoje' : `Recém-aberto há ${it.abertoHa} ${it.abertoHa === 1 ? 'dia' : 'dias'}`, cobra: false };
  }
  if (it.queda) return { texto: `Cliente em queda · ${it.queda}`, cobra: true };
  const s = situacao(it, agora);
  return { texto: s.charAt(0).toUpperCase() + s.slice(1), cobra: false };
}

/** "Próximo: retorno com o dono · venceu 14/10"; sem passo combinado, a 1ª visita de quem nunca foi visitado. */
export function proximoDaLinha(it: ItemDaLista): string | null {
  if (it.proximo?.texto) {
    const t = it.proximo.texto.charAt(0).toLocaleLowerCase('pt-BR') + it.proximo.texto.slice(1);
    return `Próximo: ${t}${it.proximo.quando ? ` · ${it.proximo.vencido ? 'venceu ' : ''}${it.proximo.quando}` : ''}`;
  }
  if (it.familia === 'cli') return null;
  return nuncaVisitado(it) ? 'Próximo: 1ª visita' : null;
}

export type GrupoDaLista = 'proxima' | 'perto' | 'resto';

/**
 * OS TRÊS GRUPOS DA LISTA (prancha "Mapa na rua" §6, 6a/6b): os mesmos níveis do mapa. A PRÓXIMA
 * é o N1; PEDEM AÇÃO PERTO são os MESMOS nomes do N2, na ordem do mapa; O RESTO NESTE TRECHO é o
 * resto, na ordem da lista (mais perto ou nunca visitado). Quem não está no recorte não entra.
 */
export function gruposDaLista(linhas: LinhaDaLista[], idProxima: string | null, idsPerto: string[]): { grupo: GrupoDaLista; linhas: LinhaDaLista[] }[] {
  const porId = new Map(linhas.map((l) => [l.id, l]));
  const proxima = idProxima && porId.has(idProxima) ? [porId.get(idProxima)!] : [];
  const perto = idsPerto.filter((id) => id !== idProxima && porId.has(id)).map((id) => porId.get(id)!);
  const usados = new Set([...proxima, ...perto].map((l) => l.id));
  return [
    { grupo: 'proxima', linhas: proxima },
    { grupo: 'perto', linhas: perto },
    { grupo: 'resto', linhas: linhas.filter((l) => !usados.has(l.id)) },
  ];
}

/** Dentro do trecho visível do mapa (a região de agora). Sem coordenada, fora. */
export function noTrecho(it: Pick<ItemDaLista, 'lat' | 'lng'>, r: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null): boolean {
  if (!r) return true;
  if (it.lat == null || it.lng == null || !Number.isFinite(it.lat) || !Number.isFinite(it.lng)) return false;
  return Math.abs(it.lat - r.latitude) <= r.latitudeDelta / 2 && Math.abs(it.lng - r.longitude) <= r.longitudeDelta / 2;
}

/** "SANTA ROSA" → "Santa Rosa" (a Casa dos Dados cadastra em caixa alta). */
function grafiaDeTela(b: string): string {
  if (b !== b.toUpperCase()) return b;
  const minusc = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  return b.toLowerCase().split(' ').map((w, i) => (i > 0 && minusc.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

function metrosEntre(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, r = Math.PI / 180;
  const dLa = (b.lat - a.lat) * r, dLo = (b.lng - a.lng) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const diaBRT = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);

/**
 * NUNCA VISITADO — uma definição só, usada pelo texto da linha E pela ordenação. Se cada um
 * tivesse a sua, a lista diria "nunca visitado" numa linha que a ordem tratou como visitada.
 * Data podre no cadastro conta como nunca visitado: visita que não dá para datar não prova nada.
 */
export function nuncaVisitado(it: ItemDaLista): boolean {
  return dataDaVisita(it) == null;
}

/**
 * A ÚNICA leitura da data da visita. `null` = não há visita datável.
 *
 * Uma função só porque o `diaBRT` abaixo é `Intl.DateTimeFormat.format`, que **lança
 * RangeError** com data inválida — e um throw aqui dentro sobe até a BarreiraDeErro e derruba
 * a tela do executivo na rua. Enquanto quem pergunta "nunca visitado?" e quem formata a data
 * lerem o campo pelo mesmo lugar, isso não tem como acontecer.
 */
function dataDaVisita(it: ItemDaLista): Date | null {
  if (!it.visitadoEm) return null;
  const v = new Date(it.visitadoEm);
  return Number.isNaN(v.getTime()) ? null : v;
}

/**
 * O QUE FALTA ALI — a coluna que transforma a lista em ferramenta. Precedência: o plano de hoje
 * manda (já está decidido), depois a visita de hoje, depois há quanto tempo foi a última, e só
 * então o tempo parado na etapa. "Nunca visitado" é o estado mais acionável, não um vazio.
 */
export function situacao(it: ItemDaLista, agora: Date): string {
  if (it.plano != null) return `${it.plano}ª parada do plano`;
  const v = dataDaVisita(it);
  if (v) {
    if (diaBRT(v) === diaBRT(agora)) return 'visitado hoje';
    const dias = Math.max(1, Math.floor((agora.getTime() - v.getTime()) / 86400000));
    return dias === 1 ? 'visitado ontem' : `última visita há ${dias} dias`;
  }
  if (it.diasNaEtapa != null && it.diasNaEtapa > 0) {
    return `nunca visitado · ${it.diasNaEtapa} ${it.diasNaEtapa === 1 ? 'dia' : 'dias'} parado`;
  }
  return 'nunca visitado';
}

/**
 * AS DUAS ORDENS (Julyan, 27/10/26: "ordena por nunca visitado primeiro também").
 *
 * - `perto`: só distância. Responde "o que está do meu lado agora".
 * - `novo`: quem nunca foi visitado primeiro e, DENTRO de cada bloco, o mais perto. Responde
 *   "o que ainda não trabalhei aqui perto" — que é outra pergunta, não a mesma com outro
 *   enfeite. Sem a distância como segundo critério, o bloco de nunca visitados sairia numa
 *   ordem qualquer e a pessoa teria de ler a lista inteira para achar o que dá para ir a pé.
 */
export type OrdemDaLista = 'perto' | 'novo';

/**
 * @param eu onde a pessoa está agora; null = sem GPS, e aí a lista é alfabética e não inventa
 *   distância nenhuma.
 */
export function montarLista(itens: ItemDaLista[], eu: { lat: number; lng: number } | null, agora: Date, ordem: OrdemDaLista = 'perto'): LinhaDaLista[] {
  const linhas = itens.map((it) => {
    const temCoord = it.lat != null && it.lng != null && Number.isFinite(it.lat) && Number.isFinite(it.lng);
    const m = eu && temCoord ? metrosEntre(eu, { lat: Number(it.lat), lng: Number(it.lng) }) : null;
    const bairro = String(it.bairro ?? '').trim();
    const partes = [bairro ? grafiaDeTela(bairro) : 'sem bairro no cadastro', situacao(it, agora)];
    if (it.etiqueta) partes.push(it.etiqueta);
    const texto = distanciaTexto(m);
    const pq = porqueVisitar(it, agora);
    return {
      id: it.id,
      nome: it.nome,
      cor: it.cor,
      sub: partes.join(' · '),
      distancia: texto == null ? null : it.aproximado ? `~${texto}` : texto,
      aproximado: it.aproximado,
      metros: m,
      nunca: nuncaVisitado(it),
      plano: it.plano,
      marcador: { familia: it.familia ?? null, cor: it.cor, glifo: it.glifo ?? '', plano: it.plano, abertoHa: it.abertoHa ?? null, feito: !!it.feito },
      porque: pq.texto,
      porqueCobra: pq.cobra,
      proximo: proximoDaLinha(it),
      // acima de 2 km o minuto a pé não ajuda (a parada a 414 km mostrava "5179 min", 02/11/26)
      minutos: m == null || m > 2000 ? null : Math.max(1, Math.round(m / 80)),
    };
  });
  // Sem distância (sem coordenada, ou sem GPS) vai para o fim do SEU bloco, em ordem de nome —
  // o que também é a ordem da lista inteira quando não há GPS.
  const porPerto = (a: LinhaDaLista, b: LinhaDaLista) => {
    if (a.metros == null && b.metros == null) return a.nome.localeCompare(b.nome, 'pt-BR');
    if (a.metros == null) return 1;
    if (b.metros == null) return -1;
    return a.metros - b.metros;
  };
  return linhas.sort((a, b) => {
    if (ordem === 'novo' && a.nunca !== b.nunca) return a.nunca ? -1 : 1;
    return porPerto(a, b);
  });
}
