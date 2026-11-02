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

export function ouvirLeituras(fn: (l: LeituraDoGps) => void): () => void {
  ouvintes.add(fn);
  return () => { ouvintes.delete(fn); };
}
