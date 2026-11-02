// O MENOR ERRO POSSÍVEL DE PINO NO MAPA (Julyan, 02/11/26). O pino nascia onde o executivo estava
// — mesmo do escritório — e era gravado como exato ('coords'), e 'coords' o banco trata como
// confirmado: um pino posto errado ficava errado para sempre (auditoria de 02/11/26: 70 de 439
// visitados com GPS de ±40 m estavam a mais de 100 m do pino; 53 deles 'coords').
//
// Agora a primeira pergunta é "Você está na porta do restaurante?" e a ORIGEM diz o quanto confiar:
//   'checkin'  GPS de ±40 m na porta (cadastro na porta ou correção no Cheguei): o único confirmado;
//   'mapa'     apontado no mapa por gente — na porta com GPS ruim (exato, ele vê a porta) ou pelo
//              "Mover o pino" (aproximado: não sabemos se ele está lá);
//   'geocode'  pelo endereço digitado ("Não estou lá"): sempre aproximado.
// No Cheguei, com GPS bom e o pino longe, o app pergunta se o restaurante é ali e move o pino.
//
// As réguas moram aqui, num lugar só. Rode o teste com:  npx tsx src/utils/precisaoDoPino.teste.ts

/** "Estou na porta": GPS com margem até aqui abre o mapa no GPS (o getBestFix para cedo com ±20–40 m). */
export const PRECISAO_PORTA_M = 50;
/** GPS que CONFIRMA o pino ('checkin'): a mesma régua da mark_client_as_visited e da auditoria (±40 m). */
export const PRECISAO_CONFIRMA_M = 40;
/** Na porta, o ponto final pode ficar até aqui do GPS e ainda ser 'checkin' (ajuste até a porta). */
export const AJUSTE_NA_PORTA_M = 50;
/** No Cheguei, pino CONFIRMADO ('checkin') a mais do que isto do GPS bom: pergunta se o restaurante é ali. */
export const DISTANCIA_PERGUNTA_M = 100;
/** Pino exato mas NÃO confirmado (coords, mapa, google…): régua de 50 m (auditoria de 02/11/26). */
export const DISTANCIA_PERGUNTA_NAO_CONFIRMADO_M = 50;
/** Pino aproximado (veio do endereço): a régua é a mais curta, porque ele nunca foi confirmado. */
export const DISTANCIA_PERGUNTA_APROX_M = 30;

/** 'porta' = o executivo está lá, vendo a porta; 'endereco' = não está lá, o pino vem do endereço. */
export type ModoDoPino = 'porta' | 'endereco';
export type OrigemDoPino = 'checkin' | 'mapa' | 'geocode' | 'coords';
export type GravacaoDoPino = { geo_source: OrigemDoPino; geo_approximate: boolean };

/** Pino confirmado na porta: só o que veio do GPS de ±40 m de alguém ('checkin') e não é aproximado. */
export function pinoConfirmado(c: { geo_source?: string | null; geo_approximate?: boolean | null }): boolean {
  return c.geo_source === 'checkin' && c.geo_approximate !== true;
}

/** O GPS de agora serve para abrir o mapa na porta? Sem leitura, ou com margem acima da régua, não. */
export function gpsServeNaPorta(precisaoM: number | null | undefined): boolean {
  return precisaoM != null && Number.isFinite(precisaoM) && precisaoM <= PRECISAO_PORTA_M;
}

/** O GPS de agora confirma um pino (±40 m)? */
export function gpsConfirma(precisaoM: number | null | undefined): boolean {
  return precisaoM != null && Number.isFinite(precisaoM) && precisaoM <= PRECISAO_CONFIRMA_M;
}

/**
 * Como o pino do cadastro / do Posicionar vai para o banco.
 * - pelo endereço: 'geocode', aproximado — mesmo arrastado (ele não está vendo a porta);
 * - na porta, GPS de ±40 m e o ponto final perto dele: 'checkin', exato (confirmado);
 * - na porta, GPS ruim ou o ponto arrastado para longe do GPS: 'mapa', exato (ele está lá vendo a
 *   porta), mas não confirmado — o próximo Cheguei com GPS bom ainda corrige.
 */
export function gravacaoDoPino(d: { modo: ModoDoPino; precisaoM?: number | null; distanciaDoGpsM?: number | null }): GravacaoDoPino {
  if (d.modo === 'endereco') return { geo_source: 'geocode', geo_approximate: true };
  const perto = d.distanciaDoGpsM != null && Number.isFinite(d.distanciaDoGpsM) && d.distanciaDoGpsM <= AJUSTE_NA_PORTA_M;
  if (gpsConfirma(d.precisaoM) && perto) return { geo_source: 'checkin', geo_approximate: false };
  return { geo_source: 'mapa', geo_approximate: false };
}

/** "Mover o pino" (a mira no mapa, sem saber se ele está na porta): 'mapa', aproximado. */
export const GRAVACAO_DA_MIRA: GravacaoDoPino = { geo_source: 'mapa', geo_approximate: true };
/** "Mover o pino para cá" do Cheguei (GPS de ±40 m, ele na porta): confirmado. */
export const GRAVACAO_DO_CHEGUEI: GravacaoDoPino = { geo_source: 'checkin', geo_approximate: false };

