// A última leitura do GPS do mapa (auditoria 02/11/26). O MapView mantém um watchPosition de alta
// precisão ligado enquanto o app está visível, e o App abria OUTRO GPS a cada "Cheguei" (4–10 s de
// espera) e só lia a posição na abertura. Aqui o mapa publica cada leitura; o Cheguei usa a de
// agora se for boa (getBestFix) e o "perto", a próxima porta e a busca acompanham a pessoa andando.
export type LeituraDoGps = { latitude: number; longitude: number; accuracy: number; em: number };

let ultima: LeituraDoGps | null = null;
const ouvintes = new Set<(l: LeituraDoGps) => void>();

/** O MapView chama a cada leitura do watchPosition. */
export function publicarLeitura(l: LeituraDoGps) {
  ultima = l;
  ouvintes.forEach((fn) => { try { fn(l); } catch { /* um ouvinte não derruba os outros */ } });
}

/** A última leitura, se tiver no máximo `idadeMs` e erro de até `erroMax` metros. */
export function leituraRecente(idadeMs: number, erroMax: number): LeituraDoGps | null {
  if (!ultima) return null;
  if (Date.now() - ultima.em > idadeMs) return null;
  if (!(ultima.accuracy > 0) || ultima.accuracy > erroMax) return null;
  return ultima;
}

/**
 * NA PORTA, A MELHOR LEITURA QUE HOUVER (17/11/26, Julyan: "não posso mais ter erro de GPS com o executivo na
 * frente da porta"). O Cheguei abria uma amostra nova de 10 s e, se ela não chegasse (iPhone voltando do
 * segundo plano, salão fechado), dizia "GPS não respondeu" — com o mapa, ao lado, lendo o GPS o tempo todo.
 * E quando a amostra vinha ruim (±200 m pela rede), ficava com ela mesmo havendo uma leitura boa do mapa de
 * segundos antes. Entre a amostra e a leitura do mapa, vale a de menor erro; sem amostra, a do mapa.
 * A régua da prova não muda: quem decide se conta é o servidor, pela distância e pela margem.
 */
export function escolherLeitura(amostra: LeituraDoGps | null, doMapa: LeituraDoGps | null): LeituraDoGps | null {
  const boa = (l: LeituraDoGps | null) => (l && l.accuracy > 0 && Number.isFinite(l.accuracy) ? l : null);
  const a = boa(amostra), m = boa(doMapa);
  if (!a) return m;
  if (!m) return a;
  return m.accuracy < a.accuracy ? m : a;
}
/** A leitura do mapa que serve de reserva ao Cheguei: até 15 s (o mesmo prazo de "leitura velha") e ±100 m (a régua da prova). */
export const RESERVA_IDADE_MS = 15000;
export const RESERVA_ERRO_M = 100;

export function ouvirLeituras(fn: (l: LeituraDoGps) => void): () => void {
  ouvintes.add(fn);
  return () => { ouvintes.delete(fn); };
}
