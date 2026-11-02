// Teste dos níveis do mapa na rua (prancha "Mapa na rua", 02/11/26).
//
// As cenas são as da prancha (S1…S4F, mesmas posições, mesmos raios, mesmos POIs), na geometria
// dos celulares da prancha. O gabarito é a linha cinza embaixo de cada celular ("N1 … · N2 3 nomes
// · N3 21 pinos"), calculada pela prancha com a mesma regra — aqui conferida nome a nome.
//
// Rode com:  npx tsx src/utils/niveisDoMapa.teste.ts
import { niveisDoMapa, assinaturaDosNiveis, escolherN1, rankN2, metrosTexto, minutosAPe, type Caixa, type ModoDoMapa, type NiveisDaCena, type PinoDaCena } from './niveisDoMapa';

let falhas = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'OK    ' : 'FALHA ') + m);
  if (!c) falhas++;
};
const igual = (a: unknown, b: unknown, m: string) => {
  const sa = JSON.stringify(a); const sb = JSON.stringify(b);
  ok(sa === sb, sa === sb ? m : `${m} — veio ${sa}, esperado ${sb}`);
};

// ── as cenas da prancha ─────────────────────────────────────────────────────────────────────
type Spec = { k: string; dx: number; dy: number; n?: string; d?: number; temp?: 'Q' | 'M' | 'F'; num?: number; why?: string;
  queda?: boolean; cobrar?: boolean; days?: number; nota?: string; semDono?: boolean; prop?: boolean; members?: Spec[] };
