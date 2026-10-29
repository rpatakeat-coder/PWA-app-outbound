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
};

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
