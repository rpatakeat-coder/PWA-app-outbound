// O MESMO RESTAURANTE COM OUTRO NOME OU OUTRO PINO (05/10/2026). "Deu Bo Bar e Restaurante",
// cliente Takeat desde julho, virou lead novo "Deu BO" pelo Google: o pino do cliente estava a
// 43 km (endereço convertido errado) e a checagem só olhava pinos a ~60 m. E nem o nome casaria:
// a regra pedia palavra de 4+ letras, e "Deu Bo" não tem nenhuma.
//
// Agora o nome é comparado inteiro, sem acento, sem espaço e sem as palavras genéricas do ramo
// ("bar", "restaurante", "e", "ltda"…): "deubo" casa com "deubo". E pino que nasceu de endereço
// convertido não é prova de lugar — um nome igual na mesma cidade basta.

const GENERICAS = new Set([
  'bar', 'bares', 'restaurante', 'restaurantes', 'lanchonete', 'pizzaria', 'ltda', 'me', 'eireli', 'comercio',
  'alimentos', 'e', 'de', 'da', 'do', 'das', 'dos', 'o', 'a', 'the', 'and', 'cia', 'casa',
]);

const ACENTOS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
const semAcento = (t: string) => t.normalize('NFD').replace(ACENTOS, '');

/** "Deu Bo Bar e Restaurante" → "deubo"; "Deu BO" → "deubo". */
export function chaveDoNome(nome: string | null | undefined): string {
  return semAcento(String(nome ?? '')).toLowerCase()
    .split(/[^a-z0-9]+/).filter((w) => w && !GENERICAS.has(w)).join('');
}

/** Mesmo nome? Igual (4+ letras de chave), ou um começa pelo outro com 6+ letras ("Café" não é "Café Pingado"). */
export function mesmoNome(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = chaveDoNome(a), y = chaveDoNome(b);
  if (x.length < 4 || y.length < 4) return !!x && x === y;
  if (x === y) return true;
  return Math.min(x.length, y.length) >= 6 && (x.startsWith(y) || y.startsWith(x));
}

/** Padrão ilike para achar candidatos pelo nome no banco: "Deu BO" → "%deu%bo%". */
export function padraoDoNome(nome: string): string | null {
  const ws = semAcento(nome).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !GENERICAS.has(w));
  return ws.length ? `%${ws.join('%')}%` : null;
}

/** Pino que veio do GPS de alguém (cadastro na rua ou check-in) — esse é prova de lugar. */
export const pinoDeGps = (c: { geo_source?: string | null; geo_approximate?: boolean | null }) =>
  (c.geo_source === 'coords' || c.geo_source === 'checkin') && !c.geo_approximate;