const S1: Spec[] = [
  { k: 'next', dx: -20, dy: -70, n: 'Senhor Bacon', d: 120, temp: 'M', num: 3, why: 'proposta pronta' },
  { k: 'done', dx: -110, dy: 120, num: 1, temp: 'Q', n: 'Café Bonfim' },
  { k: 'done', dx: -44, dy: 150, num: 2, temp: 'M', n: 'Bar Lua' },
  { k: 'plan', dx: 118, dy: -168, num: 4, temp: 'F', n: 'Cantina 1912', d: 320 },
  { k: 'plan', dx: 150, dy: 62, num: 5, temp: 'F', n: 'Golden Tulip Bistrô', d: 520 },
  { k: 'plan', dx: -150, dy: -300, num: 6, temp: 'M', n: 'Berlim Bistrô', d: 760 },
  { k: 'cli', dx: 78, dy: -236, n: 'Make a Coffee', d: 210, queda: true },
  { k: 'lead', dx: -92, dy: -118, temp: 'M', n: 'Piu Restaurante', d: 240, cobrar: true },
  { k: 'rec', dx: -36, dy: 48, n: 'Berlimbiss', d: 90, days: 81 },
  { k: 'rec', dx: 160, dy: -300, n: 'Doce Vila', d: 620, days: 63 },
  { k: 'rec', dx: -150, dy: -30, n: 'Empório Lírio', d: 380, days: 12 },
  { k: 'cli', dx: 172, dy: -62, d: 470 }, { k: 'cli', dx: -170, dy: 108, d: 600 }, { k: 'cli', dx: 150, dy: -350, d: 900 }, { k: 'cli', dx: 24, dy: 190, d: 300 },
  { k: 'top', dx: -160, dy: -196, nota: '4,7', d: 600 }, { k: 'top', dx: -20, dy: -250, nota: '4,6', d: 420 }, { k: 'top', dx: 104, dy: -108, nota: '4,8', d: 260 }, { k: 'top', dx: -124, dy: 200, nota: '4,5', d: 500 }, { k: 'top', dx: 184, dy: 150, nota: '4,6', d: 700 },
  { k: 'lead', dx: -60, dy: -330, temp: 'F', semDono: true, d: 700 }, { k: 'lead', dx: 122, dy: 150, temp: 'F', d: 420, cobrar: true }, { k: 'lead', dx: -182, dy: 40, temp: 'Q', d: 540 }, { k: 'lead', dx: 64, dy: 84, temp: 'F', d: 200 }, { k: 'lead', dx: -8, dy: -172, temp: 'M', d: 260 },
];
const tirar = (arr: Spec[], nomes: string[]) => arr.filter((p) => !nomes.includes(p.n ?? ''));
const S2 = tirar(S1, ['Berlimbiss', 'Cantina 1912']).concat([
  { k: 'stack', dx: 40, dy: -20, d: 100, members: [{ k: 'lead', dx: 0, dy: 0, temp: 'F', n: 'Doce Lar Confeitaria', d: 100 }, { k: 'rec', dx: 0, dy: 0, days: 81, n: 'Berlimbiss', d: 100 }] },
  { k: 'stack', dx: 118, dy: -168, d: 320, members: [{ k: 'plan', dx: 0, dy: 0, num: 4, temp: 'F', n: 'Cantina 1912', d: 320 }, { k: 'lead', dx: 0, dy: 0, temp: 'M', n: 'Pastel do Zé', d: 320 }] },
]);
const S3: Spec[] = [
  { k: 'next', dx: -60, dy: -96, n: 'Senhor Bacon', d: 120, temp: 'M', num: 3, why: 'proposta pronta' },
  { k: 'rec', dx: -90, dy: 70, n: 'Açaí da Praça', d: 90, days: 6 }, { k: 'rec', dx: 110, dy: -40, n: 'Empório Lírio', d: 160, days: 12 },
  { k: 'rec', dx: -40, dy: -200, n: 'Sushi Kaō', d: 240, days: 27 }, { k: 'rec', dx: 140, dy: 60, n: 'Bistrô Verde', d: 210, days: 45 },
  { k: 'rec', dx: -150, dy: -20, n: 'Berlimbiss', d: 280, days: 81 }, { k: 'rec', dx: 60, dy: -320, n: 'Casa Nona', d: 620, days: 19 },
  { k: 'rec', dx: 170, dy: -236, n: 'Boteco 27', d: 700, days: 70 }, { k: 'rec', dx: -170, dy: -290, n: 'Pão & Prosa', d: 760, days: 38 },
  { k: 'done', dx: -40, dy: 150, num: 2, temp: 'M' }, { k: 'plan', dx: 150, dy: -90, num: 4, temp: 'F', n: 'Cantina 1912', d: 330 },
];
const S4 = tirar(S1, ['Senhor Bacon', 'Café Bonfim', 'Bar Lua', 'Cantina 1912', 'Golden Tulip Bistrô', 'Berlim Bistrô', 'Piu Restaurante']).concat([
  { k: 'sug', dx: -92, dy: -118, temp: 'M', n: 'Piu Restaurante', d: 240, why: 'passo vencido' },
  { k: 'lead', dx: 118, dy: -168, temp: 'F', n: 'Cantina 1912', d: 320, prop: true },
  { k: 'lead', dx: -20, dy: -70, temp: 'M', n: 'Senhor Bacon', d: 120 },
]);
const S4F = tirar(S4, ['Piu Restaurante']).map((p) => ({ ...p, prop: false }))
  .concat([{ k: 'lead', dx: -92, dy: -118, temp: 'M', n: 'Piu Restaurante', d: 240, cobrar: true }, { k: 'rec', dx: 110, dy: 90, n: 'Café Aurora', d: 180, days: 20 }]);
const POIS = [{ dx: -175, dy: 130, t: 'Praça dos Namorados' }, { dx: 40, dy: 116, t: 'Ponto · Av. Rio Branco' }];

// tamanho do pino no nível 2 da prancha (o N1 é 40) — a função look() da prancha
function tamanho(b: Spec, nivel: 1 | 2): { s: number; losango: boolean } {
  if (b.k === 'rec') { const d = b.days ?? 99; return { s: d <= 30 ? 23 : d <= 60 ? 18 : 16, losango: true }; }
  if (nivel === 1 || b.k === 'next' || b.k === 'sug') return { s: 40, losango: false };
  if (b.k === 'plan') return { s: 32, losango: false };
  if (b.k === 'done') return { s: 24, losango: false };
  if (b.k === 'lead') return { s: { Q: 26, M: 24, F: 22 }[b.temp ?? 'F'], losango: false };
  return { s: 26, losango: false };
}