/**
 * ANTES DA 0247 o banco não conhece 'mapa' como pino de gente: se recusar o valor (check) ou se o
 * gatilho clients_protege_posicao_confirmada devolver a posição antiga (ele só deixa mover um pino
 * 'coords' exato para 'coords'/'checkin'), o app grava 'coords' APROXIMADO — o mais perto do certo que
 * o banco de hoje aceita, e nunca um 'coords' exato novo.
 */
export function gravacaoSemMapa(g: GravacaoDoPino): GravacaoDoPino {
  return g.geo_source === 'mapa' ? { geo_source: 'coords', geo_approximate: true } : g;
}

export type LeituraDoGps = { latitude: number; longitude: number; precisaoM: number | null };

/**
 * "Estou na porta": com GPS bom, o mapa abre no GPS e o aviso é nulo. Com GPS ruim ou sem leitura,
 * o mapa abre no melhor lugar que houver (a leitura ruim, senão quem chamou decide) e o aviso pede
 * para arrastar até a porta.
 */
export function decidirPinoNaPorta(leitura: LeituraDoGps | null): {
  centro: { latitude: number; longitude: number } | null;
  gpsBom: boolean;
  aviso: string | null;
} {
  if (!leitura) return { centro: null, gpsBom: false, aviso: 'Sem GPS agora: arraste o pino até a porta.' };
  const centro = { latitude: leitura.latitude, longitude: leitura.longitude };
  if (gpsServeNaPorta(leitura.precisaoM)) return { centro, gpsBom: true, aviso: null };
  const n = leitura.precisaoM != null && Number.isFinite(leitura.precisaoM) ? Math.round(leitura.precisaoM) : null;
  return { centro, gpsBom: false, aviso: n != null ? `GPS impreciso agora (± ${n} m): arraste o pino até a porta.` : 'GPS impreciso agora: arraste o pino até a porta.' };
}

/** "Não estou lá": rua e número; sem número só quando ele diz que não tem. */
export function enderecoCompleto(d: { rua: string; numero: string; semNumero: boolean }): boolean {
  return d.rua.trim().length > 0 && (d.numero.trim().length > 0 || d.semNumero);
}

/**
 * No Cheguei: pergunta "O restaurante é aqui?" só com GPS que confirma (±40 m) e o pino longe dele —
 * mais de 100 m se confirmado ('checkin'), mais de 50 m se exato não confirmado, mais de 30 m se
 * aproximado. Visita declarada (sem GPS que preste) não pergunta: a posição dela não é a porta.
 */
export function deveSugerirMoverPino(d: {
  precisaoM: number | null | undefined;
  distanciaM: number | null | undefined;
  pino: { geo_source?: string | null; geo_approximate?: boolean | null };
  declarada: boolean;
}): boolean {
  if (d.declarada) return false;
  if (!gpsConfirma(d.precisaoM)) return false;
  if (d.distanciaM == null || !Number.isFinite(d.distanciaM)) return false;
  const limite = d.pino.geo_approximate === true
    ? DISTANCIA_PERGUNTA_APROX_M
    : pinoConfirmado(d.pino) ? DISTANCIA_PERGUNTA_M : DISTANCIA_PERGUNTA_NAO_CONFIRMADO_M;
  return d.distanciaM > limite;
}

/** Uma pergunta por pino por visita: o mesmo lead, no mesmo lugar, no mesmo dia, não pergunta de novo. */
export function chaveDaPerguntaDoPino(clientId: string, lat: number, lng: number, dia: string): string {
  return `${clientId}|${lat.toFixed(5)}|${lng.toFixed(5)}|${dia}`;
}

/** O texto da barra de baixo do mapa, por modo (sem coordenada crua: é jargão para o executivo). */
export function textoDaBarraDoPino(d: {
  modo: ModoDoPino;
  lendoGps: boolean;
  precisaoM: number | null;
  depoisPasso: boolean;
}): string {
  const depois = d.depoisPasso ? ' Depois abre o próximo passo.' : '';
  if (d.modo === 'endereco') {
    return 'Pino pelo endereço. Se souber o ponto da porta, arraste o mapa até ele. Fica como posição aproximada até alguém confirmar na porta.' + depois;
  }
  if (d.lendoGps) return 'Lendo o GPS…';
  if (gpsServeNaPorta(d.precisaoM)) {
    return `Pino no seu GPS (± ${Math.round(d.precisaoM as number)} m). Se a porta estiver ao lado, arraste o mapa até ela.` + depois;
  }
  return (d.precisaoM == null || !Number.isFinite(d.precisaoM)
    ? 'Sem GPS agora: arraste o mapa até a porta. Vale como pino na porta, porque você está lá.'
    : `GPS impreciso agora (± ${Math.round(d.precisaoM)} m): arraste o mapa até a porta. Vale como pino na porta, porque você está lá.`) + depois;
}
