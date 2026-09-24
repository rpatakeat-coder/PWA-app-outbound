// "Ja existe esse restaurante aqui?" — a checagem que roda ANTES de cadastrar.
//
// Por que ela existe: 83% dos leads da base entram pelo webhook do HubSpot
// (5.197 de 6.235, medido em 24/09/2026). O vendedor na rua nao sabe o que ja'
// veio por esse caminho, cadastra de novo, e nasce um segundo negocio no CRM.
//
// POR QUE NAO BASTA O TELEFONE. Medido na base inteira: 478 telefones
// aparecem em mais de um lead, em 1.172 linhas. Destes, so' 40 grupos tem o
// mesmo NOME junto — os outros 435 sao casas diferentes que dividem o numero
// (rede, mesmo dono, telefone do contador). O caso que prova: o
// "Cachorro do Bonfa" tem as TRES lojas com o telefone 51995611173. Uma trava
// por telefone bloquearia as tres.
//
// POR QUE NAO BASTA O NOME. 146 grupos compartilham nome+cidade na base, e
// boa parte e' rede de verdade.
//
// Entao o criterio e' o NOME junto com uma segunda evidencia:
//   nome igual  E  (mesmo telefone  OU  a menos de 150 m)
//
// E o nome que vale e' o do RESTAURANTE (`empresa`), nao o do contato
// (`nome`) — o indice `clients_unique_nome_geo` usa `nome`, e e' por isso que
// ele deixou passar o "Best chicken" cadastrado duas vezes como 'Fachada' e
// 'Douglas'. Ver supabase/migrations/0004_clients_unique_nome_geo_skip_hubspot.sql.

/** Raio em que dois cadastros do mesmo nome sao a mesma casa. */
export const RAIO_M = 150;

/** Tira acento, caixa e pontuacao. "Cachorro do Bonfá - Redenção" != "- Harmonia". */
export function normalizarNome(valor: string | null | undefined): string {
  if (!valor) return '';
  const semAcento = valor.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return semAcento
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Ultimos 11 digitos — absorve +55, parenteses, hifen e espaco. */
export function digitosDoTelefone(valor: string | null | undefined): string {
  const so = (valor ?? '').replace(/\D/g, '');
  return so.length >= 10 ? so.slice(-11) : '';
}

/** Haversine em metros. */
export function metrosEntre(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const f1 = rad(a.latitude);
  const f2 = rad(b.latitude);
  const df = rad(b.latitude - a.latitude);
  const dl = rad(b.longitude - a.longitude);
  const h = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Caixa em graus que contem o circulo de `raio` — e' o filtro que vai pro
 * PostgREST, porque `gte/lte` em lat/lon usa indice e `haversine` nao.
 * A distancia exata e' conferida depois, em memoria.
 */
export function caixaDeBusca(latitude: number, longitude: number, raio = RAIO_M) {
  const grauLat = raio / 111_320;
  const cos = Math.cos((latitude * Math.PI) / 180);
  // Perto do polo o cosseno tende a zero e a caixa explodiria; 0.01 limita.
  const grauLon = raio / (111_320 * Math.max(Math.abs(cos), 0.01));
  return {
    latMin: latitude - grauLat,
    latMax: latitude + grauLat,
    lonMin: longitude - grauLon,
    lonMax: longitude + grauLon,
  };
}

export interface LeadExistente {
  id: string;
  nome: string | null;
  empresa: string | null;
  telefone: string | null;
  latitude: number | null;
  longitude: number | null;
  etapa: string | null;
  id_hubspot: string | null;
  created_at: string | null;
}

export interface LeadNovo {
  empresa: string | null;
  nome: string | null;
  telefone: string | null;
  latitude: number;
  longitude: number;
}

export type MotivoDaSuspeita = 'mesmo-telefone' | 'mesmo-lugar';

export interface Parecido {
  lead: LeadExistente;
  motivo: MotivoDaSuspeita;
  distanciaM: number | null;
}

/** O nome que identifica a CASA: empresa quando existe, senao o contato. */
export function nomeDaCasa(x: { empresa: string | null; nome: string | null }): string {
  return normalizarNome(x.empresa) || normalizarNome(x.nome);
}

/**
 * Decide se `existente` e' provavelmente a mesma casa que `novo`.
 * Devolve null quando nao ha' evidencia suficiente.
 */
export function avaliar(novo: LeadNovo, existente: LeadExistente): Parecido | null {
  const nomeNovo = nomeDaCasa(novo);
  if (!nomeNovo || nomeNovo !== nomeDaCasa(existente)) return null;

  const distanciaM =
    existente.latitude != null && existente.longitude != null
      ? metrosEntre(novo, { latitude: existente.latitude, longitude: existente.longitude })
      : null;

  const foneNovo = digitosDoTelefone(novo.telefone);
  if (foneNovo && foneNovo === digitosDoTelefone(existente.telefone)) {
    // Telefone igual vale mesmo longe: o "Salseiro brasa e lenha" duplicou com
    // os dois pins a 33 km, mesmo telefone e mesmo nome.
    return { lead: existente, motivo: 'mesmo-telefone', distanciaM };
  }
  if (distanciaM !== null && distanciaM <= RAIO_M) {
    return { lead: existente, motivo: 'mesmo-lugar', distanciaM };
  }
  return null;
}

/** Avalia todos e devolve os suspeitos, do mais proximo pro mais distante. */
export function parecidos(novo: LeadNovo, candidatos: LeadExistente[]): Parecido[] {
  return candidatos
    .map((c) => avaliar(novo, c))
    .filter((p): p is Parecido => p !== null)
    .sort((a, b) => (a.distanciaM ?? Infinity) - (b.distanciaM ?? Infinity));
}

/** A frase do aviso. Curta: ela vive numa faixa dentro da folha de cadastro. */
export function fraseDoAviso(p: Parecido): string {
  const nome = p.lead.empresa?.trim() || p.lead.nome?.trim() || 'um lead';
  const onde =
    p.motivo === 'mesmo-telefone'
      ? 'com o mesmo telefone'
      : p.distanciaM != null && p.distanciaM < 1
        ? 'neste mesmo ponto'
        : `a ${Math.round(p.distanciaM ?? 0)} m daqui`;
  const etapa = p.lead.etapa ? ` em ${p.lead.etapa}` : '';
  return `“${nome}” já está cadastrado ${onde}${etapa}.`;
}