type Cena = { pinos: PinoDaCena[]; faixa: Caixa; posicao: { x: number; y: number }; obst: Caixa[] };
const DIMS: Record<number, number> = { 360: 800, 390: 844, 412: 915, 430: 932 };
function cena(W: number, specs: Spec[], comFaixaDaVez = false): Cena {
  const H = DIMS[W]; const android = W === 360 || W === 412;
  const statusH = android ? 30 : 47; const tabsH = android ? 80 : 84; const fileTop = statusH + 6; const faixaTop = fileTop + 56;
  const folhaTop = H - tabsH - 76 + 4; const chipsTop = folhaTop - 4 - 50;
  const zoneTop = (comFaixaDaVez ? faixaTop + 52 : fileTop + 48) + 8; const zoneBot = chipsTop - 8;
  const cx = Math.round(W / 2); const uy = Math.round(fileTop + 48 + 8 + (zoneBot - fileTop - 56) * 0.66);
  const obst: Caixa[] = [{ x0: W - 60, y0: chipsTop - 58, x1: W, y1: chipsTop },
    ...POIS.map((p) => ({ x0: cx + p.dx, y0: uy + p.dy, x1: cx + p.dx + p.t.length * 6.4, y1: uy + p.dy + 15 }))];
  const pinos = specs.map((sp, i): PinoDaCena => {
    const b = sp.k === 'stack' ? sp.members![0] : sp;
    const x = Math.round(cx + sp.dx); const y = Math.round(uy + sp.dy);
    const { s, losango } = tamanho(b, sp.k === 'next' || sp.k === 'sug' ? 1 : 2);
    const hh = losango ? s * 1.414 : s + 7; const meia = losango ? s * 0.707 : s / 2;
    const cabeca = losango ? { x0: x - meia, x1: x + meia, y0: y - hh, y1: y } : { x0: x - meia, x1: x + meia, y0: y - hh, y1: y - 7 };
    return {
      id: b.n ?? `${b.k}-${i}`, x, y, cabeca, distanciaM: b.d ?? sp.d ?? null, nome: b.n ?? '',
      familia: b.k === 'rec' ? 'rec' : b.k === 'cli' ? 'cli' : b.k === 'top' ? 'av' : 'lead',
      plano: b.num ?? null, feito: b.k === 'done', sugerida: b.k === 'sug', proposta: !!b.prop,
      cobrar: !!b.cobrar, queda: !!b.queda, abertoHa: b.k === 'rec' ? b.days ?? null : null, pilhaN: sp.members?.length ?? 1,
    };
  });
  return { pinos, faixa: { x0: 8, x1: W - 8, y0: zoneTop, y1: zoneBot }, posicao: { x: cx, y: uy }, obst };
}
const rodar = (c: Cena, modo: ModoDoMapa, fonte = 1, motivoN1: string | null = null): NiveisDaCena =>
  niveisDoMapa(c.pinos, { zoom: 'rua', modo, posicao: c.posicao, faixaSegura: c.faixa, fonte, obstaculos: c.obst, motivoN1 });
const nomesN2 = (r: NiveisDaCena) => r.n2.map((x) => x.nome);

