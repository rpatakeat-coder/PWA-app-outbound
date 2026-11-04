// A aba Eu enxuta: os textos do topo saem dos mesmos quadros da fixture do Desenvolvimento v2.
// Rodar: npx tsx src/utils/abaEu.teste.ts
import assert from 'node:assert/strict';
import fx from './desenvolvimentoV2.fixture.json';
import { linhaDaSemana, topoDaVariavel } from './abaEu';
import type { Quadro } from '../../supabase/functions/_compartilhado/desenvolvimentoV2';

/* "$base" herda o estado indicado (só o primeiro nível) e "$faixas" vira a tabela, como na suíte do Desenvolvimento v2 */
const E = fx.estados as Record<string, Record<string, unknown>>;
const montar = (k: string): Record<string, unknown> => { const e = E[k]; const b = e.$base ? montar(String(e.$base)) : {}; const r = Object.assign({}, b, e); delete r.$base; return r; };
const resolver = (o: unknown) => JSON.parse(JSON.stringify(o).replace(/"\$faixas"/g, JSON.stringify(fx.faixas))) as Quadro;
const q = (k: string, mexe?: (x: Quadro) => void) => { const x = resolver(montar(k)); mexe?.(x); return x; };
let n = 0;
const ok = (c: boolean, m: string) => { assert.ok(c, m); n++; };
const eq = (a: unknown, b: unknown, m: string) => { assert.deepEqual(a, b, m); n++; };

// ---- a faixa da variável ----
const faixas = (fx.faixas as Array<{ de: number; ate: number | null; porCliente: number }>).slice().sort((a, b) => a.de - b.de);
const quarta = topoDaVariavel(q('quarta'));
ok(/^Novembro · faixa \d da variável$/.test(quarta.kicker), 'kicker: ' + quarta.kicker);
eq(quarta.degraus.length, Math.max(8, 5), 'um degrau por venda até a meta');
eq(quarta.degraus.filter((d) => d === 'feita').length, 5, '5 vendas feitas');
eq(quarta.degraus[5], 'proxima', 'a 6ª é a próxima');
ok(quarta.rsSub === '5 vendas · meta 8', 'rsSub: ' + quarta.rsSub);
/* a 6ª venda muda a faixa quando a faixa da 6ª é outra: o texto diz o valor POR VENDA da faixa nova */
const f5 = faixas.find((f) => 5 >= f.de && (f.ate == null || 5 <= f.ate))!;
const f6 = faixas.find((f) => 6 >= f.de && (f.ate == null || 6 <= f.ate))!;
if (f5 !== f6) {
  ok(quarta.falta === `A próxima venda muda a faixa: +R$ ${f6.porCliente} por venda.`, 'muda a faixa: ' + quarta.falta);
  eq(quarta.proxima.s, 'muda a faixa', 'a grade diz "muda a faixa"');
} else ok(/^Faltam|^A próxima venda vale/.test(quarta.falta), 'sem mudança de faixa: ' + quarta.falta);
/* a próxima venda é retroativa: 6 × faixa(6) − 5 × faixa(5) */
eq(quarta.proxima.v, `+R$ ${(6 * f6.porCliente - 5 * f5.porCliente).toLocaleString('pt-BR').replace(/\./g, '.')}`, 'próxima venda retroativa');
// zero vendas: a faixa é a da 1ª venda, e o R$ é zero
const zero = topoDaVariavel(q('quarta', (x) => { x.variavel!.vendas = 0; }));
eq(zero.rs, 'R$ 0', 'zero vendas, R$ 0');
ok(zero.kicker.endsWith('faixa 1 da variável'), 'zero vendas na faixa 1');
eq(zero.degraus[0], 'proxima', 'a 1ª venda é a próxima');
// meta batida
const bateu = topoDaVariavel(q('quarta', (x) => { x.variavel!.vendas = 9; }));
ok(bateu.falta.startsWith('Meta batida: 9 de 8.'), 'meta batida: ' + bateu.falta);
eq(bateu.degraus.length, 9, 'passou da meta: um degrau por venda');
// sem fonte: traço, nunca zero
const fora = topoDaVariavel(q('quarta', (x) => { x.variavel = null; }));
ok(fora.fora && fora.rs === '—', 'sem variável, —');

// ---- a linha da semana ----
const s3 = linhaDaSemana(q('quarta'));
eq(s3.linha, '212 pts · 3º · faltam 19 para passar Gama', 'linha do 3º (230 − 212 + 1)');
ok(/^uma demo \(25\) já passa$/.test(s3.sub), 'menor ação: ' + s3.sub);
ok(!s3.lider, 'o 3º não é líder');
const lider = linhaDaSemana(q('lider'));
ok(lider.lider && /^\d+ pts · 1º/.test(lider.linha), 'líder: ' + lider.linha);
const novato = linhaDaSemana(q('novato'));
ok(novato.linha.endsWith('· na rampa'), 'novato na rampa: ' + novato.linha);
const segunda = linhaDaSemana(q('segunda'));
ok(segunda.linha === '0 pts · semana zerada' || /pts ·/.test(segunda.linha), 'segunda: ' + segunda.linha);
const zerada = linhaDaSemana(q('quarta', (x) => { x.semana!.pts = 0; x.semana!.podio.forEach((p) => { p.pts = 0; }); }));
eq(zerada.linha, '0 pts · semana zerada', 'semana zerada');
ok(zerada.sub.startsWith('a 1ª visita com prova vale 3'), 'zerada convida: ' + zerada.sub);
const semFonte = linhaDaSemana(q('quarta', (x) => { x.semana = null; }));
ok(semFonte.fora && semFonte.linha.startsWith('—'), 'sem semana, —');

console.log(`abaEu: ${n} checagens ok`);
