// AS PLACAS DE BAIRRO DO ZOOM AFASTADO (prancha "Mapa do Executivo", §5 e quadro 7, 15/10/26).
//
// Afastado, o que está na lente vira ponto e cada bairro ganha uma placa: "Praia do Canto · 18
// novos" e, embaixo, em verde, "6 clientes Takeat" — a referência sem pôr os 2.938 pinos de
// cliente no mapa. Regra pura (testada em placasDeBairro.teste.ts): agrupa pelo bairro DENTRO da
// cidade (sem acento, sem caixa: "Centro" de Vitória não é o "Centro" de Vila Velha), fica com os
// maiores e tira a placa que cairia em cima de outra.

export type FamiliaDaPlaca = 'rec' | 'lead' | 'cli' | 'outro';
export type ItemDaPlaca = { id: string; bairro: string | null | undefined; cidade?: string | null; lat: number; lng: number; familia: FamiliaDaPlaca };
export type ClienteDaPlaca = { bairro: string | null | undefined; cidade?: string | null };
export type Placa = { chave: string; bairro: string; lat: number; lng: number; titulo: string; clientes: string | null; n: number };

const sem = (b: string | null | undefined) =>
  String(b ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const chaveDe = (bairro: string | null | undefined, cidade: string | null | undefined) => {
  const b = sem(bairro);
  return b ? `${sem(cidade)}|${b}` : '';
};

/** "SANTA ROSA" → "Santa Rosa" (o cadastro da Casa dos Dados vem em caixa alta). */
function grafiaDeTela(b: string): string {
  if (b !== b.toUpperCase()) return b;
  const minusc = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  return b.toLowerCase().split(' ').map((w, i) => (i > 0 && minusc.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

/**
 * @param distanciaMinima em graus de latitude: duas placas mais perto que isso, fica a maior.
 */
export function placasDeBairro(itens: ItemDaPlaca[], clientes: ClienteDaPlaca[], maximo = 6, distanciaMinima = 0.01): Placa[] {
  const grupos = new Map<string, { bairro: string; lat: number; lng: number; n: number; rec: number; lead: number; cli: number }>();
  for (const it of itens) {
    const k = chaveDe(it.bairro, it.cidade);
    if (!k) continue;
    const g = grupos.get(k) ?? { bairro: String(it.bairro).trim(), lat: 0, lng: 0, n: 0, rec: 0, lead: 0, cli: 0 };
    // a grafia da placa: a que não está toda em caixa alta ("Praia do Canto", não "PRAIA DO CANTO")
    const grafia = String(it.bairro).trim();
    if (g.bairro === g.bairro.toUpperCase() && grafia !== grafia.toUpperCase()) g.bairro = grafia;
    g.lat += it.lat; g.lng += it.lng; g.n++;
    if (it.familia === 'rec') g.rec++; else if (it.familia === 'lead') g.lead++; else if (it.familia === 'cli') g.cli++;
    grupos.set(k, g);
  }
  const cli = new Map<string, number>();
  for (const c of clientes) { const k = chaveDe(c.bairro, c.cidade); if (k) cli.set(k, (cli.get(k) ?? 0) + 1); }
  const ordem = [...grupos.entries()].sort((a, b) => b[1].n - a[1].n);
  const out: Placa[] = [];
  for (const [k, g] of ordem) {
    if (out.length >= maximo) break;
    const lat = g.lat / g.n; const lng = g.lng / g.n;
    if (out.some((p) => Math.abs(p.lat - lat) < distanciaMinima && Math.abs(p.lng - lng) < distanciaMinima * 1.3)) continue;
    const nome = grafiaDeTela(g.bairro);
    const conta = g.rec > 0 ? `${g.rec} ${g.rec === 1 ? 'novo' : 'novos'}`
      : g.lead > 0 ? `${g.lead} ${g.lead === 1 ? 'lead' : 'leads'}`
        : g.cli > 0 ? `${g.cli} ${g.cli === 1 ? 'cliente' : 'clientes'}`
          : `${g.n} ${g.n === 1 ? 'pino' : 'pinos'}`;
    // a linha verde é a referência: na lente de clientes ela repetiria a própria placa
    const nc = g.rec === 0 && g.lead === 0 && g.cli > 0 ? 0 : (cli.get(k) ?? 0);
    out.push({ chave: k, bairro: nome, lat, lng, titulo: `${nome} · ${conta}`, clientes: nc ? `${nc} ${nc === 1 ? 'cliente Takeat' : 'clientes Takeat'}` : null, n: g.n });
  }
  return out;
}