// ── 1a · rua, 13h, plano com 6 portas, a próxima a 120 m ──────────────────────────────────────
const r1a = rodar(cena(390, S1), 'plano', 1, 'proposta pronta');
ok(r1a.n1?.id === 'Senhor Bacon', '1a: N1 é a 1ª parada não feita (a 3)');
ok(r1a.n1?.rotulo?.lado === 'dir' && r1a.n1?.rotulo?.linha2 === '120 m · proposta pronta', '1a: rótulo do N1 à direita, "120 m · proposta pronta"');
igual(nomesN2(r1a), ['Cantina 1912', 'Piu Restaurante', 'Empório Lírio'], '1a (390): N2 = plano › cobrar › recém ≤ 30 d (o gabarito da prancha)');
ok(r1a.n3.length === 21, `1a: N3 21 pinos sem nome (veio ${r1a.n3.length})`);
igual(r1a.selos, { 'Make a Coffee': '↓', 'Piu Restaurante': '!' }, '1a: 2 selos, ! e ↓, só a até 400 m (o lead que cobra a 420 m fica sem)');
ok(r1a.n2.length <= 3, '1a: nunca mais de 3 nomes além da próxima porta');
const r1a360 = rodar(cena(360, S1), 'plano', 1, 'proposta pronta');
igual(nomesN2(r1a360), ['Cantina 1912', 'Empório Lírio', 'Make a Coffee'], '1a (360): o Piu não cabe sem cobrir; a fila segue (gabarito 8a)');
ok(r1a360.n1?.rotulo?.lado === 'acima', '1a (360): o N1 vai para cima quando direita e esquerda batem');
igual(nomesN2(rodar(cena(430, S1), 'plano')), ['Cantina 1912', 'Piu Restaurante', 'Empório Lírio'], '1a (430): largura nova não aumenta o limite de 3');
igual(nomesN2(rodar(cena(412, S1), 'plano')), ['Cantina 1912', 'Piu Restaurante', 'Empório Lírio'], '1a (412): os mesmos nomes');

// ── 2a · pilha ──────────────────────────────────────────────────────────────────────────────
const r2a = rodar(cena(390, S2), 'plano');
igual(nomesN2(r2a), ['Cantina 1912 +1', 'Piu Restaurante', 'Empório Lírio'], '2a: a pilha do plano ganha nome "Cantina 1912 +1"');
ok(!r2a.n2.some((x) => x.nome.startsWith('Doce Lar')), '2a: a pilha cujo membro principal não pede ação fica sem nome');

// ── 3a · lente Recém-abertos ────────────────────────────────────────────────────────────────
const r3a = rodar(cena(390, S3), 'lente_recem');
igual(nomesN2(r3a), ['Açaí da Praça', 'Empório Lírio', 'Sushi Kaō'], '3a: os 3 recém ≤ 30 d mais novos a até 400 m');
ok(r3a.n3.length === 7, `3a: N3 7 pinos (veio ${r3a.n3.length})`);
ok(Object.keys(r3a.selos).length === 0, '3a: nenhum selo');

// ── 4a · dia sem plano ──────────────────────────────────────────────────────────────────────
const r4a = rodar(cena(390, S4), 'sem_plano', 1, 'passo vencido');
ok(r4a.n1?.id === 'Piu Restaurante', '4a: sem plano, a porta sugerida é o N1');
ok(r4a.n1?.rotulo?.linha2 === 'sugestão · 240 m · passo vencido', '4a: rótulo "sugestão · 240 m · motivo"');
igual(nomesN2(r4a), ['Cantina 1912', 'Empório Lírio', 'Make a Coffee'], '4a: N2 com a proposta primeiro');
ok(!r4a.selos['Piu Restaurante'], '4a: nunca selo no N1');
ok(r4a.n3.length === 17, `4a: N3 17 pinos (veio ${r4a.n3.length})`);
const r4a360 = rodar(cena(360, S4), 'sem_plano', 1, 'passo vencido');
ok(r4a360.n1?.id === 'Piu Restaurante' && r4a360.n1.rotulo === null && r4a360.rotulosDescartados >= 1,
  '4a (360): o rótulo do N1 que não cabe na faixa não é desenhado (a porta já está na folha) e conta como descartado');

// ── 4c · feriado (a faixa "Feriado · sem expediente" desce a faixa segura) ───────────────────
const c4c = cena(390, S4F, true);
const r4c = rodar(c4c, 'feriado');
ok(r4c.n1 === null, '4c: feriado sem N1 (o N1 é só a bolinha)');
igual(nomesN2(r4c), ['Café Aurora', 'Empório Lírio'], '4c: só recém ≤ 30 d a até 400 m');
ok(Object.keys(r4c.selos).length === 0, '4c: nenhum selo no feriado (nada é cobrado)');
ok(r4c.n3.length === 20, `4c: N3 20 pinos (veio ${r4c.n3.length})`);
ok(r4c.n2.every((x) => x.caixa.y0 >= c4c.faixa.y0), '4c: nenhum nome acima da faixa da vez');
const r4cPlano = rodar(c4c, 'plano');
ok(r4cPlano.n2.length === 3 && Object.keys(rodar(c4c, 'feriado').selos).length === 0, '4c: mesma cena fora do feriado teria 3 nomes e selos; no feriado não');

// ── 8d · 360 com fonte a 130% ───────────────────────────────────────────────────────────────
const c8d = cena(360, S1);
const r8d = rodar(c8d, 'plano', 1.3, 'proposta pronta');
igual(nomesN2(r8d), ['Empório Lírio', 'Make a Coffee'], '8d: com fonte a 130% um nome cai porque não cabe');
ok(r8d.n1?.rotulo != null, '8d: o N1 continua com nome');
ok(r8d.rotulosDescartados >= 1, '8d: os descartados são contados');
const dentro = (cx: Caixa, f: Caixa) => cx.x0 >= f.x0 && cx.x1 <= f.x1 && cx.y0 >= f.y0 && cx.y1 <= f.y1;
ok([r8d.n1?.rotulo, ...r8d.n2].every((x) => !x || dentro(x.caixa, c8d.faixa)), '8d: nenhum rótulo fora da faixa segura');
const zona = { x0: c8d.posicao.x - 24, y0: c8d.posicao.y - 24, x1: c8d.posicao.x + 24, y1: c8d.posicao.y + 24 };
const bate = (a: Caixa, b: Caixa) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
ok([r8d.n1?.rotulo, ...r8d.n2].every((x) => !x || !bate(x.caixa, zona)), '8d: nenhum rótulo na zona da bolinha');
// fonte nunca encolhe: abaixo de 100% conta como 100%
igual(nomesN2(rodar(c8d, 'plano', 0.8)), nomesN2(rodar(c8d, 'plano', 1)), 'fonte menor que 100% não ganha nomes (nunca reduzir)');

// ── todas as larguras e as duas fontes: nada fora da faixa, nada na bolinha, rótulos sem colisão ──
for (const W of [360, 390, 412, 430]) for (const fonte of [1, 1.3]) for (const [nome, specs, modo, faixa] of [['1a', S1, 'plano', false], ['2a', S2, 'plano', false], ['3a', S3, 'lente_recem', false], ['4a', S4, 'sem_plano', false], ['4c', S4F, 'feriado', true]] as const) {
  const c = cena(W, specs as Spec[], faixa);
  const r = rodar(c, modo, fonte, 'motivo');
  const rots = [r.n1?.rotulo, ...r.n2].filter(Boolean) as { caixa: Caixa }[];
  const u = { x0: c.posicao.x - 24, y0: c.posicao.y - 24, x1: c.posicao.x + 24, y1: c.posicao.y + 24 };
  const semColisao = rots.every((a, i) => rots.every((b, j) => i === j || !bate(a.caixa, b.caixa)));
  ok(rots.every((x) => dentro(x.caixa, c.faixa)) && rots.every((x) => !bate(x.caixa, u)) && semColisao && r.n2.length <= 3,
    `${nome} ${W} px fonte ${fonte * 100}%: dentro da faixa, fora da bolinha, sem colisão, ≤ 3`);
}

// ── determinística ─────────────────────────────────────────────────────────────────────────
const cA = cena(390, S1);
const a1 = rodar(cA, 'plano'); const a2 = rodar(cA, 'plano');
ok(assinaturaDosNiveis(a1) === assinaturaDosNiveis(a2), 'mesma cena → mesmos nomes');
const embaralhado = { ...cA, pinos: [...cA.pinos].reverse() };
ok(assinaturaDosNiveis(rodar(embaralhado, 'plano')) === assinaturaDosNiveis(a1), 'a ordem de entrada não muda a saída');
const outra = { ...cA, pinos: cA.pinos.slice(3).concat(cA.pinos.slice(0, 3)) };
ok(assinaturaDosNiveis(rodar(outra, 'plano')) === assinaturaDosNiveis(a1), 'outra rotação da entrada: mesma saída');

// ── até 3 mesmo sobrando espaço ─────────────────────────────────────────────────────────────
const vazio: PinoDaCena[] = Array.from({ length: 6 }, (_, i) => ({
  id: `p${i}`, x: 60 + (i % 2) * 180, y: 150 + Math.floor(i / 2) * 150, cabeca: { x0: 48 + (i % 2) * 180, x1: 72 + (i % 2) * 180, y0: 119 + Math.floor(i / 2) * 150, y1: 143 + Math.floor(i / 2) * 150 },
  distanciaM: 100 + i * 10, nome: `Casa ${i}`, familia: 'lead', plano: null, feito: false, cobrar: true, queda: false, abertoHa: null,
}));
const rv = niveisDoMapa(vazio, { zoom: 'rua', modo: 'plano', posicao: null, faixaSegura: { x0: 8, y0: 60, x1: 382, y1: 700 }, fonte: 1 });
ok(rv.n2.length === 3 && rv.n2.map((x) => x.id).join() === 'p0,p1,p2', 'para em 3, mesmo sobrando espaço (o mais perto primeiro)');
ok(Object.keys(rv.selos).length === 6, 'selo ! em todos os que cobram a até 400 m, com nome ou sem');

// ── bairro e afastado ───────────────────────────────────────────────────────────────────────
const cb = cena(390, S1);
const rb = niveisDoMapa(cb.pinos, { zoom: 'bairro', modo: 'plano', posicao: cb.posicao, faixaSegura: cb.faixa, fonte: 1, obstaculos: cb.obst, motivoN1: 'proposta pronta' });
ok(rb.n1?.id === 'Senhor Bacon' && rb.n1.rotulo?.linha2 === '120 m' && rb.n2.length === 0 && Object.keys(rb.selos).length === 0,
  'bairro: só a próxima com nome e distância; nenhum N2; nenhum selo');
const ra = niveisDoMapa(cb.pinos, { zoom: 'afastado', modo: 'plano', posicao: cb.posicao, faixaSegura: cb.faixa, fonte: 1 });
ok(ra.n1 === null && ra.n2.length === 0 && ra.n3.length === cb.pinos.length, 'afastado: nenhum nome (as placas falam)');

// ── as regras soltas ────────────────────────────────────────────────────────────────────────
const base: PinoDaCena = { id: 'x', x: 0, y: 0, cabeca: { x0: 0, x1: 1, y0: 0, y1: 1 }, distanciaM: 100, nome: 'x', familia: 'lead', plano: null, feito: false, cobrar: false, queda: false, abertoHa: null };
ok(rankN2({ ...base, distanciaM: 401, cobrar: true }, 'plano') === -1, 'a 401 m não entra no N2');
ok(rankN2({ ...base, distanciaM: null, cobrar: true }, 'plano') === -1, 'sem GPS não entra no N2');
ok(rankN2({ ...base, familia: 'rec', abertoHa: 31 }, 'plano') === -1, 'recém de 31 dias não pede nome');
ok(rankN2({ ...base, cobrar: true }, 'feriado') === -1, 'feriado: cobrar não entra');
ok(escolherN1([{ ...base, plano: 2 }, { ...base, id: 'y', plano: 1, feito: true }, { ...base, id: 'z', sugerida: true }], 'plano')?.plano === 2, 'N1: a 1ª parada NÃO feita');
ok(escolherN1([{ ...base, sugerida: true }], 'feriado') === null, 'N1 no feriado: nenhum');
ok(metrosTexto(120) === '120 m' && metrosTexto(1240) === '1,2 km' && minutosAPe(240) === 3 && minutosAPe(20) === 1, 'distância e minutos a pé');

console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo');
if (falhas) process.exit(1);
